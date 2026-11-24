import json, re, sys
S=sys.argv[1]
secs=json.load(open(f"{S}/sections.json")); man=json.load(open(f"{S}/narration/manifest.json"))
def sentences(p):
    p=p.replace('R. D.','R.D.')
    return [x for x in re.split(r'(?<=[.?!])\s+(?=[A-Z\'"])', p) if x.strip()]
out=[]
for s,m in zip(secs,man):
    mp=[]
    for p in s['paras']:
        if mp and p[0].islower(): mp[-1]+=' '+p
        else: mp.append(p)
    ci=0
    for pi,p in enumerate(mp):
        n=len(sentences(p)); c=m['cues'][ci:ci+n]; ci+=n
        out.append({'sec':m['n'],'p':pi,'start':c[0][0],'end':c[-1][1],'text':p})
    assert ci==len(m['cues']), (m['n'],ci,len(m['cues']))
json.dump(out,open(f"{S}/paras.json","w"),indent=1)
for o in out: print(o['sec'],o['p'],round(o['end']-o['start']),o['text'][:70])
