from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from google.auth.exceptions import GoogleAuthError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.core.security import create_access_token
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    GoogleLoginRequest,
    LoginSuccessResponse,
    ManualLoginRequest,
    ManualSignupRequest,
    UserOut,
)
from app.services.auth_service import (
    EmployeeDomainNotAllowedError,
    InvalidCredentialsError,
    get_or_create_user_from_google_credential,
    login_user_with_password,
    signup_user_with_password,
    UserAlreadyExistsError,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _build_login_cookie_response() -> JSONResponse:
    response = JSONResponse(content=LoginSuccessResponse(status="ok").model_dump())
    return response


def _set_access_cookie(response: JSONResponse, email: str) -> None:
    token = create_access_token(email)
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=settings.environment != "development",
        samesite="lax",
        max_age=(settings.jwt_expire_minutes or 480) * 60,
        path="/",
    )


@router.post("/signup", response_model=LoginSuccessResponse)
async def signup(
    payload: ManualSignupRequest,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    try:
        user = await signup_user_with_password(
            db,
            payload.email,
            payload.name,
            payload.password,
        )
    except UserAlreadyExistsError as exc:
        raise HTTPException(
            status_code=409,
            detail={"error": "user_exists", "message": str(exc)},
        ) from exc
    except EmployeeDomainNotAllowedError as exc:
        raise HTTPException(
            status_code=403,
            detail={"error": "domain_not_allowed", "message": str(exc)},
        ) from exc

    response = _build_login_cookie_response()
    _set_access_cookie(response, user.email)
    return response


@router.post("/login", response_model=LoginSuccessResponse)
async def login(
    payload: ManualLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    try:
        user = await login_user_with_password(db, payload.email, payload.password)
    except InvalidCredentialsError as exc:
        raise HTTPException(
            status_code=401,
            detail={"error": "invalid_credentials", "message": str(exc)},
        ) from exc

    response = _build_login_cookie_response()
    _set_access_cookie(response, user.email)
    return response


@router.post("/google/login", response_model=LoginSuccessResponse)
async def google_login(
    payload: GoogleLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    try:
        user = await get_or_create_user_from_google_credential(db, payload.credential)
    except EmployeeDomainNotAllowedError as exc:
        raise HTTPException(
            status_code=403,
            detail={"error": "domain_not_allowed", "message": str(exc)},
        ) from exc
    except (GoogleAuthError, ValueError) as exc:
        raise HTTPException(
            status_code=401,
            detail={"error": "invalid_google_token", "message": str(exc)},
        ) from exc

    response = _build_login_cookie_response()
    _set_access_cookie(response, user.email)
    return response


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)) -> UserOut:
    return current_user


@router.post("/logout", response_model=LoginSuccessResponse)
async def logout() -> JSONResponse:
    response = JSONResponse(content=LoginSuccessResponse(status="ok").model_dump())
    response.delete_cookie(key="access_token", path="/")
    return response
