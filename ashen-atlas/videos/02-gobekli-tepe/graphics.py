"""Original 1920x1080 graphics for the Gobekli Tepe documentary."""
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

# G6: wide Near East
make_map(f"{G}/img/G6.png", 24, 56, 26, 44,
         sites=[(38.92, 37.22, "Göbekli Tepe", True, 30, -60)],
         labels=[(33, 39.3, "TÜRKİYE", 38, (190, 175, 155, 255)), (38.6, 34.6, "SYRIA", 32, (190, 175, 155, 255)),
                 (43.8, 33.2, "IRAQ", 32, (190, 175, 155, 255)), (53, 33, "IRAN", 32, (190, 175, 155, 255)),
                 (30, 33.2, "Mediterranean Sea", 30, (130, 150, 165, 255)), (35.5, 42.6, "Black Sea", 30, (130, 150, 165, 255)),
                 (51.0, 41.4, "Caspian Sea", 28, (130, 150, 165, 255))],
         ttl="SOUTHEASTERN ANATOLIA", sub="Göbekli Tepe and the 'Stone Hills' region", box=(37.6, 40.4, 36.6, 38.0))
# G2: regional close-up
make_map(f"{G}/img/G2.png", 37.4, 40.6, 36.45, 38.25,
         sites=[(38.922, 37.223, "Göbekli Tepe", True, 30, -64), (38.796, 37.159, "Şanlıurfa", False, -190, 14),
                (38.60, 37.53, "Nevalı Çori (flooded)", False, -380, -50), (39.30, 37.10, "Karahan Tepe", False, 24, 6),
                (39.83, 37.76, "Karacadağ", False, 22, -16)],
         labels=[(39.2, 36.62, "SYRIA", 30, (190, 175, 155, 255))],
         ttl="THE STONE HILLS", sub="Sites mentioned in this documentary")

# G3: timeline
im = bg(); d = ImageDraw.Draw(im)
title(d, "HOW OLD IS GÖBEKLİ TEPE?", "Years BCE (approximate)")
x0, x1, y = 160, W - 160, 600
def X(yr): return x0 + (9600 - yr) / (9600 + 2026) * (x1 - x0)
d.line((x0, y, x1, y), fill=(120, 100, 80), width=4)
for yr in range(9000, -1, -1000):
    d.line((X(yr), y - 8, X(yr), y + 8), fill=(120, 100, 80), width=2)
ev = [(9500, "Göbekli Tepe", "first enclosures", ORANGE, -1, 0), (8000, "Site abandoned", "c. 8000 BCE", GOLD, 1, 0),
      (3200, "First writing", "Mesopotamia", CREAM, -1, 0), (3000, "Stonehenge", "first phase", CREAM, 1, 0),
      (2560, "Great Pyramid", "Giza", CREAM, -1, 1), (2500, "Mohenjo-daro", "at its peak", CREAM, 1, 1), (-2026, "Today", "", GREY, -1, 0)]
for yr, a, b, c, side, lvl in ev:
    x = X(yr); r = 16 if c == ORANGE else 11
    d.ellipse((x - r, y - r, x + r, y + r), fill=c)
    ty = y - 190 - lvl * 120 if side < 0 else y + 60 + lvl * 120
    d.line((x, y + (-r if side < 0 else r), x, ty + (95 if side < 0 else -10)), fill=c, width=2)
    f = F(SANS_B, 36 if c == ORANGE else 30); tw = d.textlength(a, font=f)
    tx = min(max(x - tw / 2, 60), W - 60 - tw)
    d.text((tx, ty + 10), a, font=f, fill=c)
    if b:
        f2 = F(SANS_L, 26); tw2 = d.textlength(b, font=f2); d.text((min(max(x - tw2 / 2, 60), W - 60 - tw2), ty + 54), b, font=f2, fill=(190, 182, 170))
d.text((X(9500) - 10, H - 150), "~6,000 years before Stonehenge  •  ~7,000 years before the Great Pyramid", font=F(SANS, 32), fill=GOLD)
im.save(f"{G}/img/G3.png")

# G4: schematic plan of an enclosure
im = bg(); d = ImageDraw.Draw(im, "RGBA")
title(d, "ENCLOSURE D  •  SCHEMATIC", "Simplified drawing, not to exact scale")
cx, cy, rx, ry = 960, 580, 380, 310
d.ellipse((cx - rx - 40, cy - ry - 40, cx + rx + 40, cy + ry + 40), fill=(70, 58, 46, 255), outline=(140, 118, 90, 255), width=3)
d.ellipse((cx - rx + 10, cy - ry + 10, cx + rx - 10, cy + ry - 10), fill=(36, 30, 25, 255))
n = 12
for i in range(n):
    a = 2 * math.pi * i / n + 0.2; px = cx + (rx - 30) * math.cos(a); py = cy + (ry - 30) * math.sin(a)
    ang = math.degrees(a)
    L, Wd = 50, 18
    pts = [(-L, -Wd), (L, -Wd), (L, Wd), (-L, Wd)]
    ca, sa = math.cos(a), math.sin(a)
    d.polygon([(px + u * ca - v * sa, py + u * sa + v * ca) for u, v in pts], fill=GOLD + (255,))
for dx, lab in ((-70, "18"), (70, "31")):
    d.rectangle((cx + dx - 22, cy - 70, cx + dx + 22, cy + 70), fill=ORANGE + (255,))
    f = F(SANS_B, 30); tw = d.textlength(lab, font=f); d.text((cx + dx - tw / 2, cy + 90), lab, font=f, fill=CREAM)
d.text((cx + rx + 80, cy - 120), "Stone wall", font=F(SANS, 32), fill=(200, 185, 160))
d.text((cx + rx + 80, cy - 40), "Smaller pillars", font=F(SANS, 32), fill=GOLD); d.text((cx + rx + 80, cy), "facing inwards", font=F(SANS_L, 28), fill=(190, 182, 170))
d.text((cx + rx + 80, cy + 80), "Two central pillars", font=F(SANS, 32), fill=ORANGE); d.text((cx + rx + 80, cy + 120), "c. 5.5 m tall", font=F(SANS_L, 28), fill=(190, 182, 170))
d.text((cx - 60, cy + ry + 95), "c. 20 m", font=F(SANS_B, 36), fill=CREAM)
d.line((cx - rx - 40, cy + ry + 80, cx + rx + 40, cy + ry + 80), fill=CREAM, width=2)
im.save(f"{G}/img/G4.png")

# G5: the old model vs Gobekli Tepe
im = bg(); d = ImageDraw.Draw(im, "RGBA")
title(d, "WHICH CAME FIRST?")
def row(y, items, col, lab, labcol):
    d.text((110, y - 90), lab, font=F(SANS_B, 34), fill=labcol)
    bw, gap = 330, 80; x = 110
    for i, t in enumerate(items):
        d.rounded_rectangle((x, y, x + bw, y + 140), 14, outline=col + (255,), width=3, fill=(0, 0, 0, 90))
        f = F(SANS_B, 34); tw = d.textlength(t, font=f); d.text((x + (bw - tw) / 2, y + 48), t, font=f, fill=CREAM)
        if i < len(items) - 1:
            ax = x + bw + 12; d.polygon([(ax, y + 55), (ax + 50, y + 70), (ax, y + 85)], fill=col + (255,)); d.line((ax - 6, y + 70, ax + 20, y + 70), fill=col, width=6)
        x += bw + gap
row(330, ["Farming", "Surplus food", "Villages & rulers", "Monuments"], GREY, "THE TEXTBOOK ORDER", (190, 182, 170))
row(720, ["Hunter-gatherers", "Monuments", "Farming?"], ORANGE, "GÖBEKLİ TEPE SUGGESTS", ORANGE)
im.save(f"{G}/img/G5.png")
print("ok")
