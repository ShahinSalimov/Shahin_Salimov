import json, sys, subprocess, numpy as np, soundfile as sf
V = sys.argv[1]; tl = json.load(open(f'{V}/timeline.json')); SR = 44100
T = tl['end'] - tl['start'] + 0.5; N = int(T * SR)
voice = np.zeros(N, np.float32)
for s in tl['scenes']:
    a, sr = sf.read(f'{V}/audio/{s["id"]}.wav', dtype='float32')
    if a.ndim > 1: a = a.mean(1)
    o = int((s['t'] - tl['start'] + 0.35) * SR); voice[o:o + len(a)] += a[:N - o]
sf.write(f'{V}/voice.wav', voice, SR)
# Sakit, korporativ fon musiqisi: Am–F–C–G akkordları, yumşaq pad + arpeggio
t = np.arange(N) / SR
def note(f): return 440 * 2 ** ((f - 69) / 12)
prog = [[57, 60, 64], [53, 57, 60], [48, 55, 60], [55, 59, 62]]
bar = 4.0; music = np.zeros(N, np.float32)
for b in range(int(T / bar) + 1):
    ch = prog[b % 4]; s0 = int(b * bar * SR); s1 = min(N, int((b + 1) * bar * SR) + SR)
    if s0 >= N: break
    tt = t[s0:s1] - b * bar
    env = np.minimum(1, tt / 1.2) * np.exp(-np.maximum(0, tt - bar) * 3)
    pad = sum(np.sin(2 * np.pi * note(m) * tt) + .35 * np.sin(2 * np.pi * note(m + 12) * tt + .5) for m in ch) / 3
    bass = np.sin(2 * np.pi * note(ch[0] - 12) * tt) * .6
    music[s0:s1] += (pad * .5 + bass * .5) * env
    for j in range(8):  # arpeggio
        a0 = int((b * bar + j * .5) * SR)
        if a0 >= N: break
        m = ch[j % 3] + 12; L = min(int(.45 * SR), N - a0); u = np.arange(L) / SR
        music[a0:a0 + L] += .22 * np.sin(2 * np.pi * note(m) * u) * np.exp(-u * 6)
music /= np.abs(music).max()
fade = np.ones(N); fi = int(2 * SR); fade[:fi] = np.linspace(0, 1, fi); fade[-int(3 * SR):] = np.linspace(1, 0, int(3 * SR))
sf.write(f'{V}/music.wav', (music * fade * .9).astype(np.float32), SR)
# səs danışanda musiqini avtomatik endir (ducking) və miksi normallaşdır
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', f'{V}/music.wav', '-i', f'{V}/voice.wav', '-filter_complex',
  '[0:a]lowpass=f=3000,volume=0.22[m];[1:a]asplit=2[v1][v2];[m][v1]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[md];[md][v2]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-15:TP=-1.5,aresample=48000[out]',
  '-map', '[out]', '-c:a', 'pcm_s16le', f'{V}/mix.wav'], check=True)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', f'{V}/music.wav', '-af', 'lowpass=f=3000,volume=0.5,loudnorm=I=-18:TP=-1.5,aresample=48000', f'{V}/music_only.wav'], check=True)
# SRT (subtitr) faylı
scenes = {s['id']: s for s in json.load(open(f'{V}/scenes.json'))}
dur = json.load(open(f'{V}/audio/durations.json'))
fmt = lambda x: '%02d:%02d:%02d,%03d' % (x // 3600, x % 3600 // 60, x % 60, (x * 1000) % 1000)
with open(f'{V}/subtitrler.srt', 'w') as f:
    for i, s in enumerate(tl['scenes'], 1):
        a = s['t'] - tl['start'] + .35; f.write(f'{i}\n{fmt(a)} --> {fmt(a + dur[s["id"]])}\n{scenes[s["id"]]["sub"]}\n\n')
print('audio done', round(T, 1))
