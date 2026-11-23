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
            assert "file" in kw["files"] and kw["data"]["uploadPath"]
            return httpx.Response(200, json={"success": True, "code": 200,
                                             "data": {"downloadUrl": "https://cdn.example/f.png"}})
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
        "animate_provider": "kie", "kie_model": "bytedance/seedance-2",
        "kie_image_field": "", "kie_extra": "", "clip_seconds": 5}})
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
    # Seedance 2: first_frame_url + integer duration + aspect ratio, no generated audio
    assert create[2] == {"model": "bytedance/seedance-2", "input": {
        "prompt": "slow push in", "resolution": "720p", "generate_audio": False, "duration": 5,
        "aspect_ratio": "16:9", "first_frame_url": "https://cdn.example/f.png"}}


def test_kie_list_field_and_failure(monkeypatch, setup):
    img, out, st = setup
    st["motion"]["kie_model"] = "kling-2.6/image-to-video"
    fake = FakeKie(final_state="fail")
    monkeypatch.setattr(media.httpx, "post", fake.post)
    monkeypatch.setattr(media.httpx, "get", fake.get)
    with pytest.raises(ProviderError, match="bad image"):
        media.animate(img, "p", out, st)
    create = next(c for c in fake.calls if c[1].endswith("createTask"))
    assert create[2]["input"]["image_urls"] == ["https://cdn.example/f.png"]


def test_kie_input_presets():
    # values below are taken from the docs.kie.ai model pages
    assert media.kie_input("kling-2.6/image-to-video", "p", "u", 7, "16:9") == {
        "prompt": "p", "sound": False, "duration": "5", "image_urls": ["u"]}
    assert media.kie_input("hailuo/2-3-image-to-video-standard", "p", "u", 5, "16:9")["duration"] == "6"
    assert media.kie_input("wan/2-6-image-to-video", "p", "u", 14, "16:9")["duration"] == "15"
    assert media.kie_input("bytedance/seedance-2", "p", "u", 30, "9:16")["duration"] == 15
    custom = media.kie_input("some/new-model", "p", "u", 5, "16:9", "input_urls", '{"mode": "pro"}')
    assert custom == {"prompt": "p", "duration": "5", "input_urls": ["u"], "mode": "pro"}
