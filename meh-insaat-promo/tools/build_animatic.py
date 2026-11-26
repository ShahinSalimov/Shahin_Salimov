"""Assemble the full 79 s 9:16 promo from the approved stills + ready clips.

Each still gets a camera move (push-in, tilt, pan, pull-back); scenes are joined
with short cross-dissolves. 9B and the logo outro are taken from their rendered
mp4 files untouched. Silent, no subtitles.
Usage: python3 build_animatic.py <out.mp4>
"""
import subprocess
import sys

import numpy as np
from PIL import Image

W, H, FPS, X = 1080, 1920, 30, 0.35  # X = cross-dissolve length (s)

# (start, file, kind, z0, z1, (cx0, cy0), (cx1, cy1)) - centres are 0..1 of the image
S = [
    (0, "scenes/01_empty_plot.jpg", "img", 1.00, 1.18, (.5, .62), (.5, .52)),        # drone glides forward
    (6, "scenes/02_concrete.jpg", "img", 1.05, 1.22, (.5, .55), (.55, .62)),         # push to the pour
    (11, "scenes/03_house_construction.jpg", "img", 1.20, 1.10, (.55, .70), (.55, .40)),  # tilt up the house
    (17, "scenes/04_asphalt.jpg", "img", 1.04, 1.20, (.5, .60), (.5, .66)),          # low push along the road
    (23, "scenes/04A_pole_installation.jpg", "img", 1.22, 1.12, (.5, .72), (.5, .40)),  # tilt up the pole
    (27, "scenes/04B_street_lighting.jpg", "img", 1.04, 1.22, (.5, .40), (.48, .22)),   # rise to the lamp
    (31, "scenes/05_electrical.jpg", "img", 1.02, 1.20, (.45, .5), (.40, .55)),      # push on the hands
    (36, "scenes/06_ventilation.jpg", "img", 1.18, 1.06, (.5, .68), (.5, .38)),      # tilt up to the ducts
    (41, "scenes/07_air_conditioner.jpg", "img", 1.14, 1.14, (.62, .45), (.45, .40)),  # lateral slide
    (46, "scenes/08_interior_renovation.jpg", "img", 1.03, 1.22, (.5, .55), (.48, .68)),  # push on the tile
    (52, "scenes/09_finished_interior.jpg", "img", 1.25, 1.02, (.5, .5), (.5, .5)),  # reveal pull-back
    (57, "scenes/09B_office_logo_3s.mp4", "vid"),
    (60, "scenes/10_team.jpg", "img", 1.02, 1.16, (.5, .55), (.5, .58)),             # slow push on the team
    (66, "scenes/10B_building.jpg", "img", 1.18, 1.03, (.5, .55), (.5, .50)),        # drone pull-back
    (69, "outro/MEH_Insaat_logo_outro_9x16_10s.mp4", "vid"),
]
END = 79.0
starts = [s[0] for s in S] + [END]


def smooth(q):
    q = min(max(q, 0.0), 1.0)
    return q * q * (3 - 2 * q)


class Still:
    def __init__(self, spec, dur):
        _, path, _, self.z0, self.z1, self.c0, self.c1 = spec
        im = Image.open(path).convert("RGB")
        k = 2.4 * W / im.width  # pre-upscale once, crops stay sharp
        self.im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        self.dur = dur

    def frame(self, u):
        q = smooth(u / self.dur)
        z = self.z0 + (self.z1 - self.z0) * q
        cx = self.c0[0] + (self.c1[0] - self.c0[0]) * q
        cy = self.c0[1] + (self.c1[1] - self.c0[1]) * q
        iw, ih = self.im.size
        cw = min(iw, ih * W / H) / z
        ch = cw * H / W
        left = min(max(cx * iw - cw / 2, 0), iw - cw)
        top = min(max(cy * ih - ch / 2, 0), ih - ch)
        return np.asarray(self.im.resize((W, H), Image.BICUBIC, box=(left, top, left + cw, top + ch)))


class Clip:
    def __init__(self, path):
        self.p = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-i", path, "-f", "rawvideo",
                                   "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-"], stdout=subprocess.PIPE)
        self.idx, self.last = -1, np.zeros((H, W, 3), np.uint8)

    def frame(self, u):
        want = int(u * FPS)
        while self.idx < want:
            buf = self.p.stdout.read(W * H * 3)
            if len(buf) < W * H * 3:
                break  # clip ended: hold the last frame
            self.last = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
            self.idx += 1
        return self.last


objs = {}


def get(i):
    if i not in objs:
        spec = S[i]
        dur = starts[i + 1] - spec[0] + X
        objs[i] = Still(spec, dur) if spec[2] == "img" else Clip(spec[1])
    return objs[i]


out = sys.argv[1]
ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                       "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow",
                       "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
for f in range(int(END * FPS)):
    t = f / FPS
    i = max(k for k in range(len(S)) if starts[k] <= t)
    u = t - starts[i] + (X if i > 0 and S[i][2] == "img" else 0)
    if S[i][2] == "vid":
        u = t - starts[i] + X  # clips started fading in X before their slot
    fr = get(i).frame(u).astype(np.float32)
    if i + 1 < len(S) and t >= starts[i + 1] - X:
        w = smooth((t - (starts[i + 1] - X)) / X)
        nxt = get(i + 1).frame(t - (starts[i + 1] - X)).astype(np.float32)
        fr = fr * (1 - w) + nxt * w
    for k in list(objs):  # free scenes that are finished
        if k < i:
            del objs[k]
    ff.stdin.write(fr.clip(0, 255).astype(np.uint8).tobytes())
ff.stdin.close()
ff.wait()
print("done", out)
