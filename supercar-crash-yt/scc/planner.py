"""Content calendar: one long video and one Short per day, chosen to avoid repetition.

Selection is deterministic for a given date (seeded RNG), so re-planning the same day gives the same
result unless the history changes.
"""
from __future__ import annotations

import random
from dataclasses import asdict, dataclass, field
from datetime import date, timedelta

from .catalog import CARS, CARS_BY_KEY, COLORS, FORMATS_BY_KEY, LIGHTING, SCENARIOS, SPEEDS_KMH, Car

# Names that pull the most search and browse traffic in this niche; used more often early on.
VIRAL_FIRST = {"chiron", "jesko", "laferrari", "senna", "revuelto", "svj", "sf90", "g63", "cullinan",
               "p1", "huayra", "tourbillon", "urus", "phantom", "valkyrie", "amg_one"}

# (format, weight) per growth phase. Phase is picked from the day index of the plan.
LONG_WEIGHTS = {
    "launch": [("showdown", 5), ("speed_ladder", 5), ("price_ladder", 1), ("suv_tank", 1)],
    "growth": [("showdown", 3), ("speed_ladder", 2), ("price_ladder", 3), ("brand_battle", 2),
               ("suv_tank", 2), ("top_list", 1)],
    "scale": [("showdown", 2), ("speed_ladder", 2), ("price_ladder", 2), ("brand_battle", 3),
              ("suv_tank", 2), ("top_list", 2)],
}
SHORT_STANDALONE = ["one_hit", "slowmo", "survive", "before_after", "versus_short"]
RECENT_DAYS = 4          # a car may not appear again within this many days
RECENT_LONG_DAYS = 10    # ...and may not be in another long video within this many days (soft rule)


@dataclass
class VideoPlan:
    id: str
    publish_date: str          # YYYY-MM-DD
    kind: str                  # long | short
    format_key: str
    car_keys: list[str]
    scenario_key: str
    speeds: list[int]
    colors: list[str]
    lighting: str
    title_index: int
    linked_long_id: str | None = None
    phase: str = "launch"
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "VideoPlan":
        return cls(**d)

    @property
    def cars(self) -> list[Car]:
        return [CARS_BY_KEY[k] for k in self.car_keys]

    @property
    def fmt(self):
        return FORMATS_BY_KEY[self.format_key]


def phase_for(day_index: int) -> str:
    if day_index < 21:
        return "launch"
    if day_index < 60:
        return "growth"
    return "scale"


def _weighted(rng: random.Random, pairs: list[tuple[str, int]], exclude: set[str]) -> str:
    options = [(k, w) for k, w in pairs if k not in exclude] or pairs
    keys, weights = zip(*options)
    return rng.choices(keys, weights=weights, k=1)[0]


class Planner:
    def __init__(self, history: list[VideoPlan] | None = None):
        self.history: list[VideoPlan] = sorted(history or [], key=lambda p: (p.publish_date, p.kind))

    # -- helpers ---------------------------------------------------------------
    def _recent_cars(self, day: date, days: int = RECENT_DAYS, kind: str | None = None) -> set[str]:
        lo = (day - timedelta(days=days)).isoformat()
        return {k for p in self.history if lo <= p.publish_date < day.isoformat()
                and (kind is None or p.kind == kind) for k in p.car_keys}

    def _recent_formats(self, day: date, kind: str, n: int) -> list[str]:
        past = [p for p in self.history if p.kind == kind and p.publish_date < day.isoformat()]
        return [p.format_key for p in past[-n:]]

    def _pick_cars(self, rng: random.Random, n: int, pool: list[Car], avoid: set[str],
                   distinct_brands: bool = True, prefer_viral: bool = True, soft_avoid: set[str] = frozenset()) -> list[Car]:
        fresh = [c for c in pool if c.key not in avoid | soft_avoid]
        if len(fresh) < n:
            fresh = [c for c in pool if c.key not in avoid] or list(pool)
        chosen: list[Car] = []
        while len(chosen) < n and fresh:
            weights = [3 if (prefer_viral and c.key in VIRAL_FIRST) else 1 for c in fresh]
            car = rng.choices(fresh, weights=weights, k=1)[0]
            chosen.append(car)
            fresh = [c for c in fresh if c.key != car.key and not (distinct_brands and c.brand == car.brand)]
        if len(chosen) < n:   # pool too small after filters: relax brand rule
            rest = [c for c in pool if c not in chosen]
            chosen += rng.sample(rest, n - len(chosen))
        return chosen

    # -- planning --------------------------------------------------------------
    def plan_long(self, day: date, day_index: int) -> VideoPlan:
        rng = random.Random(f"long-{day.isoformat()}")
        phase = phase_for(day_index)
        last = set(self._recent_formats(day, "long", 1))
        fmt_key = _weighted(rng, LONG_WEIGHTS[phase], exclude=last)
        avoid = self._recent_cars(day)
        soft = self._recent_cars(day, RECENT_LONG_DAYS, 'long')
        prefer_viral = phase != "scale"
        exotic = [c for c in CARS if c.tier in ("hyper", "super")]

        if fmt_key == "speed_ladder":
            cars = self._pick_cars(rng, 1, exotic, avoid, prefer_viral=prefer_viral, soft_avoid=soft)
            speeds = [50, 100, 200, 300]
        elif fmt_key == "showdown":
            tier = rng.choice(["hyper", "hyper", "super"])
            cars = self._pick_cars(rng, 2, [c for c in CARS if c.tier == tier], avoid, prefer_viral=prefer_viral, soft_avoid=soft)
            speeds = [rng.choice([150, 200, 250])]
        elif fmt_key == "price_ladder":
            cars = []
            for tier in ("mid", "super", "luxury", "hyper"):
                cars += self._pick_cars(rng, 1, [c for c in CARS if c.tier == tier], avoid, prefer_viral=prefer_viral, soft_avoid=soft)
            cars.sort(key=lambda c: c.price_usd)
            speeds = [rng.choice([100, 150])]
        elif fmt_key == "brand_battle":
            cars = self._pick_cars(rng, 3, exotic, avoid, distinct_brands=True, prefer_viral=prefer_viral, soft_avoid=soft)
            speeds = [rng.choice([150, 200])]
        elif fmt_key == "suv_tank":
            cars = self._pick_cars(rng, 3, [c for c in CARS if c.body == "suv"], set(), prefer_viral=False)
            speeds = [rng.choice([80, 100, 120])]
        else:  # top_list
            hyper = sorted([c for c in CARS if c.tier == "hyper"], key=lambda c: -c.price_usd)
            top = [c for c in hyper if c.key not in avoid][:8]
            top += [c for c in hyper if c not in top][:max(0, 5 - len(top))]
            cars = sorted(rng.sample(top, 5), key=lambda c: c.price_usd)
            speeds = [200]

        fmt = FORMATS_BY_KEY[fmt_key]
        # long videos are wall crashes only; the side-pole scenario is kept for occasional Shorts
        scenario = rng.choice([s for s in SCENARIOS if s.impact != "side"])
        plan = VideoPlan(
            id=f"{day.isoformat()}-L", publish_date=day.isoformat(), kind="long", format_key=fmt_key,
            car_keys=[c.key for c in cars], scenario_key=scenario.key, speeds=speeds,
            colors=rng.sample(COLORS, len(cars)), lighting=rng.choice(LIGHTING),
            title_index=rng.randrange(len(fmt.titles)), phase=phase,
        )
        self.history.append(plan)
        return plan

    def plan_short(self, day: date, day_index: int, long_plan: VideoPlan) -> VideoPlan:
        rng = random.Random(f"short-{day.isoformat()}")
        phase = phase_for(day_index)
        teaser = day_index % 2 == 0          # every other day the Short promotes today's long video
        last = set(self._recent_formats(day, "short", 2))
        if teaser:
            fmt_key = rng.choice([k for k in ("one_hit", "slowmo", "survive") if k not in last] or ["one_hit"])
            if long_plan.format_key in ("showdown",) and "versus_short" not in last:
                fmt_key = "versus_short"
            n = FORMATS_BY_KEY[fmt_key].n_cars
            # the teaser shows the most expensive car(s) of the long video: strongest hook
            order = sorted(range(len(long_plan.car_keys)),
                           key=lambda i: -CARS_BY_KEY[long_plan.car_keys[i]].price_usd)[:n]
            car_keys = [long_plan.car_keys[i] for i in order]
            colors = [long_plan.colors[i] for i in order]
            scenario_key, lighting = long_plan.scenario_key, long_plan.lighting
            speed = max(long_plan.speeds)
            linked = long_plan.id
        else:
            fmt_key = rng.choice([k for k in SHORT_STANDALONE if k not in last])
            n = FORMATS_BY_KEY[fmt_key].n_cars
            avoid = self._recent_cars(day) | set(long_plan.car_keys)
            exotic = [c for c in CARS if c.tier in ("hyper", "super", "luxury")]
            cars = self._pick_cars(rng, n, exotic, avoid, prefer_viral=True)
            car_keys = [c.key for c in cars]
            colors = rng.sample(COLORS, n)
            scenario_key = rng.choice(SCENARIOS).key if n == 1 else "test_wall"
            lighting = rng.choice(LIGHTING)
            speed = rng.choice([s for s in SPEEDS_KMH if s >= 150])
            linked = None
        fmt = FORMATS_BY_KEY[fmt_key]
        plan = VideoPlan(
            id=f"{day.isoformat()}-S", publish_date=day.isoformat(), kind="short", format_key=fmt_key,
            car_keys=car_keys, scenario_key=scenario_key, speeds=[speed], colors=colors, lighting=lighting,
            title_index=rng.randrange(len(fmt.titles)), linked_long_id=linked, phase=phase,
        )
        self.history.append(plan)
        return plan

    def plan_range(self, start: date, days: int, first_day: date | None = None) -> list[VideoPlan]:
        """Plan ``days`` days from ``start``. ``first_day`` is the channel's day 1 (for phases)."""
        first_day = first_day or start
        existing = {p.id for p in self.history}
        out: list[VideoPlan] = []
        for i in range(days):
            day = start + timedelta(days=i)
            idx = (day - first_day).days
            if f"{day.isoformat()}-L" in existing:
                continue
            long_plan = self.plan_long(day, idx)
            out += [long_plan, self.plan_short(day, idx, long_plan)]
        return out
