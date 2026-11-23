import os

import pytest

from app import config, jobs, providers, youtube


def _script(seconds):
    sent = "The red supercar raced along the coast at dawn."
    n = int(seconds / 3.2) + 1
    return "\n\n".join(" ".join([sent] * 3) for _ in range(0, n, 3))


CH = {}


@pytest.fixture(autouse=True)
def clean(channel):
    CH.update(channel)
    youtube.FAKE.calls.clear()
    youtube.FAKE.fail_thumbnail = False
    config.save_settings({"budget_cap": 6.0})
    yield


def _run(job):
    jobs.run_job(job["id"])
    return jobs.get_job(job["id"])


def test_full_job_fake():
    j = _run(jobs.add_job(_script(75), CH["id"], "Supercar crashes"))
    assert j["status"] == "done", j["error"]
    assert os.path.exists(j["long"]["path"]) and os.path.exists(j["short"]["path"])
    kinds = [c[0] for c in youtube.FAKE.calls]
    assert kinds.count("upload") == 2 and "thumbnail" in kinds and "captions" in kinds
    short_body = [c[2] for c in youtube.FAKE.calls if c[0] == "upload"][1]
    assert short_body["snippet"]["title"].endswith("#Shorts")
    assert j["long"]["studio"].startswith("https://studio.youtube.com/video/")
    assert j["cost"] > 0


def test_budget_cap_stops_before_images():
    config.save_settings({"budget_cap": 0.01})
    j = _run(jobs.add_job(_script(60), CH["id"]))
    assert j["status"] == "error" and "büdcə" in j["error"]
    assert not (config.DATA / "jobs" / j["id"] / "images").exists()


def test_retry_resumes_from_failed_step(monkeypatch):
    calls = {"img": 0, "tts": 0}
    real_img, real_tts = providers.image, providers.tts

    def img(*a, **k):
        calls["img"] += 1
        return real_img(*a, **k)

    def flaky_tts(text, out, voice=""):
        calls["tts"] += 1
        if calls["tts"] == 2:
            raise providers.ProviderError("Fish down")
        return real_tts(text, out, voice)
    monkeypatch.setattr(providers, "image", img)
    monkeypatch.setattr(providers, "tts", flaky_tts)
    j = _run(jobs.add_job(_script(20), CH["id"], make_short=False))
    assert j["status"] == "error" and j["step"] == "voice"
    images_before = calls["img"]
    jobs.retry(j["id"])
    j = _run(j)
    assert j["status"] == "done"
    assert calls["img"] == images_before + 1  # only the thumbnail image is new


def test_thumbnail_failure_is_warning():
    youtube.FAKE.fail_thumbnail = True
    j = _run(jobs.add_job(_script(20), CH["id"], make_short=False))
    assert j["status"] == "done" and any("Thumbnail" in w for w in j["warnings"])


def test_short_only_and_too_short():
    j = _run(jobs.add_job(_script(15), CH["id"], make_long=True, make_short=True))
    assert j["status"] == "done" and not j["short"] and any("Shorts" in w for w in j["warnings"])
    with pytest.raises(jobs.JobError):
        jobs.add_job("text", CH["id"], make_long=False, make_short=False)


def test_recover_marks_running_as_stopped():
    j = jobs.add_job(_script(10), CH["id"])
    jobs._update(j["id"], lambda x: x.update(status="running"))
    jobs.recover()
    assert jobs.get_job(j["id"])["status"] == "stopped"
    jobs.delete(j["id"])


def test_queue_runs_in_order():
    a, b = jobs.add_job(_script(10), CH["id"], make_short=False), jobs.add_job(_script(10), CH["id"], make_short=False)
    first = next(j for j in jobs.list_jobs() if j["status"] == "queued")
    assert first["id"] == a["id"]
    for j in (a, b):
        _run(j)
    assert jobs.get_job(a["id"])["updated"] <= jobs.get_job(b["id"])["updated"]


def test_job_uses_its_channel():
    from app import channels
    other = channels.add("Second", "UCsecond", voice_id="v2", language="Turkish", category_id="24")
    j = _run(jobs.add_job(_script(20), other["id"], make_short=False))
    up = next(c for c in youtube.FAKE.calls if c[0] == "upload")
    assert up[3] == other["id"] and up[2]["snippet"]["categoryId"] == "24"
    assert up[2]["snippet"]["defaultLanguage"] == "tr"
    with pytest.raises(jobs.JobError, match="Kanal"):
        jobs.add_job("A script.", "0000000000")
