"""Tests that the two orgs never import or process each other's code, data and messages."""
import ast
import subprocess
import sys
from pathlib import Path

import pytest

from core.bootstrap import build_runtime
from core.config import Settings
from core.envelope import new_envelope
from core.testing import FakeLLM
from core.tools.whatsapp import ConsoleWhatsApp

ROOT = Path(__file__).resolve().parents[1]
ORGS = ("studio", "youtube")


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names |= {a.name for a in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
    return names


@pytest.mark.parametrize("org,other", [("studio", "youtube"), ("youtube", "studio")])
def test_org_code_never_imports_the_other_org(org, other):
    offenders = {str(p.relative_to(ROOT)): sorted(i for i in _imports(p) if i.startswith(f"orgs.{other}"))
                 for p in (ROOT / "orgs" / org).rglob("*.py")}
    assert not {k: v for k, v in offenders.items() if v}


def test_core_has_no_static_org_imports():
    offenders = {str(p.relative_to(ROOT)): sorted(i for i in _imports(p) if i.startswith("orgs"))
                 for p in (ROOT / "core").rglob("*.py")}
    assert not {k: v for k, v in offenders.items() if v}


@pytest.mark.parametrize("org,other", [("studio", "youtube"), ("youtube", "studio")])
def test_runtime_does_not_load_other_org_modules(tmp_path, org, other):
    code = (
        "import sys\n"
        "from core.bootstrap import build_runtime\n"
        "from core.config import Settings\n"
        "from core.tools.whatsapp import ConsoleWhatsApp\n"
        f"rt = build_runtime('{org}', Settings(_env_file=None), llm=object(), "
        f"notifier=ConsoleWhatsApp(org='{org}'), db_path=r'{tmp_path / 'iso.db'}')\n"
        f"bad = [m for m in sys.modules if m.startswith('orgs.{other}')]\n"
        "assert not bad, bad\n"
        "rt.stop()\n"
    )
    res = subprocess.run([sys.executable, "-c", code], cwd=ROOT, capture_output=True, text=True)
    assert res.returncode == 0, res.stderr


@pytest.fixture
def runtimes(tmp_path):
    rts = {org: build_runtime(org, Settings(_env_file=None, data_dir=str(tmp_path / org)), llm=FakeLLM({}),
                              notifier=ConsoleWhatsApp(org=org)) for org in ORGS}
    yield rts
    for rt in rts.values():
        rt.stop()


def test_separate_databases_by_default(runtimes, tmp_path):
    assert Path(runtimes["studio"].store.path) == tmp_path / "studio" / "studio.db"
    assert Path(runtimes["youtube"].store.path) == tmp_path / "youtube" / "youtube.db"


def test_store_rejects_foreign_org_runs_and_envelopes(runtimes):
    studio = runtimes["studio"]
    run_id = studio.store.create_run("studio", "studio_daily")
    with pytest.raises(ValueError):
        studio.store.enqueue(new_envelope("youtube", run_id, step="trend_scout", from_agent="x", payload={}))
    with pytest.raises(ValueError):
        studio.store.create_run("youtube", "youtube_daily")


def test_tools_pipelines_and_agents_are_disjoint(runtimes):
    s, y = runtimes["studio"], runtimes["youtube"]
    assert (s.tools.names() & y.tools.names()) == {"whatsapp_send"}
    assert not set(s.runner.pipelines) & set(y.runner.pipelines)
    assert not set(s.agents.routing) & set(y.agents.routing)
    assert not {a for a, _ in s.agents.schemas} & {a for a, _ in y.agents.schemas}


def test_budget_kill_switch_and_quota_state_do_not_leak(runtimes):
    s, y = runtimes["studio"], runtimes["youtube"]
    s.budget.record("studio", 4.0)
    s.kill.activate("studio", reason="test")
    assert y.budget.spent_today("youtube") == 0.0
    assert not y.kill.is_active("youtube")


def test_whatsapp_messages_are_prefixed_per_org(runtimes):
    runtimes["studio"].notifier.send("a")
    runtimes["youtube"].notifier.send("b")
    assert runtimes["studio"].notifier.sent == ["[STUDIO] a"]
    assert runtimes["youtube"].notifier.sent == ["[YOUTUBE] b"]
