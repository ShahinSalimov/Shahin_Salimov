"""One-button launch: analysis → decision → channel → plan → autopilot."""
from __future__ import annotations

from . import channel, db, planner, research


def launch(progress, inp: dict, mode: str = "approve") -> dict:
    r = research.new_research(inp)
    progress(2, "1/4 Bazar analizi")
    research.run(lambda p, m: progress(2 + p * 0.45, f"1/4 {m}"), r["id"])
    r = db.get_research(r["id"])
    progress(48, f"2/4 Qərar: {r['decision']['niche']}")
    cid = channel.build(lambda p, m: progress(50 + p * 0.35, f"3/4 {m}"), r["id"])
    progress(86, "4/4 İlk kontent planı hazırlanır")
    planner.generate_ideas(cid)

    def upd(c):
        c["autopilot"].update(enabled=True, mode=mode if mode in ("approve", "full") else "approve")
        if c["autopilot"]["mode"] == "full":
            for i in c["ideas"]:
                if i["status"] == "idea":
                    i["status"] = "approved"
    db.update_channel(cid, upd)
    db.log(cid, f"Autopilot işə düşdü (rejim: {mode})")
    progress(100, "Sistem işə düşdü")
    return {"research_id": r["id"], "channel_id": cid}
