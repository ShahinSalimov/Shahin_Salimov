"""Original explanatory graphics for Video #1 (schematic, not to exact scale)."""
import sys, os, math
sys.path.insert(0, "/home/user/Shahin_Salimov/ashen-atlas")
import make_images as M  # reuses palette, fonts, helpers (also regenerates brand images)
from PIL import Image, ImageDraw

OUT = "/home/user/Shahin_Salimov/ashen-atlas/video-01-mohenjo-daro/graphics"
os.makedirs(OUT, exist_ok=True)
F, SANS, SANS_B, SERIF_B = M.F, M.SANS, M.SANS_B, M.SERIF_B
PARCH, GOLD, EMBER, CHAR = M.PARCH, M.GOLD, M.EMBER, M.CHAR
INK = (40, 32, 24)
W, H = 1920, 1080

def paper():
    im = M.vgrad(W, H, (238, 226, 204), (214, 196, 165))
    return im, ImageDraw.Draw(im)

def title(d, t, sub=None):
    d.text((80, 60), t, font=F(SERIF_B, 64), fill=INK)
    if sub: d.text((84, 145), sub, font=F(SANS, 30), fill=(110, 90, 60))
    d.text((W - 360, H - 60), "ASHEN ATLAS • schematic", font=F(SANS, 24), fill=(120, 100, 70))

# 1. MAP -------------------------------------------------------------
def map_graphic():
    im, d = paper(); title(d, "The Indus Civilization, c. 2500 BCE", "Major cities (schematic map, positions approximate)")
    # sea
    d.polygon([(0, 1080), (0, 820), (300, 860), (620, 900), (760, 840), (900, 880), (1050, 960), (1150, 1080)], fill=(150, 175, 180))
    d.text((180, 960), "ARABIAN SEA", font=F(SANS_B, 34), fill=(70, 95, 105))
    # Indus river
    pts = [(1180, 230), (1120, 330), (1040, 420), (990, 520), (930, 620), (860, 720), (800, 810), (760, 845)]
    d.line(pts, fill=(70, 110, 150), width=12, joint="curve")
    d.line([(1120, 330), (1300, 300), (1420, 260)], fill=(70, 110, 150), width=7)  # Punjab tributaries
    d.line([(1080, 380), (1260, 400), (1400, 380)], fill=(70, 110, 150), width=6)
    d.text((1150, 520), "Indus River", font=F(SANS, 30), fill=(50, 90, 130))
    d.line([(1450, 330), (1380, 520), (1260, 640)], fill=(140, 150, 160), width=6)
    d.text((1395, 540), "Ghaggar-Hakra\n(dry today)", font=F(SANS, 24), fill=(100, 110, 120))
    cities = [("MOHENJO-DARO", (930, 620), True), ("Harappa", (1210, 330), False), ("Rakhigarhi", (1520, 360), False),
              ("Ganweriwala", (1250, 500), False), ("Dholavira", (1060, 820), False), ("Lothal", (1290, 900), False)]
    for n, (x, y), main in cities:
        r = 22 if main else 13
        d.ellipse([x - r, y - r, x + r, y + r], fill=EMBER if main else INK, outline=(255, 255, 255), width=4)
        d.text((x + r + 12, y - 20), n, font=F(SANS_B, 38 if main else 30), fill=(150, 60, 20) if main else INK)
    d.line([(560, 760), (120, 330)], fill=GOLD, width=6)
    d.polygon([(120, 330), (150, 390), (180, 350)], fill=GOLD)
    d.text((110, 260), "To Mesopotamia (\"Meluhha\" trade)\nby sea via the Persian Gulf", font=F(SANS_B, 28), fill=(140, 100, 40))
    M.compass(d, W - 140, 200, 70, bg=(230, 215, 190))
    im.save(f"{OUT}/G1_map_indus_civilization.png")

# 2. TIMELINE ---------------------------------------------------------
def timeline():
    im, d = paper(); title(d, "Mohenjo-daro: a 4,500-year timeline", "Dates are approximate (BCE / CE)")
    y = 560; x0, x1 = 120, 1800
    d.line([(x0, y), (x1, y)], fill=INK, width=8)
    ev = [(0.00, "c. 2600 BCE", "Mature Harappan\nphase begins"), (0.12, "c. 2500 BCE", "Mohenjo-daro\nis built"),
          (0.24, "c. 2300 BCE", "Mesopotamian texts\nmention 'Meluhha'"), (0.38, "c. 2200 BCE", "Monsoon begins\nto weaken"),
          (0.52, "c. 1900 BCE", "Urban decline\nsets in"), (0.62, "c. 1700 BCE", "City largely\nabandoned"),
          (0.76, "1922 CE", "Excavations\nbegin"), (0.88, "1964 CE", "Dales: the\n'massacre' myth"), (1.00, "1980 CE", "UNESCO World\nHeritage Site")]
    for i, (t, date, label) in enumerate(ev):
        x = x0 + t * (x1 - x0)
        up = i % 2 == 0
        col = EMBER if i in (1, 5) else INK
        d.ellipse([x - 16, y - 16, x + 16, y + 16], fill=col)
        yy = y - 230 if up else y + 50
        d.line([(x, y), (x, yy + (170 if up else 0))], fill=col, width=3)
        d.text((x - 80, yy), date, font=F(SANS_B, 32), fill=col)
        d.multiline_text((x - 80, yy + 45), label, font=F(SANS, 26), fill=INK, spacing=4)
    d.text((x0 + 0.63 * (x1 - x0), y + 260), "≈ 3,600 years buried", font=F(SANS, 24), fill=(120, 100, 70))
    im.save(f"{OUT}/G2_timeline.png")

# 3. CITY PLAN -------------------------------------------------------
def city_plan():
    im, d = paper(); title(d, "How the city was laid out", "Citadel mound (west) and Lower Town (east) — schematic")
    # citadel
    d.rounded_rectangle([140, 260, 640, 940], 30, fill=(205, 170, 120), outline=INK, width=5)
    d.text((200, 280), "CITADEL", font=F(SANS_B, 44), fill=INK)
    d.text((200, 335), "raised brick platform", font=F(SANS, 26), fill=INK)
    for (x, y, w_, h_, n) in [(220, 420, 200, 120, "Great Bath"), (440, 420, 160, 160, "'Great Hall'\n(granary?)"),
                              (220, 600, 160, 120, "Assembly hall?"), (400, 700, 220, 110, "Later Buddhist\nstupa (CE era,\nmuch later)")]:
        d.rectangle([x, y, x + w_, y + h_], fill=(235, 215, 180), outline=INK, width=3)
        d.multiline_text((x + 10, y + 10), n, font=F(SANS, 22), fill=INK)
    # gap
    d.text((660, 600), "open\nground", font=F(SANS, 24), fill=(110, 90, 60))
    # lower town grid
    gx0, gy0, gx1, gy1 = 800, 230, 1800, 990
    d.rectangle([gx0, gy0, gx1, gy1], fill=(220, 195, 150), outline=INK, width=5)
    for i in range(1, 8):
        x = gx0 + i * (gx1 - gx0) / 8
        d.line([(x, gy0), (x, gy1)], fill=(245, 235, 215), width=6)
    for j in range(1, 6):
        yy = gy0 + j * (gy1 - gy0) / 6
        d.line([(gx0, yy), (gx1, yy)], fill=(245, 235, 215), width=6)
    d.line([(gx0 + (gx1 - gx0) * 0.5, gy0), (gx0 + (gx1 - gx0) * 0.5, gy1)], fill=(255, 250, 240), width=18)
    d.line([(gx0, gy0 + (gy1 - gy0) * 0.5), (gx1, gy0 + (gy1 - gy0) * 0.5)], fill=(255, 250, 240), width=14)
    d.text((gx0 + 20, gy0 + 10), "LOWER TOWN — homes, workshops, wells", font=F(SANS_B, 34), fill=INK)
    d.text((gx0 + (gx1 - gx0) * 0.5 + 20, gy1 - 60), "main north–south street", font=F(SANS, 24), fill=INK)
    for k in range(18):
        x = gx0 + 60 + (k * 137) % (gx1 - gx0 - 120); yy = gy0 + 90 + (k * 211) % (gy1 - gy0 - 140)
        d.ellipse([x - 9, yy - 9, x + 9, yy + 9], fill=(70, 110, 150))
    d.ellipse([gx0 + 20, gy1 + 30, gx0 + 38, gy1 + 48], fill=(70, 110, 150))
    d.text((gx0 + 50, gy1 + 24), "= well (around 700 estimated citywide)", font=F(SANS, 24), fill=INK)
    M.compass(d, 1830, 110, 50, bg=(230, 215, 190))
    im.save(f"{OUT}/G3_city_plan.png")

# 4. GREAT BATH -----------------------------------------------------
def great_bath():
    im, d = paper(); title(d, "The Great Bath", "Approx. 12 m × 7 m, about 2.4 m deep — cross-section (schematic)")
    # cross-section
    gx, gy = 260, 420
    d.rectangle([gx - 60, gy, gx + 1460, gy + 40], fill=(190, 150, 100), outline=INK, width=3)
    d.polygon([(gx, gy + 40), (gx + 240, gy + 340), (gx + 1160, gy + 340), (gx + 1400, gy + 40)], fill=(120, 160, 170))
    # steps
    for s in range(6):
        d.rectangle([gx + s * 40, gy + 40 + s * 50, gx + 240, gy + 90 + s * 50], outline=INK, width=2)
        d.rectangle([gx + 1160, gy + 40 + s * 50, gx + 1400 - s * 40, gy + 90 + s * 50], outline=INK, width=2)
    d.line([(gx + 240, gy + 340), (gx + 1160, gy + 340)], fill=INK, width=6)
    d.line([(gx + 230, gy + 352), (gx + 1170, gy + 352)], fill=(30, 25, 20), width=10)
    d.text((gx + 420, gy + 370), "bitumen (natural tar) waterproofing layer", font=F(SANS_B, 30), fill=INK)
    d.text((gx + 20, gy - 60), "steps (north)", font=F(SANS, 28), fill=INK)
    d.text((gx + 1180, gy - 60), "steps (south)", font=F(SANS, 28), fill=INK)
    d.text((gx + 520, gy + 140), "≈ 2.4 m deep", font=F(SANS_B, 40), fill=(255, 255, 255))
    d.line([(gx, gy + 520), (gx + 1400, gy + 520)], fill=INK, width=4)
    d.text((gx + 600, gy + 535), "≈ 12 m long", font=F(SANS_B, 34), fill=INK)
    d.text((gx, gy + 590), "Tightly fitted baked bricks set in gypsum mortar • a drain to empty the pool • a well nearby to fill it",
           font=F(SANS, 28), fill=INK)
    im.save(f"{OUT}/G4_great_bath_section.png")

# 5. WEIGHTS --------------------------------------------------------
def weights():
    im, d = paper(); title(d, "One standard, one civilization", "Indus cube weights: doubling steps, then decimal multiples (approx.)")
    vals = [1, 2, 4, 8, 16, 32, 64]
    x = 140
    for v in vals:
        s = 40 + int(math.log2(v) * 34)
        d.rectangle([x, 760 - s, x + s, 760], fill=(170, 150, 120), outline=INK, width=4)
        d.text((x, 780), f"×{v}", font=F(SANS_B, 34), fill=INK)
        x += s + 70
    d.text((140, 880), "Basic unit ≈ 14 g • same system from Pakistan to Gujarat • polished chert cubes",
           font=F(SANS, 30), fill=INK)
    im.save(f"{OUT}/G5_weights.png")

# 6. THEORIES BOARD -------------------------------------------------
def theories():
    im = M.vgrad(W, H, (20, 18, 22), (50, 28, 18)); d = ImageDraw.Draw(im)
    d.text((80, 60), "Why did Mohenjo-daro empty out?", font=F(SERIF_B, 64), fill=PARCH)
    rows = [("Invasion / massacre", "Largely rejected", (200, 70, 60)),
            ("Catastrophic floods", "Debated", (220, 160, 60)),
            ("Weakening monsoon & drought", "Strong evidence", (110, 190, 110)),
            ("Shifting / drying rivers", "Strong evidence (region)", (110, 190, 110)),
            ("Collapse of long-distance trade", "Contributing factor", (220, 160, 60))]
    y = 220
    for n, v, c in rows:
        d.rounded_rectangle([80, y, 1840, y + 130], 18, fill=(35, 32, 34), outline=(80, 70, 60), width=2)
        d.text((120, y + 38), n, font=F(SANS_B, 46), fill=PARCH)
        d.rounded_rectangle([1260, y + 28, 1800, y + 102], 37, fill=c)
        d.text((1290, y + 42), v, font=F(SANS_B, 34), fill=(15, 15, 15))
        y += 160
    im.save(f"{OUT}/G6_theories_board.png")

# THUMBNAIL variants + SHORT cover ----------------------------------
def thumbs():
    M.OUT = OUT
    M.thumb("T1_thumbnail_A.jpg", (25, 22, 40), (150, 70, 30), ((900, 420), 230, (255, 140, 50)),
            ["40,000 PEOPLE", "VANISHED"], "The Lost City of Mohenjo-daro", 3)
    M.thumb("T2_thumbnail_B.jpg", (12, 14, 30), (60, 50, 80), ((950, 330), 200, (190, 160, 255)),
            ["NO KINGS.", "NO PALACES.", "NO WAR?"], "Mohenjo-daro, 2500 BCE", 5, accent=(190, 160, 255))
    M.thumb("T3_thumbnail_C.jpg", (40, 25, 10), (170, 110, 40), ((980, 360), 250, (255, 200, 90)),
            ["4,500 YEARS", "AHEAD?"], "The city with covered drains", 8, accent=(255, 200, 90))
    W2, H2 = 1080, 1920
    im = M.vgrad(W2, H2, (20, 18, 30), (120, 60, 25)); im = M.glow(im, (540, 1150), 420, (220, 110, 40))
    d = ImageDraw.Draw(im); M.ruins(d, W2, 1350, 1.5, (10, 9, 10), seed=33); M.embers(im, 220, 9, (0, 300, W2, 1350), (1, 4))
    d = ImageDraw.Draw(im)
    M.center_text(d, W2, 330, "4,500 YEARS AGO", F(SANS_B, 100), (250, 245, 235))
    M.center_text(d, W2, 470, "THIS CITY HAD", F(SANS_B, 100), (250, 245, 235))
    M.center_text(d, W2, 610, "DRAINS", F(SANS_B, 170), EMBER)
    M.center_text(d, W2, 1500, "FULL DOCUMENTARY ON THE CHANNEL", F(SANS_B, 40), GOLD)
    M.compass(d, 540, 1680, 70)
    im.save(f"{OUT}/T4_short_cover.jpg", quality=90)

for f in (map_graphic, timeline, city_plan, great_bath, weights, theories, thumbs): f()
print(sorted(os.listdir(OUT)))
