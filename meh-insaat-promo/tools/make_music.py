"""Original cinematic corporate background track for the MEH-Insaat cut (96.4 s, 96 BPM).

Synthesised from scratch (no samples, royalty-free). Structure follows the video:
0-13 piano + pad (design), 13-29 bass pulse + ticks (machines), 29-61 full groove,
61-81 bigger, 81-86.4 riser, 86.5 impact + shimmer (logo), 92.4-96.4 resolve + fade.
Usage: python3 make_music.py out.wav [duration_s]
"""
import sys
import wave

import numpy as np

SR, BPM = 48000, 96
DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 96.4
BEAT = 60 / BPM
N = int(SR * DUR)
t_all = np.arange(N) / SR
rng = np.random.default_rng(3)
L = np.zeros(N)
R = np.zeros(N)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def env_adsr(n, a, d, s, r):
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    e = np.full(n, s)
    e[:a] = np.linspace(0, 1, max(a, 1))
    e[a:a + d] = np.linspace(1, s, len(e[a:a + d]))
    if r:
        e[-r:] *= np.linspace(1, 0, r)
    return e


def add(sig, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N:
        return
    sig = sig[:N - i]
    L[i:i + len(sig)] += sig * gain * (1 - pan) / 2 * 2 ** 0.5
    R[i:i + len(sig)] += sig * gain * (1 + pan) / 2 * 2 ** 0.5


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for k in range(len(x)):  # one-pole; used only on short signals
        acc = (1 - a) * x[k] + a * acc
        y[k] = acc
    return y


# chords (Dm - Bb - F - C), 2 bars each = 8 beats
PROG = [[50, 57, 62, 65, 69], [46, 53, 58, 62, 65], [53, 60, 65, 69, 72], [48, 55, 60, 64, 67]]
BAR = 4 * BEAT
CH = 2 * BAR


def chord_at(t):
    return PROG[int(t // CH) % 4]


def intensity(t):  # global arrangement curve
    pts = [(0, .55), (13, .7), (29, .85), (61, 1.0), (81, 1.0), (86.4, .9), (92.4, .7), (DUR, 0)]
    xs, ys = zip(*pts)
    return np.interp(t, xs, ys)


# --- pad: detuned additive, slow swell per chord
c = 0.0
while c < 92.4:
    n = int(CH * SR) + int(1.5 * SR)
    tt = np.arange(n) / SR
    sig = np.zeros(n)
    for note in chord_at(c)[1:]:
        for det in (-0.12, 0.12):
            f = midi(note) * 2 ** (det / 12)
            for h, amp in ((1, 1), (2, .35), (3, .15), (4, .07)):
                sig += amp * np.sin(2 * np.pi * f * h * tt + rng.uniform(0, 6.28))
    sig *= env_adsr(n, 1.2, 1.0, .85, 1.5) * 0.018
    add(sig, c, intensity(c), pan=0)
    c += CH

# --- piano arpeggio (eighths), soft until 13 s, continues under everything
def piano(f, length=1.6):
    n = int(length * SR)
    tt = np.arange(n) / SR
    s = sum(a * np.sin(2 * np.pi * f * h * tt) * np.exp(-tt * (2.2 + h * 1.3))
            for h, a in ((1, 1), (2, .45), (3, .22), (4, .1), (5, .05)))
    s *= np.minimum(tt / 0.004, 1)
    return s * 0.11


step = BEAT / 2
k = 0
t = 0.0
while t < 92.4:
    ch = chord_at(t)
    pattern = [ch[2], ch[3], ch[4], ch[3] + 12 if k % 8 == 3 else ch[4], ch[2] + 12, ch[4], ch[3], ch[4]]
    note = pattern[k % 8]
    vel = (0.9 if k % 2 == 0 else 0.6) * (1.0 if t < 61 else 1.15)
    add(piano(midi(note)), t, vel * intensity(t), pan=0.25 if k % 2 else -0.25)
    t += step
    k += 1

# --- bass pulse (eighths) 13-86.4
t = 13.0
while t < 86.4:
    root = chord_at(t)[0] - 12
    n = int(step * SR)
    tt = np.arange(n) / SR
    s = np.tanh(2.2 * np.sin(2 * np.pi * midi(root) * tt)) * np.exp(-tt * 7) * np.minimum(tt / 0.003, 1)
    add(s * 0.10, t, intensity(t))
    t += step

# --- drums
def kick():
    n = int(0.45 * SR)
    tt = np.arange(n) / SR
    f = 50 + 90 * np.exp(-tt * 25)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 9) * 0.5


def noise_hit(length, decay, cut):
    n = int(length * SR)
    s = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * decay)
    if cut:  # crude high-pass for ticks
        s = np.diff(np.concatenate([[0], s]))
    return s


KICK = kick()
CLAP = noise_hit(0.25, 22, False) * 0.09
TICK = noise_hit(0.05, 90, True) * 0.05
t = 13.0
b = 0
while t < 86.4:
    if b % 2 == 0 or t >= 29:
        add(TICK, t, intensity(t) * (1.0 if b % 2 else 0.6), pan=0.3)
    beat_i = b // 2
    if t >= 29 and b % 2 == 0:
        if beat_i % 4 in (0, 2) or (t >= 61 and beat_i % 4 == 3 and b % 4 == 2):
            add(KICK, t, intensity(t))
        if beat_i % 4 in (1, 3):
            add(CLAP, t, intensity(t), pan=-0.1)
    t += step
    b += 1

# --- riser 81-86.4 and impact at 86.5
n = int(5.4 * SR)
tt = np.arange(n) / SR
riser = rng.standard_normal(n) * (tt / 5.4) ** 2.5 * 0.06
riser += np.sin(2 * np.pi * np.cumsum(200 + 900 * (tt / 5.4) ** 2) / SR) * (tt / 5.4) ** 3 * 0.03
add(riser, 81.0)
n = int(5.5 * SR)
tt = np.arange(n) / SR
boom = np.sin(2 * np.pi * np.cumsum(45 + 60 * np.exp(-tt * 6)) / SR) * np.exp(-tt * 1.3) * 0.55
boom += rng.standard_normal(n) * np.exp(-tt * 3.5) * 0.05
add(boom, 86.5)

# --- logo shimmer + motif 86.5-96.4 (F major), final chord resolves
for i, note in enumerate([77, 81, 84, 89, 84, 81]):
    add(piano(midi(note), 2.5), 87.0 + i * BEAT, 0.9, pan=(-0.4, 0.4)[i % 2])
n = int(9.9 * SR)
tt = np.arange(n) / SR
sh = sum(np.sin(2 * np.pi * midi(m) * tt + rng.uniform(0, 6)) for m in (77, 81, 84, 89, 93))
sh *= (0.5 + 0.5 * np.sin(2 * np.pi * 3.1 * tt)) * env_adsr(n, 1.0, 1.0, .8, 3.5) * 0.012
add(sh, 86.5)
for note in (41, 53, 60, 65, 69, 72):
    add(piano(midi(note), 4.5) * 1.3, 92.4, 1.0)

# --- simple stereo reverb (FFT convolution with decaying noise)
def reverb(x, seed):
    r = np.random.default_rng(seed)
    n = int(2.2 * SR)
    ir = r.standard_normal(n) * np.exp(-np.arange(n) / SR * 3.2)
    ir[0] = 0
    m = len(x) + n
    size = 1 << (m - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:len(x)]
    return y / np.max(np.abs(ir)) * 0.012


L, R = L + reverb(L, 1), R + reverb(R, 2)
fade = np.ones(N)
fade[-int(1.5 * SR):] = np.linspace(1, 0, int(1.5 * SR))
fade[:int(0.3 * SR)] = np.linspace(0, 1, int(0.3 * SR))
out = np.stack([L * fade, R * fade], axis=1)
out = np.tanh(out / np.max(np.abs(out)) * 1.2) * 0.85
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((out * 32767).astype("<i2").tobytes())
print("music done", sys.argv[1])
