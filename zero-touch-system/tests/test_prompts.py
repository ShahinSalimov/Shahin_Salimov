"""Tests for core.prompts."""
import pytest

from core.prompts import PromptLoader


def test_loads_version_and_strips_header(prompts_dir):
    loader = PromptLoader(prompts_dir)
    p = loader.load("studio/ceo")
    assert p.version == "1.0.0"
    assert not p.text.startswith("version:")
    assert p.text.startswith("ROLE: You are the CEO")


def test_system_for_combines_common_and_agent(prompts_dir):
    loader = PromptLoader(prompts_dir)
    system, version = loader.system_for("youtube", "trend_scout")
    assert system.startswith("You are an autonomous agent")
    assert "ROLE: You are the Trend Scout" in system
    assert version == "1.0.0"


def test_missing_version_header_rejected(tmp_path):
    (tmp_path / "bad.md").write_text("no header\n")
    with pytest.raises(ValueError):
        PromptLoader(tmp_path).load("bad")


def test_missing_prompt_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        PromptLoader(tmp_path).load("nope")


def test_path_traversal_rejected(prompts_dir):
    with pytest.raises(ValueError):
        PromptLoader(prompts_dir).load("../CLAUDE")


def test_list_agents(prompts_dir):
    loader = PromptLoader(prompts_dir)
    assert loader.agents("studio") == {"ceo", "research", "content", "philosopher", "banker"}
    assert loader.agents("youtube") == {"trend_scout", "script_writer", "media_producer",
                                        "seo_upload", "growth_banker"}
