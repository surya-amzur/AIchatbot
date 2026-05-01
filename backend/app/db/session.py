from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
import logging
import uuid

import sqlalchemy as sa

from app.core.config import settings
from app.db.base import Base
import app.models  # noqa: F401
from app.models.thread import ChatThread


logger = logging.getLogger(__name__)


def _build_async_db_url(url: str) -> str:
    if url.startswith("postgresql+asyncpg://"):
        return url
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


engine = create_async_engine(_build_async_db_url(settings.database_url), future=True)
SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with SessionLocal() as session:
        yield session


def _ensure_legacy_thread_schema(sync_conn: sa.Connection) -> None:
    inspector = sa.inspect(sync_conn)
    table_names = set(inspector.get_table_names())

    if "messages" not in table_names:
        return

    if "chat_threads" not in table_names:
        ChatThread.__table__.create(sync_conn, checkfirst=True)

    message_columns = {column["name"] for column in inspector.get_columns("messages")}
    if "thread_id" not in message_columns:
        column_type = "UUID" if sync_conn.dialect.name == "postgresql" else "CHAR(32)"
        sync_conn.execute(sa.text(f"ALTER TABLE messages ADD COLUMN thread_id {column_type}"))

    users = sync_conn.execute(
        sa.text("SELECT DISTINCT user_id FROM messages WHERE user_id IS NOT NULL")
    ).fetchall()

    for row in users:
        user_id = row[0]
        existing = sync_conn.execute(
            sa.text(
                "SELECT id FROM chat_threads WHERE user_id = :user_id ORDER BY created_at ASC LIMIT 1"
            ),
            {"user_id": user_id},
        ).fetchone()

        if existing:
            thread_id = existing[0]
        else:
            thread_id = uuid.uuid4().hex
            sync_conn.execute(
                sa.text(
                    """
                    INSERT INTO chat_threads (id, user_id, title, created_at, updated_at)
                    VALUES (:id, :user_id, :title, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    """
                ),
                {
                    "id": thread_id,
                    "user_id": user_id,
                    "title": "Migrated Chat",
                },
            )

        sync_conn.execute(
            sa.text(
                """
                UPDATE messages
                SET thread_id = :thread_id
                WHERE user_id = :user_id AND (thread_id IS NULL OR thread_id = '')
                """
            ),
            {
                "thread_id": thread_id,
                "user_id": user_id,
            },
        )

    # Index creation is idempotent in sqlite/postgres with IF NOT EXISTS.
    sync_conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_messages_thread_id ON messages (thread_id)"))


async def init_db() -> None:
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.run_sync(_ensure_legacy_thread_schema)
    except Exception as exc:
        logger.warning("Database initialization skipped: %s", exc)
