import re, json, sys
lines = open(sys.argv[1], encoding='utf-8').read().split('\n')
start = next(i for i,l in enumerate(lines) if '1. Ssenari' in l)
end = next(i for i,l in enumerate(lines) if '2. Short ssenarisi' in l)
hdr = re.compile(r'^\s*(\d\d:\d\d)\s*–\s*(\d\d:\d\d)\s*•\s*(.+)$')
sections=[]; cur=None; inblock=False; para=[]
def flush():
    global para
    if para and cur is not None:
        cur['paras'].append(' '.join(para)); para=[]
for l in lines[start+1:end]:
    s=l.strip()
    m=hdr.match(l)
    if m:
        flush(); inblock=False
        cur={'start':m.group(1),'end':m.group(2),'title':m.group(3).strip(),'paras':[]}; sections.append(cur); continue
    if cur is None: continue
    if s.startswith('ASHEN ATLAS •') or s.startswith('Qrafika'): continue
    if s.startswith('VİZUAL:') or s.startswith('PROMPT:'):
        flush(); inblock=True; continue
    if not s:
        if inblock: inblock=False
        else: flush()
        continue
    if inblock: continue
    para.append(s)
flush()
json.dump(sections, open(sys.argv[2],'w'), indent=1, ensure_ascii=False)
for x in sections: print(x['start'], x['title'], len(x['paras']), sum(len(p.split()) for p in x['paras']))
