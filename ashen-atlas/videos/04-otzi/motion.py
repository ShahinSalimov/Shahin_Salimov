"""2.5D motion for still AI images: depth parallax camera + atmospheric effects.

Usage from render.py:
    import motion as M
    M.init(S)                       # S = work dir; depth maps cached in S/depth
    f = M.frame(path, prompt, u, t, idx, vig)   # float32 HxWx3, 0..255

Prep (optional, faster renders):  python motion.py S img1.png img2.png ...
Depth model: depth-anything/Depth-Anything-V2-Small-hf on CPU (~3.5 s per image).
"""
import os, sys, hashlib, math
import numpy as np, cv2

W, H = 1920, 1080
MARGIN = 1.10          # source is scaled this much larger than the frame (room for parallax)
_S = None
_pipe = None
_cache = {}

def init(S):
    global _S
    _S = S; os.makedirs(f"{S}/depth", exist_ok=True)

def _key(path): return hashlib.md5(os.path.abspath(path).encode()).hexdigest()[:16]

def _model():
    global _pipe
    if _pipe is None:
        os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
        from transformers import pipeline
        _pipe = pipeline("depth-estimation", model="depth-anything/Depth-Anything-V2-Small-hf", device="cpu")
    return _pipe

def depth(path):
    """Normalized near=1 / far=0 depth, same size as the image, edges softened."""
    f = f"{_S}/depth/{_key(path)}.npy"
    if os.path.exists(f): return np.load(f).astype(np.float32)
    from PIL import Image
    im = Image.open(path).convert("RGB")
    d = _model()(im)["predicted_depth"].squeeze().numpy().astype(np.float32)
    d = cv2.resize(d, im.size, interpolation=cv2.INTER_CUBIC)
    lo, hi = np.percentile(d, 2), np.percentile(d, 98)
    d = np.clip((d - lo) / max(hi - lo, 1e-6), 0, 1)
    # grow foreground slightly and blur so edges stretch instead of tearing
    k = max(5, im.size[0] // 90) | 1
    d = cv2.dilate(d, np.ones((k, k), np.uint8))
    d = cv2.GaussianBlur(d, (0, 0), k * 0.8)
    np.save(f, d.astype(np.float16)); return d

def _src(path):
    if path in _cache: return _cache[path]
    im = cv2.imread(path)[:, :, ::-1]
    sw, sh = int(W * MARGIN), int(H * MARGIN)
    big = cv2.resize(im, (sw, sh), interpolation=cv2.INTER_LANCZOS4)
    blur = cv2.GaussianBlur(big, (0, 0), 1.2)
    big = cv2.addWeighted(big, 1.3, blur, -0.3, 0)
    d = cv2.resize(depth(path), (sw, sh), interpolation=cv2.INTER_LINEAR)
    if len(_cache) > 8: _cache.pop(next(iter(_cache)))
    _cache[path] = (big, d); return _cache[path]

# ---------- camera ----------
def set_size(w, h):
    """Output size: 1920x1080 for long videos (default), 1080x1920 for Shorts."""
    global W, H, GX, GY, _GRAIN, FOGY
    W, H = w, h; _cache.clear()
    GX, GY = np.meshgrid(np.arange(W, dtype=np.float32) - W / 2, np.arange(H, dtype=np.float32) - H / 2)
    r = np.random.default_rng(7)
    _GRAIN = [r.normal(0, 1, (H // 2, W // 2)).astype(np.float32) for _ in range(6)]
    FOGY = np.linspace(0.35, 1.0, H // 2, dtype=np.float32)[:, None] ** 1.5   # heavier near the ground
#            zoom0  zoom1  shift_x  shift_y  dolly (near-layer magnification)
MOVES = [(1.00, 1.07, 0.0, 0.0, 0.07),    # push-in
         (1.04, 1.04, 1.0, 0.0, 0.02),    # truck right
         (1.03, 1.08, -0.7, 0.0, 0.05),   # push-in + drift left
         (1.04, 1.04, 0.0, -1.0, 0.02),   # crane up
         (1.08, 1.01, 0.4, 0.0, -0.05),   # pull-out
         (1.04, 1.04, -1.0, 0.0, 0.02)]   # truck left
AMP = 70.0   # px of relative motion between nearest and farthest layer, at full move

def camera(path, u, idx):
    big, d = _src(path)
    sh_, sw_ = big.shape[:2]
    z0, z1, ax, ay, dz = MOVES[idx % len(MOVES)]
    z = z0 + (z1 - z0) * u
    s = 1.0 / z                                # src px per output px; view = W/z of a W*MARGIN source
    cx, cy = sw_ / 2, sh_ / 2
    bx = cx + GX * s; by = cy + GY * s
    dc = cv2.remap(d, bx, by, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT) - 0.5
    m = (u - 0.5)
    mx = bx - dc * AMP * ax * m * 2 - (bx - cx) * dc * dz * u
    my = by - dc * AMP * ay * m * 2 - (by - cy) * dc * dz * u
    return cv2.remap(big, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT).astype(np.float32)

# ---------- effects ----------
FIRE = ("fire", "torch", "flame", "burning", "burn", "ember", "hearth", "lamp", "brazier", "smoke", "ash", "kiln")
FOG = ("sea", "ship", "coast", "shore", "mist", "fog", "dawn", "storm", "rain", "smoke", "harbor", "harbour",
       "ice", "snow", "glacier", "mountain", "valley", "river", "night", "ruin", "drought", "dust")

def effects_for(prompt):
    p = (prompt or "").lower()
    fx = {"dust"}
    if any(w in p for w in FIRE): fx |= {"embers", "flicker"}
    if any(w in p for w in FOG): fx.add("fog")
    if any(w in p for w in ("snow", "blizzard", "ice", "glacier")): fx.add("snow")
    return fx

def _fog_tex():
    r = np.random.default_rng(3)
    acc = np.zeros((270, 960), np.float32)
    for sc, a in ((8, 1.0), (16, 0.5), (32, 0.25)):
        n = r.random((270 // sc + 2, 960 // sc + 2)).astype(np.float32)
        acc += a * cv2.resize(n, (960 + 2 * sc, 270 + 2 * sc), interpolation=cv2.INTER_CUBIC)[sc:sc + 270, sc:sc + 960]
    acc = (acc - acc.min()) / (acc.max() - acc.min())
    acc = np.hstack([acc, acc[:, ::-1]])            # seamless horizontally
    return cv2.GaussianBlur(acc, (0, 0), 6)
FOGTEX = _fog_tex()
set_size(W, H)

def _particles(idx, n, kind):
    r = np.random.default_rng(1000 + idx * 7 + (0 if kind == "dust" else 1 if kind == "embers" else 2))
    return dict(x=r.random(n), y=r.random(n), sz=r.uniform(0.6, 2.2, n), b=r.uniform(0.3, 1.0, n),
                vx=r.uniform(-0.012, 0.012, n), vy=r.uniform(-0.01, 0.006, n), ph=r.random(n) * 6.28)

def _draw(layer, P, t, kind):
    h, w = layer.shape[:2]
    if kind == "dust":
        x = (P["x"] + P["vx"] * t + 0.004 * np.sin(t * 0.7 + P["ph"])) % 1
        y = (P["y"] + P["vy"] * t + 0.004 * np.cos(t * 0.5 + P["ph"])) % 1
        col = lambda b: (b * 170, b * 160, b * 140)
    elif kind == "embers":
        x = (P["x"] + 0.02 * np.sin(t * 1.3 + P["ph"]) + P["vx"] * t) % 1
        y = (P["y"] - (0.07 + 0.06 * P["b"]) * t) % 1
        col = lambda b: (min(255, b * 380), b * 170, b * 40)
    else:  # snow
        x = (P["x"] + 0.015 * np.sin(t * 0.8 + P["ph"]) + 0.01 * t) % 1
        y = (P["y"] + (0.03 + 0.03 * P["b"]) * t) % 1
        col = lambda b: (b * 220, b * 225, b * 235)
    for i in range(len(x)):
        b = P["b"][i] * (0.6 + 0.4 * math.sin(t * 2.1 + P["ph"][i])) if kind == "embers" else P["b"][i]
        cv2.circle(layer, (int(x[i] * w), int(y[i] * h)), max(1, int(P["sz"][i] * {"dust": 1.0, "embers": 1.6, "snow": 1.4}[kind])),
                   col(b), -1, cv2.LINE_AA)

_pcache = {}
def apply_fx(f, fx, t, idx):
    h2, w2 = H // 2, W // 2
    if "flicker" in fx:
        k = 1 + 0.035 * math.sin(t * 9.1) + 0.025 * math.sin(t * 14.3 + 1) + 0.02 * math.sin(t * 3.7)
        f = f * np.array([k, 0.5 + 0.5 * k, 1.0], np.float32)
    if "fog" in fx:
        off = int(t * 18) % FOGTEX.shape[1]
        tex = np.roll(FOGTEX, -off, axis=1)[:, :min(w2, FOGTEX.shape[1])]
        tex = cv2.resize(tex, (w2, h2)) * FOGY
        a = cv2.resize(tex, (W, H))[..., None] * 0.16
        f = f * (1 - a) + np.array([200, 196, 188], np.float32) * a
    layer = np.zeros((h2, w2, 3), np.float32)
    for kind, n in (("dust", 45), ("embers", 70), ("snow", 120)):
        if kind in fx:
            key = (idx, kind)
            if key not in _pcache: _pcache[key] = _particles(idx, n, kind)
            _draw(layer, _pcache[key], t, kind)
    if layer.any():
        glow = cv2.GaussianBlur(layer, (0, 0), 2.5)
        layer = cv2.resize(layer * 0.8 + glow * 1.6, (W, H), interpolation=cv2.INTER_LINEAR)
        f = f + layer * (0.55 if fx == {"dust"} else 0.8)
    # light grain, refreshed ~6x/s: per-frame noise triples the file size and turns to blocks at upload bitrates
    g = cv2.resize(_GRAIN[int(t * 6) % len(_GRAIN)], (W, H), interpolation=cv2.INTER_LINEAR)
    return f + g[..., None] * 1.6

def frame(path, prompt, u, t, idx, vig=None):
    f = camera(path, u, idx)
    if vig is not None: f = f * vig
    return apply_fx(f, effects_for(prompt), t, idx)

if __name__ == "__main__":
    init(sys.argv[1])
    for i, p in enumerate(sys.argv[2:]):
        depth(p); print("depth", i + 1, len(sys.argv) - 2, flush=True)
