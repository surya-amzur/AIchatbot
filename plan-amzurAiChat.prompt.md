# Amzur AI Chat Plan

## Goal
Build an internal multi-user conversational AI platform with secure authentication, persistent threaded chat, Supabase-backed storage, and AI responses routed exclusively through the Amzur LiteLLM proxy.

## Core Stack
- Frontend: React 19 + TypeScript + Vite + Tailwind CSS v4
- Backend: FastAPI + LangChain + SQLAlchemy 2.0 (async)
- Database: PostgreSQL via Supabase (Session Pooler, IPv4 compatible)
- Auth: JWT httpOnly cookie — manual email/password + Google OAuth 2.0
- AI: All LLM calls routed through `litellm.amzur.com` proxy
- Model: `gemini/gemini-2.5-flash` (LiteLLM Gemini route)

---

## Project 1 — Simple Chatbot with LLM + UI ✅ COMPLETE

### Goal
A working chat UI talking to a LLM backend via LangChain.

### What Was Built
- FastAPI backend with `/api/chat/send` streaming endpoint.
- LangChain `ChatOpenAI`-compatible client pointed at LiteLLM proxy using `gemini/gemini-2.5-flash`.
- LangChain chain: `ChatPromptTemplate | llm | StrOutputParser` in `backend/app/ai/chains/chat_chain.py`.
- React frontend with `InputBar` (textarea + send button) and `MessageList` (streaming token-by-token display).
- Markdown rendering via `react-markdown` with `remark-gfm`, `remark-math`, `rehype-katex` for full markdown, tables, code blocks, and LaTeX math.
- SSE streaming via native `fetch` + `ReadableStream` reader in `frontend/src/lib/api.ts`.

### Key Files
- `backend/app/ai/llm.py` — LiteLLM proxy client config
- `backend/app/ai/chains/chat_chain.py` — LangChain chat chain
- `backend/app/api/chat.py` — streaming endpoint
- `frontend/src/components/chat/InputBar.tsx`
- `frontend/src/components/chat/MessageList.tsx`

### Validation
- 37/37 live smoke checks passed
- LLM replied: *"I am a large language model, trained by Google."*
- Streaming confirmed with 3+ SSE chunks per response

---

## Project 2 — PostgreSQL DB + Employee Auth + Load Stored Chats ✅ COMPLETE

### Goal
Persist all chats in PostgreSQL, restrict login to Amzur employees, and load chat history after login.

### What Was Built
- SQLAlchemy 2.0 async models: `users`, `chat_threads`, `messages` with full FK/cascade relationships.
- Alembic migration `20260501_0001_chat_threads.py` for schema creation.
- Legacy schema compatibility handler in `backend/app/db/session.py` (auto-adds `thread_id` column if missing).
- Supabase PostgreSQL connection via `asyncpg` Session Pooler URL.
- Auth endpoints: `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- JWT httpOnly cookie session (`python-jose`, `bcrypt` password hashing).
- Employee domain enforcement: only `@amzur.com` (configurable via `ALLOWED_EMPLOYEE_EMAIL_DOMAINS`).
- Chat history endpoint: `GET /api/chat/history?thread_id=<uuid>` and flat all-history mode (no thread_id).
- Frontend loads all threads on login, auto-selects first thread, "All Chats" mode loads flat history.

### Key Files
- `backend/app/models/` — User, ChatThread, Message models
- `backend/app/services/auth_service.py` — signup, login, Google auth, domain check
- `backend/app/services/chat_service.py` — message persistence, history fetch
- `backend/app/core/security.py` — JWT create/decode, bcrypt
- `backend/app/core/dependencies.py` — cookie-based `get_current_user`
- `backend/alembic/versions/20260501_0001_chat_threads.py`
- `frontend/src/hooks/useAuth.ts`, `useChat.ts`

### Validation
- Non-employee signup rejected with `domain_not_allowed` (403)
- Messages persisted to Supabase, confirmed via history endpoint
- 6 backend pytest tests + 3 frontend Vitest tests pass

---

## Project 3 — Google OAuth + Thread CRUD + Auto Names + Load on Login ✅ COMPLETE

### Goal
Allow Google sign-in, manage thread lifecycle, auto-name threads, load on login.

### What Was Built
- Google One Tap sign-in via `google.accounts.id` rendered in `LoginPage.tsx`.
- Backend `POST /api/auth/google/login` validates Google ID token via `google-auth` library.
- Thread auto-naming: first 60 chars of first user message becomes the thread title (`_make_thread_title`).
- Thread rename: `PATCH /api/chat/threads/:id` — validates non-blank title, persists, updates `updated_at`.
- Thread delete: `DELETE /api/chat/threads/:id` — cascades to messages via FK `ondelete=CASCADE`.
- Frontend sidebar: per-thread Rename (browser prompt) and Delete (confirm dialog) buttons.
- "All Chats" view loads flat message history across all threads.
- Threads load immediately after login via `useChatThreadsQuery` (TanStack Query).

### Key Files
- `backend/app/services/auth_service.py` — `get_or_create_user_from_google_credential`
- `backend/app/api/chat.py` — PATCH and DELETE thread endpoints
- `backend/app/schemas/chat.py` — `ThreadUpdateRequest`, `ChatActionResponse`
- `frontend/src/pages/LoginPage.tsx` — Google One Tap UI
- `frontend/src/pages/ChatPage.tsx` — rename/delete handlers + All Chats / New Chat buttons
- `frontend/src/hooks/useChat.ts` — `useRenameThreadMutation`, `useDeleteThreadMutation`
- `backend/tests/test_auth_and_chat.py` — thread rename/delete test

### Validation
- 7 backend pytest tests pass (auth, chat, thread CRUD, user isolation)
- 3 frontend Vitest tests pass
- 37/37 smoke checks passed (rename, delete, 404 on re-delete, post-logout 401)

---

## Project 4 — Conversation Memory (Last 5 Turns) ✅ COMPLETE

### Goal
The chat should remember the last 5 full conversation turns (5 user messages + 5 assistant replies = 10 messages) within a thread before answering, so follow-up questions are answered in context.

### Design
- A "turn" = one user message + one assistant reply pair.
- The LLM receives the last 5 turns as structured `HumanMessage` / `AIMessage` objects in the prompt — not a raw string — so the model sees them as actual conversation history.
- The current user message is passed separately as the final `HumanMessage`.
- The history window is capped at `MEMORY_TURNS = 5` (10 messages max).
- History is fetched fresh from the DB on every request — no in-memory cache, so it survives server restarts and works across multiple server instances.
- The `_format_history` raw-string approach is replaced with LangChain `MessagesPlaceholder` so the model gets properly typed chat history.

### Implemented
1. Updated `chat_chain.py` to use `MessagesPlaceholder("history")`.
2. Replaced raw history formatter with `_build_memory_messages()` in `chat_service.py`.
3. `stream_chat_response()` now passes typed memory messages + current user message separately.
4. Added unit/integration tests validating 5-turn cap and order.

### Key Files
- `backend/app/ai/chains/chat_chain.py`
- `backend/app/services/chat_service.py`
- `backend/tests/test_auth_and_chat.py`

### Known Decisions
- 5 turns = 10 messages (user+assistant pairs). A standalone user message without an assistant reply is not counted as a full turn.
- History is scoped per thread — memory does not bleed across threads.
- The current user message is NOT included in the history list; it is passed as `{message}` separately.

---

## Project 5 — Attachments (Images, Videos, Tables, Formulas, Code) ✅ COMPLETE

### Goal
Allow the chat input to accept image, video, table, formula, and code attachments alongside text messages.

### Implemented Scope
- Frontend attachment picker in `InputBar` supports multi-file selection.
- Backend `POST /api/chat/upload` saves allowed file types to `UPLOAD_DIR` with size and MIME validation.
- Static file serving at `/uploads/*` is enabled.
- Messages now persist `attachments` metadata as JSON in the `messages` table.
- Sending chat supports `attachments` payload while preserving streaming responses.
- Message list renders attachment chips and inline image/video previews.
- Attachment text context extraction is injected into the chain prompt for: text, markdown, csv, json, pdf, xlsx.
- Image attachments are passed to Gemini as multimodal `image_url` inputs (base64 data URL) for actual visual analysis.
- Added backend tests for upload endpoint and attachment persistence.

### Notes
- Video files are supported as attachments and inline previews; deep video parsing is deferred.
- Formula and code content is supported in chat rendering via markdown + KaTeX and via attached text/code files.

---

## Project 6 — Image Generation (Gemini Imagen) ✅ COMPLETE

### Goal
Allow users to request image generation inside the chat. Uses `gemini/imagen-4.0-fast-generate-001` via LiteLLM proxy.

### Implemented
- Backend endpoint `POST /api/chat/generate-image` implemented.
- Uses LiteLLM OpenAI-compatible image API with configured model `gemini/imagen-4.0-fast-generate-001`.
- Generated base64 image bytes are persisted to `UPLOAD_DIR` as `generated_<uuid>.png`.
- Assistant message stores generated image as attachment metadata in `messages.attachments`.
- Frontend `Generate Image` button added in chat input.
- Generated image appears inline in chat through existing attachment preview rendering.

### Key Files
- `backend/app/api/chat.py`
- `backend/app/services/chat_service.py`
- `frontend/src/components/chat/InputBar.tsx`
- `frontend/src/pages/ChatPage.tsx`
- `frontend/src/lib/api.ts`

### Validation
- Backend tests include image generation persistence test and pass.
- Full backend suite currently: 17 passing tests.
- Frontend tests and production build pass.

---

## Project 7 — RAG with PDF (ChromaDB + OpenAI Embeddings Large) ✅ COMPLETE

### Goal
Upload a PDF into the chat and ask questions about its content. Uses RAG with ChromaDB for vector storage and `text-embedding-3-large` for embeddings.

### Implemented
- Backend `POST /api/rag/upload` accepts PDF files and stores chunk vectors in persistent ChromaDB.
- Backend `POST /api/rag/query` retrieves top-k chunks and generates grounded answers with citations.
- Implemented `backend/app/ai/rag/pdf_rag.py` for PDF extraction (`pypdf`), chunking, embedding, retrieval, and answer generation.
- Embeddings use `OpenAIEmbeddings(model="text-embedding-3-large")` routed via LiteLLM-compatible OpenAI API settings.
- Chroma persistence is configured via `CHROMA_PERSIST_DIR` (default `./chroma_db`), with per-user collections.
- Frontend supports PDF upload and RAG query flow in chat mode, including citation rendering.
- RAG routes are registered in the main app and available under `/api/rag/*`.

### Key Files
- `backend/app/ai/rag/pdf_rag.py`
- `backend/app/api/rag.py`
- `backend/app/schemas/rag.py`
- `backend/app/main.py`
- `frontend/src/components/chat/InputBar.tsx`
- `frontend/src/pages/ChatPage.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/types/index.ts`

### Validation
- Backend test suite: 19 passing tests.
- Includes RAG endpoint tests (`/api/rag/upload`, `/api/rag/query`) with service monkeypatching.
- Frontend tests and build pass with Project 7 integrations.

---

## Project 8 — NL2SQL + Excel/GSheet QA + Image Rule Validation ✅ COMPLETE

### Goal
Three sub-projects:
1. Connect to a database and ask questions in natural language (NL → SQL → result).
2. Upload an Excel or Google Sheet and ask questions about the data.
3. Upload images and check them against a set of rules (data extraction + rule validation).

### Current Progress
- ✅ Sub-project 1 (NL2SQL) implemented on backend.
- ✅ Sub-project 2 (Excel/GSheet QA) implemented on backend.
- ✅ Sub-project 3 (Image rule validation) implemented on backend.

### Design

#### NL2SQL
- Backend endpoint `GET /api/nl2sql/schema` returns allowed-table schema for prompting.
- Backend endpoint `POST /api/nl2sql/query` runs NL question → SQL → results flow.
- SQL generation uses LiteLLM-routed LLM (`llm`) and returns a single SQL statement.
- Guardrails enforce read-only SQL:
	- only `SELECT`/`WITH ... SELECT`
	- forbidden DML/DDL keywords rejected
	- multi-statement SQL rejected
	- table references must stay inside configured allowlist (`NL2SQL_ALLOWED_TABLES`)
	- queries touching `user_id` tables must include `:current_user_id`
- Execution applies row cap (`NL2SQL_MAX_ROWS`) when missing and returns JSON-safe rows.
- Backend tests added for NL2SQL schema and query endpoints.

#### Excel / GSheet QA
- Backend endpoint `POST /api/tabular/upload-excel` ingests `.xlsx/.xls` and indexes rows for retrieval.
- Backend endpoint `POST /api/tabular/upload-gsheet` ingests Google Sheet data via `gspread` using `GOOGLE_SERVICE_ACCOUNT_JSON`.
- Backend endpoint `POST /api/tabular/query` answers natural-language questions over uploaded tabular datasets.
- Retrieval is embedding-based (`text-embedding-3-large` through LiteLLM) and responses include row-level citations.
- Answers are generated through existing chat chain with retrieved tabular row context.
- Added backend tests for excel upload, gsheet upload, and tabular query endpoints.

#### Image Rule Validation
- Backend endpoint `POST /api/image-rules/validate` accepts an image + rules text (JSON list or newline rules).
- Vision-enabled LLM call is routed through LiteLLM proxy and returns structured JSON output.
- Response includes extracted key-value data plus per-rule pass/fail evidence.
- Validation result is persisted into chat thread history for continuity.
- Added backend tests for successful validation and non-image rejection.

---

## Agent Modules ⬜ PLANNED

### Basic LangChain Agent
- ReAct agent with custom tools using LangChain `AgentExecutor`.
- Tool examples: web search, calculator, date/time.

### Tic-Tac-Toe Agent
- Two agents playing against each other using LangChain tool-calling.
- Game state managed as structured state; each move is a tool call.

### MCP Example
- Agent connected to a Model Context Protocol server.
- Demonstrates tool discovery and invocation through MCP.

### n8n Agent Orchestration
- Workflow automation using n8n nodes connected to the backend AI endpoints.
- Example: email → summarize → reply draft.

---

## Data Model

### Current (Projects 1–7)
- `users`: id, email, name, google_id, hashed_password, created_at
- `chat_threads`: id, user_id, title, created_at, updated_at
- `messages`: id, user_id, thread_id, role, content, attachments(JSON), created_at

### Planned Additions
- `documents` — user_id, thread_id, filename, chunk_count, chroma_collection, created_at

---

## Known Decisions
- Use httpOnly cookies instead of localStorage tokens.
- Use Supabase Session Pooler for IPv4 compatibility.
- Keep `.env` local and out of version control.
- Keep `.copilot/` local and out of version control.
- New Chat stays in draft mode until the first message is sent.
- Memory window is per-thread, loaded from DB on each request (no server-side cache).
- All LLM and embedding calls go through `litellm.amzur.com` — no direct model API calls.
- ChromaDB persists locally at `CHROMA_PERSIST_DIR` (configured in `.env`).
- NL2SQL queries are validated to be read-only before execution.
