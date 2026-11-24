import sys, os, re, hashlib, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shots import SHOTS
STYLE=", photorealistic cinematic film still, Indus Valley civilization 2500 BCE, warm golden light, ochre terracotta tones, 35mm film grain, shallow depth of field"
ART=", museum photography, photorealistic, macro lens, soft spotlight"
PLAIN=", photorealistic cinematic film still, 35mm film grain"
PEOPLE=re.compile(r"\b(people|man|men|woman|women|family|families|children|child|workers|craftsman|merchant|merchants|potters|farmers|builders|figures|sailors|artisan|elders|mother|traveller|metalsmith|scholar|linguist)\b")
NOSTYLE=re.compile(r"1920s|1930s|1940s|1950s|1960s|modern|Egypt|Mesopotamia|Himalaya|cave|Giza|granite stele|cuneiform|present-day|journal|laboratory|newspaper|Mediterranean|lake bed|dry river channel")
def full(kind,p):
    if kind=="art": return p+ART
    s=PLAIN if NOSTYLE.search(p) else STYLE
    if PEOPLE.search(p) and not NOSTYLE.search(p): p=p+", South Asian features"
    return p+s
def key(p): return hashlib.md5(p.encode()).hexdigest()[:10]
if __name__=="__main__":
    S=sys.argv[1]; OUT=f"{S}/gen"; os.makedirs(OUT,exist_ok=True)
    jobs=[]
    for k,shots in SHOTS.items():
        for sh in shots:
            if sh[0] in("ai","art"): jobs.append(full(sh[0],sh[1]))
            if sh[0]=="split": jobs+= [full("ai",sh[1]), full("ai",sh[2])]
    jobs=list(dict.fromkeys(jobs))
    print(len(jobs),"images", flush=True)
    if len(sys.argv)>2: sys.exit()
    import torch
    from diffusers import AutoPipelineForText2Image
    torch.set_num_threads(4)
    pipe=AutoPipelineForText2Image.from_pretrained("stabilityai/sdxl-turbo", dtype=torch.bfloat16, variant="fp16")
    pipe.set_progress_bar_config(disable=True)
    for i,p in enumerate(jobs):
        fn=f"{OUT}/{key(p)}.png"
        if os.path.exists(fn): continue
        t=time.time()
        im=pipe(p, num_inference_steps=4, guidance_scale=0.0, width=1024, height=576, generator=torch.Generator().manual_seed(1234+i)).images[0]
        im.save(fn); print(i, round(time.time()-t), p[:60], flush=True)
    print("DONE", flush=True)
