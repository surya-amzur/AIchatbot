from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
import re
import uuid

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.llm import llm
from app.models.user import User


FORBIDDEN_SQL_RE = re.compile(
    r"\\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|execute|merge)\\b",
    flags=re.IGNORECASE,
)
FROM_JOIN_RE = re.compile(r"\\b(?:from|join)\\s+([A-Za-z_][\\w.\"]*)", flags=re.IGNORECASE)
LIMIT_RE = re.compile(r"\\blimit\\s+\\d+\\b", flags=re.IGNORECASE)


class Nl2SqlServiceError(Exception):
    pass


def _json_safe(value: object | None) -> object | None:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (datetime, date, time, Decimal, uuid.UUID)):
        return str(value)
    return str(value)


def _allowed_tables_set(raw: str) -> set[str]:
    return {part.strip().lower() for part in raw.split(",") if part.strip()}


async def get_accessible_schema(
    db: AsyncSession,
    allowed_tables_raw: str,
) -> list[dict[str, object]]:
    allowed_tables = _allowed_tables_set(allowed_tables_raw)
    if not allowed_tables:
        raise Nl2SqlServiceError("NL2SQL is not configured: no allowed tables set.")

    conn = await db.connection()

    def _inspect(sync_conn: sa.Connection) -> list[dict[str, object]]:
        inspector = sa.inspect(sync_conn)
        discovered: list[dict[str, object]] = []
        for table_name in sorted(inspector.get_table_names()):
            if table_name.lower() not in allowed_tables:
                continue
            columns = inspector.get_columns(table_name)
            discovered.append(
                {
                    "name": table_name,
                    "columns": [
                        {
                            "name": col.get("name", ""),
                            "type": str(col.get("type", "")),
                        }
                        for col in columns
                    ],
                }
            )
        return discovered

    tables = await conn.run_sync(_inspect)
    if not tables:
        raise Nl2SqlServiceError("No allowed tables were found in the connected database.")
    return tables


def _schema_to_prompt(tables: list[dict[str, object]]) -> str:
    lines: list[str] = []
    for table in tables:
        table_name = str(table["name"])
        cols = table.get("columns", [])
        col_parts = [f"{c['name']} ({c['type']})" for c in cols if isinstance(c, dict)]
        lines.append(f"- {table_name}: " + ", ".join(col_parts))
    return "\\n".join(lines)


def _extract_sql(text: str) -> str:
    raw = text.strip()
    if not raw:
        raise Nl2SqlServiceError("LLM returned an empty SQL response.")

    fenced = re.findall(r"```(?:sql)?\\s*(.*?)```", raw, flags=re.IGNORECASE | re.DOTALL)
    if fenced:
        raw = fenced[0].strip()

    if raw.lower().startswith("sqlquery:"):
        raw = raw.split(":", 1)[1].strip()

    # Keep only first statement and reject trailing extra text later in validation.
    first_line = raw.splitlines()[0].strip().lower()
    if first_line.startswith("select") or first_line.startswith("with"):
        candidate = raw
    else:
        match = re.search(r"\\b(select|with)\\b[\\s\\S]*", raw, flags=re.IGNORECASE)
        if not match:
            raise Nl2SqlServiceError("Could not find a SQL SELECT statement in model output.")
        candidate = match.group(0).strip()

    return candidate.strip()


def _normalize_table_ref(token: str) -> str:
    ref = token.strip().strip('"')
    if "." in ref:
        ref = ref.split(".")[-1]
    return ref.lower()


def _validate_sql(sql: str, allowed_tables: set[str], tables_with_user_id: set[str]) -> str:
    normalized = sql.strip()
    if normalized.endswith(";"):
        normalized = normalized[:-1].strip()

    lower = normalized.lower()
    if not (lower.startswith("select") or lower.startswith("with")):
        raise Nl2SqlServiceError("Only SELECT queries are allowed.")

    if ";" in normalized:
        raise Nl2SqlServiceError("Multiple statements are not allowed.")

    if FORBIDDEN_SQL_RE.search(normalized):
        raise Nl2SqlServiceError("Unsafe SQL detected. Only read-only SELECT is permitted.")

    refs = {_normalize_table_ref(token) for token in FROM_JOIN_RE.findall(normalized)}
    unknown = sorted(ref for ref in refs if ref not in allowed_tables)
    if unknown:
        raise Nl2SqlServiceError(
            "Query references tables outside the allowed list: " + ", ".join(unknown)
        )

    scoped_refs = refs.intersection(tables_with_user_id)
    if scoped_refs and ":current_user_id" not in lower:
        joined = ", ".join(sorted(scoped_refs))
        raise Nl2SqlServiceError(
            f"Query must include :current_user_id filter for user-scoped table(s): {joined}."
        )

    return normalized


def _apply_row_limit(sql: str, max_rows: int) -> str:
    if LIMIT_RE.search(sql):
        return sql
    return f"SELECT * FROM ({sql}) AS nl2sql_result LIMIT :_nl2sql_limit"


async def _generate_sql_from_question(
    question: str,
    schema_text: str,
    user_scoped_tables: set[str],
) -> str:
    scope_line = ", ".join(sorted(user_scoped_tables)) if user_scoped_tables else "(none)"
    prompt = (
        "You are a SQL assistant. Return ONLY a single read-only SQL query.\\n"
        "Rules:\\n"
        "1) Generate SELECT-only SQL (SELECT or WITH ... SELECT).\\n"
        "2) Never use INSERT/UPDATE/DELETE/DDL.\\n"
        "3) Only use tables listed in schema.\\n"
        "4) If using any table with user scope, include WHERE ... = :current_user_id.\\n"
        f"5) User-scoped tables: {scope_line}.\\n"
        "6) Do not wrap with markdown fences.\\n\\n"
        f"Schema:\\n{schema_text}\\n\\n"
        f"Question: {question}"
    )

    result = await llm.ainvoke(prompt)
    content = getattr(result, "content", result)
    return _extract_sql(str(content))


async def run_nl2sql_query(
    db: AsyncSession,
    current_user: User,
    question: str,
    *,
    allowed_tables_raw: str,
    max_rows: int,
) -> dict[str, object]:
    normalized_question = " ".join(question.split())
    if not normalized_question:
        raise Nl2SqlServiceError("Question cannot be empty.")

    tables = await get_accessible_schema(db, allowed_tables_raw)
    schema_text = _schema_to_prompt(tables)

    allowed_tables = {str(table["name"]).lower() for table in tables}
    tables_with_user_id = {
        str(table["name"]).lower()
        for table in tables
        if any(str(col.get("name", "")).lower() == "user_id" for col in table.get("columns", []))
    }

    generated_sql = await _generate_sql_from_question(normalized_question, schema_text, tables_with_user_id)
    safe_sql = _validate_sql(generated_sql, allowed_tables, tables_with_user_id)
    executable_sql = _apply_row_limit(safe_sql, max_rows)

    params: dict[str, object] = {}
    if ":_nl2sql_limit" in executable_sql:
        params["_nl2sql_limit"] = max_rows
    if ":current_user_id" in executable_sql:
        params["current_user_id"] = str(current_user.id)

    try:
        result = await db.execute(sa.text(executable_sql), params)
    except Exception as exc:
        raise Nl2SqlServiceError(f"Query execution failed: {exc}") from exc

    mappings = result.mappings().all()
    rows = [{key: _json_safe(value) for key, value in row.items()} for row in mappings]
    columns = list(rows[0].keys()) if rows else list(result.keys())

    return {
        "sql": safe_sql,
        "columns": columns,
        "rows": rows,
        "row_count": len(rows),
    }
