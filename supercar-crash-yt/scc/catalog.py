"""Static content library: cars, crash scenarios, camera angles and video formats.

Prices are APPROXIMATE original MSRPs in USD, rounded, for title hooks such as "$3M". They are not
checked against an official source: verify a price before it goes into a title that matters, and
edit this file freely.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Car:
    key: str
    brand: str
    model: str
    body: str            # coupe | suv | sedan | roadster
    price_usd: int       # approximate, see module docstring
    tier: str            # mid | super | hyper | luxury

    @property
    def name(self) -> str:
        return f"{self.brand} {self.model}"

    @property
    def price_label(self) -> str:
        if self.price_usd >= 1_000_000:
            value = self.price_usd / 1_000_000
            return f"${value:.1f}M".replace(".0M", "M")
        return f"${round(self.price_usd / 1000)}K"


CARS: list[Car] = [
    # hypercars
    Car("chiron", "Bugatti", "Chiron", "coupe", 3_000_000, "hyper"),
    Car("veyron", "Bugatti", "Veyron", "coupe", 1_700_000, "hyper"),
    Car("tourbillon", "Bugatti", "Tourbillon", "coupe", 4_000_000, "hyper"),
    Car("divo", "Bugatti", "Divo", "coupe", 5_800_000, "hyper"),
    Car("jesko", "Koenigsegg", "Jesko", "coupe", 3_000_000, "hyper"),
    Car("huayra", "Pagani", "Huayra", "coupe", 2_800_000, "hyper"),
    Car("laferrari", "Ferrari", "LaFerrari", "coupe", 1_400_000, "hyper"),
    Car("p1", "McLaren", "P1", "coupe", 1_150_000, "hyper"),
    Car("senna", "McLaren", "Senna", "coupe", 1_000_000, "hyper"),
    Car("amg_one", "Mercedes-AMG", "ONE", "coupe", 2_700_000, "hyper"),
    Car("valkyrie", "Aston Martin", "Valkyrie", "coupe", 3_000_000, "hyper"),
    Car("nevera", "Rimac", "Nevera", "coupe", 2_100_000, "hyper"),
    Car("918", "Porsche", "918 Spyder", "roadster", 850_000, "hyper"),
    # supercars
    Car("revuelto", "Lamborghini", "Revuelto", "coupe", 600_000, "super"),
    Car("svj", "Lamborghini", "Aventador SVJ", "coupe", 520_000, "super"),
    Car("huracan", "Lamborghini", "Huracan", "coupe", 250_000, "super"),
    Car("sf90", "Ferrari", "SF90 Stradale", "coupe", 525_000, "super"),
    Car("296", "Ferrari", "296 GTB", "coupe", 320_000, "super"),
    Car("750s", "McLaren", "750S", "coupe", 330_000, "super"),
    Car("gt3rs", "Porsche", "911 GT3 RS", "coupe", 240_000, "super"),
    Car("fordgt", "Ford", "GT", "coupe", 500_000, "super"),
    Car("dbs", "Aston Martin", "DBS", "coupe", 330_000, "super"),
    # luxury
    Car("phantom", "Rolls-Royce", "Phantom", "sedan", 460_000, "luxury"),
    Car("cullinan", "Rolls-Royce", "Cullinan", "suv", 350_000, "luxury"),
    Car("spectre", "Rolls-Royce", "Spectre", "coupe", 420_000, "luxury"),
    Car("bentley_gt", "Bentley", "Continental GT", "coupe", 250_000, "luxury"),
    Car("g63", "Mercedes-AMG", "G63", "suv", 180_000, "luxury"),
    Car("maybach", "Mercedes-Maybach", "S680", "sedan", 230_000, "luxury"),
    Car("urus", "Lamborghini", "Urus", "suv", 240_000, "luxury"),
    Car("purosangue", "Ferrari", "Purosangue", "suv", 400_000, "luxury"),
    # mid tier (price-ladder comparisons only)
    Car("corvette", "Chevrolet", "Corvette Z06", "coupe", 110_000, "mid"),
    Car("gtr", "Nissan", "GT-R", "coupe", 120_000, "mid"),
    Car("m8", "BMW", "M8 Competition", "coupe", 140_000, "mid"),
]

CARS_BY_KEY = {c.key: c for c in CARS}


def article(phrase: str) -> str:
    """'a' or 'an' for the spoken start of ``phrase`` (handles initialisms like SF90, S680)."""
    w = phrase.split()[0].lstrip("$")
    if w.upper() == "ONE":
        return "a"
    if w[0].lower() in "aeiou":
        return "an"
    if w[0] in "FHLMNRSX" and len(w) > 1 and (w[1].isdigit() or w[1].isupper()):
        return "an"
    return "a"

COLORS = [
    "glossy Rosso Corsa red", "matte black", "pearl white", "Verde Mantis lime green",
    "Arancio orange", "midnight blue", "satin silver", "exposed carbon fiber",
    "Giallo yellow", "two-tone black and blue",
]


@dataclass(frozen=True)
class Scenario:
    key: str
    wall: str            # what the car hits
    location: str
    impact: str          # frontal | offset | side


SCENARIOS: list[Scenario] = [
    Scenario("test_wall", "a massive reinforced concrete crash wall", "a professional crash test facility", "frontal"),
    Scenario("offset_block", "a rigid concrete crash block", "a professional crash test facility", "offset"),
    Scenario("runway_wall", "a thick concrete wall at the end of the runway", "an empty desert airstrip", "frontal"),
    Scenario("hangar_wall", "a reinforced concrete wall", "a huge abandoned aircraft hangar", "frontal"),
    Scenario("steel_barrier", "a steel-reinforced concrete barrier", "a closed race-track straight", "frontal"),
    Scenario("side_pole", "a steel pole set in a concrete wall", "a professional crash test facility", "side"),
]
SCENARIOS_BY_KEY = {s.key: s for s in SCENARIOS}

LIGHTING = [
    "overcast daylight, soft shadows",
    "golden hour, warm low sun, long shadows",
    "night, harsh stadium floodlights, wet reflective asphalt",
    "bright midday sun, heat haze",
    "light rain, wet asphalt, moody grey sky",
]

SPEEDS_KMH = [50, 100, 150, 200, 250, 300]

CAMERA = {
    "reveal": "slow 360-degree orbit around the parked car, low angle, 35mm anamorphic lens",
    "runup": "low tracking shot at wheel level running alongside the car, strong motion blur",
    "impact_wide": "static wide side-profile shot, 1000 fps high-speed camera, extreme slow motion",
    "impact_close": "close-up on the front end at the moment of impact, 1000 fps slow motion, debris and carbon fiber fragments flying",
    "drone": "top-down drone shot directly above the wall at the moment of impact",
    "aftermath": "slow handheld walk-around of the wrecked car, dust and steam settling",
    "cabin": "interior camera showing an empty cabin, airbags deploying in slow motion",
}

NEGATIVE = ("no people, no driver, no injuries, no blood, no readable license plates, no on-screen text, "
            "no watermarks, no warped logos, no extra wheels, no cartoon look")

BASE_STYLE = "ultra-realistic, photorealistic, cinematic, 4K, shallow depth of field, physically accurate crash deformation"


@dataclass(frozen=True)
class Format:
    key: str
    kind: str            # long | short
    n_cars: int
    playlist: str
    titles: tuple[str, ...]   # {car}, {car_a}, {car_b}, {price}, {speed}, {brand_a}... placeholders
    hook_question: str


FORMATS: list[Format] = [
    # ---- long-form (8-10 min) ----
    Format("speed_ladder", "long", 1, "Speed Ladder Crash Tests", (
        "{car} vs Concrete Wall at 50, 100, 200 & 300 km/h",
        "How Fast Can a {price} {car} Hit a Wall? (Speed Test)",
        "Crashing a {car} Into a Wall at Every Speed",
    ), "At which speed do you think the {model} stops being repairable?"),
    Format("showdown", "long", 2, "Supercar Showdowns", (
        "{car_a} vs {car_b}: Which Survives a {speed} km/h Wall Crash?",
        "{car_a} vs {car_b} Crash Test - The Result Is Shocking",
        "{brand_a} vs {brand_b}: Who Builds the Stronger Hypercar?",
    ), "Which one did you think would survive: {model_a} or {model_b}?"),
    Format("price_ladder", "long", 4, "Price vs Safety", (
        "{low_price} vs {high_price} Cars Crash Into a Wall - Does Price Mean Safety?",
        "Cheap vs Expensive Supercars: Wall Crash at {speed} km/h",
        "I Crashed a {low_price} Car and a {high_price} Hypercar Into the Same Wall",
    ), "Is a more expensive car really safer? Tell me in the comments."),
    Format("brand_battle", "long", 3, "Brand Battles", (
        "{brand_a} vs {brand_b} vs {brand_c}: Ultimate Wall Crash Test",
        "Which Supercar Brand Is the Toughest? {speed} km/h Crash Test",
    ), "Which brand should fight next? Comment your pick."),
    Format("suv_tank", "long", 3, "Luxury SUV Crash Tests", (
        "{car_a} vs {car_b} vs {car_c}: Which Luxury SUV Is a Tank?",
        "Luxury SUVs vs Concrete Wall at {speed} km/h",
    ), "Which SUV would you trust with your family?"),
    Format("top_list", "long", 5, "Most Expensive Crashes", (
        "Top 5 Most Expensive Cars vs Concrete Wall (Simulation)",
        "{total_price} of Hypercars vs One Concrete Wall",
    ), "Which crash hurt the most to watch?"),
    # ---- shorts (25-40 s) ----
    Format("one_hit", "short", 1, "Shorts", (
        "{price} {car} vs Concrete Wall",
        "{car} Hits a Wall at {speed} km/h",
        "This {price} {model} Didn't Stand a Chance",
    ), "Would you fix it or scrap it?"),
    Format("slowmo", "short", 1, "Shorts", (
        "{car} Wall Crash in 1000 FPS Slow Motion",
        "Watch {a_model} Fold Like Paper in Slow Motion",
    ), "Which car should hit the wall next?"),
    Format("survive", "short", 1, "Shorts", (
        "Will the {car} Survive This Wall?",
        "Can a {price} {model} Survive {speed} km/h?",
    ), "Did it survive? Your verdict below."),
    Format("before_after", "short", 1, "Shorts", (
        "{car}: Before vs After a {speed} km/h Crash",
        "{price} {model}: Before... and After",
    ), "How much do you think this repair costs?"),
    Format("versus_short", "short", 2, "Shorts", (
        "{model_a} vs {model_b} - Same Wall, Same Speed",
        "{brand_a} or {brand_b}? Wall Crash Test",
    ), "Which one won? Comment A or B."),
]
FORMATS_BY_KEY = {f.key: f for f in FORMATS}

# Phrases a title or description must never contain: the videos are AI simulations, and claiming
# otherwise is deceptive (and against YouTube's misleading-metadata policy).
BANNED_PHRASES = [
    "real footage", "real crash", "actual footage", "caught on camera", "dashcam", "dash cam",
    "breaking news", "true story", "not cgi", "not ai", "100% real", "killed", "dies", "died", "fatal",
]

BASE_TAGS = [
    "supercar crash", "hypercar crash", "car crash test", "crash test", "wall crash",
    "car vs wall", "luxury car crash", "slow motion crash", "crash simulation", "ai car crash",
    "supercars", "hypercars", "car crash compilation",
]
