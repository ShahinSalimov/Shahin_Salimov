"""Procedural background score for the Bronze Age Collapse documentary (fully original, no samples).
Layers: tanpura-style drone + plucks, pad chords, bansuri-style flute melody, frame drum, wind.
Mood follows the narration timeline; music ducks under the voice."""
import sys, json, numpy as np, soundfile as sf
from scipy.signal import fftconvolve, lfilter, resample_poly

S = sys.argv[1]
SR = 32000
tl = json.load(open(f"{S}/timeline.json")); off = {int(k): v for k, v in tl["sec_off"].items()}
paras = json.load(open(f"{S}/paras.json"))
TOTAL = tl["total"]; N = int(TOTAL * SR) + SR
rng = np.random.default_rng(42)
BEAT = 60 / 66; BAR = 4 * BEAT; CH = 2 * BAR
def mtof(m): return 440 * 2 ** ((m - 69) / 12)
def pt(sec, p):  # absolute time of paragraph start
    q = next(x for x in paras if x["sec"] == sec and x["p"] == p)
    return off[sec] + (0 if p == 0 else q["start"])

# ---- mood cues (time, mood) ----
CUES = [(0, "tension"), (off[2] - 2, "swell"), (off[2], "epic"), (off[3], "warm"), (pt(3, 3), "day"), (pt(3, 5), "reflect"),
        (off[4], "voyage"), (pt(4, 4), "warm"), (off[5], "hook"), (off[6], "mystery"), (pt(6, 1), "tension"), (pt(6, 3), "storm"),
        (pt(6, 5), "decline"), (off[7], "hook"), (pt(7, 1), "tension"), (pt(7, 5), "storm"), (pt(7, 7), "migration"), (pt(7, 8), "mystery"),
        (off[8], "reflect"), (pt(8, 1), "drought"), (pt(8, 3), "tension"), (pt(8, 5), "decline"), (off[9], "storm"), (pt(9, 3), "reflect"),
        (off[10], "decline"), (pt(10, 1), "hope"), (pt(10, 4), "epic"), (off[11], "reflect"), (off[12], "hope"), (TOTAL - 21, "end")]
# per mood: layer gains (drone, pluck, pad, melody, perc, wind), progression, scale, melody density
MOODS = {
 "dark":     ((1.0, .0, .25, .35, 0, .9), "dark", "minor", .35),
 "swell":    ((1.0, .3, .9, .0, .5, .2), "dark", "minor", 0),
 "warm":     ((.7, .6, .6, .5, 0, 0), "warm", "dorian", .45),
 "epic":     ((.8, .5, .9, .6, .6, 0), "epic", "dorian", .5),
 "sacred":   ((.8, .7, .55, .45, 0, 0), "warm", "dorian", .4),
 "day":      ((.6, .7, .55, .7, .55, 0), "bright", "dorian", .65),
 "evening":  ((.7, .6, .6, .55, 0, .1), "warm", "dorian", .5),
 "tension":  ((.9, .2, .5, .2, 0, .2), "dark", "minor", .2),
 "hook":     ((.6, 0, 0, 0, 0, .15), "dark", "minor", 0),
 "mystery":  ((.9, .4, .5, .35, 0, .1), "dark", "minor", .35),
 "voyage":   ((.7, .6, .7, .65, .5, .15), "epic", "dorian", .6),
 "decline":  ((.9, .25, .55, .3, 0, .3), "decline", "minor", .3),
 "storm":    ((1.0, .1, .6, .15, .35, .6), "decline", "minor", .15),
 "drought":  ((.9, .2, .5, .3, 0, .5), "decline", "minor", .3),
 "migration":((.8, .4, .7, .55, .3, .2), "decline", "minor", .5),
 "hope":     ((.7, .6, .7, .6, 0, 0), "hope", "major", .5),
 "reflect":  ((.7, .5, .6, .4, 0, 0), "warm", "dorian", .35),
 "end":      ((.8, .6, .9, .7, .4, 0), "hope", "major", .7),
}
PROG = {"dark": [[50, 57, 62, 65], [50, 57, 62, 65], [48, 55, 60, 64], [50, 57, 62, 65]],
        "warm": [[50, 57, 62, 65], [53, 57, 60, 65], [48, 55, 60, 64], [50, 57, 62, 69]],
        "epic": [[50, 57, 62, 65], [48, 55, 60, 64], [46, 53, 58, 62], [45, 52, 57, 61]],
        "bright": [[50, 57, 62, 65], [55, 59, 62, 67], [53, 57, 60, 65], [55, 59, 62, 67]],
        "decline": [[50, 57, 62, 65], [46, 53, 58, 62], [43, 50, 55, 58], [45, 52, 57, 61]],
        "hope": [[50, 57, 62, 66], [55, 59, 62, 67], [57, 61, 64, 69], [50, 57, 62, 66]]}
SCALE = {"minor": [62, 64, 65, 67, 69, 70, 72, 74], "dorian": [62, 64, 65, 67, 69, 71, 72, 74],
         "major": [62, 64, 66, 69, 71, 74, 76]}

def mood_at(t):
    m = CUES[0][1]
    for ct, cm in CUES:
        if ct <= t: m = cm
    return m
# gain automation at 100 Hz with 3 s smoothing
CR = 100; tc = np.arange(int(TOTAL * CR) + CR) / CR
G = np.array([MOODS[mood_at(t)][0] for t in tc]).T  # 6 x n
k = np.ones(3 * CR) / (3 * CR)
G = np.array([np.convolve(np.pad(g, (len(k), len(k)), mode="edge"), k, "same")[len(k):-len(k)] for g in G])
def gain(i):
    return np.interp(np.arange(N) / SR, tc, G[i]).astype(np.float32)

def env(n, a, r):
    e = np.ones(n, np.float32); na, nr = int(a * SR), int(r * SR)
    e[:na] = np.linspace(0, 1, na) ** 1.5; e[n - nr:] *= np.linspace(1, 0, nr) ** 2; return e

# ---- drone (seamless 16 s loop) ----
L = 16; t = np.arange(L * SR) / SR
drone = np.zeros_like(t)
for m, a in ((38, 1.0), (45, .6), (50, .35)):
    f = round(mtof(m) * L) / L
    for h in range(1, 9):
        fh = round(f * h * L) / L
        drone += a / h ** 1.3 * np.sin(2 * np.pi * fh * t) * (1 + .3 * np.sin(2 * np.pi * t * (h % 4 + 1) / L))
drone = (drone / np.abs(drone).max()).astype(np.float32)
DR = np.tile(drone, N // len(drone) + 1)[:N]

# ---- tanpura-like pluck ----
def pluck(m, dur=4.5):
    n = int(dur * SR); tt = np.arange(n) / SR; f = mtof(m); y = np.zeros(n)
    for h in range(1, 16):
        y += (1 / h ** .8) * np.sin(2 * np.pi * f * h * tt * (1 + .0004 * h)) * np.exp(-tt * (0.6 + .25 * h))
    y *= np.minimum(1, tt / .004)
    return (y / np.abs(y).max()).astype(np.float32)
PL = {m: pluck(m) for m in (45, 50, 38)}
plk = np.zeros(N, np.float32); TP = 1.2 * BEAT * 4 / 4 * 1.25
pos = 0.0; pat = [45, 50, 50, 38]; i = 0
while pos < TOTAL:
    s = int(pos * SR); p = PL[pat[i % 4]]; e = min(N, s + len(p)); plk[s:e] += p[:e - s] * (.8 if i % 4 else 1)
    pos += BEAT * 1.25; i += 1

# ---- pads ----
pad_cache = {}
def pad(ch):
    key = tuple(ch)
    if key in pad_cache: return pad_cache[key]
    n = int((CH + 3) * SR); tt = np.arange(n) / SR; y = np.zeros(n)
    for m in ch:
        for det in (-.006, 0, .006):
            f = mtof(m) * (1 + det)
            for h in range(1, 7):
                y += (1 / h ** 1.6) * np.sin(2 * np.pi * f * h * tt + rng.random() * 6.28) * (1 + .25 * np.sin(2 * np.pi * .13 * tt + h))
    y = y / np.abs(y).max() * env(n, 1.8, 2.8)
    pad_cache[key] = y.astype(np.float32); return pad_cache[key]
pads = np.zeros(N, np.float32); ci = 0; pos = 0.0
while pos < TOTAL:
    prog = PROG[MOODS[mood_at(pos + 1)][1]]; p = pad(prog[ci % 4]); s = int(pos * SR); e = min(N, s + len(p))
    pads[s:e] += p[:e - s]; pos += CH; ci += 1

# ---- flute melody ----
def flute(m, dur, vel):
    n = int((dur + .5) * SR); tt = np.arange(n) / SR; f = mtof(m)
    vib = 1 + .005 * np.sin(2 * np.pi * 5.2 * tt) * np.minimum(1, np.maximum(0, tt - .35) / .4)
    ph = 2 * np.cumsum(np.pi * f * vib) / SR
    y = np.sin(ph) + .28 * np.sin(2 * ph) + .1 * np.sin(3 * ph) + .04 * np.sin(4 * ph)
    br = lfilter([1, -0.6], [1], rng.standard_normal(n)) * .05
    y = (y + br) * env(n, .14, min(.5, dur * .5)) * vel
    return y.astype(np.float32)
mel = np.zeros(N, np.float32); pos = 2 * BAR
while pos < TOTAL - 4:
    md = MOODS[mood_at(pos)]; dens = md[3]
    if rng.random() < dens:
        sc = SCALE[md[2]]; idx = rng.choice([0, 2, 4]); t0 = pos
        nnotes = rng.integers(3, 7)
        for j in range(nnotes):
            dur = rng.choice([1, 1, 1.5, 2, 3]) * BEAT if j < nnotes - 1 else rng.choice([3, 4]) * BEAT
            if t0 + dur > TOTAL - 2: break
            y = flute(sc[idx], dur, .55 + .3 * rng.random()); s = int(t0 * SR); e = min(N, s + len(y))
            mel[s:e] += y[:e - s]; t0 += dur
            idx = int(np.clip(idx + rng.choice([-2, -1, -1, 1, 1, 2]), 0, len(sc) - 1))
        pos = t0 + rng.choice([1, 2]) * BAR
    else:
        pos += BAR

# ---- frame drum ----
def drum(f0, n=int(.6 * SR)):
    tt = np.arange(n) / SR; f = f0 * (1 + .6 * np.exp(-tt * 25))
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 7) + .25 * lfilter([.15], [1, -.85], rng.standard_normal(n)) * np.exp(-tt * 40)
    return (y / np.abs(y).max()).astype(np.float32)
D1, D2 = drum(62), drum(95)
perc = np.zeros(N, np.float32); pos = 0.0
while pos < TOTAL:
    for b, d, v in ((0, D1, 1.0), (1.5, D2, .45), (2, D1, .7), (3.5, D2, .35)):
        s = int((pos + b * BEAT) * SR); e = min(N, s + len(d))
        if s < N: perc[s:e] += d[:e - s] * v
    pos += BAR

# ---- wind ----
wind = lfilter([1], [1, -1.97, .971], rng.standard_normal(N)).astype(np.float32)
wind *= (1 + .5 * np.sin(2 * np.pi * np.arange(N) / SR / 7.3)).astype(np.float32)
wind /= np.percentile(np.abs(wind), 99.5)

# ---- reverb ----
irn = int(2.8 * SR); ir = (rng.standard_normal(irn) * np.exp(-np.arange(irn) / SR * 2.4)).astype(np.float32); ir /= np.sqrt((ir ** 2).sum())
def rev(x, wet):
    y = fftconvolve(x, ir)[:len(x)].astype(np.float32); return x * (1 - wet) + y * wet

def norm(x): return x / (np.sqrt(np.mean(x ** 2)) + 1e-9)
music = (.30 * norm(DR) * gain(0) + .16 * rev(norm(plk), .35) * gain(1) + .20 * rev(norm(pads), .3) * gain(2)
         + .20 * rev(norm(mel), .4) * gain(3) + .14 * norm(perc) * gain(4) + .10 * norm(wind) * gain(5))
fade = np.ones(N, np.float32); fade[:int(3 * SR)] = np.linspace(0, 1, int(3 * SR)); fade[-int(4 * SR):] = np.linspace(1, 0, int(4 * SR))
music *= fade
music = music[:int(TOTAL * SR)]

# ---- ducking under narration ----
voice, vsr = sf.read(f"{S}/narration_timeline.wav", dtype="float32")
v = resample_poly(voice, SR, vsr)[:len(music)]; v = np.pad(v, (0, len(music) - len(v)))
hop = SR // 100; rms = np.sqrt(np.convolve(v ** 2, np.ones(hop * 3) / (hop * 3), "same")[::hop])
act = (rms > 0.01).astype(float)
# hold 0.6 s, attack 0.15 s, release 0.8 s
act = np.convolve(act, np.ones(60), "same") > 0
g = np.empty(len(act)); cur = 1.0
for i, a in enumerate(act):
    tgt = 0.17 if a else 1.0
    cur += (tgt - cur) * (1 / 15 if tgt < cur else 1 / 80); g[i] = cur
duck = np.interp(np.arange(len(music)), np.arange(len(g)) * hop, g).astype(np.float32)
music = music * duck
music = np.tanh(music * 1.2) / 1.2
music *= 0.26 / np.abs(music).max()  # music peak ~ -7.5 dBFS before mix, sits under voice when ducked
sf.write(f"{S}/music_stem.wav", music, SR)
mix = v * 0.95 + music
mix /= max(1.0, np.abs(mix).max() / 0.97)
sf.write(f"{S}/mix.wav", mix, SR)
print("music rms dB under voice:", 20 * np.log10(np.sqrt(np.mean((music[act.repeat(hop)[:len(music)]]) ** 2)) + 1e-9),
      "voice rms dB:", 20 * np.log10(np.sqrt(np.mean(v[np.abs(v) > 0.01] ** 2))))
