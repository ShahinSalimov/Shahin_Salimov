import sys, os, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen as G
from shots import SHOTS
S=sys.argv[1]; OUT=f"{S}/deliver/thumbnails"; os.makedirs(OUT,exist_ok=True)
XB="/usr/share/fonts/opentype/inter/Inter-Black.otf"; B="/usr/share/fonts/opentype/inter/Inter-Bold.otf"
CREAM=(250,243,228); GOLD=(214,175,110)
logo=Image.open(f"{S}/img/i-001.png").convert("RGBA")
m=Image.new("L",(800,800),0); ImageDraw.Draw(m).ellipse((62,62,738,738),fill=255); logo.putalpha(m)
def grade(im, tint, sat=1.15, con=1.15):
    im=ImageEnhance.Contrast(ImageEnhance.Color(im).enhance(sat)).enhance(con)
    a=np.asarray(im,np.float32)/255; lum=a.mean(2,keepdims=True)
    a=a*(1-.35)+lum*np.array(tint,np.float32)/255*.35*1.8
    return Image.fromarray(np.clip(a*255,0,255).astype(np.uint8))
def shade(im, side="left", strength=.85):
    w,h=im.size; a=np.asarray(im,np.float32)
    if side=="left": g=np.clip(1-np.linspace(1,0,w)*1.6,0,1)[None,:,None]; g=1-strength*(1-g)
    else: g=np.clip(1-np.linspace(1,0,h)*1.7,0,1)[:,None,None]; g=1-strength*(1-g)
    return Image.fromarray(np.clip(a*g,0,255).astype(np.uint8))
def txt(d,xy,t,f,fill,stroke=6):
    d.text((xy[0]+5,xy[1]+6),t,font=f,fill=(0,0,0,180),stroke_width=stroke,stroke_fill=(0,0,0,180))
    d.text(xy,t,font=f,fill=fill,stroke_width=stroke,stroke_fill=(15,10,8))
def fit(d,t,path,size,maxw):
    while d.textlength(t,font=ImageFont.truetype(path,size))>maxw: size-=4
    return ImageFont.truetype(path,size)
def duotone(im, stops, glow):
    a=np.asarray(im.convert("L"),np.float32)/255; a=np.clip(a*1.9,0,1)**0.8
    h,w=a.shape; yy,xx=np.mgrid[0:h,0:w]; gx,gy,gr=glow
    a=np.clip(a+0.75*np.exp(-(((xx-gx)/gr)**2+((yy-gy)/(gr*.7))**2)),0,1)
    xs=np.linspace(0,1,len(stops)); out=np.stack([np.interp(a,xs,[c[i] for c in stops]) for i in range(3)],2)
    rng=np.random.default_rng(3)
    img=Image.fromarray(out.astype(np.uint8)); d=ImageDraw.Draw(img)
    for _ in range(260):
        x,y=rng.integers(0,w),rng.integers(0,int(h*.8)); r=rng.choice([1,1,2,2,3]); c=(255,int(rng.integers(120,200)),60)
        d.ellipse((x-r,y-r,x+r,y+r),fill=c)
    return img
def thumb(name, bg, lines, sub, tint, mode=None):
    im=Image.open(bg).convert("RGB").resize((1280,720),Image.LANCZOS)
    if mode=="duo": im=duotone(im,[(8,4,3),(70,25,10),(200,85,25),(255,175,80)],(930,330,260)); im=shade(im,"left",.7)
    elif mode=="bright": im=shade(ImageEnhance.Brightness(grade(im,tint)).enhance(1.6),"left",.65)
    else: im=shade(grade(im,tint),"left",.8)
    im=im.convert("RGBA"); d=ImageDraw.Draw(im)
    y=56
    for t,col,size in lines:
        f=fit(d,t,XB,size,760); txt(d,(52,y),t,f,col); y+=int(f.size*1.08)
    if sub:
        f=ImageFont.truetype(B,34); tw=d.textlength(sub,font=f)
        d.rounded_rectangle((52,y+18,52+tw+40,y+18+62),12,fill=(10,8,6,215)); d.text((72,y+28),sub,font=f,fill=GOLD)
    im.alpha_composite(logo.resize((104,104),Image.LANCZOS),(1150,590))
    im.convert("RGB").save(f"{OUT}/{name}.jpg",quality=92); im.convert("RGB").save(f"{OUT}/{name}.png")
ORANGE=(240,120,45); VIOLET=(180,140,255); AMBER=(255,195,80)
thumb("T1_40000_PEOPLE_VANISHED", f"{S}/thumb/t2_2.png",
      [("40,000 PEOPLE",CREAM,118),("VANISHED",ORANGE,150)], "The Lost City of Mohenjo-daro", (255,130,50), "duo")
thumb("T2_NO_KINGS", f"{S}/thumb/t2_1.png",
      [("NO KINGS.",CREAM,112),("NO PALACES.",CREAM,112),("NO WAR?",VIOLET,124)], "Mohenjo-daro, 2500 BCE", (150,110,255), "bright")
drain=f"{S}/gen/{G.key(G.full('ai',SHOTS[(4,4)][2][1]))}.png"
thumb("T3_4500_YEARS_AHEAD", drain, [("4,500 YEARS",CREAM,124),("AHEAD?",AMBER,160)], "The city with covered drains", (255,190,90))
# Short cover 1080x1920
im=Image.open(f"{S}/short/img_0_0.png").convert("RGB").resize((1080,1920),Image.LANCZOS)
im=shade(grade(im,(255,150,60)),"top",.85).convert("RGBA"); d=ImageDraw.Draw(im); y=230
for t,col,size in [("4,500 YEARS AGO",CREAM,104),("THIS CITY HAD",CREAM,104),("DRAINS",ORANGE,210)]:
    f=fit(d,t,XB,size,960); tw=d.textlength(t,font=f); txt(d,((1080-tw)/2,y),t,f,col,7); y+=int(f.size*1.12)
f=ImageFont.truetype(B,40); t="FULL DOCUMENTARY ON THE CHANNEL"; tw=d.textlength(t,font=f)
d.rounded_rectangle(((1080-tw)/2-30,1560,(1080+tw)/2+30,1640),14,fill=(10,8,6,215)); d.text(((1080-tw)/2,1578),t,font=f,fill=GOLD)
im.alpha_composite(logo.resize((150,150),Image.LANCZOS),(465,1680))
im.convert("RGB").save(f"{OUT}/Short_cover_1080x1920.jpg",quality=92)
print(os.listdir(OUT))
