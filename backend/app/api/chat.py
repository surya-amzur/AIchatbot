from collections.abc import AsyncGenerator
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.chat import ChatHistoryResponse, ChatRequest, ChatThreadsResponse, ThreadSummary
from app.services.chat_service import (
    ThreadNotFoundError,
    get_thread_messages,
    get_user_messages_flat,
    list_user_threads,
    stream_chat_response,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])


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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatHistoryResponse:
    if thread_id is None:
        messages = await get_user_messages_flat(db, current_user.id)
        return ChatHistoryResponse(messages=messages)

    try:
        messages = await get_thread_messages(db, current_user.id, thread_id)
        return ChatHistoryResponse(thread_id=thread_id, messages=messages)
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
            ):
                yield f"data: {chunk}\n\n"
        except ThreadNotFoundError as exc:
            yield f"data: [ERROR] {str(exc)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
