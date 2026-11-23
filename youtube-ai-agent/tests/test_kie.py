"""Kie.ai adapter against a simulated API (the request/response shape our code expects)."""
import json
import os
import tempfile
from pathlib import Path

import httpx
import pytest

os.environ.setdefault("YTA_DATA_DIR", tempfile.mkdtemp())

from app import media, store  # noqa: E402
from app.llm import ProviderError  # noqa: E402


class FakeKie:
    def __init__(self, final_state="success"):
        self.calls, self.polls, self.final_state = [], 0, final_state

    def post(self, url, json=None, headers=None, **kw):
        self.calls.append(("POST", url, json, headers))
        if url == media.KIE_UPLOAD:
            assert json["base64Data"].startswith("data:image/png;base64,")
            return httpx.Response(200, json={"code": 200, "data": {"downloadUrl": "https://cdn.example/f.png"}})
        assert url.endswith("/jobs/createTask")
        return httpx.Response(200, json={"code": 200, "msg": "success", "data": {"taskId": "t1"}})

    def get(self, url, params=None, headers=None, **kw):
        self.calls.append(("GET", url, params, headers))
        if url.endswith("/jobs/recordInfo"):
            self.polls += 1
            if self.polls < 2:
                return httpx.Response(200, json={"code": 200, "data": {"state": "generating"}})
            if self.final_state == "fail":
                return httpx.Response(200, json={"code": 200, "data": {"state": "fail", "failMsg": "bad image"}})
            res = json.dumps({"resultUrls": ["https://cdn.example/v.mp4"]})
            return httpx.Response(200, json={"code": 200, "data": {"state": "success", "resultJson": res}})
        return httpx.Response(200, content=b"MP4DATA")


@pytest.fixture
def setup(monkeypatch, tmp_path):
    store.save_keys({"kie": "kie-key"})
    monkeypatch.setattr(media.time, "sleep", lambda s: None)
    img = tmp_path / "f.png"
    img.write_bytes(b"\x89PNG fake")
    st = store.deep_merge(store.DEFAULT_SETTINGS, {"demo_mode": False, "motion": {
        "animate_provider": "kie", "kie_model": "bytedance/v1-pro-image-to-video",
        "kie_image_field": "image_url", "kie_extra": '{"resolution": "720p"}', "clip_seconds": 5}})
    return img, tmp_path / "out.mp4", st


def test_kie_success(monkeypatch, setup):
    img, out, st = setup
    fake = FakeKie()
    monkeypatch.setattr(media.httpx, "post", fake.post)
    monkeypatch.setattr(media.httpx, "get", fake.get)
    cost = media.animate(img, "slow push in", out, st)
    assert out.read_bytes() == b"MP4DATA" and cost["provider"] == "kie"
    create = next(c for c in fake.calls if c[1].endswith("createTask"))
    assert create[3]["Authorization"] == "Bearer kie-key"
    assert create[2] == {"model": "bytedance/v1-pro-image-to-video", "input": {
        "prompt": "slow push in", "duration": "5", "image_url": "https://cdn.example/f.png", "resolution": "720p"}}


def test_kie_list_field_and_failure(monkeypatch, setup):
    img, out, st = setup
    st["motion"]["kie_image_field"] = "image_urls"
    fake = FakeKie(final_state="fail")
    monkeypatch.setattr(media.httpx, "post", fake.post)
    monkeypatch.setattr(media.httpx, "get", fake.get)
    with pytest.raises(ProviderError, match="bad image"):
        media.animate(img, "p", out, st)
    create = next(c for c in fake.calls if c[1].endswith("createTask"))
    assert create[2]["input"]["image_urls"] == ["https://cdn.example/f.png"]
