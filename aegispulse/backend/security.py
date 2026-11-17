"""Authentication, authorisation, tenancy scoping and rate limiting.

Three kinds of caller resolve to a :class:`Principal`:

* **User session** - ``Authorization: Bearer <token>``. Tokens are HMAC-SHA256
  signed (``AEGIS_SECRET_KEY``), expire after ``AEGIS_SESSION_TTL_HOURS``, and
  the user row is re-checked on every request, so deactivating a user or
  changing their role takes effect immediately.
* **Tenant API key** - ``X-API-Key: ap_...`` created by a company admin. Only
  the SHA-256 hash is stored; keys can be revoked.
* **Platform key** - ``X-API-Key`` matching ``AEGIS_API_KEYS``. Operator-level
  access across all tenants (collectors, provisioning, support).

Roles are ordered ``viewer < analyst < admin``. Every tenant-scoped principal
can only see its own company; out-of-scope objects return 404 (not 403) so
object IDs from other tenants cannot be probed.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import secrets
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import Settings, get_settings
from backend.db import get_session
from backend.models import ApiKey, Role, User, utcnow

logger = logging.getLogger("aegispulse.security")

ROLE_ORDER = {Role.VIEWER: 0, Role.ANALYST: 1, Role.ADMIN: 2}
API_KEY_PREFIX = "ap_"
MIN_PASSWORD_LENGTH = 12

# --------------------------------------------------------------------------- #
# Passwords (scrypt, stdlib)
# --------------------------------------------------------------------------- #

_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=32)
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt_b64, digest_b64 = stored.split("$")
        if algo != "scrypt":
            return False
        expected = base64.b64decode(digest_b64)
        actual = hashlib.scrypt(
            password.encode(), salt=base64.b64decode(salt_b64), n=int(n), r=int(r), p=int(p), dklen=len(expected)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


# Used to equalise timing when the email does not exist.
DUMMY_HASH = hash_password(secrets.token_hex(8))


def check_password_strength(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"password must be at least {MIN_PASSWORD_LENGTH} characters")
    kinds = [any(c.islower() for c in password), any(c.isupper() for c in password), any(c.isdigit() for c in password),
             any(not c.isalnum() for c in password)]
    if sum(kinds) < 2:
        raise ValueError("password must mix at least two of: lowercase, uppercase, digits, symbols")


# --------------------------------------------------------------------------- #
# Session tokens (HMAC-signed, stdlib)
# --------------------------------------------------------------------------- #

_dev_secret = secrets.token_bytes(32)


def _secret(settings: Settings) -> bytes:
    if settings.secret_key:
        return settings.secret_key.get_secret_value().encode()
    if settings.is_production:
        raise RuntimeError("AEGIS_SECRET_KEY must be set in production")
    return _dev_secret  # per-process: dev sessions end on restart


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def issue_token(user: User, settings: Settings) -> tuple[str, int]:
    expires = int(time.time()) + settings.session_ttl_hours * 3600
    body = json.dumps({"sub": str(user.id), "cid": str(user.company_id), "exp": expires}, separators=(",", ":"))
    payload = _b64(body.encode())
    signature = _b64(hmac.new(_secret(settings), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{signature}", expires


def verify_token(token: str, settings: Settings) -> dict[str, Any] | None:
    try:
        payload_b64, signature = token.split(".")
        expected = _b64(hmac.new(_secret(settings), payload_b64.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            return None
        payload = json.loads(_unb64(payload_b64))
    except (ValueError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict) or int(payload.get("exp", 0)) < time.time():
        return None
    return payload


# --------------------------------------------------------------------------- #
# API keys
# --------------------------------------------------------------------------- #


def new_api_key() -> tuple[str, str, str]:
    """Return (plaintext, display prefix, sha256 hex)."""
    plaintext = API_KEY_PREFIX + secrets.token_urlsafe(32)
    return plaintext, plaintext[:10], hashlib.sha256(plaintext.encode()).hexdigest()


# --------------------------------------------------------------------------- #
# Principal
# --------------------------------------------------------------------------- #


@dataclass(frozen=True, slots=True)
class Principal:
    kind: str  # "user" | "api_key" | "platform" | "dev"
    id: str
    role: Role
    company_id: uuid.UUID | None  # None = operator scope (all tenants)
    email: str | None = None

    @property
    def is_platform(self) -> bool:
        return self.company_id is None

    def has_role(self, role: Role) -> bool:
        return ROLE_ORDER[self.role] >= ROLE_ORDER[role]

    def can_access(self, company_id: uuid.UUID) -> bool:
        return self.company_id is None or self.company_id == company_id

    @property
    def label(self) -> str:
        return self.email or f"{self.kind}:{self.id}"


def _fingerprint(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()[:16]


async def authenticate(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> Principal:
    unauthorized = HTTPException(
        status.HTTP_401_UNAUTHORIZED, "Invalid or missing credentials", headers={"WWW-Authenticate": "Bearer"}
    )

    if authorization and authorization.lower().startswith("bearer "):
        payload = verify_token(authorization[7:].strip(), settings)
        if payload is None:
            raise unauthorized
        try:
            user_id = uuid.UUID(str(payload["sub"]))
        except (KeyError, ValueError):
            raise unauthorized from None
        user = await session.get(User, user_id)
        if user is None or not user.is_active or str(user.company_id) != payload.get("cid"):
            raise unauthorized
        principal = Principal("user", str(user.id), user.role, user.company_id, user.email)
    elif x_api_key:
        candidate = x_api_key.encode()
        if any(hmac.compare_digest(candidate, k.encode()) for k in settings.api_keys):
            principal = Principal("platform", _fingerprint(x_api_key), Role.ADMIN, None)
        elif x_api_key.startswith(API_KEY_PREFIX):
            digest = hashlib.sha256(candidate).hexdigest()
            key = (await session.execute(select(ApiKey).where(ApiKey.key_hash == digest))).scalar_one_or_none()
            if key is None or key.revoked_at is not None:
                raise unauthorized
            await session.execute(update(ApiKey).where(ApiKey.id == key.id).values(last_used_at=utcnow()))
            await session.commit()
            principal = Principal("api_key", str(key.id), key.role, key.company_id, f"api-key:{key.name}")
        else:
            logger.warning("rejected API key from %s", request.client.host if request.client else "unknown")
            raise unauthorized
    elif not settings.api_keys and not settings.is_production:
        principal = Principal("dev", "anonymous", Role.ADMIN, None)
    else:
        raise unauthorized

    request.state.principal = principal
    return principal


# --------------------------------------------------------------------------- #
# Rate limiting
# --------------------------------------------------------------------------- #


class RateLimiter:
    """Fixed one-minute window per (identity, bucket); Redis-backed when available."""

    def __init__(self) -> None:
        self._memory: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])
        self._redis = None

    def attach_redis(self, client: object | None) -> None:
        self._redis = client

    async def hit(self, identity: str, bucket: str, limit: int) -> tuple[bool, int]:
        window = int(time.time() // 60)
        reset_in = 60 - int(time.time() % 60)
        key = f"aegis:rl:{bucket}:{identity}:{window}"
        if self._redis is not None:
            try:
                count = await self._redis.incr(key)  # type: ignore[attr-defined]
                if count == 1:
                    await self._redis.expire(key, 70)  # type: ignore[attr-defined]
                return count <= limit, reset_in
            except Exception:
                logger.exception("redis rate limiter unavailable; falling back to in-process counter")
        slot = self._memory[f"{bucket}:{identity}"]
        if slot[0] != window:
            slot[0], slot[1] = window, 0
        slot[1] += 1
        if len(self._memory) > 50_000:  # bound memory under key-spraying
            self._memory.clear()
        return slot[1] <= limit, reset_in

    def reset(self) -> None:
        self._memory.clear()


rate_limiter = RateLimiter()


async def enforce_rate_limit(identity: str, bucket: str, limit: int) -> None:
    allowed, reset_in = await rate_limiter.hit(identity, bucket, limit)
    if not allowed:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Rate limit exceeded for '{bucket}' ({limit}/min). Retry in {reset_in}s.",
            headers={"Retry-After": str(reset_in)},
        )


def guard(bucket: str = "default", role: Role = Role.VIEWER):
    """Dependency: authenticate, rate-limit, and require a minimum role."""

    async def _dependency(
        request: Request,
        principal: Annotated[Principal, Depends(authenticate)],
        settings: Annotated[Settings, Depends(get_settings)],
    ) -> Principal:
        limit = settings.expensive_rate_limit_per_minute if bucket == "expensive" else settings.rate_limit_per_minute
        client_ip = request.client.host if request.client else "unknown"
        identity = f"ip:{client_ip}" if principal.kind == "dev" else f"{principal.kind}:{principal.id}"
        await enforce_rate_limit(identity, bucket, limit)
        if not principal.has_role(role):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"This action requires the '{role.value}' role")
        return principal

    return _dependency


Viewer = Annotated[Principal, Depends(guard("default", Role.VIEWER))]
Analyst = Annotated[Principal, Depends(guard("default", Role.ANALYST))]
Admin = Annotated[Principal, Depends(guard("default", Role.ADMIN))]
AnalystExpensive = Annotated[Principal, Depends(guard("expensive", Role.ANALYST))]
