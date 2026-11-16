"""Pipelines of the youtube org. Filled in Stage 5; empty until then."""
from core.pipeline import Pipeline

PIPELINES: dict[str, Pipeline] = {}
ALLOWED_WHEN_KILLED: set[str] = set()   # report pipelines that keep running while the kill switch is on
