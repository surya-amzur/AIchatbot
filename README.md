# Amzur AI Chat Scaffold

This repository contains the initial scaffold for the Amzur AI Chat project.

## What Is Included

- Frontend scaffold with React + TypeScript + Tailwind CSS (Vite)
- Backend scaffold with FastAPI + environment-based configuration
- Project folder structure aligned to the architecture instructions in `.copilot/copilot-instructions.md`
- Environment variable templates for backend and frontend
- Baseline API client file and shared frontend types file

No feature logic is implemented yet.

## Repository Structure

```text
.
├── README.md
├── .env.example
├── backend/
│   ├── .env.example
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── api/
│       ├── services/
│       ├── models/
│       ├── schemas/
│       ├── ai/
│       │   ├── llm.py
│       │   ├── chains/
│       │   ├── memory/
│       │   ├── rag/
│       │   └── prompts/
│       ├── db/
│       └── core/
└── frontend/
    ├── .env.example
    ├── package.json
    ├── tailwind.config.ts
    ├── postcss.config.js
    └── src/
        ├── components/
        │   ├── chat/
        │   ├── attachments/
        │   └── auth/
        ├── pages/
        ├── hooks/
        ├── lib/
        │   └── api.ts
        └── types/
            └── index.ts
```

## Prerequisites

- Python 3.11+
- Node.js 20+
- npm 10+

## Environment Setup

### Backend

1. Copy either root `.env.example` or `backend/.env.example` to `.env` at repository root.
2. Fill in all required values.

### Frontend

1. Copy `frontend/.env.example` to `frontend/.env`.
2. Adjust `VITE_API_BASE_URL` if needed. Default points to `http://localhost:8000`.

## Backend Setup And Run

```bash
cd backend
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend health check:

- GET http://localhost:8000/health

## Frontend Setup And Run

```bash
cd frontend
npm install
npm run dev
```

Frontend default dev URL:

- http://localhost:5173

## Project Rules (Scaffold-Level)

- No secrets in source code.
- Load all configuration from environment variables.
- Frontend API calls go through `frontend/src/lib/api.ts`.
- Backend settings are centralized in `backend/app/core/config.py`.
- All AI calls must route through the LiteLLM proxy in future feature work.

## Next Recommended Steps

1. Add linting and formatting config for both backend and frontend (ruff, eslint, prettier).
2. Add test configuration (pytest, pytest-asyncio, vitest).
3. Add Alembic initialization and first migration setup.
4. Add auth, database models, and API routers feature-by-feature.
