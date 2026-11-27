"""Stage 6: growth report every N days (default 3) + the learning loop.

Pulls YouTube Analytics for the period and the previous period, maps videos to our ideas
(long/short, pillar), measures what worked, asks AI for actions and feeds the lessons back
into planning (pillar weights, learnings, and — in full-auto mode — cadence adjustments).
"""
from __future__ import annotations

import hashlib
import html
import statistics as stats
import time
from datetime import date, timedelta

from . import ai, db, ytapi

METRICS = ("views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,"
           "subscribersGained,subscribersLost,likes,comments,shares")
YPP = {"early": {"subs": 500, "hours": 3000, "shorts_views": 3_000_000},
       "full": {"subs": 1000, "hours": 4000, "shorts_views": 10_000_000}}


def _num(x) -> float:
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def _delta(cur: float, prev: float) -> float | None:
    return None if not prev else round((cur - prev) / prev * 100, 1)


# --------------------------------------------------------------------------- data
def _real_data(cid: str, days: int) -> dict:
    end = date.today()
    start = end - timedelta(days=days - 1)
    pstart, pend = start - timedelta(days=days), start - timedelta(days=1)
    cur = (ytapi.analytics(cid, start, end, METRICS) or [{}])[0]
    prev = (ytapi.analytics(cid, pstart, pend, METRICS) or [{}])[0]
    per_video = ytapi.analytics(cid, start, end, "views,estimatedMinutesWatched,averageViewDuration,"
                                "averageViewPercentage,likes,subscribersGained",
                                dimensions="video", sort="-views", max_results=200)
    me = ytapi.my_channel(cid)
    ypp, approx = {}, False
    try:
        long_rows = ytapi.analytics(cid, end - timedelta(days=364), end, "estimatedMinutesWatched",
                                    dimensions="creatorContentType")
        by_type = {r.get("creatorContentType"): _num(r.get("estimatedMinutesWatched")) for r in long_rows}
        hours = (by_type.get("videoOnDemand", 0) + by_type.get("VIDEO_ON_DEMAND", 0)) / 60
        short_rows = ytapi.analytics(cid, end - timedelta(days=89), end, "views", dimensions="creatorContentType")
        sv = {r.get("creatorContentType"): _num(r.get("views")) for r in short_rows}
        shorts_views = sv.get("shorts", 0) + sv.get("SHORTS", 0)
    except ytapi.YTError:
        approx = True
        hours = _num((ytapi.analytics(cid, end - timedelta(days=364), end, "estimatedMinutesWatched") or [{}])[0]
                     .get("estimatedMinutesWatched")) / 60
        shorts_views = 0
    ypp = {"subs": me["subs"], "hours": round(hours, 1), "shorts_views": int(shorts_views), "approx": approx}
    return {"period": [start.isoformat(), end.isoformat()], "cur": cur, "prev": prev, "per_video": per_video,
            "channel": {k: me[k] for k in ("subs", "views", "videos")}, "ypp": ypp}


def _demo_data(ch: dict, days: int) -> dict:
    pub = [i for i in ch["ideas"] if i.get("yt_id")]
    n = len(ch.get("reports", []))
    g = 1 + 0.35 * n
    rows = []
    for i in pub:
        h = int(hashlib.md5(i["yt_id"].encode()).hexdigest(), 16)
        views = int((h % 4000 + 300) * (3 if i["kind"] == "short" else 1) * g)
        rows.append({"video": i["yt_id"], "views": views,
                     "estimatedMinutesWatched": views * (0.6 if i["kind"] == "short" else 4.2),
                     "averageViewDuration": 34 if i["kind"] == "short" else 260 + h % 200,
                     "averageViewPercentage": 70 + h % 25 if i["kind"] == "short" else 30 + h % 25,
                     "likes": views // 25, "subscribersGained": views // 180})
    tot = sum(r["views"] for r in rows) or int(500 * g)
    cur = {"views": tot, "estimatedMinutesWatched": sum(r["estimatedMinutesWatched"] for r in rows) or tot * 2,
           "averageViewDuration": 150, "averageViewPercentage": 45, "subscribersGained": tot // 150,
           "subscribersLost": tot // 2000, "likes": tot // 25, "comments": tot // 300, "shares": tot // 400}
    prev = {k: (v / g * (1 + 0.35 * max(0, n - 1)) if n else 0) for k, v in cur.items()}
    subs = int(sum(_num(r.get("cur", {}).get("subscribersGained")) for r in ch.get("reports", [])) + cur["subscribersGained"])
    end = date.today()
    return {"period": [(end - timedelta(days=days - 1)).isoformat(), end.isoformat()], "cur": cur, "prev": prev,
            "per_video": rows, "channel": {"subs": subs, "views": tot * (n + 1), "videos": len(pub)},
            "ypp": {"subs": subs, "hours": round(cur["estimatedMinutesWatched"] * (n + 1) / 60, 1),
                    "shorts_views": sum(r["views"] for r, i in zip(rows, pub) if i["kind"] == "short") * (n + 1),
                    "approx": True}}


# --------------------------------------------------------------------------- analysis
def analyse(ch: dict, data: dict, days: int) -> dict:
    by_id = {i["yt_id"]: i for i in ch["ideas"] if i.get("yt_id")}
    videos = []
    for r in data["per_video"]:
        i = by_id.get(r.get("video"))
        videos.append({
            "yt_id": r.get("video"), "title": i["title"] if i else "(sistemdən kənar video)",
            "kind": i["kind"] if i else "?", "pillar": i.get("pillar", "") if i else "",
            "views": int(_num(r.get("views"))), "minutes": round(_num(r.get("estimatedMinutesWatched"))),
            "avd": round(_num(r.get("averageViewDuration"))), "avp": round(_num(r.get("averageViewPercentage")), 1),
            "likes": int(_num(r.get("likes"))), "subs": int(_num(r.get("subscribersGained"))),
        })
    videos.sort(key=lambda v: -v["views"])
    cur, prev = data["cur"], data["prev"]
    kpis = {
        "views": int(_num(cur.get("views"))),
        "watch_hours": round(_num(cur.get("estimatedMinutesWatched")) / 60, 1),
        "subs_net": int(_num(cur.get("subscribersGained")) - _num(cur.get("subscribersLost"))),
        "avd_sec": round(_num(cur.get("averageViewDuration"))),
        "avp": round(_num(cur.get("averageViewPercentage")), 1),
        "engagement": int(_num(cur.get("likes")) + _num(cur.get("comments")) + _num(cur.get("shares"))),
    }
    pk = {"views": _num(prev.get("views")), "watch_hours": _num(prev.get("estimatedMinutesWatched")) / 60,
          "subs_net": _num(prev.get("subscribersGained")) - _num(prev.get("subscribersLost")),
          "avd_sec": _num(prev.get("averageViewDuration")), "avp": _num(prev.get("averageViewPercentage")),
          "engagement": _num(prev.get("likes")) + _num(prev.get("comments")) + _num(prev.get("shares"))}
    deltas = {k: _delta(kpis[k], pk[k]) for k in kpis}

    def avg(vs):
        return round(stats.mean(v["views"] for v in vs)) if vs else 0
    by_kind = {k: {"count": len([v for v in videos if v["kind"] == k]), "avg_views": avg([v for v in videos if v["kind"] == k])}
               for k in ("long", "short")}
    pillars = {}
    for v in videos:
        if v["pillar"]:
            pillars.setdefault(v["pillar"], []).append(v)
    overall = avg([v for v in videos if v["pillar"]]) or 1
    pillar_perf = {p: {"count": len(vs), "avg_views": avg(vs), "index": round(avg(vs) / overall, 2)} for p, vs in pillars.items()}

    y = data["ypp"]
    rate_subs = kpis["subs_net"] / days
    rate_hours = sum(v["minutes"] for v in videos if v["kind"] == "long") / 60 / days
    ypp = {"current": y, "targets": YPP, "eta_days": {}}
    for tier, t in YPP.items():
        need_s, need_h = max(0, t["subs"] - y["subs"]), max(0, t["hours"] - y["hours"])
        eta_s = need_s / rate_subs if rate_subs > 0 else None
        eta_h = need_h / rate_hours if rate_hours > 0 else None
        ypp["eta_days"][tier] = None if (eta_s is None and need_s) or (eta_h is None and need_h) else round(max(eta_s or 0, eta_h or 0))
    return {"kpis": kpis, "deltas": deltas, "videos": videos[:50], "by_kind": by_kind, "pillars": pillar_perf,
            "winners": videos[:3], "losers": [v for v in videos if v["views"] > 0][-3:] if len(videos) > 3 else [],
            "ypp": ypp, "channel": data["channel"], "period": data["period"]}


def _insights(ch: dict, a: dict) -> tuple[dict, dict | None]:
    if ai.demo():
        best = a["winners"][0]["title"] if a["winners"] else "—"
        return {
            "summary": f"Demo hesabat: {a['kpis']['views']} baxış, {a['kpis']['subs_net']} yeni abunəçi. Ən yaxşı video: {best}.",
            "what_worked": ["Qısa, sual ilə başlayan hook-lar", "Shorts orta hesabla long-dan çox baxış alır"],
            "what_failed": ["Uzun intro olan videolarda saxlanma aşağıdır"],
            "actions": [{"action": "Ən yaxşı videonun mövzusunda 2 davam videosu çək", "why": "Sübut olunmuş maraq", "impact": "high"},
                        {"action": "Long videoların ilk 15 saniyəsini qısalt", "why": "AVD aşağıdır", "impact": "medium"},
                        {"action": "Hər long video üçün 2 teaser Short hazırla", "why": "Shorts trafiki long-a yönəldir", "impact": "medium"}],
            "next_focus": "Qalib pillar-ə daha çox video", "adjustments": {},
            "learnings": ["Sual formalı başlıqlar daha yaxşı işləyir", "Shorts-da ilk cümlə 2 saniyədən qısa olmalıdır"],
        }, None
    compact = {k: a[k] for k in ("kpis", "deltas", "by_kind", "pillars", "ypp", "period")}
    compact["top"] = [{k: v[k] for k in ("title", "kind", "pillar", "views", "avd", "avp")} for v in a["videos"][:12]]
    compact["bottom"] = [{k: v[k] for k in ("title", "kind", "pillar", "views", "avd", "avp")} for v in a["losers"]]
    return ai.ask_json(
        "You are a YouTube growth analyst. Be specific and data-driven, write in Azerbaijani "
        "(keep YouTube terms like CTR, AVD, Shorts, hook, thumbnail in English).",
        f"Channel: {ch['name']} ({ch['niche']}). Autopilot: {ch['autopilot']}.\n"
        f"Lessons already known: {[l['text'] for l in ch.get('learnings', [])][-10:]}\n"
        f"Report data: {ytapi.dumps(compact)}\n\n"
        'Return {"summary": "4-5 sentences", "what_worked": ["..."], "what_failed": ["..."], '
        '"actions": [{"action": "...", "why": "...", "impact": "high|medium|low"}] (5 actions for the next 3 days), '
        '"next_focus": "one sentence", "adjustments": {"long_per_week": n?, "shorts_per_week": n?, '
        '"long_minutes": n?} (only if data clearly supports a change, else {}), '
        '"learnings": ["3-5 short reusable rules for future videos of this channel"]}', max_tokens=4000)


def generate(progress, cid: str) -> dict:
    ch = db.get_channel(cid)
    days = int(ch["autopilot"].get("report_every_days") or 3)
    progress(10, "YouTube Analytics məlumatı yığılır")
    demo = ai.demo() or ytapi.is_demo_link(cid) or not ch["youtube"]["connected"]
    data = _demo_data(ch, days) if demo else _real_data(cid, days)
    progress(45, "Göstəricilər hesablanır")
    a = analyse(ch, data, days)
    progress(65, "AI nəticə çıxarır və tövsiyələr yazır")
    ins, cost = _insights(ch, a)
    rep = {"id": db.new_id(), "created": time.time(), "days": days, "demo": demo, **a, "insights": ins}
    applied = []

    def upd(c):
        c["reports"] = (c.get("reports") or [])[-59:] + [rep]
        c["last_report_at"] = time.time()
        for t in ins.get("learnings", [])[:5]:
            c["learnings"].append({"t": time.time(), "source": "hesabat", "text": t})
        c["learnings"] = c["learnings"][-40:]
        w = dict(c.get("pillar_weights") or {})
        for p, perf in a["pillars"].items():
            if perf["count"]:
                w[p] = round(max(0.5, min(2.0, 0.5 * w.get(p, 1.0) + 0.5 * perf["index"])), 2)
        c["pillar_weights"] = w
        for i in c["ideas"]:  # re-prioritise the backlog with fresh weights
            if i["status"] in ("idea", "approved"):
                i["priority"] = round(i["predicted"] * w.get(i.get("pillar", ""), 1.0), 1)
        if c["autopilot"]["mode"] == "full":
            adj = ins.get("adjustments") or {}
            bounds = {"long_per_week": (1, 5), "shorts_per_week": (3, 14)}
            for k, (lo, hi) in bounds.items():
                if isinstance(adj.get(k), (int, float)):
                    v = int(max(lo, min(hi, adj[k])))
                    if v != c["autopilot"][k]:
                        applied.append(f"{k}: {c['autopilot'][k]} → {v}")
                        c["autopilot"][k] = v
        if cost:
            c.setdefault("costs", []).append({**cost, "t": time.time()})
    db.update_channel(cid, upd)
    rep["applied"] = applied
    db.update_channel(cid, lambda c: c["reports"][-1].update(applied=applied))
    db.log(cid, f"İnkişaf hesabatı hazırdır ({a['period'][0]} → {a['period'][1]})"
                + (f"; avtomatik dəyişikliklər: {', '.join(applied)}" if applied else ""))
    progress(100, "Hesabat hazırdır")
    return rep


# --------------------------------------------------------------------------- export
def to_html(ch: dict, rep: dict) -> str:
    e = html.escape
    k, d, ins = rep["kpis"], rep["deltas"], rep["insights"]
    names = {"views": "Baxış", "watch_hours": "İzlənmə saatı", "subs_net": "Yeni abunəçi (net)",
             "avd_sec": "Orta izlənmə (san)", "avp": "Orta izlənmə %", "engagement": "Engagement"}

    def dl(x):
        return "" if x is None else f"<small class={'up' if x >= 0 else 'down'}>{'+' if x >= 0 else ''}{x}%</small>"
    cards = "".join(f"<div class=card><span>{names[n]}</span><b>{k[n]:,}</b>{dl(d[n])}</div>" for n in k)
    rows = "".join(f"<tr><td>{e(v['title'])}</td><td>{v['kind']}</td><td>{e(v['pillar'])}</td><td>{v['views']:,}</td>"
                   f"<td>{v['avd']}s</td><td>{v['avp']}%</td><td>{v['subs']}</td></tr>" for v in rep["videos"][:25])
    acts = "".join(f"<li><b>[{e(a.get('impact', ''))}]</b> {e(a.get('action', ''))} — {e(a.get('why', ''))}</li>"
                   for a in ins.get("actions", []))
    y = rep["ypp"]["current"]
    eta = rep["ypp"]["eta_days"]
    return f"""<!doctype html><html lang=az><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>{e(ch['name'])} hesabat</title><style>
:root{{--bg:#fff;--fg:#111;--mut:#666;--card:#f4f4f6;--acc:#e11d48}}
@media (prefers-color-scheme:dark){{:root{{--bg:#0e0e12;--fg:#eee;--mut:#999;--card:#1b1b22}}}}
body{{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;max-width:980px;margin:0 auto;padding:24px 16px}}
h1{{margin:0}} .mut{{color:var(--mut)}} .grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:18px 0}}
.card{{background:var(--card);border-radius:10px;padding:12px;display:flex;flex-direction:column}} .card b{{font-size:22px}}
.up{{color:#16a34a}} .down{{color:#dc2626}} table{{width:100%;border-collapse:collapse;font-size:13px}} td,th{{padding:6px;border-bottom:1px solid var(--card);text-align:left}}
.wrap{{overflow-x:auto}}</style>
<h1>SALIMOFF AI YOUTUBE · {e(ch['name'])}</h1><div class=mut>İnkişaf hesabatı {rep['period'][0]} → {rep['period'][1]}{' · DEMO məlumat' if rep.get('demo') else ''}</div>
<div class=grid>{cards}</div><h2>Xülasə</h2><p>{e(ins.get('summary', ''))}</p>
<h3>Nə işlədi</h3><ul>{''.join(f'<li>{e(x)}</li>' for x in ins.get('what_worked', []))}</ul>
<h3>Nə işləmədi</h3><ul>{''.join(f'<li>{e(x)}</li>' for x in ins.get('what_failed', []))}</ul>
<h2>Növbəti 3 gün üçün addımlar</h2><ol>{acts}</ol>
<h2>Monetizasiya yolu (YPP)</h2><p>Abunəçi: <b>{y['subs']:,}</b> · Long izlənmə saatı (12 ay): <b>{y['hours']:,}</b> · Shorts baxışı (90 gün): <b>{y['shorts_views']:,}</b>{' (təxmini)' if y.get('approx') else ''}<br>
Təxmini çatma müddəti — erkən YPP: <b>{eta.get('early') if eta.get('early') is not None else '—'}</b> gün, tam YPP: <b>{eta.get('full') if eta.get('full') is not None else '—'}</b> gün (cari templə)</p>
<h2>Videolar</h2><div class=wrap><table><tr><th>Başlıq</th><th>Növ</th><th>Pillar</th><th>Baxış</th><th>AVD</th><th>AVP</th><th>Abunə</th></tr>{rows}</table></div>
</html>"""
