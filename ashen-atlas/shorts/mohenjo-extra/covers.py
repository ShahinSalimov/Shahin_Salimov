"""1080x1920 Short covers. Usage: covers.py LOGO OUTDIR  (jobs defined below)."""
import sys, os, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageEnhance
LOGO, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True)
XB = "/usr/share/fonts/opentype/inter/Inter-Black.otf"; B = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
CREAM = (250, 243, 228); GOLD = (214, 175, 110); ORANGE = (240, 120, 45); AMBER = (255, 195, 80)
S = "/tmp/claude-0/-home-user-Shahin-Salimov/4df16a1c-c402-531b-9541-cec4397ad2a6/scratchpad"
logo = Image.open(LOGO).convert("RGBA")
m = Image.new("L", (800, 800), 0); ImageDraw.Draw(m).ellipse((62, 62, 738, 738), fill=255); logo = logo.resize((800, 800)); logo.putalpha(m)

def grade(im, tint):
    im = ImageEnhance.Contrast(ImageEnhance.Color(im).enhance(1.15)).enhance(1.15)
    a = np.asarray(im, np.float32) / 255; lum = a.mean(2, keepdims=True)
    a = a * .65 + lum * np.array(tint, np.float32) / 255 * .35 * 1.8
    return Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
def shade(im):
    h = im.size[1]; a = np.asarray(im, np.float32)
    g = np.ones(h, np.float32); top = int(h * .5)
    g[:top] = .18 + .82 * np.linspace(0, 1, top) ** 1.4
    bot = int(h * .25); g[-bot:] *= np.linspace(1, .45, bot)
    return Image.fromarray(np.clip(a * g[:, None, None], 0, 255).astype(np.uint8))
def fit(d, t, size, maxw):
    while d.textlength(t, font=ImageFont.truetype(XB, size)) > maxw: size -= 4
    return ImageFont.truetype(XB, size)
def txt(d, xy, t, f, fill):
    d.text((xy[0] + 5, xy[1] + 7), t, font=f, fill=(0, 0, 0, 170), stroke_width=7, stroke_fill=(0, 0, 0, 170))
    d.text(xy, t, font=f, fill=fill, stroke_width=7, stroke_fill=(15, 10, 8))
def cover(name, bg, lines, tint, tag=None):
    im = Image.open(bg).convert("RGB").resize((1080, 1920), Image.LANCZOS)
    im = shade(grade(im, tint)).convert("RGBA"); d = ImageDraw.Draw(im); y = 210
    for t, col, size in lines:
        f = fit(d, t, size, 960); tw = d.textlength(t, font=f); txt(d, ((1080 - tw) / 2, y), t, f, col); y += int(f.size * 1.12)
    if tag:
        f = ImageFont.truetype(B, 32); tw = d.textlength(tag, font=f)
        d.rounded_rectangle(((1080 - tw) / 2 - 22, y + 20, (1080 + tw) / 2 + 22, y + 76), 12, fill=(10, 8, 6, 200))
        d.text(((1080 - tw) / 2, y + 30), tag, font=f, fill=(225, 215, 200))
    f = ImageFont.truetype(B, 40); t = "FULL DOCUMENTARY ON THE CHANNEL"; tw = d.textlength(t, font=f)
    d.rounded_rectangle(((1080 - tw) / 2 - 30, 1560, (1080 + tw) / 2 + 30, 1640), 14, fill=(10, 8, 6, 215)); d.text(((1080 - tw) / 2, 1578), t, font=f, fill=GOLD)
    im.alpha_composite(logo.resize((150, 150), Image.LANCZOS), (465, 1680))
    im.convert("RGB").save(f"{OUT}/{name}.jpg", quality=92)

JOBS = sys.argv[3]
if JOBS == "mohenjo":
    M = f"{S}/ms"
    cover("Cover_Mohenjo_PriestKing", f"{M}/short_priest/img_1_0.png",
          [("PRIEST", CREAM, 170), ("OR KING?", ORANGE, 170)], (255, 150, 60), "Mohenjo-daro, c. 2500 BCE")
    cover("Cover_Mohenjo_IndusScript", f"{M}/short_script/img_0_0.png",
          [("NO ONE", CREAM, 170), ("CAN READ", CREAM, 150), ("THIS", AMBER, 200)], (255, 170, 80), "The Indus script, 4,500 years old")
    cover("Cover_Mohenjo_DancingGirl", f"{M}/short_girl/img_0_0.png",
          [("10 CM TALL", CREAM, 150), ("4,500 YEARS", CREAM, 130), ("OLD", ORANGE, 220)], (255, 150, 60), "AI illustration")
else:
    G = f"{S}/gt"
    cover("Cover_Gobekli_VultureStone", f"{G}/short_vulture/img_0_0.png",
          [("THE", CREAM, 130), ("VULTURE", AMBER, 190), ("STONE", CREAM, 170)], (255, 160, 70), "11,500 years old")
    cover("Cover_Gobekli_Gravestones", f"{G}/short_graves/img_1_0.png",
          [("THEY THOUGHT", CREAM, 120), ("THESE WERE", CREAM, 120), ("GRAVESTONES", ORANGE, 160)], (255, 150, 60), "Göbekli Tepe, 1963")
print(sorted(os.listdir(OUT)))
