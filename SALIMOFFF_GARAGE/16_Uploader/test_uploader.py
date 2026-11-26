"""Offline tests: no Google libraries or network needed.  Run: python test_uploader.py"""
from datetime import date, datetime, timezone
from collections import Counter

import plan
import uploader


def test_schedule_shape():
    items = plan.build_schedule(date(2026, 11, 27))
    days = Counter(i.publish_at[:10] for i in items)
    # launch days: 1 long + 3 shorts
    for d in ("2026-11-27", "2026-11-28"):
        day_items = [i for i in items if i.publish_at.startswith(d)]
        assert sorted(i.kind for i in day_items) == ["long", "short", "short", "short"], d
    # then every other day, 3 shorts, 13 publishing days
    regular = {d: c for d, c in days.items() if d not in ("2026-11-27", "2026-11-28")}
    assert len(regular) == 13 and set(regular.values()) == {3}
    assert min(regular) == "2026-11-30" and max(regular) == "2026-12-24"
    assert "2026-11-29" not in days and "2026-12-01" not in days
    assert len(items) == 8 + 39
    assert len({i.id for i in items}) == len(items)


def test_known_slots():
    by_id = {i.id: i for i in plan.build_schedule(date(2026, 11, 27))}
    assert by_id["EP001"].publish_at == "2026-11-27T18:00:00Z"
    assert by_id["L01"].publish_at == "2026-11-27T16:00:00Z" and by_id["L01"].kind == "long"
    assert by_id["L02"].publish_at == "2026-11-28T16:00:00Z"
    assert by_id["EP015"].publish_at == "2026-12-24T18:00:00Z"
    assert by_id["EP011"].publish_at == "2026-12-08T18:00:00Z"
    assert by_id["MM13"].publish_at == "2026-12-24T14:00:00Z"
    assert by_id["PR01"].publish_at == "2026-11-30T23:00:00Z"
    assert "BMW Grille" in by_id["PR01"].title


def test_metadata_parsed_and_valid():
    items = plan.build_schedule()
    for i in items:
        assert i.title and i.description and i.tags, i.id
        assert "Synthetic content" in i.description, i.id
        assert plan.validate(i) == [], i.id
    by_id = {i.id: i for i in items}
    assert by_id["EP001"].title == "Ghost Garage #001: This Car Built Itself at 3AM"
    assert by_id["EP001"].series == "Ghost Garage"
    assert by_id["EP002"].series == "Evolution Loop"
    assert by_id["L01"].series == "Ghost Garage"
    assert by_id["L02"].series == "Barn to Billion"
    assert by_id["MM01"].series == "Macro Moments"
    assert by_id["L01"].thumbnail_file == "thumbnails/L01.jpg"


def test_start_date_shift():
    items = plan.build_schedule(date(2026, 12, 1))
    assert items[0].publish_at.startswith("2026-12-01")


def test_body_and_planning(tmp=None):
    items = [i.to_dict() for i in plan.build_schedule()]
    body = uploader.video_body(items[0])
    assert body["status"]["privacyStatus"] == "private"
    assert body["status"]["containsSyntheticMedia"] is True
    assert body["status"]["selfDeclaredMadeForKids"] is False
    assert body["snippet"]["categoryId"] == "2"

    # no video files exist in the repo -> nothing to upload, everything waits
    now = datetime(2026, 11, 26, 20, 0, tzinfo=timezone.utc)
    todo, notes = uploader.plan_uploads(items, {}, None, now)
    assert todo == [] and len(notes) == len(items)

    # pretend EP001 file exists
    orig = uploader.HERE
    class FakeHere(type(orig)):
        pass
    exists = lambda p: str(p).endswith("EP001.mp4")
    import pathlib
    real = pathlib.Path.exists
    pathlib.Path.exists = lambda self: exists(self) or (real(self) and not str(self).endswith(".mp4"))
    try:
        todo, _ = uploader.plan_uploads(items, {}, None, now)
        assert [t["id"] for t in todo] == ["EP001"]
        todo, _ = uploader.plan_uploads(items, {"EP001": {}}, None, now)
        assert todo == []
        late = datetime(2026, 11, 27, 17, 50, tzinfo=timezone.utc)
        todo, notes = uploader.plan_uploads(items, {}, {"EP001"}, late)
        assert todo == [] and "has passed" in notes[0]
        # EP011 still has [CAR MODEL] -> must not upload
        pathlib.Path.exists = lambda self: str(self).endswith("EP011.mp4") or (real(self) and not str(self).endswith(".mp4"))
        todo, notes = uploader.plan_uploads(items, {}, {"EP011"}, now)
        assert todo == [] and "placeholders" in notes[0]
    finally:
        pathlib.Path.exists = real


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok  ", name)
