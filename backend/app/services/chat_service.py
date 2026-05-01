import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.chains.chat_chain import chat_chain
from app.models.message import Message
from app.models.thread import ChatThread
from app.models.user import User


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
    thread_result = await db.execute(
        select(ChatThread).where(
            ChatThread.id == thread_id,
            ChatThread.user_id == user_id,
        )
    )
    thread = thread_result.scalar_one_or_none()
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


def _format_history(messages: list[Message], limit: int = 20) -> str:
    recent = messages[-limit:]
    return "\n".join(f"{msg.role}: {msg.content}" for msg in recent)


async def stream_chat_response(
    db: AsyncSession,
    current_user: User,
    user_message: str,
    thread_id: uuid.UUID | None = None,
) -> AsyncGenerator[str, None]:
    thread: ChatThread | None = None
    if thread_id:
        result = await db.execute(
            select(ChatThread).where(
                ChatThread.id == thread_id,
                ChatThread.user_id == current_user.id,
            )
        )
        thread = result.scalar_one_or_none()
        if not thread:
            raise ThreadNotFoundError("Chat thread not found.")
    else:
        thread = ChatThread(
            user_id=current_user.id,
            title=_make_thread_title(user_message),
        )
        db.add(thread)
        await db.flush()

    user_row = Message(
        user_id=current_user.id,
        thread_id=thread.id,
        role="user",
        content=user_message,
    )
    db.add(user_row)
    thread.updated_at = datetime.now(timezone.utc)
    await db.commit()

    all_messages = await get_thread_messages(db, current_user.id, thread.id)
    history = _format_history(all_messages)

    assistant_parts: list[str] = []
    try:
        async for chunk in chat_chain.astream(
            {"history": history, "message": user_message},
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
