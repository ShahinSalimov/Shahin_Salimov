"""Original 1920x1080 graphics for the Ötzi the Iceman documentary."""
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
# G1: where Ötzi was found
make_map(f"{G}/img/G1.png", 6, 16, 42, 49,
         sites=[(10.84, 46.78, "Ötzi found (3,210 m)", True, 30, -60), (11.35, 46.50, "Bolzano (museum)", False, 24, 6),
                (11.39, 47.27, "Innsbruck", False, -170, -46), (11.0, 43.0, "Southern Tuscany (axe copper?)", False, 24, -10)],
         labels=[(14.3, 47.6, "AUSTRIA", 34, LC), (9.6, 45.2, "ITALY", 34, LC), (7.8, 46.9, "SWITZERLAND", 26, LC),
                 (8.6, 46.3, "ALPS", 30, LC), (9.0, 43.5, "Ligurian Sea", 26, SC)],
         ttl="THE ICEMAN'S WORLD", sub="Ötztal Alps, on today's Austria-Italy border")
# G2: timeline
im = bg(); d = ImageDraw.Draw(im)
title(d, "HOW OLD IS ÖTZI?", "Approximate dates")
x0, x1, y = 180, W - 180, 600
def X(yr): return x0 + (yr + 3500) / (3500 + 2000) * (x1 - x0)  # yr: negative = BCE
d.line((x0, y, x1, y), fill=(120, 100, 80), width=4)
for yr in range(-3500, 2001, 500):
    d.line((X(yr), y - 8, X(yr), y + 8), fill=(120, 100, 80), width=2)
    f = F(SANS_L, 24); t = (f"{-yr} BCE" if yr < 0 else ("0" if yr == 0 else f"{yr} CE"))
    d.text((X(yr) - d.textlength(t, font=f) / 2, y + 16), t, font=f, fill=GREY)
ev = [(-3300, "Ötzi dies", "c. 3300 BCE", ORANGE, -1, 0), (-2560, "Great Pyramid", "c. 2560 BCE", GOLD, 1, 0),
      (-2500, "Stonehenge stones", "c. 2500 BCE", GOLD, -1, 1), (-1340, "Tutankhamun born", "c. 1340 BCE", GOLD, 1, 1),
      (0, "Roman Empire", "", GREY, -1, 0), (1991, "Ötzi found", "1991", ORANGE, 1, 0)]
for yr, a, b, c, side, lvl in ev:
    x = X(yr); r = 14
    d.ellipse((x - r, y - r, x + r, y + r), fill=c)
    ty = y - 200 - lvl * 130 if side < 0 else y + 80 + lvl * 130
    d.line((x, y + (-r if side < 0 else r), x, ty + (95 if side < 0 else -10)), fill=c, width=2)
    f = F(SANS_B, 32); tw = d.textlength(a, font=f); f2 = F(SANS_L, 26); tw2 = d.textlength(b, font=f2)
    tx = min(max(x - tw / 2, 60), W - 60 - tw); tx2 = min(max(x - tw2 / 2, 60), W - 60 - tw2)
    d.text((tx, ty + 10), a, font=f, fill=c); d.text((tx2, ty + 52), b, font=f2, fill=(190, 182, 170))
im.save(f"{G}/img/G2.png")
# G3: the last 33 hours (schematic altitude profile)
im = bg(); d = ImageDraw.Draw(im, "RGBA")
title(d, "THE LAST 33 HOURS", "Route reconstructed from pollen in his gut (schematic, after Oeggl et al. 2007)")
X0, X1, Y0, Y1 = 220, W - 160, 280, 900
def P(h, alt): return (X0 + h / 33 * (X1 - X0), Y1 - (alt - 500) / (3300 - 500) * (Y1 - Y0))
for alt in (1000, 2000, 3000):
    a = P(0, alt); b = P(33, alt); d.line((a, b), fill=(90, 80, 70, 255), width=1)
    d.text((80, a[1] - 16), f"{alt} m", font=F(SANS_L, 26), fill=GREY)
pts = [(0, 2500), (6, 2300), (12, 1300), (17, 800), (21, 900), (25, 1800), (29, 2700), (33, 3210)]
import numpy as np
hs = np.linspace(0, 33, 200); al = np.interp(hs, [p[0] for p in pts], [p[1] for p in pts])
line = [P(h, a) for h, a in zip(hs, al)]
d.line(line, fill=GOLD + (255,), width=6, joint="curve")
for (h, a, t, dx, dy) in [(0, 2500, "High mountains", -40, -60), (17, 800, "Down in the valley (Vinschgau?)", -150, 24),
                          (33, 3210, "Death, 3,210 m", -280, -64)]:
    x, y = P(h, a); d.ellipse((x - 12, y - 12, x + 12, y + 12), fill=ORANGE + (255,))
    d.text((x + dx, y + dy), t, font=F(SANS_B, 32), fill=CREAM)
for h in (0, 12, 24, 33):
    x, _ = P(h, 500); t = f"-{33 - h} h" if h < 33 else "death"; f = F(SANS_L, 26)
    d.text((x - d.textlength(t, font=f) / 2, Y1 + 20), t, font=f, fill=GREY)
im.save(f"{G}/img/G3.png")
print("ok")
