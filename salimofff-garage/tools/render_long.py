"""Render a long-form documentary episode from scenes.json + images + TTS.
usage: render_long.py EP_DIR FONT_DIR SFX_DIR MUSIC_WAV"""
import json, os, subprocess, sys, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance, ImageFont

EP, FONTS, SFX, MUSIC = sys.argv[1:5]
W, H, FPS, XF = 1920, 1080, 30, 0.5
SR = 48000
GOLD = (214, 170, 88)
d = json.load(open(f"{EP}/scenes.json"))
os.makedirs(f"{EP}/build", exist_ok=True)

def sh(cmd): subprocess.run(cmd, check=True, capture_output=True)
def dur(p): return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).decode())
def load_wav(p):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", p, "-f", "s16le", "-ac", "2", "-ar", str(SR), "-"])
    return np.frombuffer(raw, np.int16).reshape(-1, 2).astype(np.float32) / 32768

# ---------- segments ----------
segs = []  # dict(kind, img, dur, scene)
for i, s in enumerate(d["scenes"]):
    if s.get("chapter"):
        segs.append({"kind": "card", "img": f"{EP}/img_scenes/{i:02d}.png", "dur": 2.6, "title": s["chapter"]})
    a = dur(f"{EP}/tts_scenes/{i:02d}.mp3")
    segs.append({"kind": "scene", "img": f"{EP}/img_scenes/{i:02d}.png", "dur": a + 0.6, "scene": i, "adur": a})

def card_image(src, title, out):
    im = Image.open(src).convert("RGB").resize((W, H))
    im = ImageEnhance.Brightness(im.filter(ImageFilter.GaussianBlur(18))).enhance(0.35)
    dr = ImageDraw.Draw(im)
    num, _, name = title.partition(": ")
    f1 = ImageFont.truetype(f"{FONTS}/Oswald.ttf", 46); f1.set_variation_by_name("SemiBold")
    f2 = ImageFont.truetype(f"{FONTS}/Anton.ttf", 130)
    dr.text((W / 2, H / 2 - 95), num, font=f1, fill=GOLD, anchor="mm")
    dr.text((W / 2, H / 2 + 20), name, font=f2, fill=(245, 240, 230), anchor="mm")
    dr.line((W / 2 - 120, H / 2 + 110, W / 2 + 120, H / 2 + 110), fill=GOLD, width=4)
    im.save(out)

clips = []
for k, s in enumerate(segs):
    L = s["dur"] + (XF if k < len(segs) - 1 else 0)
    N = int(round(L * FPS))
    out = f"{EP}/build/seg{k:03d}.mp4"
    src = s["img"]
    if s["kind"] == "card":
        src = f"{EP}/build/card{k:03d}.png"; card_image(s["img"], s["title"], src)
        z, x, y = f"1+0.04*on/{N}", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"
    else:
        mode = s["scene"] % 4
        if mode == 0: z, x, y = f"1+0.12*on/{N}", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"
        elif mode == 1: z, x, y = f"1.12-0.12*on/{N}", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"
        elif mode == 2: z, x, y = "1.12", f"(iw-iw/zoom)*on/{N}", "ih/2-(ih/zoom/2)"
        else: z, x, y = "1.12", f"(iw-iw/zoom)*(1-on/{N})", "ih/2-(ih/zoom/2)"
    if not os.path.exists(out):
        vf = (f"scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,"
              f"zoompan=z='{z}':x='{x}':y='{y}':d={N}:s={W}x{H}:fps={FPS},"
              f"eq=contrast=1.04:saturation=0.95,noise=alls=3:allf=t,format=yuv420p")
        sh(["ffmpeg", "-y", "-v", "error", "-i", src, "-vf", vf, "-frames:v", str(N), "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", out])
    clips.append(out)
    print("seg", k, s["kind"], round(L, 2), flush=True)

# ---------- xfade chain ----------
starts, t = [], 0.0
for s in segs: starts.append(t); t += s["dur"]
total = t
inputs, fc, last = [], [], "0:v"
for c in clips: inputs += ["-i", c]
for k in range(1, len(clips)):
    off = starts[k]
    tag = f"v{k}"
    fc.append(f"[{last}][{k}:v]xfade=transition=fade:duration={XF}:offset={off:.3f}[{tag}]")
    last = tag
fc.append(f"[{last}]fade=t=in:st=0:d=1,fade=t=out:st={total-1.5:.3f}:d=1.5[vout]")
video = f"{EP}/build/video.mp4"
sh(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(fc), "-map", "[vout]", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", video])
print("video done", total, flush=True)

# ---------- audio ----------
n = int((total + 1) * SR)
voice = np.zeros((n, 2), np.float32); fx = np.zeros((n, 2), np.float32)
def place(buf, arr, at, gain=1.0):
    s0 = int(at * SR); e = min(n, s0 + len(arr)); buf[s0:e] += arr[: e - s0] * gain
sfx = {k: load_wav(f"{SFX}/{k}.wav") for k in ("whoosh", "boom", "timpani", "door", "shutter")}
for k, s in enumerate(segs):
    if s["kind"] == "card":
        place(fx, sfx["whoosh"], starts[k] - 0.3, 0.5); place(fx, sfx["boom"], starts[k] + 0.25, 0.55)
    else:
        place(voice, load_wav(f"{EP}/tts_scenes/{s['scene']:02d}.mp3"), starts[k] + 0.3)
        if s["scene"] == 1: place(fx, sfx["door"], starts[k] + 1.6, 0.7)
        if s["scene"] == 2: place(fx, sfx["timpani"], starts[k] + 0.1, 0.45)
place(fx, sfx["shutter"], starts[[i for i, s in enumerate(segs) if s.get("scene") == 6][0]] + 2.0, 0.4)
music = load_wav(MUSIC)
mus = np.zeros((n, 2), np.float32); m = min(n, len(music)); mus[:m] = music[:m]
# sidechain ducking from voice envelope
env = np.abs(voice).max(1)
win = int(0.25 * SR); env = np.convolve(env, np.ones(win) / win, "same")
duck = 1 - 0.6 * np.clip(env / 0.03, 0, 1)
mus *= (0.16 * duck)[:, None]
mix = voice * 0.95 + fx * 0.8 + mus
mix = np.clip(mix, -1, 1)
with wave.open(f"{EP}/build/mix.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
final = f"{EP}/{os.path.basename(EP)}_long.mp4"
sh(["ffmpeg", "-y", "-v", "error", "-i", video, "-i", f"{EP}/build/mix.wav", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-vf", "hqdn3d=2:2:6:6", "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-maxrate", "6M", "-bufsize", "12M", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", final])

# ---------- subtitles + chapters ----------
def ts(x):
    h, r = divmod(x, 3600); m_, s_ = divmod(r, 60)
    return f"{int(h):02d}:{int(m_):02d}:{int(s_):02d},{int((s_ % 1) * 1000):03d}"
srt, idx = [], 1
for k, s in enumerate(segs):
    if s["kind"] != "scene": continue
    words = json.load(open(f"{EP}/tts_scenes/{s['scene']:02d}.json"))
    line = []
    for wd in words + [None]:
        if wd is not None: line.append(wd)
        txt = " ".join(x[2] for x in line)
        if line and (wd is None or len(txt) > 38 or txt.endswith((".", "?", "!", ","))):
            a, b = starts[k] + 0.3 + line[0][0], starts[k] + 0.3 + line[-1][1]
            srt.append(f"{idx}\n{ts(a)} --> {ts(b + 0.15)}\n{txt}\n"); idx += 1; line = []
pass
chap = ["0:00 Intro"]
for k, s in enumerate(segs):
    if s["kind"] == "card":
        mm, ss = divmod(int(starts[k]), 60); chap.append(f"{mm}:{ss:02d} {s['title'].split(': ',1)[1].title()}")
open(f"{EP}/chapters.txt", "w").write("\n".join(chap))
print("DONE", final, round(total, 1), "s")
