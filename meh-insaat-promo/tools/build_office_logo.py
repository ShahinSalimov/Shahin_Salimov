"""Scene 9B: place the ORIGINAL logo on the blank office panel + 3 s push-in clip.

The logo is only scaled uniformly (no redraw, no recolour). Effects: soft
mounted-sign shadow on the wall, one light sweep, slow camera push-in.
Usage: python3 build_office_logo.py <office.jpg> <logo_full_transparent.png> <out_dir>
"""
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

OFFICE, LOGO, OUT = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
OUT.mkdir(parents=True, exist_ok=True)

K = 2  # work at 2x so the logo stays crisp
base = Image.open(OFFICE).convert("RGB")
base = base.resize((base.width * K, base.height * K), Image.LANCZOS)

# logo block (emblem + both text lines) from the transparent original
logo = Image.open(LOGO).crop((160, 417, 1417, 1129))
target_w = 300 * K
s = target_w / logo.width
logo = logo.convert("RGBa").resize((target_w, round(logo.height * s)), Image.LANCZOS).convert("RGBA")
cx, cy = 385 * K, 548 * K  # centre of the white panel, slightly up toward the spotlights
x0, y0 = cx - logo.width // 2, cy - logo.height // 2

# mounted-sign shadow (wall effect only)
a = np.asarray(logo)[..., 3]
shadow = Image.fromarray(a).filter(ImageFilter.GaussianBlur(6 * K))
canvas = base.convert("RGBA")
sh = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
sh_layer = Image.new("RGBA", logo.size, (60, 45, 30, 0))
sh_layer.putalpha(shadow.point(lambda v: int(v * 0.28)))
sh.paste(sh_layer, (x0 + 3 * K, y0 + 5 * K), sh_layer)
canvas = Image.alpha_composite(canvas, sh)
canvas.alpha_composite(logo, (x0, y0))
still = canvas.convert("RGB")
still.save(OUT / "09B_office_with_logo.png")
print("logo box", x0, y0, logo.size)

# ---- 3 s push-in clip, 1080x1920, 30 fps
W, H, FPS, DUR = 1080, 1920, 30, 3.0
arr = np.asarray(still).astype(np.float32) / 255
la = np.asarray(logo)[..., 3].astype(np.float32) / 255
BW, BH = still.size
mp4 = OUT / "09B_office_logo_3s.mp4"
ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                       "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow",
                       "-crf", "15", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(mp4)],
                      stdin=subprocess.PIPE)
gy, gx = np.mgrid[0:logo.height, 0:logo.width].astype(np.float32)
for f in range(int(FPS * DUR)):
    t = f / FPS
    frame = arr.copy()
    p = (t - 1.0) / 1.0  # light sweep across the sign 1.0-2.0 s
    if 0 < p < 1:
        band = (gx + gy * 0.6) - (-0.3 * logo.width + p * (logo.width * 1.6 + logo.height * 0.6))
        g = (np.exp(-(band ** 2) / (2 * (18 * K) ** 2)) * la * 0.45)[..., None]
        sub = frame[y0:y0 + logo.height, x0:x0 + logo.width]
        sub[...] = sub * (1 - g) + np.array([1.0, 0.97, 0.88]) * g
    q = t / DUR
    z = 1.0 + 0.10 * (q * q * (3 - 2 * q))  # smooth push-in
    cw, ch = BW / z, BW / z * 16 / 9
    fx, fy = cx + (BW / 2 - cx) / z, cy + 40 * K  # drift toward the sign
    left = min(max(fx - cw / 2, 0), BW - cw)
    top = min(max(fy - ch / 2, 0), BH - ch)
    img = Image.fromarray((frame * 255).astype(np.uint8)).resize(
        (W, H), Image.LANCZOS, box=(left, top, left + cw, top + ch))
    ff.stdin.write(img.tobytes())
ff.stdin.close()
ff.wait()
print("done", mp4)
