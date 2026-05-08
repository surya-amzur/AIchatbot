import uuid
import base64
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from langchain_core.messages import AIMessage, HumanMessage
from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.chains.chat_chain import chat_chain
from app.ai.llm import openai_client
from app.core.config import ROOT_DIR, settings
from app.models.message import Message
from app.models.thread import ChatThread
from app.models.user import User

MEMORY_TURNS = 5  # number of user+assistant pairs to include as context
MAX_ATTACHMENT_COUNT = 5
MAX_ATTACHMENT_CONTEXT_CHARS = 8000
MAX_ATTACHMENT_FILE_CHARS = 2000


class ChatServiceError(Exception):
    pass


class ThreadNotFoundError(ChatServiceError):
    pass


def _make_thread_title(message: str) -> str:
    title = " ".join(message.split())
    if len(title) <= 60:
        return title or "New Chat"
    return f"{title[:57]}..."


async def list_user_threads(db: AsyncSession, user_id: uuid.UUID) -> list[ChatThread]:
    result = await db.execute(
        select(ChatThread)
        .where(ChatThread.user_id == user_id)
        .options(selectinload(ChatThread.messages))
        .order_by(ChatThread.updated_at.desc())
    )
    return list(result.scalars().all())


async def get_user_messages_flat(db: AsyncSession, user_id: uuid.UUID) -> list[Message]:
    result = await db.execute(
        select(Message).where(Message.user_id == user_id).order_by(Message.created_at.asc())
    )
    return list(result.scalars().all())


async def get_thread_messages(
    db: AsyncSession,
    user_id: uuid.UUID,
    thread_id: uuid.UUID,
) -> list[Message]:
    thread = await get_user_thread(db, user_id, thread_id)
    if not thread:
        raise ThreadNotFoundError("Chat thread not found.")

    result = await db.execute(
        select(Message)
        .where(
            Message.user_id == user_id,
            Message.thread_id == thread_id,
        )
        .order_by(Message.created_at.asc())
    )
    return list(result.scalars().all())


async def get_user_thread(
    db: AsyncSession,
    user_id: uuid.UUID,
    thread_id: uuid.UUID,
) -> ChatThread:
    result = await db.execute(
        select(ChatThread)
        .where(
            ChatThread.id == thread_id,
            ChatThread.user_id == user_id,
        )
        .options(selectinload(ChatThread.messages))
    )
    thread = result.scalar_one_or_none()
    if not thread:
        raise ThreadNotFoundError("Chat thread not found.")
    return thread


async def rename_user_thread(
    db: AsyncSession,
    user_id: uuid.UUID,
    thread_id: uuid.UUID,
    title: str,
) -> ChatThread:
    normalized_title = " ".join(title.split())
    if not normalized_title:
        raise ChatServiceError("Thread title cannot be empty.")

    thread = await get_user_thread(db, user_id, thread_id)
    thread.title = normalized_title[:255]
    thread.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(thread)
    return thread


async def delete_user_thread(
    db: AsyncSession,
    user_id: uuid.UUID,
    thread_id: uuid.UUID,
) -> None:
    thread = await get_user_thread(db, user_id, thread_id)
    await db.delete(thread)
    await db.commit()


async def get_or_create_thread(
    db: AsyncSession,
    user_id: uuid.UUID,
    thread_id: uuid.UUID | None,
    title_seed: str,
) -> ChatThread:
    if thread_id:
        result = await db.execute(
            select(ChatThread).where(
                ChatThread.id == thread_id,
                ChatThread.user_id == user_id,
            )
        )
        thread = result.scalar_one_or_none()
        if not thread:
            raise ThreadNotFoundError("Chat thread not found.")
        return thread

    thread = ChatThread(
        user_id=user_id,
        title=_make_thread_title(title_seed),
    )
    db.add(thread)
    await db.flush()
    return thread


def _build_memory_messages(messages: list[Message]) -> list[HumanMessage | AIMessage]:
    """Return the last MEMORY_TURNS conversation turns as LangChain message objects.

    A turn is one user message followed by one assistant message.  We work
    backwards from the most-recent messages so we always keep the N most
    recent complete (or partial) turns, then reverse to restore chronological
    order before returning.
    """
    result: list[HumanMessage | AIMessage] = []
    turns = 0
    # Walk backwards, pairing assistant then user messages into turns.
    for msg in reversed(messages):
        if msg.role == "assistant":
            result.append(AIMessage(content=msg.content))
        elif msg.role == "user":
            result.append(HumanMessage(content=msg.content))
            turns += 1
            if turns >= MEMORY_TURNS:
                break
    result.reverse()
    return result


def _resolve_upload_path(url: str) -> Path | None:
    if not url.startswith("/uploads/"):
        return None
    file_name = url.removeprefix("/uploads/")
    # Prevent directory traversal: only allow plain file names.
    if file_name != Path(file_name).name:
        return None

    upload_root = Path(settings.upload_dir or "./uploads")
    if not upload_root.is_absolute():
        upload_root = ROOT_DIR / upload_root
    return upload_root / file_name


def _read_text_file(path: Path) -> str:
    raw = path.read_bytes()
    return raw.decode("utf-8", errors="ignore")[:MAX_ATTACHMENT_FILE_CHARS]


def _read_pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    parts: list[str] = []
    for page in reader.pages[:3]:
        parts.append((page.extract_text() or ""))
        if sum(len(part) for part in parts) >= MAX_ATTACHMENT_FILE_CHARS:
            break
    return "\n".join(parts)[:MAX_ATTACHMENT_FILE_CHARS]


def _read_xlsx_preview(path: Path) -> str:
    df = pd.read_excel(path, nrows=20)
    csv_preview = df.to_csv(index=False)
    return csv_preview[:MAX_ATTACHMENT_FILE_CHARS]


def _summarize_attachment(attachment: dict[str, str | int]) -> str:
    file_name = str(attachment.get("file_name", "attachment"))
    mime_type = str(attachment.get("mime_type", "application/octet-stream"))
    size_bytes = int(attachment.get("size_bytes", 0) or 0)
    url = str(attachment.get("url", ""))

    path = _resolve_upload_path(url)
    if not path or not path.exists():
        return (
            f"File: {file_name}\\n"
            f"Type: {mime_type}\\n"
            f"Size: {size_bytes} bytes\\n"
            "Content: File not found on disk; metadata only."
        )

    try:
        if mime_type.startswith("text/") or mime_type in {"application/json"}:
            content = _read_text_file(path)
        elif mime_type == "application/pdf":
            content = _read_pdf_text(path)
        elif mime_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
            content = _read_xlsx_preview(path)
        elif mime_type.startswith("image/"):
            content = "Image provided as vision input to the model."
        elif mime_type.startswith("video/"):
            content = "Video attachment uploaded. Video content parsing is not enabled in this step."
        else:
            content = "Binary attachment uploaded. No text extraction available for this type."
    except Exception as exc:
        content = f"Attachment could not be parsed: {exc}"

    return (
        f"File: {file_name}\\n"
        f"Type: {mime_type}\\n"
        f"Size: {size_bytes} bytes\\n"
        f"Content preview:\\n{content}"
    )


def _build_attachment_context(attachments: list[dict[str, str | int]] | None) -> str:
    if not attachments:
        return ""

    sections: list[str] = []
    for index, attachment in enumerate(attachments[:MAX_ATTACHMENT_COUNT], start=1):
        sections.append(f"Attachment {index}:\\n{_summarize_attachment(attachment)}")

    context = "\\n\\n".join(sections)
    return context[:MAX_ATTACHMENT_CONTEXT_CHARS]


def _upload_root() -> Path:
    root = Path(settings.upload_dir or "./uploads")
    if not root.is_absolute():
        root = ROOT_DIR / root
    root.mkdir(parents=True, exist_ok=True)
    return root


def _extract_image_bytes(generated: object) -> tuple[bytes, str]:
    data = getattr(generated, "data", None)
    if not data:
        raise ChatServiceError("Image generation returned empty data.")

    first = data[0]
    b64_value = getattr(first, "b64_json", None)
    if b64_value:
        return base64.b64decode(b64_value), "image/png"

    raise ChatServiceError("Image generation response did not include b64 image data.")


async def generate_image_for_prompt(
    db: AsyncSession,
    current_user: User,
    prompt: str,
    thread_id: uuid.UUID | None = None,
) -> tuple[uuid.UUID, dict[str, str | int]]:
    normalized_prompt = " ".join(prompt.split())
    if not normalized_prompt:
        raise ChatServiceError("Prompt cannot be empty.")

    thread = await get_or_create_thread(db, current_user.id, thread_id, normalized_prompt)

    user_row = Message(
        user_id=current_user.id,
        thread_id=thread.id,
        role="user",
        content=normalized_prompt,
        attachments=[],
    )
    db.add(user_row)
    thread.updated_at = datetime.now(timezone.utc)
    await db.commit()

    try:
        generated = openai_client.images.generate(
            model=settings.image_gen_model,
            prompt=normalized_prompt,
            size="1024x1024",
        )
        image_bytes, mime_type = _extract_image_bytes(generated)
    except ChatServiceError:
        raise
    except Exception as exc:
        raise ChatServiceError(f"Image generation failed: {exc}") from exc

    file_name = f"generated_{uuid.uuid4().hex}.png"
    out_path = _upload_root() / file_name
    out_path.write_bytes(image_bytes)

    attachment = {
        "file_name": file_name,
        "mime_type": mime_type,
        "size_bytes": len(image_bytes),
        "url": f"/uploads/{file_name}",
    }

    assistant_row = Message(
        user_id=current_user.id,
        thread_id=thread.id,
        role="assistant",
        content=f"Generated image for prompt: {normalized_prompt}",
        attachments=[attachment],
    )
    db.add(assistant_row)
    thread.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return thread.id, attachment


def _build_vision_parts(
    user_message: str,
    attachment_context: str,
    attachments: list[dict[str, str | int]] | None,
) -> list[dict[str, object]]:
    if not attachments:
        return []

    text_block = user_message
    if attachment_context:
        text_block = f"{user_message}\\n\\nAdditional attachment context:\\n{attachment_context}"

    parts: list[dict[str, object]] = [{"type": "text", "text": text_block}]
    for attachment in attachments[:MAX_ATTACHMENT_COUNT]:
        mime_type = str(attachment.get("mime_type", ""))
        if not mime_type.startswith("image/"):
            continue
        url = str(attachment.get("url", ""))
        path = _resolve_upload_path(url)
        if not path or not path.exists():
            continue
        raw = path.read_bytes()
        data_url = f"data:{mime_type};base64,{base64.b64encode(raw).decode('ascii')}"
        parts.append({"type": "image_url", "image_url": {"url": data_url}})

    return parts if len(parts) > 1 else []


def _memory_to_openai_messages(memory: list[HumanMessage | AIMessage]) -> list[dict[str, str]]:
    converted: list[dict[str, str]] = []
    for msg in memory:
        if isinstance(msg, HumanMessage):
            converted.append({"role": "user", "content": str(msg.content)})
        elif isinstance(msg, AIMessage):
            converted.append({"role": "assistant", "content": str(msg.content)})
    return converted


async def stream_chat_response(
    db: AsyncSession,
    current_user: User,
    user_message: str,
    thread_id: uuid.UUID | None = None,
    attachments: list[dict[str, str | int]] | None = None,
) -> AsyncGenerator[str, None]:
    thread = await get_or_create_thread(db, current_user.id, thread_id, user_message)

    user_row = Message(
        user_id=current_user.id,
        thread_id=thread.id,
        role="user",
        content=user_message,
        attachments=attachments or [],
    )
    db.add(user_row)
    thread.updated_at = datetime.now(timezone.utc)
    await db.commit()

    all_messages = await get_thread_messages(db, current_user.id, thread.id)
    # Exclude the just-saved user message from history — it is passed as {message}.
    history_messages = all_messages[:-1]
    memory = _build_memory_messages(history_messages)
    attachment_context = _build_attachment_context(attachments)
    vision_parts = _build_vision_parts(user_message, attachment_context, attachments)

    assistant_parts: list[str] = []
    try:
        if vision_parts:
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are a helpful AI assistant. Keep responses concise and clear. "
                        "Answer questions using your training knowledge when relevant. "
                        "For facts that could change over time (people's roles, titles, company leadership, live data), "
                        "give your best answer and clearly note it may be outdated — for example: "
                        "'Based on my training data, X held this role, but please verify from an official source as this may have changed.' "
                        "If the user provides context via uploaded files or attachments, always prefer that over training knowledge. "
                        "Do not invent names, statistics, or citations you are not confident about. "
                        "This assistant does not browse the web in real time unless a source is provided."
                    ),
                },
                *_memory_to_openai_messages(memory),
                {"role": "user", "content": vision_parts},
            ]
            stream = openai_client.chat.completions.create(
                model=settings.llm_model,
                messages=messages,
                stream=True,
            )
            for event in stream:
                text = (event.choices[0].delta.content or "") if event.choices else ""
                if not text:
                    continue
                assistant_parts.append(text)
                yield text
        else:
            async for chunk in chat_chain.astream(
                {
                    "history": memory,
                    "message": user_message,
                    "attachment_context": attachment_context,
                },
                config={"metadata": {"user_email": current_user.email}},
            ):
                text = str(chunk)
                assistant_parts.append(text)
                yield text
    except Exception:
        fallback = "Sorry, I could not generate a response right now. Please try again."
        assistant_parts.append(fallback)
        yield fallback

    assistant_response = "".join(assistant_parts).strip()
    if assistant_response:
        assistant_row = Message(
            user_id=current_user.id,
            thread_id=thread.id,
            role="assistant",
            content=assistant_response,
        )
        db.add(assistant_row)
        thread.updated_at = datetime.now(timezone.utc)
        await db.commit()
