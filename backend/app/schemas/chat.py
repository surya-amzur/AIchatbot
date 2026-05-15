import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str
    thread_id: uuid.UUID | None = None
    attachments: list["AttachmentIn"] = Field(default_factory=list)


class ThreadUpdateRequest(BaseModel):
    title: str


class MessageOut(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    created_at: datetime
    attachments: list["AttachmentOut"] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class ChatHistoryResponse(BaseModel):
    thread_id: uuid.UUID | None = None
    messages: list[MessageOut]
    total_count: int = 0
    offset: int = 0
    limit: int | None = None
    has_more: bool = False


class ThreadSummary(BaseModel):
    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime
    last_message: str | None = None


class ChatThreadsResponse(BaseModel):
    threads: list[ThreadSummary]


class ChatActionResponse(BaseModel):
    status: str


class AttachmentIn(BaseModel):
    file_name: str
    mime_type: str
    size_bytes: int
    url: str


class AttachmentOut(BaseModel):
    file_name: str
    mime_type: str
    size_bytes: int
    url: str


class UploadResponse(BaseModel):
    attachment: AttachmentOut


class ImageGenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    thread_id: uuid.UUID | None = None


class ImageGenerateResponse(BaseModel):
    status: str
    thread_id: uuid.UUID
    attachment: AttachmentOut


ChatRequest.model_rebuild()
MessageOut.model_rebuild()
