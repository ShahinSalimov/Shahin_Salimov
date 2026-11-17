"""Login, user management and tenant API keys.

    POST  /api/auth/login              email + password -> session token (rate limited per IP and per email)
    GET   /api/auth/me                 current principal
    GET   /api/users                   list users of the caller's company          (admin)
    POST  /api/users                   create a user                               (admin)
    PATCH /api/users/{id}              change role / deactivate                    (admin)
    GET   /api/api-keys                list API keys (never the secret)            (admin)
    POST  /api/api-keys                create a key; plaintext returned ONCE       (admin)
    POST  /api/api-keys/{id}/revoke    revoke a key                                (admin)

Platform (operator) principals must pass ``company_id`` to act on a tenant.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_serializer, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import Settings, get_settings
from backend.db import get_session
from backend.models import ApiKey, CompanyProfile, Role, User, utcnow
from backend.schemas import ShortText, as_utc
from backend.security import (
    DUMMY_HASH,
    Admin,
    Principal,
    Viewer,
    check_password_strength,
    enforce_rate_limit,
    hash_password,
    issue_token,
    new_api_key,
    verify_password,
)

router = APIRouter(prefix="/api", tags=["auth"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class LoginIn(_In):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    company_id: uuid.UUID
    email: str
    name: str
    role: Role
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None

    @field_serializer("created_at", "last_login_at")
    def _ser(self, dt: datetime | None) -> str | None:
        v = as_utc(dt)
        return v.isoformat() if v else None


class LoginOut(BaseModel):
    token: str
    expires_at: int
    user: UserOut


class MeOut(BaseModel):
    kind: str
    role: Role
    email: str | None
    company_id: uuid.UUID | None
    company_name: str | None


class UserCreate(_In):
    email: EmailStr
    name: ShortText
    role: Role = Role.ANALYST
    password: str = Field(max_length=256)

    @field_validator("password")
    @classmethod
    def _strong(cls, v: str) -> str:
        check_password_strength(v)
        return v


class UserUpdate(_In):
    role: Role | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, max_length=256)

    @field_validator("password")
    @classmethod
    def _strong(cls, v: str | None) -> str | None:
        if v is not None:
            check_password_strength(v)
        return v


class ApiKeyCreate(_In):
    name: ShortText
    role: Role = Role.ANALYST


class ApiKeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    prefix: str
    role: Role
    created_by: str | None
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None

    @field_serializer("created_at", "last_used_at", "revoked_at")
    def _ser(self, dt: datetime | None) -> str | None:
        v = as_utc(dt)
        return v.isoformat() if v else None


class ApiKeyCreated(ApiKeyOut):
    key: str = Field(description="Shown once. Store it securely.")


def _tenant(principal: Principal, company_id: uuid.UUID | None) -> uuid.UUID:
    if principal.company_id is not None:
        if company_id is not None and company_id != principal.company_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
        return principal.company_id
    if company_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Platform keys must pass company_id")
    return company_id


@router.post("/auth/login", response_model=LoginOut)
async def login(body: LoginIn, request: Request, session: SessionDep, settings: SettingsDep) -> LoginOut:
    ip = request.client.host if request.client else "unknown"
    limit = settings.login_rate_limit_per_minute
    await enforce_rate_limit(f"ip:{ip}", "login", limit)
    await enforce_rate_limit(f"email:{body.email.lower()}", "login", limit)

    user = (await session.execute(select(User).where(func.lower(User.email) == body.email.lower()))).scalar_one_or_none()
    valid = verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    if user is None or not valid or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    user.last_login_at = utcnow()
    await session.commit()
    token, expires = issue_token(user, settings)
    return LoginOut(token=token, expires_at=expires, user=UserOut.model_validate(user))


@router.get("/auth/me", response_model=MeOut)
async def me(principal: Viewer, session: SessionDep) -> MeOut:
    company = await session.get(CompanyProfile, principal.company_id) if principal.company_id else None
    return MeOut(
        kind=principal.kind, role=principal.role, email=principal.email,
        company_id=principal.company_id, company_name=company.name if company else None,
    )


@router.get("/users", response_model=list[UserOut])
async def list_users(principal: Admin, session: SessionDep, company_id: uuid.UUID | None = None) -> list[User]:
    tenant = _tenant(principal, company_id)
    return list((await session.execute(select(User).where(User.company_id == tenant).order_by(User.created_at))).scalars())


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(
    body: UserCreate, principal: Admin, session: SessionDep, company_id: Annotated[uuid.UUID | None, Query()] = None
) -> User:
    tenant = _tenant(principal, company_id)
    if await session.get(CompanyProfile, tenant) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    user = User(company_id=tenant, email=body.email.lower(), name=body.name, role=body.role, password_hash=hash_password(body.password))
    session.add(user)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this email already exists") from exc
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: uuid.UUID, body: UserUpdate, principal: Admin, session: SessionDep) -> User:
    user = await session.get(User, user_id)
    if user is None or not principal.can_access(user.company_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if principal.kind == "user" and principal.id == str(user.id) and (
        (body.role is not None and body.role is not Role.ADMIN) or body.is_active is False
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot demote or deactivate your own account")
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.password is not None:
        user.password_hash = hash_password(body.password)
    await session.commit()
    return user


@router.get("/api-keys", response_model=list[ApiKeyOut])
async def list_api_keys(principal: Admin, session: SessionDep, company_id: uuid.UUID | None = None) -> list[ApiKey]:
    tenant = _tenant(principal, company_id)
    return list((await session.execute(select(ApiKey).where(ApiKey.company_id == tenant).order_by(ApiKey.created_at))).scalars())


@router.post("/api-keys", response_model=ApiKeyCreated, status_code=201)
async def create_api_key(
    body: ApiKeyCreate, principal: Admin, session: SessionDep, company_id: Annotated[uuid.UUID | None, Query()] = None
) -> ApiKeyCreated:
    tenant = _tenant(principal, company_id)
    if await session.get(CompanyProfile, tenant) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    plaintext, prefix, digest = new_api_key()
    key = ApiKey(company_id=tenant, name=body.name, prefix=prefix, key_hash=digest, role=body.role, created_by=principal.label)
    session.add(key)
    await session.commit()
    return ApiKeyCreated(**ApiKeyOut.model_validate(key).model_dump(), key=plaintext)


@router.post("/api-keys/{key_id}/revoke", response_model=ApiKeyOut)
async def revoke_api_key(key_id: uuid.UUID, principal: Admin, session: SessionDep) -> ApiKey:
    key = await session.get(ApiKey, key_id)
    if key is None or not principal.can_access(key.company_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API key not found")
    if key.revoked_at is None:
        key.revoked_at = utcnow()
        await session.commit()
    return key
