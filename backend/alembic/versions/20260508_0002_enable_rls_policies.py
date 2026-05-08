"""enable row level security and policies for core chat tables

Revision ID: 20260508_0002
Revises: 20260501_0001
Create Date: 2026-05-08
"""

from alembic import op


revision = "20260508_0002"
down_revision = "20260501_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Ensure RLS is always enabled on public tables used by the client API.
    op.execute("ALTER TABLE public.users ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY")

    # users policies
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = 'users'
                  AND policyname = 'users_select_own'
            ) THEN
                CREATE POLICY users_select_own
                ON public.users
                FOR SELECT
                USING (id = auth.uid());
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = 'users'
                  AND policyname = 'users_update_own'
            ) THEN
                CREATE POLICY users_update_own
                ON public.users
                FOR UPDATE
                USING (id = auth.uid())
                WITH CHECK (id = auth.uid());
            END IF;
        END
        $$;
        """
    )

    # chat_threads policies
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = 'chat_threads'
                  AND policyname = 'chat_threads_select_own'
            ) THEN
                CREATE POLICY chat_threads_select_own
                ON public.chat_threads
                FOR SELECT
                USING (user_id = auth.uid());
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = 'chat_threads'
                  AND policyname = 'chat_threads_insert_own'
            ) THEN
                CREATE POLICY chat_threads_insert_own
                ON public.chat_threads
                FOR INSERT
                WITH CHECK (user_id = auth.uid());
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = 'chat_threads'
                  AND policyname = 'chat_threads_update_own'
            ) THEN
                CREATE POLICY chat_threads_update_own
                ON public.chat_threads
                FOR UPDATE
                USING (user_id = auth.uid())
                WITH CHECK (user_id = auth.uid());
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = 'chat_threads'
                  AND policyname = 'chat_threads_delete_own'
            ) THEN
                CREATE POLICY chat_threads_delete_own
                ON public.chat_threads
                FOR DELETE
                USING (user_id = auth.uid());
            END IF;
        END
        $$;
        """
    )

    # messages policies
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = 'messages'
                  AND policyname = 'messages_select_own'
            ) THEN
                CREATE POLICY messages_select_own
                ON public.messages
                FOR SELECT
                USING (user_id = auth.uid());
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = 'messages'
                  AND policyname = 'messages_insert_own'
            ) THEN
                CREATE POLICY messages_insert_own
                ON public.messages
                FOR INSERT
                WITH CHECK (
                    user_id = auth.uid()
                    AND EXISTS (
                        SELECT 1
                        FROM public.chat_threads ct
                        WHERE ct.id = thread_id
                          AND ct.user_id = auth.uid()
                    )
                );
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = 'messages'
                  AND policyname = 'messages_update_own'
            ) THEN
                CREATE POLICY messages_update_own
                ON public.messages
                FOR UPDATE
                USING (user_id = auth.uid())
                WITH CHECK (
                    user_id = auth.uid()
                    AND EXISTS (
                        SELECT 1
                        FROM public.chat_threads ct
                        WHERE ct.id = thread_id
                          AND ct.user_id = auth.uid()
                    )
                );
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = 'messages'
                  AND policyname = 'messages_delete_own'
            ) THEN
                CREATE POLICY messages_delete_own
                ON public.messages
                FOR DELETE
                USING (user_id = auth.uid());
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS messages_delete_own ON public.messages")
    op.execute("DROP POLICY IF EXISTS messages_update_own ON public.messages")
    op.execute("DROP POLICY IF EXISTS messages_insert_own ON public.messages")
    op.execute("DROP POLICY IF EXISTS messages_select_own ON public.messages")

    op.execute("DROP POLICY IF EXISTS chat_threads_delete_own ON public.chat_threads")
    op.execute("DROP POLICY IF EXISTS chat_threads_update_own ON public.chat_threads")
    op.execute("DROP POLICY IF EXISTS chat_threads_insert_own ON public.chat_threads")
    op.execute("DROP POLICY IF EXISTS chat_threads_select_own ON public.chat_threads")

    op.execute("DROP POLICY IF EXISTS users_update_own ON public.users")
    op.execute("DROP POLICY IF EXISTS users_select_own ON public.users")

    op.execute("ALTER TABLE public.messages DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.chat_threads DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.users DISABLE ROW LEVEL SECURITY")
