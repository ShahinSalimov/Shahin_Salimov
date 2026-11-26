import sys, re, json, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
S=sys.argv[1]; VOICE=sys.argv[2]; SPEED=float(sys.argv[3]); LANG=sys.argv[4]; OUT=sys.argv[5]
import os; os.makedirs(OUT, exist_ok=True)
k=Kokoro(f"{S}/models/kokoro-v1.0.onnx", f"{S}/models/voices-v1.0.bin")
secs=json.load(open(f"{S}/sections.json"))
# merge paragraphs split by page breaks
for s in secs:
    m=[]
    for p in s['paras']:
        if m and p[0].islower(): m[-1]+=' '+p
        else: m.append(p)
    s['paras']=m
RESPELL=[(r"Ugarit","Oo-gah-rit"),(r"Ammurapi","Ah-moo-rah-pee"),(r"Hattusa","Hah-too-shah"),(r"Suppiluliuma","Soo-pee-loo-lee-oo-mah"),(r"Merneptah","Mer-nep-tah"),(r"Medinet Habu","Meh-dee-net Hah-boo"),(r"Uluburun","Oo-loo-boo-roon"),(r"Shekelesh","Sheh-keh-lesh"),(r"Sherden","Sher-den"),(r"Peleset","Peh-leh-set"),(r"Arzawa","Ar-zah-wah"),(r"Alashiya","Ah-lah-shee-yah"),(r"Carchemish","Kar-keh-mish"),(r"Kode","Koh-deh"),(r"Akkadian","Ah-kay-dee-an"),(r"Gobekli Tepe","Gur-beck-lee Teh-peh"),(r"Karahan Tepe","Kah-rah-hahn Teh-peh"),(r"Tas Tepeler","Tahsh Teh-peh-lehr"),
 (r"Sanliurfa","Shahn-lee-oor-fah"),(r"Nevali Chori","Neh-vah-luh Choh-ree"),(r"Karacadag","Kah-rah-jah-dah"),(r"Ataturk","Ah-tah-turk"),
 (r"Mohenjo-daro","Mohenjo-dahro"),(r"'"," ")]
def speak(t):
    for a,b in RESPELL: t=re.sub(a,b,t)
    return t
def sentences(p):
    p=p
    parts=re.split(r'(?<=[.?!])\s+(?=[A-Z\'"])', p)
    return [x.replace('R.D.','R. D.') for x in parts if x.strip()]
SR=24000; GAP_S=0.38; GAP_P=0.85
cues=[]; offset_total=0.0; manifest=[]
for i,s in enumerate(secs,1):
    chunks=[]; t=0.0; scues=[]
    for pi,p in enumerate(s['paras']):
        for si,sent in enumerate(sentences(p)):
            a,sr=k.create(speak(sent), voice=VOICE, speed=SPEED, lang=LANG)
            # trim leading/trailing silence lightly
            idx=np.where(np.abs(a)>0.01)[0]
            if len(idx): a=a[max(0,idx[0]-240):idx[-1]+2400]
            d=len(a)/SR; scues.append((t,t+d,sent)); chunks.append(a); t+=d
            g=GAP_S; chunks.append(np.zeros(int(g*SR),dtype=np.float32)); t+=g
        chunks.append(np.zeros(int((GAP_P-GAP_S)*SR),dtype=np.float32)); t+=GAP_P-GAP_S
    audio=np.concatenate([np.zeros(int(0.3*SR),dtype=np.float32)]+chunks)
    scues=[(a+0.3,b+0.3,x) for a,b,x in scues]
    fn=f"{OUT}/{i:02d}_{re.sub(r'[^A-Za-z0-9]+','_',s['title']).strip('_')}.wav"
    sf.write(fn, audio, SR)
    dur=len(audio)/SR
    manifest.append({'n':i,'title':s['title'],'file':fn,'dur':dur,'cues':scues})
    print(i, s['title'], round(dur,1),'s', flush=True)
json.dump(manifest, open(f"{OUT}/manifest.json","w"), indent=1, ensure_ascii=False)
