from pydantic import BaseModel, Field


class Nl2SqlSchemaColumn(BaseModel):
    name: str
    type: str


class Nl2SqlSchemaTable(BaseModel):
    name: str
    columns: list[Nl2SqlSchemaColumn] = Field(default_factory=list)


class Nl2SqlSchemaResponse(BaseModel):
    status: str
    tables: list[Nl2SqlSchemaTable] = Field(default_factory=list)


class Nl2SqlQueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    max_rows: int | None = Field(default=None, ge=1, le=500)


class Nl2SqlQueryResponse(BaseModel):
    status: str
    sql: str
    columns: list[str] = Field(default_factory=list)
    rows: list[dict[str, object | None]] = Field(default_factory=list)
    row_count: int
