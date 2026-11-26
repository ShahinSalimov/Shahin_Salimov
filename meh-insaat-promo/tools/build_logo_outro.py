"""MEH-Insaat MMC logo outro builder.

Splits the ORIGINAL logo file into layers (no redrawing: every logo pixel comes
from the source file) and renders a 9:16, 10 s, 30 fps logo-reveal end card with
the contact number. Effects only touch the surroundings (background, light,
particles, shine, reveal masks); the final held frame shows the logo unchanged.

Usage: python3 build_logo_outro.py <logo.jpg> <font.ttf> <out_dir>
"""
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

LOGO, FONT, OUT = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "layers").mkdir(exist_ok=True)

W, H, FPS, DUR = 1080, 1920, 30, 10.0
N = int(FPS * DUR)
PHONE = "070 711 22 54"

# ---------------------------------------------------------------- layers ----
src = np.asarray(Image.open(LOGO).convert("RGB")).astype(np.float32)
bg_ref = np.median(src[:40, :40].reshape(-1, 3), axis=0)  # paper white of the file


def color_to_alpha(rgb):
    """Exact inverse of compositing over the file's white: over(bg_ref) == rgb."""
    ref = bg_ref[None, None, :]
    a = np.max(np.where(rgb < ref, (ref - rgb) / np.maximum(ref, 1), 0), axis=2)
    a = np.clip(a, 0, 1)
    a[a < 0.03] = 0
    safe = np.maximum(a, 1e-6)[..., None]
    col = np.clip((rgb - ref * (1 - a[..., None])) / safe, 0, 255)
    return np.dstack([col, a * 255]).astype(np.uint8)


rgba = color_to_alpha(src)
Image.fromarray(rgba).save(OUT / "layers" / "logo_full_transparent.png")

# bounding boxes measured from the source file (rows/cols of non-white pixels)
BOX_EMBLEM = (561 - 6, 423 - 6, 1008 + 7, 874 + 7)
BOX_LINE1 = (164 - 4, 892 - 4, 1412 + 5, 1045 + 5)
BOX_LINE2 = (272 - 4, 1062 - 4, 1301 + 5, 1124 + 5)
BLOCK = (BOX_LINE1[0], BOX_EMBLEM[1], BOX_LINE1[2], BOX_LINE2[3])

full = Image.fromarray(rgba)
emblem = full.crop(BOX_EMBLEM)
line1 = full.crop(BOX_LINE1)
line2 = full.crop(BOX_LINE2)
emblem.save(OUT / "layers" / "emblem.png")
line1.save(OUT / "layers" / "text_meh_insaat_mmc.png")
line2.save(OUT / "layers" / "text_temir_ve_tikinti.png")

# split emblem: gold line-art vs navy disc (used only for the build-up animation)
e = np.asarray(emblem).astype(np.float32)
r, g, b, a = e[..., 0], e[..., 1], e[..., 2], e[..., 3] / 255
gold_w = np.clip((r - b - 25) / 70, 0, 1) * a
gold_rgba = e.copy()
gold_rgba[..., 3] = gold_w * 255
navy_mask = (a > 0.9) & (gold_w < 0.05)
# fill the gold strokes with surrounding navy (normalized blur) -> clean disc
navy = np.where(navy_mask[..., None], e[..., :3], 0)
wgt = navy_mask.astype(np.float32)
def blur(x, sigma=9):
    k = np.exp(-np.arange(-3 * sigma, 3 * sigma + 1) ** 2 / (2 * sigma ** 2)).astype(np.float32)
    k /= k.sum()
    x = np.apply_along_axis(lambda v: np.convolve(v, k, mode="same"), 0, x.astype(np.float32))
    return np.apply_along_axis(lambda v: np.convolve(v, k, mode="same"), 1, x)
num = np.dstack([blur(navy[..., i].astype(np.float32)) for i in range(3)])
den = blur(wgt)[..., None]
fill = num / np.maximum(den, 1e-4)
disc_rgb = np.where(navy_mask[..., None], e[..., :3], fill)
disc_rgba = np.dstack([disc_rgb, e[..., 3]]).clip(0, 255).astype(np.uint8)
Image.fromarray(disc_rgba).save(OUT / "layers" / "emblem_disc_only.png")
Image.fromarray(gold_rgba.clip(0, 255).astype(np.uint8)).save(OUT / "layers" / "emblem_gold_lines_only.png")

# brand colours sampled from the file
NAVY = np.median(e[navy_mask][:, :3], axis=0)
_l2 = src[BOX_LINE2[1]:BOX_LINE2[3], BOX_LINE2[0]:BOX_LINE2[2]].reshape(-1, 3)
GOLD = np.median(_l2[_l2[:, 2] < 140], axis=0)  # solid gold text pixels as they appear in the file
print("navy", NAVY, "gold", GOLD)

# ------------------------------------------------------------ placement ----
S = 0.70  # logo scale on the 1080 canvas
bw = (BLOCK[2] - BLOCK[0]) * S
X0 = (W - bw) / 2 - BLOCK[0] * S
Y0 = 560 - BLOCK[1] * S


def place(img, box):
    """Resize a layer (premultiplied) and return float RGBA + top-left on canvas."""
    w = round((box[2] - box[0]) * S)
    h = round((box[3] - box[1]) * S)
    im = img.convert("RGBa").resize((w, h), Image.LANCZOS).convert("RGBA")
    return np.asarray(im).astype(np.float32) / 255, (round(X0 + box[0] * S), round(Y0 + box[1] * S))


L_emblem, P_emblem = place(emblem, BOX_EMBLEM)
L_disc, _ = place(Image.fromarray(disc_rgba), BOX_EMBLEM)
L_gold, _ = place(Image.fromarray(gold_rgba.clip(0, 255).astype(np.uint8)), BOX_EMBLEM)
L_line1, P_line1 = place(line1, BOX_LINE1)
L_line2, P_line2 = place(line2, BOX_LINE2)
eh, ew = L_emblem.shape[:2]
e_cx, e_cy = P_emblem[0] + ew / 2, P_emblem[1] + eh / 2

# phone row (rendered type, brand colours)
font = ImageFont.truetype(str(FONT), 78)
try:
    font.set_variation_by_name("Bold")
except Exception:
    pass
icon_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 54)
row = Image.new("RGBA", (900, 140), (0, 0, 0, 0))
d = ImageDraw.Draw(row)
tw = d.textlength(PHONE, font=font) + 6 * (len(PHONE) - 1)
total = 110 + 28 + tw
x = (900 - total) / 2
d.ellipse((x, 15, x + 110, 125), fill=tuple(int(c) for c in NAVY) + (255,))
d.text((x + 55, 70), "☎", font=icon_font, fill=tuple(int(c) for c in GOLD) + (255,), anchor="mm")
tx = x + 110 + 28
for ch in PHONE:  # manual tracking
    d.text((tx, 70), ch, font=font, fill=tuple(int(c) for c in NAVY) + (255,), anchor="lm")
    tx += d.textlength(ch, font=font) + 6
L_phone = np.asarray(row).astype(np.float32) / 255
P_phone = ((W - 900) // 2, round(Y0 + BOX_LINE2[3] * S) + 150)
divider_y = P_phone[1] - 55

# ------------------------------------------------------------ background ----
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
rad = np.sqrt(((xx - W / 2) / W) ** 2 + ((yy - H * 0.42) / H) ** 2)
warm_white = np.array([255, 253, 249], np.float32)
warm_edge = np.array([236, 228, 214], np.float32)
BG = warm_white + (warm_edge - warm_white) * np.clip(rad * 1.6, 0, 1)[..., None] ** 1.4
BG /= 255
ang = np.arctan2(yy + 300, xx - W / 2)  # rays from above the frame
GOLD_F = GOLD / 255

rng = np.random.default_rng(7)
NP = 140
px, py = rng.uniform(0, W, NP), rng.uniform(0, H, NP)
pv = rng.uniform(12, 45, NP)
ps = rng.uniform(1.2, 4.2, NP)
pph = rng.uniform(0, 6.28, NP)


def ease_out_cubic(t):
    t = min(max(t, 0), 1)
    return 1 - (1 - t) ** 3


def ease_out_back(t, k=1.5):
    t = min(max(t, 0), 1)
    return 1 + (k + 1) * (t - 1) ** 3 + k * (t - 1) ** 2


def prog(t, a, b):
    return min(max((t - a) / (b - a), 0), 1)


def over(canvas, layer, pos, alpha=1.0):
    x, y = pos
    h, w = layer.shape[:2]
    x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + w, W), min(y + h, H)
    if x0 >= x1 or y0 >= y1:
        return
    l = layer[y0 - y:y1 - y, x0 - x:x1 - x]
    la = l[..., 3:4] * alpha
    c = canvas[y0:y1, x0:x1]
    c[...] = l[..., :3] * la + c * (1 - la)


def scaled(layer, s):
    if s <= 0.001:
        return None
    h, w = layer.shape[:2]
    im = Image.fromarray((layer * 255).astype(np.uint8), "RGBA").convert("RGBa")
    im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS).convert("RGBA")
    return np.asarray(im).astype(np.float32) / 255


# soft drop shadow under the disc
sh = Image.new("L", (ew + 200, eh + 200), 0)
ImageDraw.Draw(sh).ellipse((100 + ew * 0.08, 100 + eh * 0.88, 100 + ew * 0.92, 100 + eh * 1.02), fill=110)
SHADOW = np.asarray(sh.filter(ImageFilter.GaussianBlur(28))).astype(np.float32) / 255

# ---------------------------------------------------------------- render ----
mp4 = OUT / "MEH_Insaat_logo_outro_9x16_10s.mp4"
ff = subprocess.Popen(
    ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
     "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "15",
     "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(mp4)],
    stdin=subprocess.PIPE)

for f in range(N):
    t = f / FPS
    cv = BG.copy()

    # light rays (slow rotation), gold tinted
    rays = (0.5 + 0.5 * np.sin(ang * 14 + t * 0.35)) ** 6 * np.clip(1 - yy / (H * 0.75), 0, 1)
    cv += (rays * 0.10 * ease_out_cubic(prog(t, 0, 1.2)))[..., None] * (GOLD_F - cv) * 1.6
    # warm glow behind the emblem
    glow = np.exp(-(((xx - e_cx) ** 2 + (yy - e_cy) ** 2) / (2 * 260 ** 2)))
    cv += (glow * 0.22 * ease_out_cubic(prog(t, 0.6, 2.5)))[..., None] * (GOLD_F * 1.15 - cv)

    # gold dust
    for i in range(NP):
        y = (py[i] - pv[i] * t) % H
        x = px[i] + 14 * math.sin(t * 0.8 + pph[i])
        tw_ = 0.55 + 0.45 * math.sin(t * 2.2 + pph[i] * 3)
        r_ = ps[i] * 3
        x0, x1 = int(max(x - r_, 0)), int(min(x + r_ + 1, W))
        y0, y1 = int(max(y - r_, 0)), int(min(y + r_ + 1, H))
        if x0 >= x1 or y0 >= y1:
            continue
        g_ = np.exp(-(((xx[y0:y1, x0:x1] - x) ** 2 + (yy[y0:y1, x0:x1] - y) ** 2) / (2 * ps[i] ** 2)))
        a_ = (g_ * 0.75 * tw_)[..., None]
        cv[y0:y1, x0:x1] = cv[y0:y1, x0:x1] * (1 - a_) + GOLD_F * a_

    # 1) shadow + navy disc pops in (0.4 - 1.4 s)
    s = ease_out_back(prog(t, 0.4, 1.4))
    if s > 0:
        so = np.zeros((SHADOW.shape[0], SHADOW.shape[1], 4), np.float32)
        so[..., 3] = SHADOW * min(s, 1)
        over(cv, so, (P_emblem[0] - 100, P_emblem[1] - 100))
    build_done = t >= 3.0
    if not build_done:
        layer = scaled(L_disc, s)
        if layer is not None:
            over(cv, layer, (round(e_cx - layer.shape[1] / 2), round(e_cy - layer.shape[0] / 2)),
                 alpha=min(1, prog(t, 0.4, 0.8)))
        # 2) gold line-art rises from the ground up (1.3 - 3.0 s)
        q = prog(t, 1.3, 3.0)
        p = q * q * (3 - 2 * q)  # smoothstep: the building visibly rises
        if p > 0:
            front = eh * (1 - p)
            rows = np.arange(eh, dtype=np.float32)[:, None]
            m = np.clip((rows - front) / 6, 0, 1)
            # reveal the ORIGINAL emblem pixels row by row (no re-coloured copy)
            gl = L_emblem.copy()
            gl[..., 3] *= m[..., 0] if m.ndim == 3 else m
            over(cv, gl, P_emblem)
            # glowing edge at the build front
            edge = np.exp(-((rows - front) ** 2) / (2 * 5 ** 2)) * (L_gold[..., 3] > 0.05)
            eg = np.zeros_like(L_gold)
            eg[..., :3] = np.minimum(GOLD_F * 1.35, 1)
            eg[..., 3] = edge[..., 0] * 0.9 if edge.ndim == 3 else edge * 0.9
            over(cv, eg, P_emblem)
    else:
        # from 3.0 s on: the ORIGINAL emblem pixels, untouched
        over(cv, L_emblem, P_emblem)

    # 3) text line 1 rises + fades (3.3 - 4.3 s)
    p1 = ease_out_cubic(prog(t, 3.3, 4.3))
    if p1 > 0:
        over(cv, L_line1, (P_line1[0], P_line1[1] + round(40 * (1 - p1))), alpha=p1)
    # 4) line 2 opens from the centre (4.1 - 5.0 s)
    p2 = ease_out_cubic(prog(t, 4.1, 5.0))
    if p2 > 0:
        l2 = L_line2.copy()
        cx = l2.shape[1] / 2
        cols = np.abs(np.arange(l2.shape[1]) - cx)[None, :]
        l2[..., 3] *= np.clip((cx * p2 - cols) / 20 + 1, 0, 1)
        over(cv, l2, P_line2, alpha=min(1, p2 * 1.3))

    # 5) thin gold divider grows (5.0 - 5.6 s)
    pd = ease_out_cubic(prog(t, 5.0, 5.6))
    if pd > 0:
        half = 160 * pd
        cv[divider_y - 1:divider_y + 2, int(W / 2 - half):int(W / 2 + half)] = GOLD_F

    # 6) phone row (5.4 - 6.3 s)
    pp = ease_out_cubic(prog(t, 5.4, 6.3))
    if pp > 0:
        over(cv, L_phone, (P_phone[0], P_phone[1] + round(30 * (1 - pp))), alpha=pp)

    # shine sweeps (on top of logo only, light passes over it)
    for (ta, tb, lay, pos) in ((3.0, 3.9, L_emblem, P_emblem), (7.2, 8.1, L_emblem, P_emblem),
                               (7.4, 8.4, L_line1, P_line1)):
        ps_ = prog(t, ta, tb)
        if 0 < ps_ < 1:
            h_, w_ = lay.shape[:2]
            gy, gx = np.mgrid[0:h_, 0:w_].astype(np.float32)
            band = (gx + gy * 0.6) - (-0.3 * w_ + ps_ * (w_ * 1.6 + h_ * 0.6))
            sh_ = np.exp(-(band ** 2) / (2 * 30 ** 2)) * lay[..., 3] * 0.55
            sl = np.ones((h_, w_, 4), np.float32)
            sl[..., :3] = [1.0, 0.97, 0.88]
            sl[..., 3] = sh_
            over(cv, sl, pos)

    ff.stdin.write((np.clip(cv, 0, 1) * 255).astype(np.uint8).tobytes())
    if f == N - 1:
        Image.fromarray((np.clip(cv, 0, 1) * 255).astype(np.uint8)).save(OUT / "endcard_final_frame.png")
    if f in (int(1.0 * FPS), int(2.2 * FPS), int(4.6 * FPS)):
        Image.fromarray((np.clip(cv, 0, 1) * 255).astype(np.uint8)).save(OUT / f"preview_{t:.1f}s.png")

ff.stdin.close()
ff.wait()
print("done", mp4)
