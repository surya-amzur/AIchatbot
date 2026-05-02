from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.nl2sql import (
    Nl2SqlQueryRequest,
    Nl2SqlQueryResponse,
    Nl2SqlSchemaColumn,
    Nl2SqlSchemaResponse,
    Nl2SqlSchemaTable,
)
from app.services import nl2sql_service


router = APIRouter(prefix="/api/nl2sql", tags=["nl2sql"])


@router.get("/schema", response_model=Nl2SqlSchemaResponse)
async def get_nl2sql_schema(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Nl2SqlSchemaResponse:
    _ = current_user
    try:
        tables = await nl2sql_service.get_accessible_schema(db, settings.nl2sql_allowed_tables)
    except nl2sql_service.Nl2SqlServiceError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "nl2sql_schema_failed", "message": str(exc)},
        ) from exc

    return Nl2SqlSchemaResponse(
        status="ok",
        tables=[
            Nl2SqlSchemaTable(
                name=str(table["name"]),
                columns=[
                    Nl2SqlSchemaColumn(name=str(col["name"]), type=str(col["type"]))
                    for col in table.get("columns", [])
                    if isinstance(col, dict)
                ],
            )
            for table in tables
        ],
    )


@router.post("/query", response_model=Nl2SqlQueryResponse)
async def query_nl2sql(
    payload: Nl2SqlQueryRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Nl2SqlQueryResponse:
    try:
        result = await nl2sql_service.run_nl2sql_query(
            db=db,
            current_user=current_user,
            question=payload.question,
            allowed_tables_raw=settings.nl2sql_allowed_tables,
            max_rows=payload.max_rows or settings.nl2sql_max_rows,
        )
    except nl2sql_service.Nl2SqlServiceError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "nl2sql_query_failed", "message": str(exc)},
        ) from exc

    return Nl2SqlQueryResponse(
        status="ok",
        sql=str(result["sql"]),
        columns=list(result["columns"]),
        rows=list(result["rows"]),
        row_count=int(result["row_count"]),
    )
