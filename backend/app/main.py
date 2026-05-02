from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import (
    auth_router,
    chat_router,
    image_rules_router,
    nl2sql_router,
    rag_router,
    tabular_router,
)
from app.core.config import ROOT_DIR, settings
from app.db.session import init_db


def _resolved_upload_dir() -> Path:
    target = settings.upload_dir or "./uploads"
    path = Path(target)
    if not path.is_absolute():
        path = ROOT_DIR / path
    path.mkdir(parents=True, exist_ok=True)
    return path


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    _resolved_upload_dir()
    yield


app = FastAPI(
    title=settings.app_name or "amzur-ai-chat",
    debug=settings.environment == "development",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_origin_regex=r"^http://localhost:\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(image_rules_router)
app.include_router(nl2sql_router)
app.include_router(rag_router)
app.include_router(tabular_router)
app.mount("/uploads", StaticFiles(directory=str(_resolved_upload_dir())), name="uploads")


@app.get("/health", tags=["system"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}
