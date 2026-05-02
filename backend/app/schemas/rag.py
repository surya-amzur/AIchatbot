from pydantic import BaseModel, Field
import uuid


class RagUploadResponse(BaseModel):
    status: str
    document_id: str
    file_name: str
    chunk_count: int
    thread_id: uuid.UUID | None = None


class RagQueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    thread_id: uuid.UUID | None = None
    document_ids: list[str] = Field(default_factory=list)
    top_k: int = Field(default=4, ge=1, le=12)


class RagCitation(BaseModel):
    document_id: str
    file_name: str
    chunk_index: int


class RagQueryResponse(BaseModel):
    status: str
    thread_id: uuid.UUID
    answer: str
    citations: list[RagCitation] = Field(default_factory=list)
