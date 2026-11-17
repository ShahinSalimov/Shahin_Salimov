"""Loads prompt files from prompts/ and exposes their version.

Every prompt file starts with ``version: x.y.z`` followed by a blank line; the header is stripped
from the text sent to the model. A system prompt is ``_common`` + the agent prompt.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

_VERSION_RE = re.compile(r"^version:\s*(\d+\.\d+\.\d+)\s*$")
_NAME_RE = re.compile(r"^[a-z_]+(/[a-z_]+)?$")


@dataclass(frozen=True)
class Prompt:
    name: str
    version: str
    text: str


class PromptLoader:
    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.load = lru_cache(maxsize=None)(self._load)  # type: ignore[method-assign]

    def _load(self, name: str) -> Prompt:
        if not _NAME_RE.match(name):
            raise ValueError(f"invalid prompt name {name!r}")
        path = self.root / f"{name}.md"
        if not path.is_file():
            raise FileNotFoundError(path)
        first, _, rest = path.read_text(encoding="utf-8").partition("\n")
        m = _VERSION_RE.match(first)
        if not m:
            raise ValueError(f"{path}: first line must be 'version: x.y.z'")
        return Prompt(name=name, version=m.group(1), text=rest.strip())

    def system_for(self, org: str, agent: str) -> tuple[str, str]:
        """Return (system_prompt, agent_prompt_version)."""
        common = self.load("_common")
        own = self.load(f"{org}/{agent}")
        return f"{common.text}\n\n{own.text}", own.version

    def agents(self, org: str) -> set[str]:
        return {p.stem for p in (self.root / org).glob("*.md")}
