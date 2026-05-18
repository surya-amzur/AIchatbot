import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api import (
    auth_router,
    chat_router,
    image_rules_router,
    nl2sql_router,
    rag_router,
    research_router,
    tabular_router,
    tictactoe_router,
    uploads_router,
)
from app.core.config import ROOT_DIR, settings, validate_settings
from app.core.rate_limit import limiter
from app.db.session import init_db

logger = logging.getLogger(__name__)


def _resolved_upload_dir() -> Path:
    target = settings.upload_dir or "./uploads"
    path = Path(target)
    if not path.is_absolute():
        path = ROOT_DIR / path
    path.mkdir(parents=True, exist_ok=True)
    return path


@asynccontextmanager
async def lifespan(_: FastAPI):
    validate_settings(settings)
    await init_db()
    _resolved_upload_dir()
    yield


app = FastAPI(
    title=settings.app_name or "amzur-ai-chat",
    debug=settings.environment == "development",
    lifespan=lifespan,
)

# Rate limiter + its 429 handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled exception on %s: %s", request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "message": "An unexpected error occurred."},
    )


# CORS: restrict wildcard localhost regex to dev only
cors_kwargs: dict = {
    "allow_origins": [settings.frontend_url],
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if settings.environment == "development":
    cors_kwargs["allow_origin_regex"] = r"^http://localhost:\d+$"

app.add_middleware(CORSMiddleware, **cors_kwargs)

app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(image_rules_router)
app.include_router(nl2sql_router)
app.include_router(rag_router)
app.include_router(research_router)
app.include_router(tabular_router)
app.include_router(tictactoe_router)
app.include_router(uploads_router)
app.mount("/uploads", StaticFiles(directory=str(_resolved_upload_dir())), name="uploads")


@app.get("/health", tags=["system"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}
