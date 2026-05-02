from __future__ import annotations

from io import BytesIO
from pathlib import Path
import uuid

import chromadb
from chromadb.api.models.Collection import Collection
from pypdf import PdfReader
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.chains.chat_chain import chat_chain
from app.ai.llm import embeddings
from app.core.config import ROOT_DIR, settings
from app.models.message import Message
from app.models.user import User
from app.services.chat_service import get_or_create_thread, get_thread_messages, _build_memory_messages


MAX_RAG_CONTEXT_CHARS = 12000
CHUNK_SIZE = 1200
CHUNK_OVERLAP = 200


class RagServiceError(Exception):
    pass


_chroma_client: chromadb.ClientAPI | None = None


def _resolve_chroma_dir() -> Path:
    target = settings.chroma_persist_dir or "./chroma_db"
    path = Path(target)
    if not path.is_absolute():
        path = ROOT_DIR / path
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_chroma_client() -> chromadb.ClientAPI:
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=str(_resolve_chroma_dir()))
    return _chroma_client


def _user_collection_name(user_id: uuid.UUID) -> str:
    return f"user_{str(user_id).replace('-', '_')}"


def _user_collection(user_id: uuid.UUID) -> Collection:
    client = get_chroma_client()
    return client.get_or_create_collection(name=_user_collection_name(user_id), metadata={"hnsw:space": "cosine"})


def _chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    clean = "\n".join(line.strip() for line in text.splitlines())
    if not clean:
        return []

    chunks: list[str] = []
    start = 0
    length = len(clean)
    while start < length:
        end = min(length, start + chunk_size)
        chunk = clean[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= length:
            break
        start = max(0, end - overlap)
    return chunks


def _extract_pdf_text(file_bytes: bytes) -> str:
    reader = PdfReader(BytesIO(file_bytes))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n\n".join(pages).strip()


def _where_for_document_ids(document_ids: list[str] | None) -> dict | None:
    if not document_ids:
        return None
    return {"document_id": {"$in": document_ids}}


async def ingest_pdf_for_user(
    current_user: User,
    file_name: str,
    file_bytes: bytes,
    thread_id: uuid.UUID | None = None,
) -> tuple[str, int]:
    text = _extract_pdf_text(file_bytes)
    if not text:
        raise RagServiceError("Unable to extract text from PDF.")

    chunks = _chunk_text(text)
    if not chunks:
        raise RagServiceError("PDF text is empty after chunking.")

    vectors = embeddings.embed_documents(chunks)
    document_id = str(uuid.uuid4())

    collection = _user_collection(current_user.id)
    ids = [f"{document_id}:{idx}" for idx in range(len(chunks))]
    metadatas = [
        {
            "document_id": document_id,
            "file_name": file_name,
            "chunk_index": idx,
            "thread_id": str(thread_id) if thread_id else "",
            "user_id": str(current_user.id),
        }
        for idx in range(len(chunks))
    ]

    collection.add(
        ids=ids,
        documents=chunks,
        embeddings=vectors,
        metadatas=metadatas,
    )

    return document_id, len(chunks)


def retrieve_rag_context(
    current_user: User,
    question: str,
    document_ids: list[str] | None,
    top_k: int,
) -> tuple[str, list[dict[str, str | int]]]:
    collection = _user_collection(current_user.id)
    query_vec = embeddings.embed_query(question)

    results = collection.query(
        query_embeddings=[query_vec],
        n_results=top_k,
        where=_where_for_document_ids(document_ids),
    )

    documents = (results.get("documents") or [[]])[0]
    metadatas = (results.get("metadatas") or [[]])[0]

    citations: list[dict[str, str | int]] = []
    snippets: list[str] = []
    for doc, meta in zip(documents, metadatas):
        if not meta:
            continue
        doc_id = str(meta.get("document_id", ""))
        file_name = str(meta.get("file_name", "document.pdf"))
        chunk_index = int(meta.get("chunk_index", 0) or 0)
        citations.append(
            {
                "document_id": doc_id,
                "file_name": file_name,
                "chunk_index": chunk_index,
            }
        )
        snippets.append(f"[{file_name} chunk {chunk_index}] {doc}")

    context = "\n\n".join(snippets)[:MAX_RAG_CONTEXT_CHARS]
    return context, citations


async def answer_rag_question(
    db: AsyncSession,
    current_user: User,
    question: str,
    thread_id: uuid.UUID | None,
    document_ids: list[str],
    top_k: int,
) -> tuple[uuid.UUID, str, list[dict[str, str | int]]]:
    normalized_question = " ".join(question.split())
    if not normalized_question:
        raise RagServiceError("Question cannot be empty.")

    context, citations = retrieve_rag_context(current_user, normalized_question, document_ids, top_k)
    if not context:
        raise RagServiceError("No relevant PDF context found. Upload a PDF and retry.")

    thread = await get_or_create_thread(db, current_user.id, thread_id, normalized_question)

    user_msg = Message(
        user_id=current_user.id,
        thread_id=thread.id,
        role="user",
        content=normalized_question,
        attachments=[],
    )
    db.add(user_msg)
    await db.commit()

    prior_messages = await get_thread_messages(db, current_user.id, thread.id)
    memory = _build_memory_messages(prior_messages[:-1])

    answer = await chat_chain.ainvoke(
        {
            "history": memory,
            "message": normalized_question,
            "attachment_context": f"RAG context from uploaded PDFs:\n{context}",
        },
        config={"metadata": {"user_email": current_user.email, "rag": True}},
    )

    assistant_msg = Message(
        user_id=current_user.id,
        thread_id=thread.id,
        role="assistant",
        content=str(answer),
        attachments=[],
    )
    db.add(assistant_msg)
    await db.commit()

    return thread.id, str(answer), citations
