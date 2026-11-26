"""Original 1920x1080 graphics for the Bronze Age Collapse documentary."""
import sys, math, warnings
warnings.filterwarnings("ignore")
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import geopandas as gp

G = sys.argv[1]
W, H = 1920, 1080
SERIF_B = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SANS = "/usr/share/fonts/opentype/inter/Inter-Medium.otf"
SANS_B = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
SANS_L = "/usr/share/fonts/opentype/inter/Inter-Light.otf"
GOLD = (212, 169, 98); ORANGE = (230, 120, 50); CREAM = (245, 236, 220); GREY = (150, 150, 150)
SEA = (22, 30, 38); LAND = (58, 48, 38); BORDER = (110, 92, 70)
def F(p, s): return ImageFont.truetype(p, s)

def bg():
    im = Image.new("RGB", (W, H)); a = np.zeros((H, W, 3), np.float32)
    g = np.linspace(0, 1, H)[:, None, None]
    a[:] = np.array([30, 24, 19]) * (1 - g) + np.array([12, 10, 9]) * g
    return Image.fromarray(a.astype(np.uint8))

def title(d, t, sub=None):
    d.text((110, 70), t, font=F(SANS_B, 52), fill=GOLD)
    if sub: d.text((112, 140), sub, font=F(SANS_L, 30), fill=(200, 192, 180))

world = gp.read_file(gp.datasets.get_path("naturalearth_lowres"))

def make_map(fn, lon0, lon1, lat0, lat1, sites, labels, ttl, sub, box=None):
    im = bg(); d = ImageDraw.Draw(im, "RGBA")
    X0, Y0, X1, Y1 = 110, 210, W - 110, H - 90
    k = math.cos(math.radians((lat0 + lat1) / 2))
    sx = (X1 - X0) / ((lon1 - lon0) * k); sy = (Y1 - Y0) / (lat1 - lat0); s = min(sx, sy)
    ox = X0 + ((X1 - X0) - (lon1 - lon0) * k * s) / 2; oy = Y0 + ((Y1 - Y0) - (lat1 - lat0) * s) / 2
    def P(lon, lat): return (ox + (lon - lon0) * k * s, oy + (lat1 - lat) * s)
    d.rectangle((ox, oy, ox + (lon1 - lon0) * k * s, oy + (lat1 - lat0) * s), fill=SEA)
    for geom in world.geometry:
        polys = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
        for pg in polys:
            pts = [P(x, y) for x, y in pg.exterior.coords]
            d.polygon(pts, fill=LAND, outline=BORDER)
    # clip outside frame
    fx0, fy0, fx1, fy1 = ox, oy, ox + (lon1 - lon0) * k * s, oy + (lat1 - lat0) * s
    arr = np.array(im); base = np.array(bg())
    m = np.zeros((H, W), bool); m[int(fy0):int(fy1), int(fx0):int(fx1)] = True
    arr[~m] = base[~m]; im = Image.fromarray(arr); d = ImageDraw.Draw(im, "RGBA")
    d.rectangle((fx0, fy0, fx1, fy1), outline=(120, 100, 80), width=2)
    if box:
        a = P(box[0], box[3]); b = P(box[1], box[2])
        d.rectangle((*a, *b), outline=ORANGE + (255,), width=4)
    for (lon, lat, txt, size, col) in labels:
        x, y = P(lon, lat); f = F(SANS_L, size); tw = d.textlength(txt, font=f)
        d.text((x - tw / 2, y), txt, font=f, fill=col)
    for (lon, lat, name, main, dx, dy) in sites:
        x, y = P(lon, lat); r = 13 if main else 9
        if main:
            for rr, al in ((40, 40), (26, 80)): d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=ORANGE + (al,))
        d.ellipse((x - r, y - r, x + r, y + r), fill=(ORANGE if main else GOLD) + (255,), outline=(20, 15, 10, 255), width=3)
        f = F(SANS_B if main else SANS, 40 if main else 32)
        d.text((x + dx, y + dy), name, font=f, fill=CREAM + (255,), stroke_width=4, stroke_fill=(15, 12, 10, 255))
    d2 = ImageDraw.Draw(im); title(d2, ttl, sub)
    d2.text((W - 470, H - 70), "Locations approximate", font=F(SANS_L, 26), fill=(170, 160, 150))
    im.save(fn)


LC=(190, 175, 155, 255); SC=(130, 150, 165, 255)
# G1: the great powers c. 1300 BCE
make_map(f"{G}/img/G1.png", 18, 50, 24, 43,
         sites=[(22.75, 37.73, "Mycenae", True, -230, -30), (21.70, 37.03, "Pylos", False, -140, 10),
                (34.61, 40.02, "Hattusa", True, 26, -56), (35.78, 35.60, "Ugarit", True, 30, -12),
                (33.3, 35.05, "Cyprus", False, -150, 12), (31.25, 30.05, "Egypt", True, 26, -10),
                (44.42, 32.54, "Babylon", False, 22, 6), (43.26, 36.36, "Assur", False, 22, -30), (25.4, 30.9, "Libya", False, -60, 18)],
         labels=[(24.5, 33.0, "Mediterranean Sea", 30, SC), (35.5, 42.3, "Black Sea", 28, SC), (39.5, 38.9, "HITTITES", 34, LC),
                 (31.5, 27.2, "NEW KINGDOM EGYPT", 32, LC), (46.5, 34.7, "ASSYRIA & BABYLON", 26, LC), (22.4, 39.6, "MYCENAEAN GREECE", 28, LC)],
         ttl="THE CLUB OF GREAT POWERS", sub="Eastern Mediterranean, c. 1300 BCE")
# G2: where the Uluburun cargo came from
im = bg(); d = ImageDraw.Draw(im, "RGBA")
title(d, "ONE SHIP, MANY WORLDS", "Origins of the Uluburun cargo (c. 1300 BCE, approximate)")
cx, cy = 960, 610
d.ellipse((cx - 120, cy - 120, cx + 120, cy + 120), fill=ORANGE + (60,), outline=ORANGE + (255,), width=4)
t = "ULUBURUN"; f = F(SANS_B, 38); d.text((cx - d.textlength(t, font=f) / 2, cy - 24), t, font=f, fill=CREAM)
items = [("Copper", "Cyprus"), ("Tin", "Central Asia / Anatolia?"), ("Glass ingots", "Egypt & Syria"), ("Ebony", "Africa"),
         ("Ivory", "Elephant & hippo"), ("Amber", "Baltic region"), ("Pottery", "Mycenaean & Cypriot"), ("Gold scarab", "Egypt (Nefertiti)")]
for i, (a, b) in enumerate(items):
    ang = -math.pi / 2 + 2 * math.pi * i / len(items); x = cx + 520 * math.cos(ang); y = cy + 330 * math.sin(ang)
    d.line((cx + 120 * math.cos(ang), cy + 120 * math.sin(ang), x, y), fill=GOLD + (160,), width=3)
    d.ellipse((x - 10, y - 10, x + 10, y + 10), fill=GOLD + (255,))
    fa = F(SANS_B, 34); fb = F(SANS_L, 26); wa = d.textlength(a, font=fa); wb = d.textlength(b, font=fb)
    tx = x + 22 if math.cos(ang) > 0.2 else (x - 22 - max(wa, wb) if math.cos(ang) < -0.2 else x - max(wa, wb) / 2)
    ty = y - 95 if math.sin(ang) < -0.5 else (y + 16 if math.sin(ang) > 0.5 else y - 34)
    d.text((tx, ty), a, font=fa, fill=CREAM); d.text((tx, ty + 40), b, font=fb, fill=(190, 182, 170))
im.save(f"{G}/img/G2.png")
# G3: timeline of destruction
im = bg(); d = ImageDraw.Draw(im)
title(d, "A WORLD FALLS", "Key events, years BCE (most dates approximate)")
x0, x1, y = 180, W - 180, 600
def X(yr): return x0 + (1260 - yr) / (1260 - 1140) * (x1 - x0)
d.line((x0, y, x1, y), fill=(120, 100, 80), width=4)
for yr in range(1260, 1139, -20):
    d.line((X(yr), y - 8, X(yr), y + 8), fill=(120, 100, 80), width=2)
    f = F(SANS_L, 24); t = str(yr)
    if yr != 1180: d.text((X(yr) - d.textlength(t, font=f) / 2, y + 16), t, font=f, fill=GREY)
ev = [(1259, "Egypt–Hittite treaty", "peace", CREAM, -1, 0), (1208, "Merneptah", "repels Libyans & sea peoples", GOLD, 1, 0),
      (1185, "Ugarit destroyed", "c. 1190–1185", ORANGE, -1, 1, "r"), (1180, "Hattusa abandoned", "Pylos burns", ORANGE, 1, 1),
      (1177, "Ramesses III", "battles the Sea Peoples", GOLD, -1, 0, "l"), (1150, "Palaces gone", "Greek Dark Age begins", GREY, 1, 0)]
for e in ev:
    yr, a, b, c, side, lvl = e[:6]; al = e[6] if len(e) > 6 else "c"
    x = X(yr); r = 14
    d.ellipse((x - r, y - r, x + r, y + r), fill=c)
    ty = y - 200 - lvl * 130 if side < 0 else y + 80 + lvl * 130
    d.line((x, y + (-r if side < 0 else r), x, ty + (95 if side < 0 else -10)), fill=c, width=2)
    f = F(SANS_B, 32); tw = d.textlength(a, font=f); f2 = F(SANS_L, 26); tw2 = d.textlength(b, font=f2)
    if al == "c": tx = min(max(x - tw / 2, 60), W - 60 - tw); tx2 = min(max(x - tw2 / 2, 60), W - 60 - tw2)
    elif al == "r": tx = x - tw + 8; tx2 = x - tw2 + 8
    else: tx = x - 8; tx2 = x - 8
    d.text((tx, ty + 10), a, font=f, fill=c); d.text((tx2, ty + 52), b, font=f2, fill=(190, 182, 170))
im.save(f"{G}/img/G3.png")
# G4: the dominoes
im = bg(); d = ImageDraw.Draw(im, "RGBA")
title(d, "A PERFECT STORM", "Several problems at once, each making the others worse")
names = ["Drought", "Famine", "Unrest &\nmigration", "Raids &\ninvasions", "Trade\nstops", "Collapse"]
bw, bh, gap = 240, 200, 64; x = (W - (len(names) * bw + (len(names) - 1) * gap)) / 2; yb = 480
for i, n in enumerate(names):
    col = ORANGE if i == len(names) - 1 else GOLD
    d.rounded_rectangle((x, yb, x + bw, yb + bh), 16, outline=col + (255,), width=4, fill=(0, 0, 0, 100))
    f = F(SANS_B, 34); d.multiline_text((x + bw / 2, yb + bh / 2), n, font=f, fill=CREAM, anchor="mm", align="center", spacing=6)
    if i < len(names) - 1:
        ax = x + bw + 10; d.polygon([(ax + 34, yb + bh / 2 - 16), (ax + 50, yb + bh / 2), (ax + 34, yb + bh / 2 + 16)], fill=col + (255,))
        d.line((ax, yb + bh / 2, ax + 38, yb + bh / 2), fill=col, width=6)
    x += bw + gap
f = F(SANS, 32); t = "+ earthquakes?   + rebellion?   + over-centralised palaces?"
d.text(((W - d.textlength(t, font=f)) / 2, 790), t, font=f, fill=(200, 190, 175))
im.save(f"{G}/img/G4.png")
# G5: who fell, who survived
im = bg(); d = ImageDraw.Draw(im, "RGBA")
title(d, "AFTER THE COLLAPSE", "c. 1150–1000 BCE")
cols = [("DESTROYED / GONE", ORANGE, ["Hittite Empire", "Ugarit", "Mycenaean palaces", "Linear B writing", "Long-distance tin trade"]),
        ("SURVIVED, WEAKENED", GOLD, ["Egypt (lost its Levant empire)", "Assyria", "Babylon", "Tyre, Sidon, Byblos"]),
        ("NEW", CREAM, ["Philistines", "Phoenician city-states", "Israel", "The alphabet spreads", "Iron in wider use"])]
for i, (h, c, items) in enumerate(cols):
    x = 110 + i * 590
    d.text((x, 250), h, font=F(SANS_B, 38), fill=c); d.line((x, 305, x + 520, 305), fill=c, width=3)
    for j, t in enumerate(items): d.text((x, 340 + j * 80), "•  " + t, font=F(SANS, 34), fill=(225, 215, 200))
im.save(f"{G}/img/G5.png")
print("ok")
