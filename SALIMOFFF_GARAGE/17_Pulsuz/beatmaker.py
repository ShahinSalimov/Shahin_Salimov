"""SALIMOFFF GARAGE — free, original music generator (no Suno, no API).

Every sound is synthesized from scratch (sine, square, noise), so the result is
100% original and safe for YouTube monetization. Each episode is a "song spec":
BPM, key, which instruments play in which seconds, drop point and the final
bass hit, matched to the episode script.

Usage:
  python beatmaker.py EP001            # -> out/EP001_music.wav + .mp3
  python beatmaker.py all
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt

SR = 44100
OUT = Path(__file__).resolve().parent / "out"
rng = np.random.default_rng(7)


def note(semitones_from_a4: float) -> float:
    return 440.0 * 2 ** (semitones_from_a4 / 12)


# C# minor helpers (semitones from A4)
CS1, CS2, CS4, CS5 = -44, -32, -8, 4  # C#1 ~34.6 Hz, C#2 ~69 Hz, C#4, C#5


def filt(x, kind, freq, order=4):
    sos = butter(order, freq, btype=kind, fs=SR, output="sos")
    return sosfilt(sos, x)


def env(n, attack=0.002, decay=0.2):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-t / decay)


# ---------- instruments ----------

def kick(length=0.45):
    n = int(length * SR); t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 35)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
    click = filt(rng.standard_normal(n), "highpass", 3000) * np.exp(-t * 300) * 0.3
    return np.tanh(1.8 * (body + click))


def bass808(freq, length, drive=3.0, glide_from=None):
    n = int(length * SR); t = np.arange(n) / SR
    f = np.full(n, freq)
    if glide_from:
        f = freq + (glide_from - freq) * np.exp(-t * 18)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.1)
    x *= np.clip(t / 0.004, 0, 1)
    return np.tanh(drive * x) * 0.9


def cowbell(freq, length=0.18):
    n = int(length * SR); t = np.arange(n) / SR
    sq = np.sign(np.sin(2 * np.pi * freq * t)) + 0.8 * np.sign(np.sin(2 * np.pi * freq * 1.48 * t))
    x = filt(sq, "bandpass", [freq * 0.8, min(freq * 6, 16000)], 2)
    return x * env(n, 0.001, 0.07) * 0.35


def musicbox(freq, length=0.6):
    n = int(length * SR); t = np.arange(n) / SR
    x = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 4.0 * t) * np.exp(-t * 9)
    return x * env(n, 0.001, 0.35) * 0.28


def saw_pluck(freq, length=0.2, bright=4000):
    n = int(length * SR); t = np.arange(n) / SR
    saw = 2 * ((freq * t) % 1) - 1 + 0.6 * (2 * ((freq * 1.004 * t) % 1) - 1)
    return filt(saw, "lowpass", bright, 2) * env(n, 0.003, 0.09) * 0.22


def pad(freqs, length):
    n = int(length * SR); t = np.arange(n) / SR
    x = sum(2 * ((f * d * t) % 1) - 1 for f in freqs for d in (0.997, 1.003))
    x = filt(x, "lowpass", 1800, 2) / (len(freqs) * 2)
    fade = np.minimum(1, np.minimum(t / 0.5, (length - t) / 0.5))
    return x * np.clip(fade, 0, 1) * 0.25


def hat(length=0.05, open_=False):
    n = int((0.25 if open_ else length) * SR)
    x = filt(rng.standard_normal(n), "highpass", 7500)
    return x * env(n, 0.0005, 0.08 if open_ else 0.015) * 0.18


def clap():
    n = int(0.25 * SR); x = np.zeros(n)
    noise = filt(rng.standard_normal(n), "bandpass", [900, 5000], 2)
    for d in (0, 0.011, 0.022):
        i = int(d * SR); m = n - i
        x[i:] += noise[:m] * env(m, 0.0005, 0.012 if d < 0.02 else 0.09)
    return x * 0.5


def riser(length):
    n = int(length * SR); t = np.arange(n) / SR
    x = rng.standard_normal(n)
    out = np.zeros(n); step = int(0.05 * SR)
    for s in range(0, n, step):  # sweep the high-pass upward in 50 ms blocks
        fc = 300 + 7000 * (s / n) ** 2
        out[s:s + step] = filt(x[s:s + step + 2000], "highpass", fc, 2)[:len(out[s:s + step])]
    return out * (t / length) ** 2 * 0.25


def impact():
    """Final signature: deep distorted sub hit."""
    sub = bass808(note(CS1), 2.6, drive=4.0, glide_from=note(CS2)) * 1.1
    k = kick(0.6)
    sub[: len(k)] += k * 0.8
    return sub


# ---------- arrangement ----------

class Track:
    def __init__(self, seconds, bpm):
        self.buf = np.zeros(int(seconds * SR) + SR * 3)
        self.beat = 60.0 / bpm
        self.seconds = seconds

    def put(self, at_sec, sig, gain=1.0):
        i = int(at_sec * SR)
        if i < 0 or i >= len(self.buf):
            return
        m = min(len(sig), len(self.buf) - i)
        self.buf[i:i + m] += sig[:m] * gain

    def steps(self, start, end, every):
        t = start
        while t < end - 1e-6:
            yield t
            t += every

    def render(self, path: Path):
        x = self.buf[: int(self.seconds * SR)]
        fade = int(0.05 * SR)
        x[:fade] *= np.linspace(0, 1, fade)
        x = np.tanh(1.2 * x / (np.max(np.abs(x)) + 1e-9)) * 0.95
        stereo = np.stack([x, x], axis=1)
        wav = path.with_suffix(".wav")
        import wave
        with wave.open(str(wav), "wb") as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((stereo * 32767).astype("<i2").tobytes())
        # Shorts-friendly loudness (-14 LUFS), mp3 copy for editing apps
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav),
                        "-af", "loudnorm=I=-14:TP=-1:LRA=9", "-ar", "44100", str(path.with_suffix(".mp3"))],
                       check=True)
        return wav


COWBELL_RIFF = [0, None, 0, 3, None, 0, 7, None, 5, None, 3, None, 0, None, -2, None]  # 16 steps, semis from C#5
BASS_LINE = [0, 0, -4, -5]  # per bar: C#, C#, A, G#


def phonk(name, seconds=30, bpm=140, drop=20.0, stop=28.0, intro_riser=2.0, melody="cowbell"):
    tr = Track(seconds, bpm); b = tr.beat; bar = 4 * b; s16 = b / 4
    tr.put(0, riser(intro_riser), 0.9)
    tr.put(drop - 2 * b * 2, riser(4 * b), 1.0)                      # pre-drop riser
    # kick: half-time before the drop, full after
    for t in tr.steps(intro_riser, stop, b):
        beat_no = round((t - intro_riser) / b)
        if t >= drop or beat_no % 2 == 0:
            tr.put(t, kick(), 0.9)
    # 808 line, one note per bar, starts with kick
    for i, t in enumerate(tr.steps(intro_riser, stop, bar)):
        semis = BASS_LINE[i % 4]
        tr.put(t, bass808(note(CS1 + 12 + semis), min(bar, stop - t), glide_from=note(CS1 + 24 + semis) if t >= drop else None), 0.8)
    # melody from 5 s
    for i, t in enumerate(tr.steps(5.0, stop, s16)):
        step = tr_step = i % 16
        st = COWBELL_RIFF[tr_step]
        if st is None:
            continue
        if melody == "cowbell":
            tr.put(t, cowbell(note(CS5 + st)), 0.9 if t >= drop else 0.6)
        else:  # music box, every 8th only
            if i % 2 == 0:
                tr.put(t, musicbox(note(CS5 + 12 + st)), 0.8)
    # hats from 10 s, rolls before drop
    for i, t in enumerate(tr.steps(10.0, stop, b / 2)):
        tr.put(t, hat(open_=(i % 8 == 7)), 1.0 if t >= drop else 0.6)
    for t in tr.steps(drop - b, drop, s16 / 2):
        tr.put(t, hat(), 0.7)
    # clap on 2 and 4 after 10 s
    for t in tr.steps(10.0 + b, stop, 2 * b):
        tr.put(t, clap(), 0.8 if t >= drop else 0.5)
    tr.put(drop, impact(), 0.6)                                      # drop hit
    tr.put(stop + 0.25, impact(), 1.2)                              # signature: silence + bass hit
    return tr.render(OUT / f"{name}_music")


ARP = [0, 3, 7, 10, 12, 10, 7, 3]
CHORDS = [[0, 3, 7], [-4, 0, 3], [-7, -4, 0], [-5, -2, 2]]  # C#m, A, F#m, G#


def synth_loop(name, seconds=20, bpm=120):
    """EP002: 80s synthwave loop that ends exactly where it began."""
    tr = Track(seconds, bpm); b = tr.beat; bar = 4 * b
    for i, t in enumerate(tr.steps(0, seconds, bar)):
        ch = CHORDS[i % 4]
        tr.put(t, pad([note(CS4 + c) for c in ch], bar + 0.1), 1.0)
        tr.put(t, bass808(note(CS1 + 12 + ch[0]), bar, drive=1.5), 0.5)
    for i, t in enumerate(tr.steps(0, seconds, b / 4)):
        ch = CHORDS[int(t // bar) % 4]
        bright = 1500 + 5000 * (t / seconds)                         # era gets brighter over time
        tr.put(t, saw_pluck(note(CS4 + 12 + ch[0] + ARP[i % 8]), bright=bright), 0.8)
    for t in tr.steps(0, seconds, b):
        tr.put(t, kick(0.3), 0.6)
    for t in tr.steps(b, seconds, 2 * b):
        tr.put(t, clap(), 0.6)                                       # gated-reverb style snare stand-in
    for t in tr.steps(seconds / 2, seconds, b / 2):
        tr.put(t, hat(), 0.8)                                        # modern era adds hats
    tr.buf[int(seconds * SR):] = 0                                   # hard loop point
    return tr.render(OUT / f"{name}_music")


SPECS = {
    "EP001": lambda: phonk("EP001", bpm=140, melody="cowbell"),
    "EP002": lambda: synth_loop("EP002"),
    "EP003": lambda: phonk("EP003", bpm=135, melody="musicbox"),
}

if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    targets = SPECS if (len(sys.argv) < 2 or sys.argv[1] == "all") else {k: SPECS[k] for k in sys.argv[1:]}
    for k, fn in targets.items():
        print(k, "->", fn())
