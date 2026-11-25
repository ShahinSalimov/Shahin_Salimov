import json, sys, subprocess, soundfile as sf
sys.path.insert(0, sys.argv[1]); from tts import synth
base = sys.argv[2]; scenes = json.load(open(f'{base}/scenes.json')); out = {}
for s in scenes:
    raw = f'{base}/audio/{s["id"]}_raw.wav'; fin = f'{base}/audio/{s["id"]}.wav'
    sf.write(raw, synth(s['say'], 0.92), 16000)
    # bir az qalın kişi tembri + səs səviyyəsinin bərabərləşdirilməsi
    subprocess.run(['ffmpeg','-loglevel','error','-y','-i',raw,'-af','asetrate=16000*0.9,aresample=44100,atempo=1.111,highpass=f=70,acompressor=threshold=-18dB:ratio=3,loudnorm=I=-16:TP=-1.5','-ar','44100',fin], check=True)
    out[s['id']] = round(sf.info(fin).duration, 2)
json.dump(out, open(f'{base}/audio/durations.json','w'), indent=1)
print(out, 'total', round(sum(out.values()),1))
