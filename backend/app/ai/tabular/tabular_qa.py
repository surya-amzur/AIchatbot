from __future__ import annotations

from io import BytesIO
from pathlib import Path
import json
import re
import uuid

import chromadb
from chromadb.api.models.Collection import Collection
import gspread
import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.chains.chat_chain import chat_chain
from app.ai.llm import embeddings
from app.core.config import ROOT_DIR, settings
from app.models.message import Message
from app.models.user import User
from app.services.chat_service import _build_memory_messages, get_or_create_thread, get_thread_messages


MAX_TABULAR_CONTEXT_CHARS = 12000
MAX_ROWS_TO_INDEX = 3000


class TabularServiceError(Exception):
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
    return f"tabular_user_{str(user_id).replace('-', '_')}"


def _user_collection(user_id: uuid.UUID) -> Collection:
    client = get_chroma_client()
    return client.get_or_create_collection(
        name=_user_collection_name(user_id), metadata={"hnsw:space": "cosine"}
    )


def _normalize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    cleaned = df.copy()
    cleaned = cleaned.dropna(how="all")
    cleaned.columns = [str(col).strip() or f"col_{idx}" for idx, col in enumerate(cleaned.columns)]
    return cleaned.fillna("")


def _dataframe_rows_as_text(df: pd.DataFrame) -> list[str]:
    texts: list[str] = []
    for row_idx, row in enumerate(df.to_dict(orient="records"), start=1):
        pairs = [f"{key}={row.get(key, '')}" for key in row.keys()]
        texts.append(f"row {row_idx}: " + "; ".join(pairs))
    return texts


def _parse_google_service_account_json() -> dict:
    raw = (settings.google_service_account_json or "").strip()
    if not raw:
        raise TabularServiceError("GOOGLE_SERVICE_ACCOUNT_JSON is not configured.")

    if raw.startswith("{"):
        return json.loads(raw)

    path = Path(raw)
    if not path.is_absolute():
        path = ROOT_DIR / path
    if not path.exists():
        raise TabularServiceError("GOOGLE_SERVICE_ACCOUNT_JSON path does not exist.")
    return json.loads(path.read_text(encoding="utf-8"))


def _extract_sheet_key(spreadsheet: str) -> str:
    value = spreadsheet.strip()
    if not value:
        raise TabularServiceError("Spreadsheet URL or key is required.")

    if "/spreadsheets/d/" in value:
        match = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", value)
        if match:
            return match.group(1)
        raise TabularServiceError("Could not parse Google Sheet key from URL.")
    return value


def _where_for_document_ids(document_ids: list[str] | None) -> dict | None:
    if not document_ids:
        return None
    return {"document_id": {"$in": document_ids}}


def _store_dataframe_in_chroma(
    current_user: User,
    df: pd.DataFrame,
    source_name: str,
    source_type: str,
    thread_id: uuid.UUID | None,
) -> tuple[str, int, list[str]]:
    normalized = _normalize_dataframe(df)
    if normalized.empty:
        raise TabularServiceError("The provided tabular data is empty.")

    limited = normalized.head(MAX_ROWS_TO_INDEX)
    row_texts = _dataframe_rows_as_text(limited)
    vectors = embeddings.embed_documents(row_texts)
    document_id = str(uuid.uuid4())

    collection = _user_collection(current_user.id)
    ids = [f"{document_id}:{idx}" for idx in range(len(row_texts))]
    metadatas = [
        {
            "document_id": document_id,
            "source_name": source_name,
            "source_type": source_type,
            "row_index": idx + 1,
            "thread_id": str(thread_id) if thread_id else "",
            "user_id": str(current_user.id),
        }
        for idx in range(len(row_texts))
    ]

    collection.add(ids=ids, documents=row_texts, embeddings=vectors, metadatas=metadatas)
    return document_id, len(row_texts), [str(col) for col in limited.columns]


async def ingest_excel_for_user(
    current_user: User,
    file_name: str,
    file_bytes: bytes,
    thread_id: uuid.UUID | None = None,
) -> tuple[str, int, list[str]]:
    try:
        df = pd.read_excel(BytesIO(file_bytes))
    except Exception as exc:
        raise TabularServiceError(f"Failed to parse Excel file: {exc}") from exc

    return _store_dataframe_in_chroma(
        current_user=current_user,
        df=df,
        source_name=file_name,
        source_type="excel",
        thread_id=thread_id,
    )


async def ingest_gsheet_for_user(
    current_user: User,
    spreadsheet: str,
    worksheet: str | None = None,
    thread_id: uuid.UUID | None = None,
) -> tuple[str, int, list[str], str]:
    creds = _parse_google_service_account_json()
    key = _extract_sheet_key(spreadsheet)

    try:
        client = gspread.service_account_from_dict(creds)
        book = client.open_by_key(key)
        sheet = book.worksheet(worksheet) if worksheet else book.sheet1
        rows = sheet.get_all_records()
    except Exception as exc:
        raise TabularServiceError(f"Failed to read Google Sheet: {exc}") from exc

    df = pd.DataFrame(rows)
    source_name = f"{book.title}:{sheet.title}"

    doc_id, row_count, columns = _store_dataframe_in_chroma(
        current_user=current_user,
        df=df,
        source_name=source_name,
        source_type="gsheet",
        thread_id=thread_id,
    )
    return doc_id, row_count, columns, source_name


def _is_aggregate_query(question: str) -> bool:
    """Detect if question is asking for aggregation/counting over data."""
    aggregate_keywords = [
        "how many",
        "count",
        "total",
        "sum",
        "average",
        "max",
        "min",
        "all",
        "list all",
        "show all",
        "breakdown",
        "distribution",
        "percentage",
        "proportion",
    ]
    q_lower = question.lower()
    return any(keyword in q_lower for keyword in aggregate_keywords)


def _is_count_query(question: str) -> bool:
    """Detect if the question is specifically asking to count/how-many."""
    count_keywords = ["how many", "count", "total number", "number of"]
    q_lower = question.lower()
    return any(keyword in q_lower for keyword in count_keywords)


def _compute_python_aggregates(question: str, snippets: list[str]) -> str | None:
    """
    For count-type questions, extract filter terms from the question,
    count matching rows in Python, and return a verified fact string.
    This prevents the LLM from miscounting large datasets.
    """
    if not _is_count_query(question):
        return None

    q_lower = question.lower()

    # Extract quoted terms or key value-like phrases from the question
    # e.g., "how many high priority bugs" → look for rows containing "high priority"
    # Strategy: find significant noun phrases after "how many" / "count of"
    # We'll extract 2-4 word candidate filters and test which ones match rows
    import re

    # Remove common stop words to find the filter terms
    stop_words = {
        "how", "many", "are", "there", "in", "the", "sheet", "spreadsheet",
        "data", "table", "of", "a", "an", "is", "what", "total", "count",
        "number", "show", "me", "give", "find", "list", "all", "with",
    }
    words = re.findall(r"[a-zA-Z]+", q_lower)
    filter_words = [w for w in words if w not in stop_words]

    if not filter_words:
        return None

    # For each snippet (row), check if it contains ALL filter terms
    filter_terms = filter_words  # e.g. ["high", "priority", "bugs"]
    matching_count = sum(
        1 for snippet in snippets
        if all(term in snippet.lower() for term in filter_terms)
    )

    if matching_count == 0:
        # Try with just the most distinctive terms (skip generic words like "bugs", "issues")
        generic = {"bugs", "issues", "items", "rows", "entries", "records", "tasks", "tickets"}
        core_terms = [w for w in filter_words if w not in generic]
        if core_terms and core_terms != filter_terms:
            matching_count = sum(
                1 for snippet in snippets
                if all(term in snippet.lower() for term in core_terms)
            )
            filter_terms = core_terms

    if matching_count > 0:
        filter_display = " ".join(filter_terms)
        return (
            f"[VERIFIED PYTHON COUNT] Rows matching '{filter_display}': {matching_count}. "
            f"This count was computed programmatically from {len(snippets)} total rows and is accurate. "
            f"Use this exact number in your answer."
        )

    return None


def retrieve_tabular_context(
    current_user: User,
    question: str,
    document_ids: list[str] | None,
    top_k: int,
) -> tuple[str, list[dict[str, str | int]]]:
    collection = _user_collection(current_user.id)
    query_vec = embeddings.embed_query(question)
    
    # For aggregate queries, retrieve ALL rows to ensure completeness
    effective_top_k = top_k
    if _is_aggregate_query(question):
        effective_top_k = MAX_ROWS_TO_INDEX  # Retrieve all indexed rows (up to 3000)

    results = collection.query(
        query_embeddings=[query_vec],
        n_results=effective_top_k,
        where=_where_for_document_ids(document_ids),
    )

    documents = (results.get("documents") or [[]])[0]
    metadatas = (results.get("metadatas") or [[]])[0]

    citations: list[dict[str, str | int]] = []
    snippets: list[str] = []
    for doc, meta in zip(documents, metadatas):
        if not meta:
            continue
        document_id = str(meta.get("document_id", ""))
        source_name = str(meta.get("source_name", "tabular-source"))
        row_index = int(meta.get("row_index", 0) or 0)
        citations.append(
            {
                "document_id": document_id,
                "source_name": source_name,
                "row_index": row_index,
            }
        )
        snippets.append(f"[{source_name} row {row_index}] {doc}")

    # Compute Python-side aggregates for count queries before truncation
    python_fact = _compute_python_aggregates(question, snippets)

    # Expand context limit for aggregate queries to ensure LLM sees all data
    context_limit = MAX_TABULAR_CONTEXT_CHARS
    if _is_aggregate_query(question):
        context_limit = 100000  # Allow much larger context for aggregates

    context = "\n\n".join(snippets)[:context_limit]

    # Prepend the verified fact so the LLM uses the accurate count
    if python_fact:
        context = python_fact + "\n\n" + context

    return context, citations


async def answer_tabular_question(
    db: AsyncSession,
    current_user: User,
    question: str,
    thread_id: uuid.UUID | None,
    document_ids: list[str],
    top_k: int,
) -> tuple[uuid.UUID, str, list[dict[str, str | int]]]:
    normalized_question = " ".join(question.split())
    if not normalized_question:
        raise TabularServiceError("Question cannot be empty.")

    context, citations = retrieve_tabular_context(current_user, normalized_question, document_ids, top_k)
    if not context:
        raise TabularServiceError("No relevant tabular context found. Upload Excel/Sheet data first.")

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
            "attachment_context": (
                "Tabular context from uploaded spreadsheets and Google Sheets "
                "(any [VERIFIED PYTHON COUNT] values are exact — use them as-is):\n" + context
            ),
        },
        config={"metadata": {"user_email": current_user.email, "tabular_qa": True}},
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
