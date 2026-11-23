import pytest

from app import config, youtube

S = {"id": "0123456789", "language": "English", "category_id": "2"}


def test_upload_without_connection_fails_clearly(tmp_path):
    youtube.FAKE.connected = False
    try:
        with pytest.raises(youtube.YouTubeError, match="YouTube hesabı qoşulmayıb"):
            youtube.upload(tmp_path / "v.mp4", {"title": "t"}, S)
    finally:
        youtube.FAKE.connected = True


def test_upload_body():
    body = youtube.video_body({"title": "Crash #Shorts", "description": "d", "tags": ["a"]}, S)
    assert body["status"] == {"privacyStatus": "private", "selfDeclaredMadeForKids": False,
                              "containsSyntheticMedia": True}
    assert body["snippet"]["categoryId"] == "2" and body["snippet"]["defaultLanguage"] == "en"
    assert len(youtube.video_body({"title": "x" * 300}, S)["snippet"]["title"]) == 100


def test_real_credentials_absent_means_not_connected(monkeypatch):
    monkeypatch.setattr(config, "FAKE", False)
    assert youtube._credentials("0123456789") is None
    with pytest.raises(youtube.YouTubeError, match="girişi yoxdur"):
        youtube._service("0123456789")
