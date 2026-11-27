import sys, os, json, math, subprocess, hashlib, re
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shots import SHOTS
import gen as G  # reuse prompt expansion (gen.py exits early only when run as main)
import motion as M  # 2.5D depth parallax + atmosphere; MOTION=0 falls back to plain Ken Burns
MOTION = os.environ.get("MOTION", "1") != "0"

S = sys.argv[1]; OUTMP4 = sys.argv[2]
T0 = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0      # preview range
T1 = float(sys.argv[4]) if len(sys.argv) > 4 else None
W, H, FPS = 1920, 1080, 25
XF = 0.7  # crossfade seconds
SERIF_B = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SANS = "/usr/share/fonts/opentype/inter/Inter-Medium.otf"
SANS_B = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
SANS_L = "/usr/share/fonts/opentype/inter/Inter-Light.otf"
GOLD = (212, 169, 98); ORANGE = (230, 120, 50); CREAM = (245, 236, 220); GREY = (150, 150, 150)
GRAPH = {k: k for k in ("G1", "G2", "G3")}

man = json.load(open(f"{S}/narration/manifest.json"))
M.init(S)
paras = json.load(open(f"{S}/paras.json"))

# ---------- timeline ----------
GAP = 1.5; INTRO = 2.0; END = 20.0
sec_off = {}; t = 0.0
for m in man:
    if m["n"] == 2: t += 1.0 + INTRO  # gap + channel intro before title section
    elif m["n"] > 1: t += GAP
    sec_off[m["n"]] = t; t += m["dur"]
narr_end = t; TOTAL = narr_end + 1.0 + END
intro_start = sec_off[2] - INTRO

segs = []  # (start, end, shot)
segs.append((intro_start, sec_off[2], ("card", "intro", None)))
for i, p in enumerate(paras):
    s = sec_off[p["sec"]] + (0 if p["p"] == 0 else p["start"])
    nxt = paras[i + 1] if i + 1 < len(paras) else None
    if nxt and nxt["sec"] == p["sec"]: e = sec_off[p["sec"]] + nxt["start"]
    else:
        e = sec_off[p["sec"]] + man[p["sec"] - 1]["dur"]
        e = (intro_start if p["sec"] == 1 else e + (GAP if nxt else 1.0))
    shots = SHOTS[(p["sec"], p["p"])]
    d = (e - s) / len(shots)
    for j, sh in enumerate(shots): segs.append((s + j * d, s + (j + 1) * d, sh))
segs.sort(key=lambda x: x[0])
segs.append((narr_end + 1.0, TOTAL, ("card", "end", None)))
# section boundaries for dip-to-black
bounds = [sec_off[n] for n in sec_off if n > 2] + [narr_end + 1.0]

# ---------- assets ----------
def font(path, size): return ImageFont.truetype(path, size)
def img_for(kind, prompt): return f"{S}/gen/{G.key(G.full(kind, prompt))}.png"
cache = {}
def load_src(path, scale=1.2):
    if path in cache: return cache[path]
    im = cv2.imread(path)[:, :, ::-1]
    tw, th = int(W * scale), int(H * scale)
    big = cv2.resize(im, (tw, th), interpolation=cv2.INTER_LANCZOS4)
    blur = cv2.GaussianBlur(big, (0, 0), 1.2)
    big = cv2.addWeighted(big, 1.35, blur, -0.35, 0)
    if len(cache) > 12: cache.pop(next(iter(cache)))
    cache[path] = big; return big

yy, xx = np.mgrid[0:H, 0:W]
r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
VIG = np.clip(1.0 - 0.28 * np.clip(r - 0.55, 0, None) ** 1.5 * 1.6, 0.55, 1.0).astype(np.float32)[..., None]

def warp(src, z, px, py=0.5):
    sh, sw = src.shape[:2]
    vw, vh = sw / z, sh / z
    cx = vw / 2 + (sw - vw) * px; cy = vh / 2 + (sh - vh) * py
    s = W / vw
    M = np.float32([[s, 0, W / 2 - s * cx], [0, s, H / 2 - s * cy]])
    return cv2.warpAffine(src, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

def kenburns(src, u, idx):
    mode = idx % 4
    z = 1.0 + 0.14 * (u if mode in (0, 2) else 1 - u)
    px = [0.5, 0.3 + 0.4 * u, 0.7 - 0.4 * u, 0.5][mode]
    py = [0.45, 0.5, 0.5, 0.55][mode]
    return warp(src, z, px, py)

def text_layer(draw_fn):
    L = Image.new("RGBA", (W, H), (0, 0, 0, 0)); draw_fn(ImageDraw.Draw(L), L); return L
def overlay(frame, L, alpha=1.0):
    a = np.asarray(L, dtype=np.float32)
    m = a[..., 3:4] / 255.0 * alpha
    return (frame.astype(np.float32) * (1 - m) + a[..., :3] * m)

caption_cache = {}
def caption_layer(text, tag=False):
    k = (text, tag)
    if k in caption_cache: return caption_cache[k]
    def d(dr, L):
        f = font(SANS, 30 if tag else 40)
        bb = dr.textbbox((0, 0), text, font=f); tw, th = bb[2] - bb[0], bb[3] - bb[1]
        if tag:
            x, y = 60, H - 90
            dr.rounded_rectangle((x - 18, y - 14, x + tw + 18, y + th + 22), 8, fill=(0, 0, 0, 150))
            dr.text((x, y - bb[1] + 4), text, font=f, fill=CREAM + (230,))
        else:
            x, y = (W - tw) // 2, H - 170
            dr.rounded_rectangle((x - 34, y - 22, x + tw + 34, y + th + 30), 10, fill=(10, 8, 6, 175))
            dr.rectangle((x - 34, y - 22, x - 28, y + th + 30), fill=ORANGE + (255,))
            dr.text((x, y - bb[1] + 4), text, font=f, fill=CREAM + (255,))
    caption_cache[k] = text_layer(d); return caption_cache[k]

def fit_text(dr, text, path, size, maxw):
    while size > 20:
        f = font(path, size)
        if dr.textlength(text, font=f) <= maxw: return f
        size -= 2
    return font(path, size)

KNOW = ["Lived c. 3300 BCE, died at about 45, high in the Alps",
        "Shot from behind with a flint-tipped arrow",
        "Ate a large meal shortly before he died",
        "Hand wounded a few days earlier"]
DONT = ["Who shot him, and why", "Why he climbed so high, so fast",
        "How his head was injured", "Why the killer left the copper axe"]
KSTEP = {0: (0, 0), 1: (1, 0), 2: (4, 0), 3: (4, 4)}

static_cache = {}
def static_card(kind, data):
    k = (kind, data)
    if k in static_cache: return static_cache[k]
    bg = np.zeros((H, W, 3), np.float32)
    grad = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    bg[:] = (np.array([28, 22, 18]) * (1 - grad) + np.array([12, 10, 9]) * grad)
    L = Image.new("RGBA", (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(L)
    if kind == "know":
        nk, nd = KSTEP[data]
        dr.text((120, 110), "WHAT WE KNOW", font=font(SANS_B, 54), fill=GOLD + (255,))
        dr.text((1010, 110), "WHAT WE DON'T KNOW", font=font(SANS_B, 54), fill=GREY + (255,))
        dr.line((960, 110, 960, 960), fill=(90, 80, 70, 255), width=2)
        for i in range(nk):
            dr.text((120, 250 + i * 130), "•", font=font(SANS_B, 40), fill=GOLD + (255,))
            dr.multiline_text((160, 250 + i * 130), wrap(KNOW[i], 32), font=font(SANS, 34), fill=CREAM + (255,), spacing=8)
        for i in range(nd):
            dr.text((1010, 250 + i * 130), "?", font=font(SANS_B, 40), fill=GREY + (255,))
            dr.multiline_text((1055, 250 + i * 130), wrap(DONT[i], 32), font=font(SANS, 34), fill=(205, 200, 195, 255), spacing=8)
    static_cache[k] = (bg, L); return static_cache[k]

def wrap(t, n):
    out, line = [], ""
    for w in t.split():
        if len(line) + len(w) + 1 > n and line: out.append(line); line = w
        else: line = (line + " " + w).strip()
    return "\n".join(out + [line])

logo = Image.open(f"{S}/img/i-001.png").convert("RGBA").resize((520, 520), Image.LANCZOS)
_m = Image.new("L", (2080, 2080), 0); ImageDraw.Draw(_m).ellipse((150, 150, 1930, 1930), fill=255)
logo.putalpha(_m.resize((520, 520), Image.LANCZOS))
title_bg_prompt = SHOTS[(2, 0)][1][1]

def render_shot(sh, lt, dur, idx):
    kind = sh[0]
    u = min(max(lt / max(dur, 0.01), 0), 1)
    u = u * u * (3 - 2 * u) * 0.6 + u * 0.4
    if kind in ("ai", "art"):
        if MOTION: f = M.frame(img_for(kind, sh[1]), sh[1], u, lt, idx, VIG)
        else: f = kenburns(load_src(img_for(kind, sh[1])), u, idx).astype(np.float32) * VIG
        if len(sh) > 2:
            a = min(1, max(0, (lt - 0.6) / 0.6)) * min(1, max(0, (dur - lt - 0.3) / 0.5))
            f = overlay(f, caption_layer(sh[2], tag=(kind == "art" and sh[2].startswith("AI illustration"))), a)
        return f
    if kind == "g":
        src = load_src(f"{S}/img/{GRAPH[sh[1]]}.png", 1.0)
        f = warp(src, 1.0 + 0.05 * u, 0.5, 0.5).astype(np.float32)
        if len(sh) > 2:
            a = min(1, max(0, (lt - 0.6) / 0.6))
            f = overlay(f, caption_layer(sh[2]), a)
        return f
    if kind == "split":
        L = kenburns(load_src(img_for("ai", sh[1])), u, 0)[:, 480:1440]
        R = kenburns(load_src(img_for("ai", sh[2])), u, 2)[:, 480:1440]
        f = np.concatenate([L, R], 1).astype(np.float32) * VIG
        f[:, 957:963] = 15
        def d(dr, Lr):
            for x0, lab in ((0, sh[3]), (960, sh[4])):
                fnt = font(SANS_B, 40); tw = dr.textlength(lab, font=fnt)
                x = x0 + (960 - tw) / 2
                dr.rounded_rectangle((x - 24, H - 150, x + tw + 24, H - 82), 8, fill=(0, 0, 0, 170))
                dr.text((x, H - 140), lab, font=fnt, fill=CREAM + (255,))
        k = ("split", sh[3])
        if k not in caption_cache: caption_cache[k] = text_layer(d)
        return overlay(f, caption_cache[k], min(1, lt / 0.8))
    if kind == "card":
        c = sh[1]
        if c == "intro":
            f = np.zeros((H, W, 3), np.float32) + 14
            sc = 0.85 + 0.15 * min(1, lt / 1.2); a = min(1, lt / 0.4) * min(1, (dur - lt) / 0.4)
            ang = -25 * (1 - min(1, lt / 1.2)) ** 2
            lg = logo.rotate(ang, resample=Image.BICUBIC).resize((int(520 * sc),) * 2, Image.LANCZOS)
            arr = np.asarray(lg, np.float32); al = arr[..., 3:4] / 255.0
            y0 = (H - arr.shape[0]) // 2 - 60; x0 = (W - arr.shape[1]) // 2
            reg = f[y0:y0 + arr.shape[0], x0:x0 + arr.shape[1]]
            f[y0:y0 + arr.shape[0], x0:x0 + arr.shape[1]] = reg * (1 - al) + arr[..., :3] * al
            ta = min(1, max(0, (lt - 0.4) / 0.5))
            def d(dr, L):
                fnt = font(SERIF_B, 64); t = "ASHEN CROWN"; tw = dr.textlength(t, font=fnt)
                dr.text(((W - tw) / 2, H - 290), t, font=fnt, fill=GOLD + (255,))
            if "intro" not in caption_cache: caption_cache["intro"] = text_layer(d)
            f = overlay(f, caption_cache["intro"], ta)
            return f * a
        if c == "title":
            f = kenburns(load_src(img_for("ai", title_bg_prompt)), u, 1).astype(np.float32) * VIG * 0.55
            def d(dr, L):
                fnt = font(SERIF_B, 96); t = "ÖTZI THE ICEMAN"; tw = dr.textlength(t, font=fnt)
                dr.text(((W - tw) / 2 + 4, 384), t, font=fnt, fill=(0, 0, 0, 160))
                dr.text(((W - tw) / 2, 380), t, font=fnt, fill=CREAM + (255,))
                f2 = font(SANS, 42); t2 = "The Oldest Murder Mystery in the World"; tw2 = dr.textlength(t2, font=f2)
                dr.text(((W - tw2) / 2, 580), t2, font=f2, fill=GOLD + (255,))
                f3 = font(SANS_L, 28); t3 = "Historical scenes are AI-generated reconstructions."; tw3 = dr.textlength(t3, font=f3)
                dr.text(((W - tw3) / 2, H - 80), t3, font=f3, fill=(220, 215, 205, 230))
            if "title" not in caption_cache: caption_cache["title"] = text_layer(d)
            return overlay(f, caption_cache["title"], min(1, lt / 1.2))
        if c == "know":
            bg, L = static_card("know", sh[2])
            return overlay(bg.copy(), L, 1.0)
        if c == "end":
            f = kenburns(load_src(img_for("ai", SHOTS[(11, 2)][0][1])), u, 0).astype(np.float32)
            f = cv2.GaussianBlur(f, (0, 0), 12) * 0.35
            def d(dr, L):
                dr.text((150, 150), "WATCH NEXT", font=font(SANS_B, 46), fill=GOLD + (255,))
                dr.rounded_rectangle((150, 240, 1010, 724), 14, outline=GOLD + (255,), width=4, fill=(0, 0, 0, 120))
                t = "The Bronze Age Collapse"; fnt = font(SERIF_B, 44); tw = dr.textlength(t, font=fnt)
                dr.text((580 - tw / 2, 430), t, font=fnt, fill=CREAM + (255,)); f2 = font(SANS, 30); t2 = "Who Destroyed the First Global World?"; dr.text((580 - dr.textlength(t2, font=f2) / 2, 510), t2, font=f2, fill=GOLD + (255,))
                dr.ellipse((1280, 290, 1660, 670), outline=GOLD + (255,), width=4, fill=(0, 0, 0, 120))
                t = "SUBSCRIBE"; fnt = font(SANS_B, 44); tw = dr.textlength(t, font=fnt)
                dr.text((1470 - tw / 2, 455), t, font=fnt, fill=CREAM + (255,))
                t = "ASHEN CROWN  •  real people, lost worlds"; fnt = font(SANS, 34); tw = dr.textlength(t, font=fnt)
                dr.text(((W - tw) / 2, 880), t, font=fnt, fill=(220, 210, 195, 255))
            if "end" not in caption_cache: caption_cache["end"] = text_layer(d)
            return overlay(f, caption_cache["end"], min(1, lt / 1.0)) * min(1, (dur - lt) / 1.5)
    raise ValueError(sh)

def frame_at(t):
    i = next((k for k, (a, b, _) in enumerate(segs) if a <= t < b), len(segs) - 1)
    a, b, sh = segs[i]
    f = render_shot(sh, t - a, b - a, i)
    if i + 1 < len(segs) and t > b - XF and segs[i + 1][0] - b < 0.05:
        a2, b2, sh2 = segs[i + 1]
        w = (t - (b - XF)) / XF; w = w * w * (3 - 2 * w)
        f = f * (1 - w) + render_shot(sh2, t - a2, b2 - a2, i + 1) * w
    # dip to black around section boundaries and at start (cold open fade-in)
    k = 1.0
    for bd in bounds:
        dd = abs(t - bd)
        if dd < 0.9: k = min(k, dd / 0.9)
    if t < 2.0: k = min(k, t / 2.0)
    if abs(t - intro_start) < 0.4: k = min(k, abs(t - intro_start) / 0.4)
    if t > TOTAL - 1.5: k = min(k, (TOTAL - t) / 1.5)
    return np.clip(f * k, 0, 255).astype(np.uint8)

# ---------- audio ----------
def build_audio(path):
    import soundfile as sf
    SR = 24000
    out = np.zeros(int((TOTAL + 1) * SR), np.float32)
    for m in man:
        a, sr = sf.read(m["file"], dtype="float32"); o = int(sec_off[m["n"]] * SR)
        out[o:o + len(a)] += a
    out = out / max(1e-6, np.abs(out).max()) * 0.89
    sf.write(path, out[:int(TOTAL * SR)], SR)

if __name__ == "__main__":
    print("TOTAL", round(TOTAL, 1), "segments", len(segs), flush=True)
    json.dump({"sec_off": sec_off, "total": TOTAL, "segs": [(a, b, list(s)) for a, b, s in segs]},
              open(f"{S}/timeline.json", "w"), indent=1)
    if MOTION:  # precompute depth maps once (~3.5 s each on CPU), cached in S/depth
        need = sorted({img_for(sh[0], sh[1]) for _, _, sh in segs if sh[0] in ("ai", "art")})
        for k, pth in enumerate(need): M.depth(pth)
        print("depth maps", len(need), flush=True)
    apath = f"{S}/narration_timeline.wav"
    if not os.path.exists(apath): build_audio(apath)
    t1 = TOTAL if T1 is None else min(T1, TOTAL)
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-ss", str(T0), "-t", str(t1 - T0), "-i", apath,
           "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
           "-movflags", "+faststart", "-shortest", OUTMP4]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n0, n1 = int(T0 * FPS), int(t1 * FPS)
    for n in range(n0, n1):
        p.stdin.write(frame_at(n / FPS).tobytes())
        if (n - n0) % (FPS * 60) == 0: print("t=", round(n / FPS), flush=True)
    p.stdin.close(); p.wait(); print("DONE", OUTMP4)
