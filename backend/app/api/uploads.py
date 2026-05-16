from pathlib import Path

from fastapi import APIRouter, Depends

from app.core.config import ROOT_DIR, settings
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


def _get_upload_dir() -> Path:
    target = settings.upload_dir or "./uploads"
    path = Path(target)
    if not path.is_absolute():
        path = ROOT_DIR / path
    return path


@router.get("/list")
async def list_uploads(current_user: User = Depends(get_current_user)) -> dict:
    """List all uploaded files."""
    upload_dir = _get_upload_dir()
    
    if not upload_dir.exists():
        return {"files": []}
    
    # Get all files, sort by modification time (newest first)
    files = sorted(
        [f.name for f in upload_dir.iterdir() if f.is_file()],
        key=lambda f: (upload_dir / f).stat().st_mtime,
        reverse=True
    )
    
    return {"files": files}
