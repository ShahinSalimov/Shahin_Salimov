"""Short cover 1080x1920 for the Tutankhamun chariot Short. Usage: cover.py ROOT (images from ROOT/short_chariot)."""
import sys, os, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageEnhance
S = sys.argv[1]; SRC = f"{S}/short_chariot"; OUT = f"{S}/deliver"
XB = "/usr/share/fonts/opentype/inter/Inter-Black.otf"; B = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
CREAM = (250, 243, 228); GOLD = (214, 175, 110); ORANGE = (240, 120, 45); AMBER = (255, 195, 80)
logo = Image.open(f"{S}/img/i-001.png").convert("RGBA").resize((800, 800))
m = Image.new("L", (800, 800), 0); ImageDraw.Draw(m).ellipse((62, 62, 738, 738), fill=255); logo.putalpha(m)
def grade(im, tint=(255, 160, 70)):
    im = ImageEnhance.Contrast(ImageEnhance.Color(im).enhance(1.12)).enhance(1.15)
    a = np.asarray(im, np.float32) / 255; lum = a.mean(2, keepdims=True)
    a = a * .74 + lum * np.array(tint, np.float32) / 255 * .26 * 1.8
    return Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
def fit(d, t, size, maxw):
    while d.textlength(t, font=ImageFont.truetype(XB, size)) > maxw: size -= 4
    return ImageFont.truetype(XB, size)
def txt(d, xy, t, f, fill, st=8):
    d.text((xy[0] + 6, xy[1] + 7), t, font=f, fill=(0, 0, 0, 190), stroke_width=st, stroke_fill=(0, 0, 0, 190))
    d.text(xy, t, font=f, fill=fill, stroke_width=st, stroke_fill=(15, 10, 8))
def cover(name, src, lines, tag, y0=150):
    im = grade(Image.open(src).convert("RGB").resize((1080, 1920), Image.LANCZOS))
    a = np.asarray(im, np.float32); g = np.ones(1920, np.float32)
    g[:760] = .22 + .78 * np.linspace(0, 1, 760) ** 1.2; g[-520:] *= np.linspace(1, .35, 520)
    im = Image.fromarray(np.clip(a * g[:, None, None], 0, 255).astype(np.uint8)).convert("RGBA"); d = ImageDraw.Draw(im); y = y0
    for t, col, size in lines:
        f = fit(d, t, size, 980); tw = d.textlength(t, font=f); txt(d, ((1080 - tw) / 2, y), t, f, col); y += int(f.size * 1.1)
    f = ImageFont.truetype(B, 36); tw = d.textlength(tag, font=f)
    d.rounded_rectangle(((1080 - tw) / 2 - 26, 1580, (1080 + tw) / 2 + 26, 1650), 14, fill=(10, 8, 6, 215))
    d.text(((1080 - tw) / 2, 1594), tag, font=f, fill=GOLD)
    im.alpha_composite(logo.resize((140, 140), Image.LANCZOS), (470, 1690))
    im.convert("RGB").save(f"{OUT}/{name}.jpg", quality=93)
cover("Cover_Chariot_A_face", f"{SRC}/img_0_0.png",
      [("KILLED BY", CREAM, 170), ("A CHARIOT?", ORANGE, 190)], "TUTANKHAMUN  ·  c. 1323 BCE")
cover("Cover_Chariot_B_chariot", f"{SRC}/img_2_0.png",
      [("DID THIS", CREAM, 170), ("KILL HIM?", ORANGE, 200)], "TUTANKHAMUN'S CHARIOTS")
