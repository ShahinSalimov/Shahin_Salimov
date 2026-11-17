"""The Alembic migration chain builds exactly the schema the ORM models describe."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _alembic(args: list[str], db_url: str) -> subprocess.CompletedProcess[str]:
    env = {"DATABASE_URL": db_url, "PATH": "/usr/bin:/bin", "AEGIS_ENV": "test"}
    return subprocess.run([sys.executable, "-m", "alembic", *args], cwd=ROOT, env=env, capture_output=True, text=True, timeout=120)


def test_upgrade_check_downgrade_roundtrip(tmp_path: Path) -> None:
    url = f"sqlite+aiosqlite:///{tmp_path / 'mig.db'}"
    up = _alembic(["upgrade", "head"], url)
    assert up.returncode == 0, up.stderr
    check = _alembic(["check"], url)
    assert check.returncode == 0, check.stdout + check.stderr  # no drift between models and migrations
    down = _alembic(["downgrade", "base"], url)
    assert down.returncode == 0, down.stderr
    assert _alembic(["upgrade", "head"], url).returncode == 0
