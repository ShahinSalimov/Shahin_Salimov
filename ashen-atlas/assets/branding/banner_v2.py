"""Compose Ashen Crown banner v2 (2560x1440, content inside the 1546x423 safe area).
Usage: python banner_v2.py BG.png LOGO.png OUT.jpg"""
import sys, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageEnhance

W, H = 2560, 1440
GOLD = (214, 172, 98)
EMBER = (232, 120, 40)
SERIF = "/usr/share/fonts/truetype/crosextra/Caladea-Bold.ttf"
SERIF_R = "/usr/share/fonts/truetype/crosextra/Caladea-Regular.ttf"

def spaced(draw, xy, text, font, fill, track):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + track
    return x

def width(draw, text, font, track):
    return sum(draw.textlength(c, font=font) for c in text) + track * (len(text) - 1)

bg_p, logo_p, out = sys.argv[1:4]
bg = Image.open(bg_p).convert("RGB")
bg = bg.resize((W, int(bg.height * W / bg.width)), Image.LANCZOS)
top = max(0, (bg.height - H) // 2); bg = bg.crop((0, top, W, top + H))
bg = ImageEnhance.Brightness(bg).enhance(0.8)

# darken centre band so the text reads
shade = Image.new("L", (W, H), 0); d = ImageDraw.Draw(shade)
d.rectangle((300, 470, W - 300, 970), fill=150)
shade = shade.filter(ImageFilter.GaussianBlur(160))
bg = Image.composite(Image.new("RGB", (W, H), (8, 6, 5)), bg, shade)

# drifting embers
rnd = random.Random(5); glow = Image.new("RGB", (W, H), 0); g = ImageDraw.Draw(glow)
for _ in range(260):
    x, y, r = rnd.randint(0, W), rnd.randint(0, H), rnd.choice([1, 1, 2, 2, 3, 4])
    c = tuple(int(v * rnd.uniform(0.5, 1)) for v in EMBER)
    g.ellipse((x - r, y - r, x + r, y + r), fill=c)
from PIL import ImageChops
bg = ImageChops.add(bg, glow.filter(ImageFilter.GaussianBlur(3)))
bg = ImageChops.add(bg, glow)

d = ImageDraw.Draw(bg)
title_f = ImageFont.truetype(SERIF, 128); tag_f = ImageFont.truetype(SERIF_R, 40)
title, tag = "ASHEN CROWN", "REAL PEOPLE  ·  LOST WORLDS  ·  FORGOTTEN STORIES"
tw, gw = width(d, title, title_f, 10), width(d, tag, tag_f, 3)
LOGO = 360; gap = 60
block = LOGO + gap + max(tw, gw)
x0 = int((W - block) // 2); cy = H // 2

# logo with soft ember halo
logo = Image.open(logo_p).convert("RGB").resize((LOGO, LOGO), Image.LANCZOS)
m = Image.new("L", (LOGO, LOGO), 0); ImageDraw.Draw(m).ellipse((0, 0, LOGO - 1, LOGO - 1), fill=255)
halo = Image.new("L", (W, H), 0)
ImageDraw.Draw(halo).ellipse((x0 - 30, cy - LOGO // 2 - 30, x0 + LOGO + 30, cy + LOGO // 2 + 30), fill=120)
halo = halo.filter(ImageFilter.GaussianBlur(40))
bg = Image.composite(Image.new("RGB", (W, H), EMBER), bg, halo)
bg.paste(logo, (x0, cy - LOGO // 2), m)
d = ImageDraw.Draw(bg)
d.ellipse((x0 - 4, cy - LOGO // 2 - 4, x0 + LOGO + 4, cy + LOGO // 2 + 4), outline=GOLD, width=6)

tx = x0 + LOGO + gap
ty = cy - 132
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0)); sd = ImageDraw.Draw(shadow)
spaced(sd, (tx + 4, ty + 6), title, title_f, (0, 0, 0, 220), 10)
bg.paste(shadow.filter(ImageFilter.GaussianBlur(6)), (0, 0), shadow.filter(ImageFilter.GaussianBlur(6)))
d = ImageDraw.Draw(bg)
spaced(d, (tx, ty), title, title_f, GOLD, 10)
ly = cy + 22
d.line((tx, ly, tx + max(tw, gw), ly), fill=EMBER, width=4)
spaced(d, (tx + (max(tw, gw) - gw) / 2 if gw < tw else tx, ly + 30), tag, tag_f, (225, 215, 200), 3)
bg.save(out, quality=92)
print(out, "safe-area block width", int(block))
