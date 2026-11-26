"""Bronze Age Collapse: 3 long-video thumbnails (1280x720, face right + question left) and 3 Short covers (1080x1920).
Usage: thumbs_bac.py ROOT"""
import sys, os, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageEnhance
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen as G
from shots import SHOTS
S = sys.argv[1]; OUT = f"{S}/deliver/thumbnails"; os.makedirs(OUT, exist_ok=True)
XB = "/usr/share/fonts/opentype/inter/Inter-Black.otf"; B = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
CREAM = (250, 243, 228); GOLD = (214, 175, 110); ORANGE = (240, 120, 45); AMBER = (255, 195, 80)
logo = Image.open(f"{S}/img/i-001.png").convert("RGBA").resize((800, 800))
m = Image.new("L", (800, 800), 0); ImageDraw.Draw(m).ellipse((62, 62, 738, 738), fill=255); logo.putalpha(m)

def grade(im, tint=(255, 150, 60)):
    im = ImageEnhance.Contrast(ImageEnhance.Color(im).enhance(1.15)).enhance(1.18)
    a = np.asarray(im, np.float32) / 255; lum = a.mean(2, keepdims=True)
    a = a * .68 + lum * np.array(tint, np.float32) / 255 * .32 * 1.8
    return Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
def fit(d, t, size, maxw):
    while d.textlength(t, font=ImageFont.truetype(XB, size)) > maxw: size -= 4
    return ImageFont.truetype(XB, size)
def txt(d, xy, t, f, fill, st=6):
    d.text((xy[0] + 5, xy[1] + 6), t, font=f, fill=(0, 0, 0, 180), stroke_width=st, stroke_fill=(0, 0, 0, 180))
    d.text(xy, t, font=f, fill=fill, stroke_width=st, stroke_fill=(15, 10, 8))
def main_img(k, i=0): return f"{S}/gen/{G.key(G.full(SHOTS[k][i][0], SHOTS[k][i][1]))}.png"

def thumb(name, src, face_x, lines, sub):
    """src image is scaled to fill height 720; the face (at relative x face_x of the source) is placed at x=930."""
    im = Image.open(src).convert("RGB"); w, h = im.size; sc = 720 / h; im = im.resize((int(w * sc), 720), Image.LANCZOS)
    canvas = Image.new("RGB", (1280, 720), (12, 9, 7)); x0 = int(930 - face_x * im.size[0])
    canvas.paste(grade(im), (x0, 0))
    a = np.asarray(canvas, np.float32); xs = np.arange(1280, dtype=np.float32)
    g = np.clip((xs - 260) / 520, 0, 1) ** 1.3 * .88 + .12           # dark left, bright right
    if x0 > 0: g = np.minimum(g, np.clip((xs - x0) / 160, 0, 1) * .9 + .1)  # soften the paste edge
    canvas = Image.fromarray(np.clip(a * g[None, :, None], 0, 255).astype(np.uint8)).convert("RGBA")
    d = ImageDraw.Draw(canvas); y = 70
    for t, col, size in lines:
        f = fit(d, t, size, 640); txt(d, (52, y), t, f, col); y += int(f.size * 1.06)
    if sub:
        f = ImageFont.truetype(B, 34); tw = d.textlength(sub, font=f)
        d.rounded_rectangle((52, y + 22, 52 + tw + 40, y + 84), 12, fill=(10, 8, 6, 215)); d.text((72, y + 32), sub, font=f, fill=GOLD)
    canvas.alpha_composite(logo.resize((96, 96), Image.LANCZOS), (1164, 604))
    canvas.convert("RGB").save(f"{OUT}/{name}.jpg", quality=92)

def cover(name, src, lines, tag):
    im = grade(Image.open(src).convert("RGB").resize((1080, 1920), Image.LANCZOS))
    a = np.asarray(im, np.float32); g = np.ones(1920, np.float32)
    g[:700] = .25 + .75 * np.linspace(0, 1, 700) ** 1.3; g[-480:] *= np.linspace(1, .45, 480)
    im = Image.fromarray(np.clip(a * g[:, None, None], 0, 255).astype(np.uint8)).convert("RGBA"); d = ImageDraw.Draw(im); y = 190
    for t, col, size in lines:
        f = fit(d, t, size, 960); tw = d.textlength(t, font=f); txt(d, ((1080 - tw) / 2, y), t, f, col, 7); y += int(f.size * 1.12)
    f = ImageFont.truetype(B, 32); tw = d.textlength(tag, font=f)
    d.rounded_rectangle(((1080 - tw) / 2 - 22, y + 20, (1080 + tw) / 2 + 22, y + 76), 12, fill=(10, 8, 6, 200))
    d.text(((1080 - tw) / 2, y + 30), tag, font=f, fill=(225, 215, 200))
    f = ImageFont.truetype(B, 40); t = "FULL DOCUMENTARY ON THE CHANNEL"; tw = d.textlength(t, font=f)
    d.rounded_rectangle(((1080 - tw) / 2 - 30, 1560, (1080 + tw) / 2 + 30, 1640), 14, fill=(10, 8, 6, 215)); d.text(((1080 - tw) / 2, 1578), t, font=f, fill=GOLD)
    im.alpha_composite(logo.resize((150, 150), Image.LANCZOS), (465, 1680))
    im.convert("RGB").save(f"{OUT}/{name}.jpg", quality=92)

FACE = main_img((1, 0)); SP = f"{S}/short_seapeoples/img_0_0.png"; KING = f"{S}/short_ugarit/img_0_0.png"
FX = float(os.environ.get("FACE_X", "0.5"))
thumb("T1_WHO_DESTROYED_IT", FACE, FX, [("WHO", CREAM, 150), ("DESTROYED", CREAM, 120), ("IT ALL?", ORANGE, 160)], "1177 BCE")
thumb("T2_WHO_WERE_THEY", SP, 0.5, [("WHO", CREAM, 160), ("WERE", CREAM, 160), ("THEY?", AMBER, 190)], "The Sea Peoples")
thumb("T3_THE_WORLD_ENDED", KING, 0.5, [("THE WORLD", CREAM, 130), ("ENDED", ORANGE, 170), ("IN 1177 BC?", CREAM, 110)], "Bronze Age Collapse")
cover("Cover_BAC_SeaPeoples", SP, [("WHO", CREAM, 190), ("WERE", CREAM, 190), ("THEY?", ORANGE, 230)], "The Sea Peoples, c. 1200 BCE")
cover("Cover_BAC_Ugarit", KING, [("HIS LAST", CREAM, 170), ("LETTER?", AMBER, 200)], "Ugarit, c. 1185 BCE")
cover("Cover_BAC_Ship", f"{S}/short_ship/img_0_0.png", [("WHAT DID", CREAM, 170), ("HE FIND?", ORANGE, 190)], "Uluburun, Turkey, 1982")
print(sorted(os.listdir(OUT)))
