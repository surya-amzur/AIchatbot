import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.tabular import tabular_qa
from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.tabular import (
    TabularCitation,
    TabularQueryRequest,
    TabularQueryResponse,
    TabularUploadExcelResponse,
    TabularUploadGSheetRequest,
    TabularUploadGSheetResponse,
)


router = APIRouter(prefix="/api/tabular", tags=["tabular"])


@router.post("/upload-excel", response_model=TabularUploadExcelResponse)
async def upload_excel_for_qa(
    file: UploadFile = File(...),
    thread_id: uuid.UUID | None = Form(default=None),
    current_user: User = Depends(get_current_user),
) -> TabularUploadExcelResponse:
    file_name = file.filename or "sheet.xlsx"
    if not (file_name.lower().endswith(".xlsx") or file_name.lower().endswith(".xls")):
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_file_type", "message": "Only Excel files (.xlsx/.xls) are supported."},
        )

    content = await file.read()
    await file.close()

    try:
        document_id, row_count, columns = await tabular_qa.ingest_excel_for_user(
            current_user=current_user,
            file_name=file_name,
            file_bytes=content,
            thread_id=thread_id,
        )
    except tabular_qa.TabularServiceError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "tabular_upload_failed", "message": str(exc)},
        ) from exc

    return TabularUploadExcelResponse(
        status="ok",
        document_id=document_id,
        source_name=file_name,
        row_count=row_count,
        columns=columns,
        thread_id=thread_id,
    )


@router.post("/upload-gsheet", response_model=TabularUploadGSheetResponse)
async def upload_gsheet_for_qa(
    payload: TabularUploadGSheetRequest,
    current_user: User = Depends(get_current_user),
) -> TabularUploadGSheetResponse:
    try:
        document_id, row_count, columns, source_name = await tabular_qa.ingest_gsheet_for_user(
            current_user=current_user,
            spreadsheet=payload.spreadsheet,
            worksheet=payload.worksheet,
            thread_id=payload.thread_id,
        )
    except tabular_qa.TabularServiceError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "tabular_upload_failed", "message": str(exc)},
        ) from exc

    return TabularUploadGSheetResponse(
        status="ok",
        document_id=document_id,
        source_name=source_name,
        row_count=row_count,
        columns=columns,
        thread_id=payload.thread_id,
    )


@router.post("/query", response_model=TabularQueryResponse)
async def query_tabular(
    payload: TabularQueryRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TabularQueryResponse:
    try:
        thread_id, answer, citations = await tabular_qa.answer_tabular_question(
            db=db,
            current_user=current_user,
            question=payload.question,
            thread_id=payload.thread_id,
            document_ids=payload.document_ids,
            top_k=payload.top_k,
        )
    except tabular_qa.TabularServiceError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "tabular_query_failed", "message": str(exc)},
        ) from exc

    return TabularQueryResponse(
        status="ok",
        thread_id=thread_id,
        answer=answer,
        citations=[TabularCitation(**citation) for citation in citations],
    )
