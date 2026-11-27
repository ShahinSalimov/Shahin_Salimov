"""Render a vertical Short with word-by-word burned captions.
usage: render_short.py SHORT_DIR FONT_DIR MUSIC_WAV OUT_NAME [SFX_DIR]"""
import json, os, subprocess, sys, wave
import numpy as np

D, FONTS, MUSIC, NAME = sys.argv[1:5]
SFX = sys.argv[5] if len(sys.argv) > 5 else None
W, H, FPS, XF, SR = 1080, 1920, 30, 0.3, 48000
d = json.load(open(f"{D}/scenes.json")); os.makedirs(f"{D}/build", exist_ok=True)
def sh(c): subprocess.run(c, check=True, capture_output=True)
def dur(p): return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).decode())
def load(p):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", p, "-f", "s16le", "-ac", "2", "-ar", str(SR), "-"])
    return np.frombuffer(raw, np.int16).reshape(-1, 2).astype(np.float32) / 32768

GAP = 0.12
segs = []
for i, s in enumerate(d["scenes"]):
    a = dur(f"{D}/tts_scenes/{i:02d}.mp3"); segs.append(a + GAP)
segs[0] += 0.15
starts = list(np.cumsum([0] + segs[:-1])); total = sum(segs)
clips = []
for i, L0 in enumerate(segs):
    L = L0 + (XF if i < len(segs) - 1 else 0); N = int(round(L * FPS))
    out = f"{D}/build/s{i:02d}.mp4"
    m = i % 3
    if m == 0: z, x, y = f"1+0.15*on/{N}", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"
    elif m == 1: z, x, y = "1.15", "iw/2-(iw/zoom/2)", f"(ih-ih/zoom)*on/{N}"
    else: z, x, y = f"1.15-0.15*on/{N}", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"
    vf = (f"scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,"
          f"zoompan=z='{z}':x='{x}':y='{y}':d={N}:s={W}x{H}:fps={FPS},eq=contrast=1.06:saturation=1.0,format=yuv420p")
    sh(["ffmpeg", "-y", "-v", "error", "-i", f"{D}/img_scenes/{i:02d}.png", "-vf", vf, "-frames:v", str(N), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", out])
    clips.append(out)

# captions (ASS): 3-word groups, active word gold
def at(x): h, r = divmod(x, 3600); m_, s_ = divmod(r, 60); return f"{int(h)}:{int(m_):02d}:{s_:05.2f}"
ass = ["[Script Info]", "ScriptType: v4.00+", f"PlayResX: {W}", f"PlayResY: {H}", "",
       "[V4+ Styles]", "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
       "Style: Cap,Anton,112,&H00F0F5F5,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,1,0,1,7,3,2,60,60,560,1", "",
       "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
ev = []
for i in range(len(segs)):
    words = json.load(open(f"{D}/tts_scenes/{i:02d}.json")); base = starts[i] + (0.15 if i == 0 else 0)
    groups = [words[k:k + 3] for k in range(0, len(words), 3)]
    for g in groups:
        for j, w in enumerate(g):
            a = base + w[0]; b = base + (g[j + 1][0] if j + 1 < len(g) else w[1] + 0.12)
            txt = " ".join(("{\\c&H58AAD6&\\fscx108\\fscy108}" + x[2].upper() + "{\\r}") if x is w else x[2].upper() for x in g)
            ev.append([a, b, txt])
ev.sort()
for k in range(len(ev) - 1): ev[k][1] = min(ev[k][1], ev[k + 1][0])
for a, b, txt in ev: ass.append(f"Dialogue: 0,{at(a)},{at(b)},Cap,,0,0,0,,{txt}")
open(f"{D}/build/caps.ass", "w").write("\n".join(ass))

inputs, fc, last = [], [], "0:v"
for c in clips: inputs += ["-i", c]
for k in range(1, len(clips)):
    fc.append(f"[{last}][{k}:v]xfade=transition=fade:duration={XF}:offset={starts[k]:.3f}[v{k}]"); last = f"v{k}"
fc.append(f"[{last}]ass={D}/build/caps.ass:fontsdir={FONTS}[vout]")
sh(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(fc), "-map", "[vout]", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", f"{D}/build/video.mp4"])

n = int((total + 0.5) * SR); voice = np.zeros((n, 2), np.float32); fx = np.zeros((n, 2), np.float32)
def place(buf, arr, t, g=1.0):
    s0 = int(t * SR); e = min(n, s0 + len(arr)); buf[s0:e] += arr[:e - s0] * g
for i in range(len(segs)): place(voice, load(f"{D}/tts_scenes/{i:02d}.mp3"), starts[i] + (0.15 if i == 0 else 0))
if SFX:
    place(fx, load(f"{SFX}/boom.wav"), 0.0, 0.5)
    for i in range(1, len(segs)): place(fx, load(f"{SFX}/whoosh.wav"), starts[i] - 0.35, 0.22)
mus = np.zeros((n, 2), np.float32); mu = load(MUSIC); m = min(n, len(mu)); mus[:m] = mu[:m]
env = np.convolve(np.abs(voice).max(1), np.ones(int(0.2 * SR)) / int(0.2 * SR), "same")
mus *= (0.2 * (1 - 0.55 * np.clip(env / 0.03, 0, 1)))[:, None]
mix = np.clip(voice + fx * 0.8 + mus, -1, 1)
with wave.open(f"{D}/build/mix.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
sh(["ffmpeg", "-y", "-v", "error", "-i", f"{D}/build/video.mp4", "-i", f"{D}/build/mix.wav", "-af", "loudnorm=I=-14:TP=-1.5:LRA=9",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", NAME])
print("DONE", NAME, round(total, 1))
