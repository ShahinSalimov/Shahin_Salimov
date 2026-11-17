"""API-key authentication and rate limiting.

* ``X-API-Key`` is compared in constant time against ``AEGIS_API_KEYS``.
  In production the service refuses to start without keys; in development
  an empty key list disables auth (and logs a loud warning).
* Rate limiting is a fixed one-minute window per (key, bucket). It uses Redis
  when ``REDIS_URL`` is configured so limits hold across replicas, and falls
  back to an in-process counter otherwise. Expensive endpoints (anything that
  spends model tokens) use a separate, tighter bucket.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
from collections import defaultdict
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status

from backend.config import Settings, get_settings

logger = logging.getLogger("aegispulse.security")


def _fingerprint(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()[:16]


async def require_api_key(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
) -> str:
    """Return a stable, non-secret principal id for the caller."""
    if not settings.api_keys:
        if settings.is_production:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "API authentication is not configured")
        return "anonymous-dev"
    if not x_api_key:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Missing X-API-Key header", headers={"WWW-Authenticate": "ApiKey"}
        )
    candidate = x_api_key.encode()
    if not any(hmac.compare_digest(candidate, k.encode()) for k in settings.api_keys):
        logger.warning("rejected API key from %s", request.client.host if request.client else "unknown")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid API key", headers={"WWW-Authenticate": "ApiKey"})
    principal = f"key:{_fingerprint(x_api_key)}"
    request.state.principal = principal
    return principal


class RateLimiter:
    def __init__(self) -> None:
        self._memory: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])
        self._redis = None

    def attach_redis(self, client: object | None) -> None:
        self._redis = client

    async def hit(self, identity: str, bucket: str, limit: int) -> tuple[bool, int]:
        """Register a hit. Returns (allowed, seconds_until_reset)."""
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


def rate_limit(bucket: str = "default"):
    async def _dependency(
        request: Request,
        principal: Annotated[str, Depends(require_api_key)],
        settings: Annotated[Settings, Depends(get_settings)],
    ) -> str:
        limit = settings.expensive_rate_limit_per_minute if bucket == "expensive" else settings.rate_limit_per_minute
        client_ip = request.client.host if request.client else "unknown"
        identity = principal if principal != "anonymous-dev" else f"ip:{client_ip}"
        allowed, reset_in = await rate_limiter.hit(identity, bucket, limit)
        if not allowed:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Rate limit exceeded for '{bucket}' ({limit}/min). Retry in {reset_in}s.",
                headers={"Retry-After": str(reset_in)},
            )
        return principal

    return _dependency


Authenticated = Annotated[str, Depends(rate_limit("default"))]
AuthenticatedExpensive = Annotated[str, Depends(rate_limit("expensive"))]
