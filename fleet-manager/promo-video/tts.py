import json, sys, re, numpy as np, soundfile as sf, onnxruntime as ort
import os
MODEL, CFG = os.environ['TTS_MODEL'], os.environ['TTS_CFG']
cfg = json.load(open(CFG)); ids = cfg['phoneme_id_map']; blank = ids[cfg['blank']]
sess = ort.InferenceSession(MODEL)
def norm(t):
    t = t.replace('İ', 'i').replace('I', 'ı').lower()
    t = t.replace('₼', ' manat').replace('%', ' faiz')
    return t
def synth(text, length_scale=1.0, seed=0):
    np.random.seed(seed)
    out = []
    for part in re.split(r'(?<=[.!?,;:])\s+', text.strip()):
        chars = [c for c in norm(part) if c in ids]
        seq = [blank]
        for c in chars: seq += [ids[c], blank]
        x = np.array([seq], dtype=np.int64)
        y = sess.run(None, {'x': x, 'x_length': np.array([x.shape[1]], dtype=np.int64),
            'noise_scale': np.array([0.5], dtype=np.float32), 'length_scale': np.array([length_scale], dtype=np.float32),
            'noise_scale_w': np.array([0.7], dtype=np.float32)})[0][0, 0]
        out.append(y)
        pause = 0.38 if part.rstrip()[-1:] in '.!?' else 0.18
        out.append(np.zeros(int(16000 * pause), dtype=np.float32))
    return np.concatenate(out)
if __name__ == '__main__':
    a = synth(sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 1.0)
    sf.write(sys.argv[1], a, 16000)
