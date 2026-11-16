"""Builds the runtime (store, agents, tools, guards, runner, scheduler) for the org given in ORG.

Only ``orgs.<org>`` modules are imported (dynamically), so the other organization's code is never
loaded. Each org package provides:

- ``orgs.<org>.schemas``: ``SCHEMAS``, ``AGENT_TIER``
- ``orgs.<org>.pipeline``: ``PIPELINES``, optional ``ALLOWED_WHEN_KILLED``
- ``orgs.<org>.schedule``: ``SCHEDULE`` (list of ScheduleEntry)
- ``orgs.<org>.tools``: optional ``register_tools(registry, settings, store)``
- ``orgs.<org>.webhooks``: optional ``WEBHOOKS`` {name: handler(form, runtime) -> dict}
"""
from __future__ import annotations

import importlib
import logging
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from core.agents import AgentRegistry
from core.config import Settings, model_routing
from core.db import JobStore
from core.guards import BudgetGuard, KillSwitch
from core.llm import LLMClient, parse_prices_json
from core.pipeline import Pipeline
from core.prompts import PromptLoader
from core.runner import Runner
from core.scheduler import ScheduleEntry, build_scheduler
from core.tools import ToolRegistry
from core.tools.whatsapp import build_notifier, whatsapp_send_tool

log = logging.getLogger(__name__)
ROOT = Path(__file__).resolve().parents[1]
ORGS = ("studio", "youtube")


def _optional(module: str) -> Any:
    try:
        return importlib.import_module(module)
    except ModuleNotFoundError as e:
        if e.name == module:
            return None
        raise


@dataclass
class Runtime:
    org: str
    settings: Settings
    store: JobStore
    llm: Any
    agents: AgentRegistry
    tools: ToolRegistry
    budget: BudgetGuard
    kill: KillSwitch
    notifier: Any
    runner: Runner
    schedule: list[ScheduleEntry]
    webhooks: dict[str, Any] = field(default_factory=dict)
    scheduler: Any = None
    _stop: threading.Event = field(default_factory=threading.Event)
    _worker: threading.Thread | None = None

    def start_background(self, idle_sleep: float = 2.0) -> None:
        recovered = self.runner.recover()
        if recovered:
            log.warning("requeued %d jobs left running by a previous process", recovered)
        self.scheduler = build_scheduler(self.runner, self.schedule)
        self.scheduler.start()
        self._worker = threading.Thread(target=self._loop, args=(idle_sleep,), name="runner", daemon=True)
        self._worker.start()

    def _loop(self, idle_sleep: float) -> None:
        while not self._stop.is_set():
            try:
                worked = self.runner.tick()
            except Exception:
                log.exception("tick crashed")
                worked = False
            self._stop.wait(0.05 if worked else idle_sleep)

    def stop(self) -> None:
        self._stop.set()
        if self.scheduler is not None and self.scheduler.running:
            self.scheduler.shutdown(wait=False)
        if self._worker is not None:
            self._worker.join(timeout=5)
        self.store.close()


def build_runtime(org: str, settings: Settings | None = None, *, llm: Any = None, notifier: Any = None,
                  db_path: str | Path | None = None, pipelines: dict[str, Pipeline] | None = None,
                  schedule: list[ScheduleEntry] | None = None,
                  allowed_when_killed: set[str] | None = None) -> Runtime:
    if org not in ORGS:
        raise ValueError(f"unknown org {org!r}; expected one of {ORGS}")
    settings = settings or Settings()

    schemas_mod = importlib.import_module(f"orgs.{org}.schemas")
    pipeline_mod = importlib.import_module(f"orgs.{org}.pipeline")
    schedule_mod = importlib.import_module(f"orgs.{org}.schedule")
    tools_mod = _optional(f"orgs.{org}.tools")
    webhooks_mod = _optional(f"orgs.{org}.webhooks")

    path = Path(db_path or settings.db_path or ROOT / "data" / f"{org}.db")
    path.parent.mkdir(parents=True, exist_ok=True)
    store = JobStore(path, org=org)

    if llm is None:
        llm = LLMClient(fallbacks=settings.llm_fallbacks, prices=parse_prices_json(settings.llm_prices_json))
    agents = AgentRegistry(org=org, llm=llm, prompts=PromptLoader(ROOT / "prompts"),
                           schemas=schemas_mod.SCHEMAS,
                           routing=model_routing(settings, schemas_mod.AGENT_TIER),
                           max_tokens=settings.llm_max_tokens)

    notifier = notifier or build_notifier(settings, org)
    tools = ToolRegistry()
    tools.register("whatsapp_send", whatsapp_send_tool(notifier))
    if tools_mod is not None and hasattr(tools_mod, "register_tools"):
        tools_mod.register_tools(tools, settings, store)

    budget = BudgetGuard(store, settings.daily_budget_usd)
    kill = KillSwitch(store)
    pipes = pipelines if pipelines is not None else pipeline_mod.PIPELINES
    allowed = (allowed_when_killed if allowed_when_killed is not None
               else set(getattr(pipeline_mod, "ALLOWED_WHEN_KILLED", set())))
    runner = Runner(org=org, pipelines=pipes, store=store, agents=agents, tools=tools, budget=budget,
                    kill=kill, notifier=notifier, allowed_when_killed=allowed)

    return Runtime(org=org, settings=settings, store=store, llm=llm, agents=agents, tools=tools,
                   budget=budget, kill=kill, notifier=notifier, runner=runner,
                   schedule=schedule if schedule is not None else list(schedule_mod.SCHEDULE),
                   webhooks=dict(getattr(webhooks_mod, "WEBHOOKS", {}) if webhooks_mod else {}))


def run_forever(runtime: Runtime) -> None:  # pragma: no cover - used by worker.py
    runtime.start_background()
    try:
        while True:
            time.sleep(3600)
    finally:
        runtime.stop()
