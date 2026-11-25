import json, sys, bisect, subprocess, numpy as np, cv2
V = sys.argv[1]; OUT = sys.argv[2]; WITH_CAPS = sys.argv[3] == '1'
tl = json.load(open(f'{V}/timeline.json')); scenes = json.load(open(f'{V}/scenes.json'))
FPS, W, H = 30, 1920, 1080
SW, SH = 3200, 1800; K = SW / 1600  # mənbə piksel / CSS piksel
frames = tl['frames']; ts = [f['t'] for f in frames]
T0, T1 = tl['start'], tl['end']

def target(ev):
    r = ev['rect']
    if r is None: return (0.0, 0.0, float(SW))
    x, y, w, h = r['x'] * K, r['y'] * K, r['w'] * K, r['h'] * K
    cx, cy = x + w / 2, y + h / 2
    w2, h2 = w * 1.12 + 120, h * 1.12 + 120
    cw = max(w2, h2 * 16 / 9)
    maxz = ev.get('zoom') or 2.2
    cw = min(SW, max(cw, SW / maxz))
    ch = cw * 9 / 16
    x0 = min(max(cx - cw / 2, 0), SW - cw); y0 = min(max(cy - ch / 2, 0), SH - ch)
    return (x0, y0, cw)

ease = lambda u: 4 * u ** 3 if u < .5 else 1 - (-2 * u + 2) ** 3 / 2
cams = sorted(tl['cams'], key=lambda e: e['t'])
TR = 1.05
def cam_at(t):
    cur = (0.0, 0.0, float(SW)); start = None; prev = cur
    for ev in cams:
        if ev['t'] > t: break
        # keçid başlayanda hazırkı vəziyyətdən hədəfə
        if start is not None:
            u = min(1, (ev['t'] - start) / TR); cur = tuple(p + (q - p) * ease(u) for p, q in zip(prev, tgt))
        prev, tgt, start = cur, target(ev), ev['t']
    if start is None: return cur
    u = min(1, (t - start) / TR)
    return tuple(p + (q - p) * ease(u) for p, q in zip(prev, tgt))

# subtitrlər
caps = []
if WITH_CAPS:
    ends = [s['t'] for s in tl['scenes'][1:]] + [T1]
    for s, e in zip(tl['scenes'], ends):
        img = cv2.imread(f'{V}/caps/{s["id"]}.png', cv2.IMREAD_UNCHANGED)
        a = img[:, :, 3:4].astype(np.float32) / 255
        ys = np.where(a[:, :, 0].max(1) > 0)[0]
        caps.append((s['t'] - T0 + .35, e - T0 - .15, img[:, :, :3].astype(np.float32), a, (ys.min(), ys.max() + 1) if len(ys) else (0, 0)))

n = int((T1 - T0) * FPS)
ff = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                       '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', OUT], stdin=subprocess.PIPE)
cache = {}
for k in range(n):
    t = T0 + k / FPS
    i = max(0, bisect.bisect_right(ts, t) - 1)
    if i not in cache:
        cache.clear(); im = cv2.imread(frames[i]['file'])
        if im.shape[1] != SW: im = cv2.resize(im, (SW, SH), interpolation=cv2.INTER_CUBIC)
        cache[i] = im
    src = cache[i]
    x0, y0, cw = cam_at(t); ch = cw * 9 / 16
    M = np.array([[W / cw, 0, -x0 * W / cw], [0, H / ch, -y0 * H / ch]], dtype=np.float32)
    out = cv2.warpAffine(src, M, (W, H), flags=cv2.INTER_AREA if cw > W else cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    tt = t - T0
    for a0, a1, rgb, al, (ya, yb) in caps:
        if a0 <= tt <= a1:
            f = min(1, (tt - a0) / .3, (a1 - tt) / .3)
            reg = out[ya:yb].astype(np.float32); A = al[ya:yb] * f
            out[ya:yb] = (reg * (1 - A) + rgb[ya:yb] * A).astype(np.uint8)
    ff.stdin.write(out.tobytes())
    if k % 900 == 0: print('frame', k, '/', n, flush=True)
ff.stdin.close(); ff.wait(); print('video done', OUT)
