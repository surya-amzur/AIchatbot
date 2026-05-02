import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.rag import pdf_rag
from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.rag import RagCitation, RagQueryRequest, RagQueryResponse, RagUploadResponse


router = APIRouter(prefix="/api/rag", tags=["rag"])


@router.post("/upload", response_model=RagUploadResponse)
async def upload_pdf_for_rag(
    file: UploadFile = File(...),
    thread_id: uuid.UUID | None = Form(default=None),
    current_user: User = Depends(get_current_user),
) -> RagUploadResponse:
    file_name = file.filename or "document.pdf"
    if not file_name.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_file_type", "message": "Only PDF files are supported."},
        )

    content = await file.read()
    await file.close()

    try:
        document_id, chunk_count = await pdf_rag.ingest_pdf_for_user(
            current_user=current_user,
            file_name=file_name,
            file_bytes=content,
            thread_id=thread_id,
        )
    except pdf_rag.RagServiceError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "rag_upload_failed", "message": str(exc)},
        ) from exc

    return RagUploadResponse(
        status="ok",
        document_id=document_id,
        file_name=file_name,
        chunk_count=chunk_count,
        thread_id=thread_id,
    )


@router.post("/query", response_model=RagQueryResponse)
async def query_rag(
    payload: RagQueryRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RagQueryResponse:
    try:
        thread_id, answer, citations = await pdf_rag.answer_rag_question(
            db=db,
            current_user=current_user,
            question=payload.question,
            thread_id=payload.thread_id,
            document_ids=payload.document_ids,
            top_k=payload.top_k,
        )
    except pdf_rag.RagServiceError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "rag_query_failed", "message": str(exc)},
        ) from exc

    return RagQueryResponse(
        status="ok",
        thread_id=thread_id,
        answer=answer,
        citations=[RagCitation(**citation) for citation in citations],
    )
