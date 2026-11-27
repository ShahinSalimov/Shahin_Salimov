import json,subprocess,re,sys
EP=sys.argv[1]; OUT=sys.argv[2]; CARD=float(sys.argv[3]) if len(sys.argv)>3 else 2.6
d=json.load(open(f'{EP}/scenes.json'))
def dur(p): return float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",p]).decode())
N=lambda x: re.sub('[^a-z0-9]','',x.lower())
t=0; starts={}
for i,s in enumerate(d['scenes']):
    if s.get('chapter'): t+=CARD
    starts[i]=t; t+=dur(f'{EP}/tts_scenes/{i:02d}.mp3')+0.6
def ts(x):
    ms=int(round(x*1000)); h,ms=divmod(ms,3600000); m,ms=divmod(ms,60000); s,ms=divmod(ms,1000); return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
ev=[]
for i,s in enumerate(d['scenes']):
    W=json.load(open(f'{EP}/tts_scenes/{i:02d}.json')); toks=s['text'].split(); j=0; rem=N(toks[0]) if toks else ''
    out=[]
    for w in W:
        nw=N(w[2]); disp=w[2]
        if nw and not rem.startswith(nw):
            for jj in range(j+1,min(j+4,len(toks))):
                if N(toks[jj]).startswith(nw): j=jj; rem=N(toks[j]); break
        if nw and rem.startswith(nw):
            rem=rem[len(nw):]
            if not rem:
                m=re.search(r'[.,!?;:"”]+$',toks[j]); disp=w[2]+(m.group(0).replace('"','') if m else '')
                j+=1; rem=N(toks[j]) if j<len(toks) else ''
        out.append((w,disp))
    line=[]
    for k,(w,disp) in enumerate(out):
        line.append((w,disp)); txt=' '.join(x[1] for x in line)
        if k==len(out)-1 or len(txt)>40 or disp.endswith(('.','?','!',',',':')):
            ev.append([starts[i]+0.3+line[0][0][0], starts[i]+0.3+line[-1][0][1]+0.2, txt]); line=[]
for k in range(len(ev)-1): ev[k][1]=min(ev[k][1],ev[k+1][0]-0.02)
open(OUT,'w').write('\n'.join(f"{n+1}\n{ts(a)} --> {ts(b)}\n{x}\n" for n,(a,b,x) in enumerate(ev)))
