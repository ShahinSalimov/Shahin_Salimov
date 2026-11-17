"""Idempotent first-run seeding: demo company and bootstrap admin user.

Run once per deploy, after migrations and before the API workers start::

    python -m alembic upgrade head && python -m backend.bootstrap && uvicorn ...

The API lifespan also calls :func:`seed` for local/dev runs. Every step
tolerates a concurrent insert (several workers starting at once), so seeding
can never crash a worker.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from backend.analysis_service import DEMO_COMPANY
from backend.config import Settings, get_settings
from backend.db import dispose_engine, get_sessionmaker, init_engine
from backend.logging_setup import configure_logging
from backend.models import CompanyProfile, Role, User
from backend.security import hash_password

logger = logging.getLogger("aegispulse.bootstrap")


async def _seed_company() -> None:
    async with get_sessionmaker()() as session:
        if (await session.execute(select(func.count(CompanyProfile.id)))).scalar_one():
            return
        session.add(CompanyProfile(**DEMO_COMPANY))
        try:
            await session.commit()
            logger.info("seeded demo company profile %s", DEMO_COMPANY["name"])
        except IntegrityError:
            await session.rollback()  # another process seeded it first


async def _seed_admin(settings: Settings) -> None:
    if not (settings.bootstrap_admin_email and settings.bootstrap_admin_password):
        return
    async with get_sessionmaker()() as session:
        if (await session.execute(select(func.count(User.id)))).scalar_one():
            return
        company = (
            await session.execute(select(CompanyProfile).order_by(CompanyProfile.created_at).limit(1))
        ).scalar_one_or_none()
        if company is None:
            logger.warning("bootstrap admin skipped: no company profile exists")
            return
        company_name = company.name
        session.add(
            User(
                company_id=company.id,
                email=settings.bootstrap_admin_email.lower(),
                name="Administrator",
                role=Role.ADMIN,
                password_hash=hash_password(settings.bootstrap_admin_password.get_secret_value()),
            )
        )
        try:
            await session.commit()
            logger.info("bootstrap admin user created for %s", company_name)
        except IntegrityError:
            await session.rollback()  # another process created it first


async def seed(settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    if settings.seed_demo_company:
        await _seed_company()
    await _seed_admin(settings)


async def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    init_engine()
    try:
        await seed(settings)
    finally:
        await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
