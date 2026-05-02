import uuid

from pydantic import BaseModel, Field


class TabularUploadExcelResponse(BaseModel):
    status: str
    document_id: str
    source_name: str
    row_count: int
    columns: list[str] = Field(default_factory=list)
    thread_id: uuid.UUID | None = None


class TabularUploadGSheetRequest(BaseModel):
    spreadsheet: str = Field(min_length=1, max_length=2000)
    worksheet: str | None = Field(default=None, max_length=255)
    thread_id: uuid.UUID | None = None


class TabularUploadGSheetResponse(BaseModel):
    status: str
    document_id: str
    source_name: str
    row_count: int
    columns: list[str] = Field(default_factory=list)
    thread_id: uuid.UUID | None = None


class TabularCitation(BaseModel):
    document_id: str
    source_name: str
    row_index: int


class TabularQueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    thread_id: uuid.UUID | None = None
    document_ids: list[str] = Field(default_factory=list)
    top_k: int = Field(default=6, ge=1, le=20)


class TabularQueryResponse(BaseModel):
    status: str
    thread_id: uuid.UUID
    answer: str
    citations: list[TabularCitation] = Field(default_factory=list)
