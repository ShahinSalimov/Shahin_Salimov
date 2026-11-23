from PIL import Image

from app import providers


def test_fake_providers_produce_files(tmp_path):
    land, port = tmp_path / "l.png", tmp_path / "p.png"
    providers.image("a car", land)
    providers.image("a car", port, portrait=True)
    assert Image.open(land).size == (1536, 1024)
    assert Image.open(port).size == (1024, 1536)
    audio = tmp_path / "a.mp3"
    providers.tts("x" * 60, audio)
    assert abs(providers.media_duration(audio) - 4) < 0.3
    clip = tmp_path / "c.mp4"
    providers.animate(land, "push in", clip)
    assert providers.media_duration(clip) > 4


def test_kie_input_seedance():
    # values from docs.kie.ai/market/bytedance/seedance-2
    assert providers.kie_input("p", "u", 30, True) == {
        "prompt": "p", "first_frame_url": "u", "duration": 15, "resolution": "720p",
        "aspect_ratio": "9:16", "generate_audio": False}
    assert providers.kie_input("p", "u", 2, False)["duration"] == 4
