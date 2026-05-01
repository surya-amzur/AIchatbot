from fastapi import Cookie, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User


async def get_current_user(
    access_token: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not access_token:
        raise HTTPException(
            status_code=401,
            detail={"error": "unauthorized", "message": "Not authenticated"},
        )

    email = decode_access_token(access_token)
    if not email:
        raise HTTPException(
            status_code=401,
            detail={"error": "unauthorized", "message": "Invalid or expired token"},
        )

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=401,
            detail={"error": "unauthorized", "message": "User not found"},
        )

    return user
