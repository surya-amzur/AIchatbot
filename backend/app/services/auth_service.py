from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.core.config import settings
from app.models.user import User


class AuthServiceError(Exception):
    pass


class EmployeeDomainNotAllowedError(AuthServiceError):
    pass


class UserAlreadyExistsError(AuthServiceError):
    pass


class InvalidCredentialsError(AuthServiceError):
    pass


def _allowed_domains() -> set[str]:
    return {
        domain.strip().lower()
        for domain in settings.allowed_employee_email_domains.split(",")
        if domain.strip()
    }


def _is_allowed_employee_email(email: str) -> bool:
    if "@" not in email:
        return False
    domain = email.rsplit("@", 1)[1].lower()
    return domain in _allowed_domains()


def _normalize_email(email: str) -> str:
    return email.strip().lower()


async def get_or_create_user_from_google_credential(
    db: AsyncSession, credential: str
) -> User:
    token_info = id_token.verify_oauth2_token(
        credential,
        google_requests.Request(),
        settings.google_client_id,
    )

    email = _normalize_email(str(token_info.get("email", "")))
    name = str(token_info.get("name", email.split("@")[0] if email else "User")).strip()
    google_sub = str(token_info.get("sub", "")).strip()

    if not _is_allowed_employee_email(email):
        raise EmployeeDomainNotAllowedError(
            "Only Amzur employee accounts can authenticate."
        )

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user:
        if google_sub and user.google_id != google_sub:
            user.google_id = google_sub
            await db.commit()
            await db.refresh(user)
        return user

    user = User(
        email=email,
        name=name,
        google_id=google_sub or None,
        hashed_password=None,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def signup_user_with_password(
    db: AsyncSession,
    email: str,
    name: str,
    password: str,
) -> User:
    normalized_email = _normalize_email(email)
    if not _is_allowed_employee_email(normalized_email):
        raise EmployeeDomainNotAllowedError(
            "Only Amzur employee accounts can authenticate."
        )

    result = await db.execute(select(User).where(User.email == normalized_email))
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise UserAlreadyExistsError("Account already exists for this email.")

    user = User(
        email=normalized_email,
        name=name.strip(),
        hashed_password=hash_password(password),
        google_id=None,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def login_user_with_password(
    db: AsyncSession,
    email: str,
    password: str,
) -> User:
    normalized_email = _normalize_email(email)
    result = await db.execute(select(User).where(User.email == normalized_email))
    user = result.scalar_one_or_none()
    if not user or not user.hashed_password:
        raise InvalidCredentialsError("Invalid email or password.")

    if not verify_password(password, user.hashed_password):
        raise InvalidCredentialsError("Invalid email or password.")

    return user
