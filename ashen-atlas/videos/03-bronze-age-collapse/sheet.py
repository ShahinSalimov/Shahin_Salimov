import sys, os, glob
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen as G
from shots import SHOTS
S=sys.argv[1]; lo,hi=int(sys.argv[2]),int(sys.argv[3])
jobs=[]
for k,shots in SHOTS.items():
    for sh in shots:
        if sh[0] in("ai","art"): jobs.append(G.full(sh[0],sh[1]))
        if sh[0]=="split": jobs+=[G.full("ai",sh[1]),G.full("ai",sh[2])]
jobs=list(dict.fromkeys(jobs))[lo:hi]
cols=6; w,h=320,180
sheet=Image.new("RGB",(cols*w,((len(jobs)+cols-1)//cols)*h),(0,0,0)); d=ImageDraw.Draw(sheet)
for i,p in enumerate(jobs):
    f=f"{S}/gen/{G.key(p)}.png"
    if os.path.exists(f): sheet.paste(Image.open(f).resize((w,h)),((i%cols)*w,(i//cols)*h))
    d.text(((i%cols)*w+6,(i//cols)*h+6),str(lo+i),fill=(255,255,0))
sheet.save(sys.argv[4])
