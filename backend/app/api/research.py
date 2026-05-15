"""Research Digest API — SSE streaming endpoint."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.ai.research.agent import stream_research_digest
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/research", tags=["research"])


class ResearchDigestRequest(BaseModel):
    topic: str = Field(..., min_length=3, max_length=300)
    max_papers: int = Field(default=8, ge=1, le=20)


@router.post("/digest")
async def research_digest(
    request: ResearchDigestRequest,
    _current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    Stream a structured research digest for the given topic.
    Events are newline-delimited SSE: `data: {...}\n\n`
    """
    return StreamingResponse(
        stream_research_digest(request.topic, max_papers=request.max_papers),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
