import uuid

from pydantic import BaseModel, EmailStr, Field


class GoogleLoginRequest(BaseModel):
    credential: str


class ManualSignupRequest(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=72)


class ManualLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    name: str

    model_config = {"from_attributes": True}


class LoginSuccessResponse(BaseModel):
    status: str
