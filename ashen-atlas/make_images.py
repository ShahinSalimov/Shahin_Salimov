import math, random, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = "/home/user/Shahin_Salimov/ashen-atlas/images"
os.makedirs(OUT, exist_ok=True)
SERIF_B = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SERIF = "/usr/share/fonts/truetype/freefont/FreeSerif.ttf"
SANS_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

CHAR = (14, 15, 18); EMBER = (232, 119, 46); GOLD = (201, 164, 92)
PARCH = (233, 220, 195); ASH = (120, 118, 112)

def F(p, s): return ImageFont.truetype(p, s)

def vgrad(w, h, top, bot):
    im = Image.new("RGB", (w, h)); d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / max(h - 1, 1)
        d.line([(0, y), (w, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    return im

def glow(im, xy, r, color, strength=1.0):
    layer = Image.new("RGB", im.size, (0, 0, 0)); d = ImageDraw.Draw(layer)
    x, y = xy
    d.ellipse([x - r, y - r, x + r, y + r], fill=tuple(int(c * strength) for c in color))
    layer = layer.filter(ImageFilter.GaussianBlur(r * 0.6))
    from PIL import ImageChops
    return ImageChops.add(im, layer)

def embers(im, n, seed, area=None, size=(1, 4)):
    rnd = random.Random(seed); d = ImageDraw.Draw(im)
    w, h = im.size; x0, y0, x1, y1 = area or (0, 0, w, h)
    for _ in range(n):
        x = rnd.uniform(x0, x1); y = rnd.uniform(y0, y1); r = rnd.uniform(*size)
        c = rnd.choice([EMBER, (255, 170, 80), GOLD])
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)
    return im

def ruins(d, w, base, scale, color, seed=1):
    """procedural skyline: pyramid, columns, arch, broken wall"""
    rnd = random.Random(seed)
    # ground
    d.rectangle([0, base, w, base + 2000], fill=color)
    # pyramid
    px = w * 0.16; ph = 260 * scale
    d.polygon([(px - ph * 1.3, base), (px, base - ph), (px + ph * 1.3, base)], fill=color)
    # temple columns
    cx = w * 0.62; ch = 230 * scale; cw = 26 * scale; gap = 58 * scale
    for i in range(7):
        x = cx + i * gap
        hh = ch if i not in (2, 5) else ch * rnd.uniform(0.35, 0.7)
        d.rectangle([x, base - hh, x + cw, base], fill=color)
    d.rectangle([cx - 14 * scale, base - ch - 22 * scale, cx + 3 * gap + cw + 10 * scale, base - ch], fill=color)
    d.polygon([(cx - 14 * scale, base - ch - 22 * scale), (cx + 1.5 * gap + cw / 2, base - ch - 80 * scale),
               (cx + 3 * gap + cw + 10 * scale, base - ch - 22 * scale)], fill=color)
    # arch
    ax = w * 0.38; ah = 170 * scale; aw = 150 * scale
    d.rectangle([ax, base - ah, ax + aw, base], fill=color)
    # broken wall / dunes
    for i in range(40):
        x = rnd.uniform(0, w); hh = rnd.uniform(10, 60) * scale
        d.rectangle([x, base - hh, x + rnd.uniform(20, 90) * scale, base], fill=color)
    return ax, ah, aw

def center_text(d, w, y, txt, font, fill, shadow=True, spacing=0):
    bb = d.textbbox((0, 0), txt, font=font)
    tw = bb[2] - bb[0]
    x = (w - tw) / 2
    if shadow:
        d.text((x + 4, y + 4), txt, font=font, fill=(0, 0, 0))
    d.text((x, y), txt, font=font, fill=fill)
    return bb[3] - bb[1]

def compass(d, cx, cy, R, gold=GOLD, ember=EMBER, bg=CHAR):
    d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=gold, width=max(3, R // 40))
    r2 = R * 0.86
    d.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], outline=gold, width=max(1, R // 110))
    for k in range(72):
        a = k * math.pi * 2 / 72
        l = R * (0.08 if k % 6 == 0 else 0.04)
        d.line([(cx + math.cos(a) * r2, cy + math.sin(a) * r2),
                (cx + math.cos(a) * (r2 - l), cy + math.sin(a) * (r2 - l))], fill=gold, width=max(1, R // 160))
    for k in range(8):
        a = -math.pi / 2 + k * math.pi / 4
        L = R * (0.78 if k % 2 == 0 else 0.48); wdt = R * 0.11
        tip = (cx + math.cos(a) * L, cy + math.sin(a) * L)
        l1 = (cx + math.cos(a + math.pi / 2) * wdt, cy + math.sin(a + math.pi / 2) * wdt)
        l2 = (cx + math.cos(a - math.pi / 2) * wdt, cy + math.sin(a - math.pi / 2) * wdt)
        d.polygon([tip, l1, (cx, cy)], fill=ember if k == 0 else gold)
        d.polygon([tip, l2, (cx, cy)], fill=(150, 110, 50) if k else (180, 80, 25))
    d.ellipse([cx - R * 0.07, cy - R * 0.07, cx + R * 0.07, cy + R * 0.07], fill=bg, outline=ember, width=max(2, R // 70))

# ---------- 1. LOGO 800x800 ----------
def logo():
    W = 800
    im = vgrad(W, W, (30, 26, 24), CHAR)
    im = glow(im, (400, 400), 300, (90, 40, 15))
    d = ImageDraw.Draw(im)
    compass(d, 400, 365, 255)
    embers(im, 60, 3, (120, 560, 680, 760), (1, 3))
    d = ImageDraw.Draw(im)
    center_text(d, W, 650, "ASHEN ATLAS", F(SERIF_B, 64), PARCH)
    im.save(f"{OUT}/01c_logo_with_wordmark_800x800.png")
    im = vgrad(W, W, (30, 26, 24), CHAR); im = glow(im, (400, 400), 300, (90, 40, 15))
    d = ImageDraw.Draw(im); compass(d, 400, 400, 330)
    im.save(f"{OUT}/01_logo_800x800.png")
    # circle preview
    mask = Image.new("L", (W, W), 0); ImageDraw.Draw(mask).ellipse([0, 0, W, W], fill=255)
    prev = Image.new("RGB", (W, W), (245, 245, 245)); prev.paste(im, (0, 0), mask)
    prev.save(f"{OUT}/01b_logo_circle_preview.png")

# ---------- 2. BANNER 2560x1440 ----------
def banner():
    W, H = 2560, 1440
    im = vgrad(W, H, (22, 20, 24), (58, 30, 18))
    im = glow(im, (W // 2, 980), 520, (200, 90, 30), 0.9)
    d = ImageDraw.Draw(im)
    ruins(d, W, 1060, 1.6, (12, 11, 12), seed=7)
    embers(im, 500, 11, (0, 300, W, 1060), (1, 3.5))
    d = ImageDraw.Draw(im)
    # safe area 1546x423 centered
    sx0, sy0 = (W - 1546) // 2, (H - 423) // 2
    compass(d, sx0 + 150, H // 2, 140)
    title = F(SERIF_B, 150)
    d.text((sx0 + 330 + 5, sy0 + 55 + 5), "ASHEN ATLAS", font=title, fill=(0, 0, 0))
    d.text((sx0 + 330, sy0 + 55), "ASHEN ATLAS", font=title, fill=PARCH)
    d.text((sx0 + 336, sy0 + 245), "Cinematic documentaries on the worlds history forgot",
           font=F(SERIF, 54), fill=GOLD)
    d.text((sx0 + 336, sy0 + 330), "NEW DOCUMENTARY DAILY  •  7 PM ET", font=F(SANS_B, 38), fill=EMBER)
    im.save(f"{OUT}/02_banner_2560x1440.jpg", quality=92)
    # safe-area guide version
    g = im.copy(); gd = ImageDraw.Draw(g)
    gd.rectangle([sx0, sy0, sx0 + 1546, sy0 + 423], outline=(0, 255, 140), width=6)
    gd.text((sx0, sy0 - 60), "SAFE AREA 1546x423 (all devices)", font=F(SANS_B, 40), fill=(0, 255, 140))
    g.resize((1280, 720)).save(f"{OUT}/02b_banner_safe_area_guide.jpg", quality=88)

# ---------- 3. THUMBNAILS 1280x720 ----------
def thumb(name, sky_top, sky_bot, sun, words, sub, seed, accent=EMBER, red_arrow=None):
    W, H = 1280, 720
    im = vgrad(W, H, sky_top, sky_bot)
    im = glow(im, sun[0], sun[1], sun[2])
    d = ImageDraw.Draw(im)
    ax, ah, aw = ruins(d, W, 560, 1.1, (10, 9, 10), seed=seed)
    embers(im, 160, seed, (0, 0, W, 560), (1, 3))
    # left-side dark gradient for text legibility
    ov = Image.new("L", (W, H), 0); od = ImageDraw.Draw(ov)
    for x in range(W):
        od.line([(x, 0), (x, H)], fill=int(max(0, 200 - x * 0.35)))
    im = Image.composite(Image.new("RGB", (W, H), (0, 0, 0)), im, ov)
    d = ImageDraw.Draw(im)
    y = 70
    for i, wtxt in enumerate(words):
        f = F(SANS_B, 118)
        col = accent if i == len(words) - 1 else (250, 245, 235)
        for dx, dy in [(-4, 0), (4, 0), (0, -4), (0, 4), (6, 6)]:
            d.text((60 + dx, y + dy), wtxt, font=f, fill=(0, 0, 0))
        d.text((60, y), wtxt, font=f, fill=col)
        y += 130
    d.rounded_rectangle([60, y + 20, 60 + d.textlength(sub, font=F(SANS_B, 40)) + 40, y + 90], 12, fill=(0, 0, 0))
    d.text((80, y + 30), sub, font=F(SANS_B, 40), fill=GOLD)
    # small brand mark
    compass(d, W - 70, H - 70, 42)
    if red_arrow:
        (x1, y1), (x2, y2) = red_arrow
        d.line([(x1, y1), (x2, y2)], fill=(230, 40, 40), width=14)
        a = math.atan2(y2 - y1, x2 - x1)
        d.polygon([(x2, y2), (x2 - 50 * math.cos(a - 0.45), y2 - 50 * math.sin(a - 0.45)),
                   (x2 - 50 * math.cos(a + 0.45), y2 - 50 * math.sin(a + 0.45))], fill=(230, 40, 40))
    im.save(f"{OUT}/{name}", quality=92)

def shorts_cover():
    W, H = 1080, 1920
    im = vgrad(W, H, (20, 18, 30), (90, 40, 20))
    im = glow(im, (540, 1150), 420, (220, 100, 30))
    d = ImageDraw.Draw(im)
    ruins(d, W, 1350, 1.5, (10, 9, 10), seed=21)
    embers(im, 260, 5, (0, 300, W, 1350), (1, 4))
    d = ImageDraw.Draw(im)
    center_text(d, W, 330, "A WHOLE CITY", F(SANS_B, 120), (250, 245, 235))
    center_text(d, W, 480, "BURIED", F(SANS_B, 170), EMBER)
    center_text(d, W, 660, "IN ONE DAY", F(SANS_B, 110), (250, 245, 235))
    center_text(d, W, 1500, "FULL DOCUMENTARY ON THE CHANNEL", F(SANS_B, 40), GOLD)
    compass(d, 540, 1680, 70)
    im.save(f"{OUT}/06_shorts_cover_1080x1920.jpg", quality=90)

def watermark():
    im = Image.new("RGBA", (150, 150), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    compass(d, 75, 75, 70, bg=(14, 15, 18))
    im.save(f"{OUT}/07_watermark_150x150.png")

logo(); banner()
thumb("03_thumbnail_A_1280x720.jpg", (25, 22, 40), (150, 70, 30), ((900, 420), 230, (255, 140, 50)),
      ["40,000 PEOPLE", "VANISHED"], "The Lost City of Mohenjo-daro", 3)
thumb("04_thumbnail_B_1280x720.jpg", (10, 20, 35), (40, 70, 90), ((980, 300), 160, (170, 210, 255)),
      ["THEY BUILT", "THIS 5,000", "YEARS AGO?"], "Göbekli Tepe, explained", 9, accent=(120, 200, 255))
thumb("05_thumbnail_C_1280x720.jpg", (40, 10, 8), (120, 30, 15), ((1000, 380), 260, (255, 80, 20)),
      ["BURIED", "IN 18 HOURS"], "The Last Day of Pompeii", 15, red_arrow=((880, 160), (1000, 330)))
shorts_cover(); watermark()
print(sorted(os.listdir(OUT)))
