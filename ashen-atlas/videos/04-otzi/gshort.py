"""YouTube Shorts (9:16, 25-33 s) for Video #4 Ötzi the Iceman: arrow, tattoos."""
import sys, os, json, subprocess, numpy as np, cv2, soundfile as sf
from PIL import Image, ImageDraw, ImageFont
from scipy.signal import fftconvolve, lfilter, resample_poly
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen as G
S = sys.argv[1]; STEP = sys.argv[2]; ID = sys.argv[3]
OUT = f"{S}/short_{ID}"; os.makedirs(OUT, exist_ok=True)
W, H, FPS = 1080, 1920, 30
MOTION = os.environ.get("MOTION", "1") != "0"  # 2.5D depth parallax + atmosphere (motion.py)

END = ("Follow for more lost worlds. Full documentary on YouTube.", "FOLLOW FOR MORE", [])
from shots import OTZI, MUMMY
FACE = "extreme close-up portrait of a " + OTZI + ", intense eyes looking into camera, snowy mountain background, cold light"
SPECS = {
"arrow": [
 ("He was shot in the back, five thousand three hundred years ago.", "SHOT IN THE BACK", [FACE]),
 ("In 1991, hikers found him melting out of the ice in the Alps.", "FOUND IN 1991", [MUMMY]),
 ("For ten years, everyone thought he froze to death.", "FROZE TO DEATH?",
  ["Copper Age man lying in the snow during a blizzard in the high mountains, exhausted, night"]),
 ("Then an X-ray showed a flint arrowhead in his shoulder.", "AN ARROWHEAD",
  ["black and white X-ray of a human shoulder blade and ribs with one small bright white triangular stone point inside, dark background"]),
 ("It tore an artery. He probably bled to death in minutes.", "DEAD IN MINUTES",
  ["archer seen from behind drawing a bow, aiming at a distant resting man in a snowy rocky gully, dusk"]),
 ("And his killer left his precious copper axe behind. Why?", "WHY LEAVE THE AXE?",
  ["prehistoric axe with a short narrow copper blade wedged into a crooked wooden handle bound with leather, lying on snowy rocks, close-up"]),
 END],
"tattoos": [
 ("This man had sixty-one tattoos, five thousand years ago.", "61 TATTOOS", [FACE]),
 ("No pictures. Just short lines and small crosses.", "LINES AND CROSSES",
  ["close-up of a tanned muscular bare lower back of a man with three small groups of short black parallel line tattoos, firelight, simple tattoos"]),
 ("They were cut into the skin, and rubbed with charcoal.", "CHARCOAL",
  ["Copper Age healer cutting short lines into a man's knee skin with a small flint blade and rubbing in black charcoal, firelight, close-up"]),
 ("Most sit on his back, knees and ankles, where his joints were worn.", "WHERE IT HURT",
  ["close-up of a man's bare tanned ankle with a small black cross tattoo and three short black line tattoos, firelight"]),
 ("So they may have been a treatment for pain.", "ANCIENT MEDICINE?",
  ["Copper Age man lying on furs while a healer presses charcoal into small cuts on his lower back, hut, firelight"]),
 ("Days later, someone shot him in the back with an arrow.", "THEN HE WAS MURDERED",
  ["silhouette of an archer drawing a bow behind a boulder on a snowy alpine slope, dusk, mist"]),
 END],
}
SEGS = SPECS[ID]
TT_MODE = os.environ.get("TT") == "1"
if TT_MODE:
    SEGS = SEGS[:-1] + [("Follow for more lost worlds. The full documentary is on YouTube.", "FOLLOW FOR MORE", [])]
def full(p): return G.full("ai", p) + ", vertical composition"

if STEP == "img":
    import torch
    from diffusers import AutoPipelineForText2Image
    torch.set_num_threads(4)
    pipe = AutoPipelineForText2Image.from_pretrained("stabilityai/sdxl-turbo", dtype=torch.bfloat16, variant="fp16")
    pipe.set_progress_bar_config(disable=True)
    for i, (_, _, ps) in enumerate(SEGS):
        for j, p in enumerate(ps):
            fn = f"{OUT}/img_{i}_{j}.png"
            if os.path.exists(fn): continue
            pipe(full(p), num_inference_steps=4, guidance_scale=0.0, width=576, height=1024,
                 generator=torch.Generator().manual_seed(int(os.environ.get("SEED", 3300)) + 10 * i + j)).images[0].save(fn)
            print("img", i, j, flush=True)
    sys.exit()

# ---------- voice ----------
from kokoro_onnx import Kokoro
k = Kokoro(f"{S}/models/kokoro-v1.0.onnx", f"{S}/models/voices-v1.0.bin")
SR = 24000; lines = []
for txt, _, _ in SEGS:
    a, _ = k.create(txt.replace("1991", "nineteen ninety-one"), voice="am_michael", speed=1.12, lang="en-us")
    idx = np.where(np.abs(a) > .01)[0]; a = a[max(0, idx[0] - 240): idx[-1] + 2400]; lines.append(a.astype(np.float32))
# timeline: segment = its line + pause; target ~55 s
pause = [0.3] * (len(SEGS) - 1) + [0.0]
starts = []; t = 0.25
for a, p in zip(lines, pause): starts.append(t); t += len(a) / SR + p
TOTAL = t + 1.6; seg_bounds = starts + [TOTAL]
voice = np.zeros(int(TOTAL * SR) + SR, np.float32)
for a, s in zip(lines, starts): voice[int(s * SR): int(s * SR) + len(a)] += a
voice = voice[:int(TOTAL * SR)]
print("TOTAL", round(TOTAL, 2), [round(x, 2) for x in starts])

# ---------- music (energetic short cue, D dorian) ----------
MSR = 32000; N = int(TOTAL * MSR); rng = np.random.default_rng(7); tt = np.arange(N) / MSR
BEAT = 60 / 92
def mtof(m): return 440 * 2 ** ((m - 69) / 12)
drone = sum(a / h ** 1.3 * np.sin(2 * np.pi * mtof(m) * h * tt) for m, a in ((38, 1), (45, .6)) for h in range(1, 7))
def note(m, dur, kind):
    n = int((dur + .6) * MSR); x = np.arange(n) / MSR; f = mtof(m)
    if kind == "pluck":
        y = sum((1 / h ** .8) * np.sin(2 * np.pi * f * h * x) * np.exp(-x * (2 + .5 * h)) for h in range(1, 12))
    else:
        ph = 2 * np.pi * np.cumsum(f * (1 + .005 * np.sin(2 * np.pi * 5.2 * x) * np.minimum(1, x / .5))) / MSR
        y = (np.sin(ph) + .28 * np.sin(2 * ph) + .1 * np.sin(3 * ph)) * np.minimum(1, x / .08) * np.minimum(1, np.maximum(0, dur + .5 - x) / .5)
    return y.astype(np.float32)
def add(buf, y, t0, g):
    s = int(t0 * MSR); e = min(len(buf), s + len(y)); buf[s:e] += y[:e - s] * g
pl = np.zeros(N, np.float32); fl = np.zeros(N, np.float32); dr = np.zeros(N, np.float32)
arp = [50, 57, 62, 65, 69, 65, 62, 57]; chords = [0, 0, -2, -2, 3, 3, -2, 0]
b = 0; t = 0.0
while t < TOTAL:
    add(pl, note(arp[b % 8] + chords[(b // 8) % 8], .4, "pluck"), t, .8 if b % 4 == 0 else .5); t += BEAT / 2; b += 1
def kick(f0):
    n = int(.5 * MSR); x = np.arange(n) / MSR; f = f0 * (1 + .7 * np.exp(-x * 30))
    return (np.sin(2 * np.pi * np.cumsum(f) / MSR) * np.exp(-x * 8)).astype(np.float32)
K1, K2 = kick(60), kick(100)
t = seg_bounds[1]  # drums enter at segment 2
while t < seg_bounds[5]:
    for off, d, g in ((0, K1, 1), (1.5, K2, .5), (2, K1, .7), (3, K2, .4), (3.5, K2, .3)): add(dr, d, t + off * BEAT, g)
    t += 4 * BEAT
mel = [(74, 2), (72, 1), (69, 1), (67, 2), (69, 2), (65, 1), (67, 1), (69, 4), (62, 2), (65, 2), (67, 2), (69, 2), (72, 2), (74, 6)]
t = seg_bounds[2]
for m, d in mel:
    if t > TOTAL - 2: break
    add(fl, note(m, d * BEAT * .95, "flute"), t, .6); t += d * BEAT
ir = (rng.standard_normal(int(2.2 * MSR)) * np.exp(-np.arange(int(2.2 * MSR)) / MSR * 2.8)).astype(np.float32); ir /= np.sqrt((ir ** 2).sum())
def rev(x, w): return x * (1 - w) + fftconvolve(x, ir)[:len(x)].astype(np.float32) * w
def nm(x): return x / (np.sqrt(np.mean(x ** 2)) + 1e-9)
# mood automation: dark open, full middle, drums out for "why did they leave", outro swell
gD = np.interp(tt, [0, seg_bounds[5], TOTAL], [1, 1, .8])
gP = np.interp(tt, [0, 1.5, seg_bounds[5] - .5, seg_bounds[5] + .5, seg_bounds[6], TOTAL], [.3, .8, .8, .35, .5, .9])
gF = np.interp(tt, [0, seg_bounds[5], seg_bounds[5] + 1, TOTAL], [1, 1, .8, 1])
music = .28 * nm(drone) * gD + .22 * rev(nm(pl), .3) * gP + .2 * nm(dr) + .22 * rev(nm(fl), .35) * gF
music *= np.minimum(1, tt / 1.0) * np.minimum(1, (TOTAL - tt) / 1.5)
v = resample_poly(voice, MSR, SR)[:N]; v = np.pad(v, (0, N - len(v)))
hop = MSR // 100; rms = np.sqrt(np.convolve(v ** 2, np.ones(hop * 3) / (hop * 3), "same")[::hop])
act = np.convolve((rms > .01).astype(float), np.ones(40), "same") > 0
g = np.empty(len(act)); cur = 1.0
for i, a in enumerate(act):
    tgt = .3 if a else 1.0; cur += (tgt - cur) * (1 / 10 if tgt < cur else 1 / 40); g[i] = cur
music = music * np.interp(np.arange(N), np.arange(len(g)) * hop, g)
music = np.tanh(music * 1.2); music *= .3 / np.abs(music).max()
mix = v + music; mix /= max(1, np.abs(mix).max() / .97)
sf.write(f"{OUT}/mix" + ("_tt" if TT_MODE else "") + ".wav", mix.astype(np.float32), MSR)

# ---------- captions (word chunks timed by characters) ----------
caps = []
for (txt, _, _), a, s in zip(SEGS, lines, starts):
    words = txt.split(); chunks = []; cur = []
    for w in words:
        cur.append(w)
        if len(" ".join(cur)) > 14 or w[-1] in ".,?": chunks.append(" ".join(cur)); cur = []
    if cur: chunks.append(" ".join(cur))
    tot = sum(len(c) + 2 for c in chunks); t = s; d = len(a) / SR
    for c in chunks:
        dd = d * (len(c) + 2) / tot; caps.append((t, t + dd, c)); t += dd

# ---------- render ----------
BOLD = "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf"; SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
CREAM = (250, 242, 225); ORANGE = (240, 130, 50); GOLD = (212, 169, 98)
def F(p, s): return ImageFont.truetype(p, s)
srcs = {}
def src(path):
    if path not in srcs:
        im = cv2.imread(path)[:, :, ::-1]; big = cv2.resize(im, (int(W * 1.15), int(H * 1.15)), interpolation=cv2.INTER_LANCZOS4)
        bl = cv2.GaussianBlur(big, (0, 0), 1.2); srcs[path] = cv2.addWeighted(big, 1.35, bl, -.35, 0)
    return srcs[path]
def kb(s, u, mode):
    sh, sw = s.shape[:2]; z = 1 + .15 * (u if mode % 2 == 0 else 1 - u); vw, vh = sw / z, sh / z
    px = .5 if mode % 3 else .3 + .4 * u; cx = vw / 2 + (sw - vw) * px; cy = vh / 2 + (sh - vh) * .5; sc = W / vw
    M = np.float32([[sc, 0, W / 2 - sc * cx], [0, sc, H / 2 - sc * cy]])
    return cv2.warpAffine(s, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
yy, xx = np.mgrid[0:H, 0:W]; r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
VIG = np.clip(1 - .3 * np.clip(r - .6, 0, None) ** 1.5 * 1.6, .55, 1).astype(np.float32)[..., None]
if MOTION:
    import motion as M
    M.init(OUT); M.set_size(W, H)
shots = []
for i, (_, _, ps) in enumerate(SEGS):
    a, b = seg_bounds[i], seg_bounds[i + 1]
    if i == 0: a = 0
    if not ps: shots.append((a, b, None, "")); continue
    d = (b - a) / len(ps)
    for j in range(len(ps)): shots.append((a + j * d, a + (j + 1) * d, f"{OUT}/img_{i}_{j}.png", ps[j]))
logo = Image.open(f"{S}/img/i-001.png").convert("RGBA").resize((560, 560), Image.LANCZOS)
m = Image.new("L", (2240, 2240), 0); ImageDraw.Draw(m).ellipse((160, 160, 2080, 2080), fill=255); logo.putalpha(m.resize((560, 560), Image.LANCZOS))
lay_cache = {}
def layer(key, fn):
    if key not in lay_cache:
        L = Image.new("RGBA", (W, H), (0, 0, 0, 0)); fn(ImageDraw.Draw(L), L); lay_cache[key] = np.asarray(L, np.float32)
    return lay_cache[key]
def over(f, L, a=1.0):
    al = L[..., 3:4] / 255 * a; return f * (1 - al) + L[..., :3] * al
def title_layer(text):
    def d(dr, L):
        fnt = F(BOLD, 74); tw = dr.textlength(text, font=fnt)
        while tw > W - 140: fnt = F(BOLD, fnt.size - 4); tw = dr.textlength(text, font=fnt)
        x = (W - tw) / 2; y = 260
        dr.rounded_rectangle((x - 36, y - 24, x + tw + 36, y + fnt.size + 34), 18, fill=(15, 10, 8, 200))
        dr.rectangle((x - 36, y + fnt.size + 28, x + tw + 36, y + fnt.size + 34), fill=ORANGE + (255,))
        dr.text((x, y), text, font=fnt, fill=CREAM + (255,))
    return layer(("t", text), d)
def cap_layer(text):
    def d(dr, L):
        fnt = F(BOLD, 86); tw = dr.textlength(text.upper(), font=fnt)
        while tw > W - 120: fnt = F(BOLD, fnt.size - 4); tw = dr.textlength(text.upper(), font=fnt)
        x = (W - tw) / 2; y = 1300
        dr.text((x, y), text.upper(), font=fnt, fill=(255, 255, 255, 255), stroke_width=9, stroke_fill=(0, 0, 0, 255))
    return layer(("c", text), d)
def end_layer():
    def d(dr, L):
        L.alpha_composite(logo, ((W - 560) // 2, 560))
        fnt = F(SERIF, 70); t = "ASHEN CROWN"; tw = dr.textlength(t, font=fnt); dr.text(((W - tw) / 2, 1180), t, font=fnt, fill=GOLD + (255,))
    return layer(("end",), d)
def frame(t):
    i = next((k for k, (a, b, *_) in enumerate(shots) if a <= t < b), len(shots) - 1)
    def shot(k, t):
        a, b, p, pr = shots[k]; u = min(1, max(0, (t - a) / (b - a)))
        if p is None: return np.zeros((H, W, 3), np.float32) + 14
        if MOTION: return M.frame(p, pr, u, t - a, k, VIG)
        return kb(src(p), u, k).astype(np.float32) * VIG
    f = shot(i, t); a, b = shots[i][:2]
    if i + 1 < len(shots) and t > b - .35:
        w = (t - (b - .35)) / .35; f = f * (1 - w) + shot(i + 1, t) * w
    seg = next((k for k in range(len(SEGS)) if seg_bounds[k] <= t < seg_bounds[k + 1]), len(SEGS) - 1)
    if seg == 0 and t < seg_bounds[0]: seg = 0
    if seg == len(SEGS) - 1:
        f = over(f, end_layer(), min(1, (t - seg_bounds[-2]) / .4))
    ta = min(1, (t - (0 if seg == 0 else seg_bounds[seg])) / .25)
    f = over(f, title_layer(SEGS[seg][1]), ta)
    c = next((c for c in caps if c[0] <= t < c[1]), None)
    if c: f = over(f, cap_layer(c[2]))
    if t < .3: f *= t / .3
    if t > TOTAL - .6: f *= max(0, (TOTAL - t) / .6)
    return np.clip(f, 0, 255).astype(np.uint8)
mp4 = f"{S}/deliver/Short_{ID}_9x16" + ("_TikTok" if TT_MODE else "") + ".mp4"
cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
       "-i", f"{OUT}/mix" + ("_tt" if TT_MODE else "") + ".wav", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
       "-c:a", "aac", "-ar", "48000", "-b:a", "192k", "-shortest", "-movflags", "+faststart", mp4]
p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
for n in range(int(TOTAL * FPS)): p.stdin.write(frame(n / FPS).tobytes())
p.stdin.close(); p.wait(); print("DONE", mp4)
