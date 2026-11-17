"""Runner: claims jobs, executes agent/tool steps, handles retry, fan-out/join and routing.

One ``tick()`` processes at most one job:

1. Kill switch: jobs of runs whose pipeline is not in ``allowed_when_killed`` are cancelled.
2. Jobs of runs that are no longer running are dropped.
3. Agent steps pass the BudgetGuard first; every reported cost (also of failed attempts) is recorded.
4. Idempotent steps reuse a recorded side effect instead of executing twice.
5. Output status: ``ok`` -> complete and route; ``retry``/``needs_input`` -> backoff retry;
   ``rejected`` -> run rejected. Exceptions retry with backoff 60s, 240s, 960s, then the run fails.
   Refusals, NonRetryable errors and pipeline/routing bugs end the run without retry.
6. Fan-out: the next step is enqueued once, by the job that completes the join group.
7. ``alert_level == "critical"`` in an output trips the kill switch (the run itself completes).
"""
from __future__ import annotations

import logging
import traceback
from typing import Any

from core.agents import AgentOutputError
from core.db import Job, JobStore
from core.envelope import new_envelope
from core.guards import BudgetExceeded, BudgetGuard, KillSwitch
from core.llm import LLMError, LLMRefusal
from core.logging import log_context
from core.pipeline import Pipeline, RunOutputs
from core.tools import NonRetryable, ToolContext, ToolRegistry

log = logging.getLogger(__name__)

RETRY_DELAYS_S = (60, 240, 960)


class KillSwitchActive(Exception):
    pass


class _EndRun(Exception):
    def __init__(self, status: str, reason: Any, notify: str | None = None):
        super().__init__(str(reason))
        self.status, self.reason, self.notify = status, reason, notify


class Runner:
    def __init__(self, *, org: str, pipelines: dict[str, Pipeline], store: JobStore, agents: Any,
                 tools: ToolRegistry, budget: BudgetGuard, kill: KillSwitch, notifier: Any = None,
                 allowed_when_killed: set[str] | tuple = (), retry_delays: tuple[int, ...] = RETRY_DELAYS_S,
                 context_provider: Any = None):
        self.org, self.pipelines, self.store = org, pipelines, store
        self.agents, self.tools, self.budget, self.kill = agents, tools, budget, kill
        self.notifier = notifier
        self.allowed_when_killed = set(allowed_when_killed)
        self.retry_delays = retry_delays
        self.context_provider = context_provider  # callable(pipeline_name) -> dict merged into run context

    # -- public -----------------------------------------------------------------------

    def start_run(self, pipeline_name: str, payload: dict[str, Any],
                  context: dict[str, Any] | None = None) -> str:
        pipeline = self.pipelines[pipeline_name]
        if self.kill.is_active(self.org) and pipeline_name not in self.allowed_when_killed:
            raise KillSwitchActive(f"{self.org}: kill switch active, {pipeline_name} not started")
        base = self.context_provider(pipeline_name) if self.context_provider else {}
        run_id = self.store.create_run(self.org, pipeline_name, state={})
        self.store.enqueue(new_envelope(self.org, run_id, step=pipeline.start, from_agent="scheduler",
                                        payload=payload, context={**base, **(context or {})}))
        log.info("run started", extra={"run_id": run_id, "pipeline": pipeline_name})
        return run_id

    def recover(self) -> int:
        """Requeue jobs left 'running' by a crash. Call once at startup."""
        return self.store.requeue_stale(self.org)

    def tick(self) -> bool:
        job = self.store.claim_next(self.org)
        if job is None:
            return False
        with log_context(org=self.org, run_id=job.run_id, step=job.step, attempt=job.attempt):
            log.info("job started")
            try:
                self._process(job)
            except _EndRun as end:
                self._end_run(job, end)
            except Exception as exc:  # unexpected bug in the runner path itself
                log.exception("runner error")
                self._end_run(job, _EndRun("failed", f"runner error: {exc}",
                                           notify=f"{job.step} daxili xəta: {exc}"))
        return True

    # -- internals ----------------------------------------------------------------------

    def _process(self, job: Job) -> None:
        env = job.envelope
        run = self.store.get_run(env.run_id)
        if run.status != "running":
            self.store.fail(job, f"run already {run.status}")
            return
        if self.kill.is_active(self.org) and run.pipeline not in self.allowed_when_killed:
            raise _EndRun("rejected", "kill_switch")

        pipeline = self.pipelines[run.pipeline]
        step = pipeline.steps[env.step]
        state = run.state

        try:
            if step.is_agent:
                self.budget.check(self.org)
            output, meta = self._execute(step, env, state)
        except BudgetExceeded as e:
            raise _EndRun("rejected", f"budget: {e}", notify=f"Gündəlik büdcə limiti: {e}") from None
        except LLMRefusal as e:
            self._record_cost(e.cost_usd)
            raise _EndRun("rejected", f"refusal: {e.category}",
                          notify=f"{env.step}: model sorğunu rədd etdi ({e.category})") from None
        except NonRetryable as e:
            raise _EndRun("failed", f"{env.step}: {e}", notify=f"{env.step} uğursuz (retry edilmir): {e}") from None
        except (AgentOutputError, LLMError) as e:
            self._record_cost(getattr(e, "meta", {}).get("cost_usd", 0.0) if isinstance(e, AgentOutputError)
                              else e.cost_usd)
            self._retry_or_fail(job, f"{type(e).__name__}: {e}")
            return
        except Exception as e:
            log.warning("step error: %s", traceback.format_exc(limit=3))
            self._retry_or_fail(job, f"{type(e).__name__}: {e}")
            return

        self._record_cost(meta.get("cost_usd", 0.0))
        status = output.get("status", "ok")
        if status in ("retry", "needs_input"):
            self._retry_or_fail(job, f"{status}: {output.get('errors')}")
            return
        if status == "rejected":
            self.store.complete(job, output, meta)
            raise _EndRun("rejected", output.get("errors") or "rejected",
                          notify=f"{env.step}: run dayandırıldı: {output.get('errors')}")

        if output.get("alert_level") == "critical" and not self.kill.is_active(self.org):
            self.kill.activate(self.org, reason=f"critical alert from {env.step}")
            self._notify(f"Kill switch aktivdir: {env.step} critical alert verdi.")

        join_done = self.store.complete(job, output, meta)
        if not join_done:
            self.store.save_state(run.id, state)
            return

        try:
            next_step = pipeline.route(env.step, output, state)
            self.store.save_state(run.id, state)
            if next_step is None:
                if self.store.pending_count(run.id) == 0:
                    self.store.finish_run(run.id, "done")
                return
            outputs = RunOutputs(self.store.outputs_of(run.id),
                                 lambda s: self.store.outputs_list(run.id, s))
            payloads = pipeline.build_payloads(next_step, output, state, outputs)
        except Exception as e:
            raise _EndRun("failed", f"pipeline error after {env.step}: {e}",
                          notify=f"Pipeline xətası ({env.step}): {e}") from None

        round_ = self.store.group_count(run.id, next_step)
        self.store.enqueue_group([
            new_envelope(self.org, run.id, step=next_step, from_agent=step.name, payload=p,
                         context=env.context, index=i, round_=round_)
            for i, p in enumerate(payloads)
        ])

    def _execute(self, step, env, state) -> tuple[dict[str, Any], dict[str, Any]]:
        if step.idempotent:
            done = self.store.get_effect(env.idempotency_key)
            if done is not None:
                log.info("idempotent step reused recorded effect", extra={"key": env.idempotency_key})
                return done, {"cost_usd": 0.0, "reused_effect": True}
        if step.is_agent:
            res = self.agents.call(step.agent, step.mode, env.payload, env.context)
            output, meta = res.output, res.meta
        else:
            ctx = ToolContext(org=self.org, run_id=env.run_id, step=env.step,
                              idempotency_key=env.idempotency_key, state=state, store=self.store)
            output, meta = self.tools.call(step.tool, env.payload, ctx)
        if step.idempotent and output.get("status", "ok") == "ok":
            self.store.record_effect(env.idempotency_key, output)
        return output, meta

    def _retry_or_fail(self, job: Job, error: str) -> None:
        retries_done = job.attempt - 1
        if retries_done < len(self.retry_delays):
            delay = self.retry_delays[retries_done]
            self.store.retry(job, delay_s=delay, attempt=job.attempt + 1, error=error)
            log.info("job retry scheduled", extra={"job_id": job.id, "delay_s": delay, "error": error})
            return
        raise _EndRun("failed", error,
                      notify=f"{job.step} {job.attempt} cəhddən sonra uğursuz: {error}")

    def _end_run(self, job: Job, end: _EndRun) -> None:
        current = self.store.get_job(job.id)
        if current.status == "running":
            self.store.fail(job, str(end.reason))
        run = self.store.get_run(job.run_id)
        if run.status == "running":
            self.store.finish_run(job.run_id, end.status, reason=end.reason)
        if end.notify:
            self._notify(f"run {job.run_id}: {end.notify}")
        if end.status == "failed" and self.kill.check_failures(self.org):
            self._notify(f"Kill switch aktivdir: {self.kill.status(self.org).get('reason')}")

    def _record_cost(self, usd: float) -> None:
        if usd:
            self.budget.record(self.org, usd)

    def _notify(self, text: str) -> None:
        if self.notifier is None:
            return
        try:
            self.notifier.send(text)
        except Exception:
            log.exception("notification failed")
