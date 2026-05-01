"""add chat threads and message thread reference

Revision ID: 20260501_0001
Revises:
Create Date: 2026-05-01
"""

from alembic import op
import sqlalchemy as sa
import uuid


revision = "20260501_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_threads",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chat_threads_user_id", "chat_threads", ["user_id"])
    op.create_index("ix_chat_threads_created_at", "chat_threads", ["created_at"])
    op.create_index("ix_chat_threads_updated_at", "chat_threads", ["updated_at"])

    op.add_column("messages", sa.Column("thread_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_messages_thread_id",
        "messages",
        "chat_threads",
        ["thread_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_messages_thread_id", "messages", ["thread_id"])

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT DISTINCT user_id FROM messages")).fetchall()
    for row in rows:
        user_id = row[0]
        thread_id = uuid.uuid4()
        bind.execute(
            sa.text(
                """
                INSERT INTO chat_threads (id, user_id, title, created_at, updated_at)
                VALUES (:thread_id, :user_id, :title, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """
            ),
            {"thread_id": thread_id, "user_id": user_id, "title": "Migrated Chat"},
        )
        bind.execute(
            sa.text(
                """
                UPDATE messages
                SET thread_id = :thread_id
                WHERE user_id = :user_id AND thread_id IS NULL
                """
            ),
            {"thread_id": thread_id, "user_id": user_id},
        )

    op.alter_column("messages", "thread_id", nullable=False)


def downgrade() -> None:
    op.drop_index("ix_messages_thread_id", table_name="messages")
    op.drop_constraint("fk_messages_thread_id", "messages", type_="foreignkey")
    op.drop_column("messages", "thread_id")

    op.drop_index("ix_chat_threads_updated_at", table_name="chat_threads")
    op.drop_index("ix_chat_threads_created_at", table_name="chat_threads")
    op.drop_index("ix_chat_threads_user_id", table_name="chat_threads")
    op.drop_table("chat_threads")
