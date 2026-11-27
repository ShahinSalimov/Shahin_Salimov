"""Synthesize an original dark documentary ambient bed. usage: music.py out.wav seconds [seed] [mood]
mood: doc (slow minor pads) | drive (pads + pulse, for shorts)"""
import sys, numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt, fftconvolve

out, secs = sys.argv[1], float(sys.argv[2])
seed = int(sys.argv[3]) if len(sys.argv) > 3 else 1
mood = sys.argv[4] if len(sys.argv) > 4 else "doc"
SR = 48000
rng = np.random.default_rng(seed)
n = int(secs * SR)
t = np.arange(n) / SR

def midi(m): return 440 * 2 ** ((m - 69) / 12)

# chord progressions (minor, cinematic)
progs = [[(45, 52, 57, 60, 64), (41, 48, 53, 57, 60), (36, 48, 52, 55, 60), (43, 50, 55, 59, 62)],   # Am F C G
         [(38, 50, 53, 57, 62), (46, 53, 58, 62, 65), (41, 53, 57, 60, 65), (45, 52, 57, 61, 64)]]   # Dm Bb F A
prog = progs[seed % 2]
bar = 8.0 if mood == "doc" else 4.0
pad = np.zeros(n)
nbars = int(np.ceil(secs / bar)) + 1
for b in range(nbars):
    ch = prog[b % len(prog)]
    s0 = int(max(0, (b * bar - 1.5)) * SR); s1 = min(n, int(((b + 1) * bar + 1.5) * SR))
    if s0 >= n: break
    seg_t = np.arange(s1 - s0) / SR
    env = np.minimum(1, seg_t / 2.0) * np.minimum(1, (seg_t[::-1]) / 2.0)
    for k, m in enumerate(ch):
        f = midi(m)
        for det in (-0.12, 0.0, 0.11):
            ph = rng.uniform(0, 2 * np.pi)
            w = 2 * np.pi * f * (1 + det / 100) * seg_t + ph
            # soft saw approximation (few harmonics)
            v = np.sin(w) + 0.35 * np.sin(2 * w) + 0.15 * np.sin(3 * w)
            pad[s0:s1] += v * env * (0.9 if k == 0 else 0.5)
# slow filter sweep via two lowpasses crossfaded
lo = sosfilt(butter(2, 500, fs=SR, output="sos"), pad)
hi = sosfilt(butter(2, 1400, fs=SR, output="sos"), pad)
lfo = 0.5 + 0.5 * np.sin(2 * np.pi * t / 32)
pad = lo * (1 - lfo) + hi * lfo
# sub pulse
sub = np.zeros(n)
for b in range(nbars):
    root = prog[b % len(prog)][0] - 12
    step = bar / (2 if mood == "doc" else 8)
    for k in range(int(bar / step)):
        st = int((b * bar + k * step) * SR)
        if st >= n: break
        L = min(n - st, int(1.2 * SR)); tt = np.arange(L) / SR
        sub[st:st + L] += np.sin(2 * np.pi * midi(root) * tt) * np.exp(-tt * (3 if mood == "doc" else 6))
# air noise
air = sosfilt(butter(2, [2000, 6000], btype="band", fs=SR, output="sos"), rng.standard_normal(n)) * 0.02
mix = pad / (np.abs(pad).max() + 1e-9) * 0.6 + sub / (np.abs(sub).max() + 1e-9) * (0.35 if mood == "doc" else 0.5) + air
# simple reverb
ir_t = np.arange(int(2.5 * SR)) / SR
ir = rng.standard_normal(len(ir_t)) * np.exp(-ir_t * 2.2); ir /= np.abs(ir).sum() ** 0.5 * 30
wet = fftconvolve(mix, ir)[:n]
mix = 0.7 * mix + 0.6 * wet
# fade in/out
fi = int(3 * SR); mix[:fi] *= np.linspace(0, 1, fi); mix[-fi:] *= np.linspace(1, 0, fi)
mix /= np.abs(mix).max() + 1e-9
st = np.stack([mix, np.roll(mix, 480)], 1) * 0.8
sf.write(out, st.astype(np.float32), SR)
print("music", out, secs)
