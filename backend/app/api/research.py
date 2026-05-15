"""Research Digest API — SSE streaming endpoint."""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.ai.research.agent import stream_research_digest
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/research", tags=["research"])

# Per-user concurrent request limit
_MAX_CONCURRENT_PER_USER = 2
_user_active_requests: dict[str, int] = defaultdict(int)
_user_lock = asyncio.Lock()


class ResearchDigestRequest(BaseModel):
    topic: str = Field(..., min_length=3, max_length=300)
    max_papers: int = Field(default=8, ge=1, le=20)


@router.post("/digest")
async def research_digest(
    request: ResearchDigestRequest,
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    user_key = str(current_user.id)

    async with _user_lock:
        if _user_active_requests[user_key] >= _MAX_CONCURRENT_PER_USER:
            raise HTTPException(
                status_code=429,
                detail={"error": "too_many_requests", "message": "You already have active research requests. Please wait."},
            )
        _user_active_requests[user_key] += 1

    async def _stream_with_cleanup() -> asyncio.AsyncGenerator[str, None]:
        try:
            async for chunk in stream_research_digest(request.topic, max_papers=request.max_papers):
                yield chunk
        finally:
            async with _user_lock:
                _user_active_requests[user_key] = max(0, _user_active_requests[user_key] - 1)

    return StreamingResponse(
        _stream_with_cleanup(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
