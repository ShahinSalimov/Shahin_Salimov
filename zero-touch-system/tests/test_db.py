"""Tests for core.db.JobStore."""
import threading
from datetime import datetime, timedelta, timezone

import pytest
from freezegun import freeze_time

from core.db import JobStore
from core.envelope import new_envelope


@pytest.fixture
def store(tmp_path):
    s = JobStore(tmp_path / "test.db")
    yield s
    s.close()


def _env(run_id, step="a", org="studio", index=0, payload=None):
    return new_envelope(org, run_id, step=step, from_agent="test",
                        payload=payload or {}, index=index)


# --- runs -------------------------------------------------------------------

def test_create_and_get_run(store):
    run_id = store.create_run("studio", "studio_daily", state={"revision_round": 0})
    run = store.get_run(run_id)
    assert run.id == run_id and run_id.startswith("studio-")
    assert run.org == "studio" and run.pipeline == "studio_daily"
    assert run.status == "running"
    assert run.state == {"revision_round": 0}


def test_save_state_and_finish_run(store):
    run_id = store.create_run("studio", "p")
    store.save_state(run_id, {"x": 1})
    store.finish_run(run_id, "rejected", reason=["budget"])
    run = store.get_run(run_id)
    assert run.state == {"x": 1}
    assert run.status == "rejected"
    assert run.reason == ["budget"]
    assert run.finished_at is not None


def test_finish_run_rejects_unknown_status(store):
    run_id = store.create_run("studio", "p")
    with pytest.raises(ValueError):
        store.finish_run(run_id, "weird")


def test_get_missing_run_raises(store):
    with pytest.raises(KeyError):
        store.get_run("nope")


def test_last_run(store):
    assert store.last_run("studio") is None
    store.create_run("studio", "p1")
    r2 = store.create_run("studio", "p2")
    store.create_run("youtube", "p3")
    assert store.last_run("studio")["id"] == r2


# --- enqueue / claim ----------------------------------------------------------

def test_claim_returns_queued_job_and_marks_running(store):
    run_id = store.create_run("studio", "p")
    store.enqueue(_env(run_id, payload={"k": 1}))
    job = store.claim_next("studio")
    assert job is not None
    assert job.status == "running"
    assert job.envelope.payload == {"k": 1}
    assert store.claim_next("studio") is None


def test_claim_next_never_returns_same_job_twice_concurrently(tmp_path):
    path = tmp_path / "c.db"
    setup = JobStore(path)
    run_id = setup.create_run("studio", "p")
    setup.enqueue_group([_env(run_id, index=i) for i in range(50)])
    setup.close()

    claimed, lock = [], threading.Lock()

    def worker():
        s = JobStore(path)
        while (job := s.claim_next("studio")) is not None:
            with lock:
                claimed.append(job.id)
        s.close()

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(claimed) == 50
    assert len(set(claimed)) == 50


def test_org_isolation_on_claim(store):
    r_studio = store.create_run("studio", "p")
    r_yt = store.create_run("youtube", "p")
    store.enqueue(_env(r_studio, org="studio"))
    store.enqueue(_env(r_yt, org="youtube"))
    job = store.claim_next("youtube")
    assert job.envelope.org == "youtube"
    assert store.claim_next("youtube") is None
    assert store.claim_next("studio").envelope.org == "studio"


def test_store_bound_to_org_rejects_foreign_envelope(tmp_path):
    s = JobStore(tmp_path / "studio.db", org="studio")
    run_id = s.create_run("studio", "p")
    with pytest.raises(ValueError):
        s.enqueue(_env(run_id, org="youtube"))
    with pytest.raises(ValueError):
        s.create_run("youtube", "p")
    s.close()


def test_enqueue_rejects_envelope_for_run_of_other_org(store):
    run_id = store.create_run("studio", "p")
    with pytest.raises(ValueError):
        store.enqueue(_env(run_id, org="youtube"))


def test_enqueue_unknown_run_raises(store):
    with pytest.raises(KeyError):
        store.enqueue(_env("missing-run"))


def test_enqueue_same_idempotency_key_is_noop(store):
    run_id = store.create_run("studio", "p")
    first = store.enqueue(_env(run_id))
    second = store.enqueue(_env(run_id))
    assert first == second
    assert store.queue_depth("studio") == 1


def test_claim_order_is_fifo(store):
    run_id = store.create_run("studio", "p")
    store.enqueue(_env(run_id, step="first"))
    store.enqueue(_env(run_id, step="second"))
    assert store.claim_next("studio").step == "first"
    assert store.claim_next("studio").step == "second"


# --- complete / retry / fail ----------------------------------------------------

def test_complete_stores_output_and_idempotency(store):
    run_id = store.create_run("studio", "p")
    env = _env(run_id, step="tools.publish")
    store.enqueue(env)
    job = store.claim_next("studio")
    assert not store.has_completed(env.idempotency_key)
    store.complete(job, {"status": "ok", "url": "u"}, meta={"cost_usd": 0.1})
    assert store.has_completed(env.idempotency_key)
    assert store.get_output(env.idempotency_key) == {"status": "ok", "url": "u"}
    assert store.get_job(job.id).meta == {"cost_usd": 0.1}
    assert store.get_job(job.id).status == "done"


def test_get_output_of_unfinished_key_is_none(store):
    run_id = store.create_run("studio", "p")
    env = _env(run_id)
    store.enqueue(env)
    assert store.get_output(env.idempotency_key) is None


def test_retry_respects_run_after(store):
    with freeze_time("2026-11-16 06:00:00") as frozen:
        run_id = store.create_run("studio", "p")
        store.enqueue(_env(run_id))
        job = store.claim_next("studio")
        store.retry(job, delay_s=60, attempt=2, error="timeout")

        assert store.claim_next("studio") is None
        frozen.tick(timedelta(seconds=59))
        assert store.claim_next("studio") is None
        frozen.tick(timedelta(seconds=2))
        again = store.claim_next("studio")

    assert again.id == job.id
    assert again.attempt == 2
    assert again.envelope.attempt == 2
    assert again.error == "timeout"


def test_enqueue_with_run_after_in_future(store):
    with freeze_time("2026-11-16 06:00:00") as frozen:
        run_id = store.create_run("studio", "p")
        later = datetime(2026, 11, 16, 7, 0, tzinfo=timezone.utc)
        store.enqueue(_env(run_id), run_after=later)
        assert store.claim_next("studio") is None
        frozen.move_to("2026-11-16 07:00:01")
        assert store.claim_next("studio") is not None


def test_fail_marks_job_failed(store):
    run_id = store.create_run("studio", "p")
    store.enqueue(_env(run_id))
    job = store.claim_next("studio")
    store.fail(job, "boom")
    failed = store.get_job(job.id)
    assert failed.status == "failed" and failed.error == "boom"
    assert store.claim_next("studio") is None


def test_queue_depth_counts_only_queued_of_org(store):
    r = store.create_run("studio", "p")
    y = store.create_run("youtube", "p")
    store.enqueue_group([_env(r, index=i) for i in range(3)])
    store.enqueue(_env(y, org="youtube"))
    store.claim_next("studio")
    assert store.queue_depth("studio") == 2
    assert store.queue_depth("youtube") == 1


# --- outputs & fan-out join -------------------------------------------------------

def test_outputs_of_and_outputs_list(store):
    run_id = store.create_run("studio", "p")
    store.enqueue(_env(run_id, step="ceo.decide"))
    store.complete(store.claim_next("studio"), {"spec": 1})
    store.enqueue_group([_env(run_id, step="content.section", index=i) for i in range(2)])
    store.complete(store.claim_next("studio"), {"section": 0})
    store.complete(store.claim_next("studio"), {"section": 1})

    outs = store.outputs_of(run_id)
    assert outs["ceo.decide"] == {"spec": 1}
    assert outs["content.section"] == {"section": 1}  # latest wins
    assert store.outputs_list(run_id, "content.section") == [{"section": 0}, {"section": 1}]


def test_fan_out_join_completes_once(store):
    run_id = store.create_run("studio", "p")
    store.enqueue_group([_env(run_id, step="content.section", index=i) for i in range(4)])
    results = [store.complete(store.claim_next("studio"), {"i": i}) for i in range(4)]
    assert results == [False, False, False, True]


def test_single_job_join_completes_immediately(store):
    run_id = store.create_run("studio", "p")
    store.enqueue(_env(run_id))
    assert store.complete(store.claim_next("studio"), {}) is True


def test_new_group_resets_join_counter(store):
    """A revision round re-enqueues the same step: the join must count the new group only."""
    run_id = store.create_run("studio", "p")
    store.enqueue_group([_env(run_id, step="content.section", index=i) for i in range(2)])
    store.complete(store.claim_next("studio"), {})
    store.complete(store.claim_next("studio"), {})

    redo = [new_envelope("studio", run_id, step="content.section", from_agent="philosopher",
                         payload={}, index=i, round_=1) for i in range(2)]
    store.enqueue_group(redo)
    assert store.complete(store.claim_next("studio"), {}) is False
    assert store.complete(store.claim_next("studio"), {}) is True


def test_enqueue_group_rejects_mixed_steps(store):
    run_id = store.create_run("studio", "p")
    with pytest.raises(ValueError):
        store.enqueue_group([_env(run_id, step="a"), _env(run_id, step="b", index=1)])


# --- persistence ----------------------------------------------------------------

def test_state_survives_reopen(tmp_path):
    path = tmp_path / "p.db"
    s1 = JobStore(path)
    run_id = s1.create_run("studio", "p", state={"k": "v"})
    s1.enqueue(_env(run_id))
    s1.close()

    s2 = JobStore(path)
    assert s2.get_run(run_id).state == {"k": "v"}
    assert s2.claim_next("studio") is not None
    s2.close()


def test_wal_mode_enabled(store):
    assert store.journal_mode() == "wal"


def test_requeue_stale_running_jobs(store):
    """After a crash, jobs left in 'running' are put back in the queue on startup."""
    run_id = store.create_run("studio", "p")
    store.enqueue(_env(run_id))
    store.claim_next("studio")
    assert store.requeue_stale("studio") == 1
    assert store.claim_next("studio") is not None


def test_all_tables_created(store):
    assert {"runs", "jobs", "step_joins", "ledger", "products", "videos",
            "directives", "budget_daily"} <= store.tables()


# --- Stage 3 additions: effects, spend, control, failure counts, rounds ------------------

def test_effects_record_and_get(store):
    assert store.get_effect("k1") is None
    store.record_effect("k1", {"url": "https://x"})
    assert store.get_effect("k1") == {"url": "https://x"}
    store.record_effect("k1", {"url": "other"})  # first write wins: side effect already happened
    assert store.get_effect("k1") == {"url": "https://x"}


def test_spend_accumulates_per_org_and_day(store):
    store.add_spend("studio", "2026-11-16", 0.5)
    store.add_spend("studio", "2026-11-16", 0.25)
    store.add_spend("studio", "2026-11-17", 1.0)
    store.add_spend("youtube", "2026-11-16", 9.0)
    assert store.get_spend("studio", "2026-11-16") == pytest.approx(0.75)
    assert store.get_spend("studio", "2026-11-18") == 0.0


def test_control_values(store):
    assert store.get_control("kill:studio") is None
    store.set_control("kill:studio", {"active": True})
    assert store.get_control("kill:studio") == {"active": True}
    store.set_control("kill:studio", None)
    assert store.get_control("kill:studio") is None


def test_count_failed_runs_since(store):
    with freeze_time("2026-11-15 10:00:00"):
        old = store.create_run("studio", "p")
        store.finish_run(old, "failed")
    with freeze_time("2026-11-16 10:00:00"):
        for _ in range(2):
            store.finish_run(store.create_run("studio", "p"), "failed")
        store.finish_run(store.create_run("studio", "p"), "done")
        store.finish_run(store.create_run("youtube", "p"), "failed")
    since = datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc)
    assert store.count_failed_runs("studio", since) == 2


def test_group_count_tracks_rounds(store):
    run_id = store.create_run("studio", "p")
    assert store.group_count(run_id, "content.section") == 0
    store.enqueue_group([_env(run_id, step="content.section", index=i) for i in range(2)])
    assert store.group_count(run_id, "content.section") == 1


def test_jobs_of_run(store):
    run_id = store.create_run("studio", "p")
    store.enqueue(_env(run_id, step="a"))
    store.enqueue(_env(run_id, step="b"))
    assert [j.step for j in store.jobs_of(run_id)] == ["a", "b"]
    assert store.pending_count(run_id) == 2
    store.complete(store.claim_next("studio"), {})
    assert store.pending_count(run_id) == 1


# --- Stage 4 additions: ledger, products, directives, spend totals ---------------------------

def test_ledger_insert_is_idempotent_by_ref(store):
    assert store.insert_ledger("sale", 19.0, ref="sale:S1", product_id="p1", created_at="2026-11-16T10:00:00.000000Z")
    assert not store.insert_ledger("sale", 19.0, ref="sale:S1", product_id="p1", created_at="2026-11-16T10:00:00.000000Z")
    store.insert_ledger("fee", -2.4, ref="fee:S1", product_id="p1", created_at="2026-11-16T10:00:00.000000Z")
    store.insert_ledger("sale", 9.0, ref="sale:S2", product_id="p2", created_at="2026-11-17T10:00:00.000000Z")
    rows = store.ledger_rows("2026-11-16T00:00:00.000000Z", "2026-11-17T00:00:00.000000Z")
    assert [r["ref"] for r in rows] == ["sale:S1", "fee:S1"]
    assert store.ledger_total() == pytest.approx(19.0 - 2.4 + 9.0)


def test_products_insert_and_topic_uniqueness(store):
    assert store.insert_product(id="p1", run_id="r", name="Kit", topic_key="kit", price_usd=19.0,
                                gumroad_url=None, status="draft_ready")
    assert not store.insert_product(id="p2", run_id="r", name="Kit 2", topic_key="kit", price_usd=9.0,
                                    gumroad_url=None, status="draft_ready")
    assert store.topic_exists("kit")
    assert store.products()[0]["name"] == "Kit"


def test_products_created_on_day(store):
    with freeze_time("2026-11-16 08:00:00"):
        store.insert_product(id="p1", run_id="r", name="A", topic_key="a", price_usd=1, gumroad_url=None, status="s")
    with freeze_time("2026-11-17 08:00:00"):
        store.insert_product(id="p2", run_id="r", name="B", topic_key="b", price_usd=1, gumroad_url=None, status="s")
    assert [p["id"] for p in store.products_created_on("2026-11-17")] == ["p2"]


def test_directives_active_until_expiry(store):
    with freeze_time("2026-11-16 08:00:00"):
        store.add_directive("studio", "ceo", "Try bundles", expires_at="2026-11-30T00:00:00.000000Z")
        store.add_directive("studio", "ceo", "Old idea", expires_at="2026-11-10T00:00:00.000000Z")
        store.add_directive("studio", "banker", "Other", expires_at="2026-11-30T00:00:00.000000Z")
        assert store.active_directives("studio", "ceo") == ["Try bundles"]


def test_total_spend_and_by_day(store):
    store.add_spend("studio", "2026-11-15", 1.0)
    store.add_spend("studio", "2026-11-16", 2.0)
    store.add_spend("youtube", "2026-11-16", 5.0)
    assert store.total_spend("studio") == pytest.approx(3.0)
    assert store.spend_by_day("studio", "2026-11-16") == {"2026-11-16": 2.0}
