from collections.abc import AsyncGenerator
from pathlib import Path
import re
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import ROOT_DIR, settings
from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.chat import (
    AttachmentOut,
    ChatActionResponse,
    ChatHistoryResponse,
    ImageGenerateRequest,
    ImageGenerateResponse,
    ChatRequest,
    ChatThreadsResponse,
    ThreadSummary,
    ThreadUpdateRequest,
    UploadResponse,
)
from app.services.chat_service import (
    ChatServiceError,
    ThreadNotFoundError,
    generate_image_for_prompt,
    get_thread_messages_page,
    delete_user_thread,
    get_thread_messages,
    get_user_messages_flat,
    rename_user_thread,
    list_user_threads,
    stream_chat_response,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])

ALLOWED_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def _safe_upload_dir() -> Path:
    target = settings.upload_dir or "./uploads"
    path = Path(target)
    if not path.is_absolute():
        path = ROOT_DIR / path
    path.mkdir(parents=True, exist_ok=True)
    return path


def _sanitize_filename(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", name).strip("._")
    return cleaned or "attachment.bin"


@router.get("/threads", response_model=ChatThreadsResponse)
async def get_chat_threads(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatThreadsResponse:
    threads = await list_user_threads(db, current_user.id)
    payload = [
        ThreadSummary(
            id=thread.id,
            title=thread.title,
            created_at=thread.created_at,
            updated_at=thread.updated_at,
            last_message=thread.messages[-1].content if thread.messages else None,
        )
        for thread in threads
    ]
    return ChatThreadsResponse(threads=payload)


@router.get("/history", response_model=ChatHistoryResponse)
async def get_chat_history(
    thread_id: uuid.UUID | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int | None = Query(default=None, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatHistoryResponse:
    if thread_id is None:
        messages = await get_user_messages_flat(db, current_user.id)
        total_count = len(messages)
        if limit is not None:
            end = max(0, total_count - offset)
            start = max(0, end - limit)
            paged = messages[start:end]
            has_more = start > 0
            return ChatHistoryResponse(
                messages=paged,
                total_count=total_count,
                offset=offset,
                limit=limit,
                has_more=has_more,
            )
        return ChatHistoryResponse(messages=messages, total_count=total_count)

    try:
        if limit is not None:
            messages, total_count = await get_thread_messages_page(
                db=db,
                user_id=current_user.id,
                thread_id=thread_id,
                offset=offset,
                limit=limit,
            )
            has_more = (offset + len(messages)) < total_count
            return ChatHistoryResponse(
                thread_id=thread_id,
                messages=messages,
                total_count=total_count,
                offset=offset,
                limit=limit,
                has_more=has_more,
            )

        messages = await get_thread_messages(db, current_user.id, thread_id)
        return ChatHistoryResponse(thread_id=thread_id, messages=messages, total_count=len(messages))
    except ThreadNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail={"error": "thread_not_found", "message": str(exc)},
        ) from exc


@router.post("/send")
async def send_chat_message(
    payload: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            async for chunk in stream_chat_response(
                db,
                current_user,
                payload.message,
                payload.thread_id,
                [attachment.model_dump() for attachment in payload.attachments],
            ):
                yield f"data: {chunk}\n\n"
        except ThreadNotFoundError as exc:
            yield f"data: [ERROR] {str(exc)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/upload", response_model=UploadResponse)
async def upload_attachment(
    file: UploadFile = File(...),
    _current_user: User = Depends(get_current_user),
) -> UploadResponse:
    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail={"error": "unsupported_file_type", "message": f"Unsupported type: {content_type}"},
        )

    upload_dir = _safe_upload_dir()
    extension = Path(file.filename or "").suffix
    file_name = _sanitize_filename(Path(file.filename or "attachment").stem)
    storage_name = f"{uuid.uuid4()}_{file_name}{extension}"
    output_path = upload_dir / storage_name

    max_bytes = max(1, settings.max_upload_mb or 20) * 1024 * 1024
    size_bytes = 0
    with output_path.open("wb") as target:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size_bytes += len(chunk)
            if size_bytes > max_bytes:
                output_path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail={
                        "error": "file_too_large",
                        "message": f"File exceeds max size of {max_bytes // (1024 * 1024)} MB",
                    },
                )
            target.write(chunk)

    await file.close()

    attachment = AttachmentOut(
        file_name=file.filename or storage_name,
        mime_type=content_type,
        size_bytes=size_bytes,
        url=f"/uploads/{storage_name}",
    )
    return UploadResponse(attachment=attachment)


@router.post("/generate-image", response_model=ImageGenerateResponse)
async def generate_image(
    payload: ImageGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ImageGenerateResponse:
    try:
        thread_id, attachment = await generate_image_for_prompt(
            db,
            current_user,
            payload.prompt,
            payload.thread_id,
        )
    except ThreadNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail={"error": "thread_not_found", "message": str(exc)},
        ) from exc
    except ChatServiceError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "image_generation_failed", "message": str(exc)},
        ) from exc

    return ImageGenerateResponse(
        status="ok",
        thread_id=thread_id,
        attachment=AttachmentOut(**attachment),
    )


@router.patch("/threads/{thread_id}", response_model=ThreadSummary)
async def rename_chat_thread(
    thread_id: uuid.UUID,
    payload: ThreadUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ThreadSummary:
    try:
        thread = await rename_user_thread(db, current_user.id, thread_id, payload.title)
    except ThreadNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail={"error": "thread_not_found", "message": str(exc)},
        ) from exc
    except ChatServiceError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_thread_title", "message": str(exc)},
        ) from exc

    return ThreadSummary(
        id=thread.id,
        title=thread.title,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
        last_message=thread.messages[-1].content if thread.messages else None,
    )


@router.delete("/threads/{thread_id}", response_model=ChatActionResponse)
async def delete_chat_thread(
    thread_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatActionResponse:
    try:
        await delete_user_thread(db, current_user.id, thread_id)
    except ThreadNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail={"error": "thread_not_found", "message": str(exc)},
        ) from exc

    return ChatActionResponse(status="ok")
