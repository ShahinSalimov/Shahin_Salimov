import os
import tempfile

# Every test run uses fake providers and a throwaway data folder.
os.environ["YTA_FAKE"] = "1"
_tmp = tempfile.mkdtemp()
os.environ["YTA_DATA_DIR"] = os.path.join(_tmp, "data")
os.environ["YTA_OUTPUT_DIR"] = os.path.join(_tmp, "output")


import pytest  # noqa: E402


@pytest.fixture
def channel():
    from app import channels
    return channels.add("Test Channel", "UCtest", voice_id="v1")
