import json, sys
S=sys.argv[1]
man=json.load(open(f"{S}/narration/manifest.json")); tl=json.load(open(f"{S}/timeline.json"))
off={int(k):v for k,v in tl["sec_off"].items()}
def ts(t):
    h=int(t//3600); m=int(t%3600//60); s=t%60
    return f"{h:02d}:{m:02d}:{int(s):02d},{int(round((s-int(s))*1000))%1000:03d}"
def chunks(text, maxc=84):
    import math
    n=math.ceil(len(text)/maxc); maxc=math.ceil(len(text)/n)+6
    words=text.split(); out=[]; cur=""
    for w in words:
        if len(cur)+len(w)+1>maxc and cur: out.append(cur); cur=w
        else: cur=(cur+" "+w).strip()
    out.append(cur)
    # rebalance: avoid tiny last chunk
    return out
def lines(c, n=42):
    if len(c)<=n: return c
    ws=c.split(); best=None
    for i in range(1,len(ws)):
        a=" ".join(ws[:i]); b=" ".join(ws[i:]); d=max(len(a),len(b))
        if best is None or d<best[0]: best=(d,a+"\n"+b)
    return best[1]
n=1; out=[]
for m in man:
    o=off[m["n"]]
    for a,b,text in m["cues"]:
        cs=chunks(text); tot=sum(len(c) for c in cs); t=a
        for c in cs:
            d=(b-a)*len(c)/tot
            out.append(f"{n}\n{ts(o+t)} --> {ts(o+t+d-0.02)}\n{lines(c)}\n"); n+=1; t+=d
open(sys.argv[2],"w").write("\n".join(out)); print(n-1,"cues")
