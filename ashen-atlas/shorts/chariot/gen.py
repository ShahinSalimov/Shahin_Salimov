import sys, os, re, hashlib, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shots import SHOTS
STYLE=", photorealistic cinematic film still, Late Bronze Age eastern Mediterranean, dramatic warm light, bronze and ochre tones, 35mm film grain, shallow depth of field"
ART=", museum photography, photorealistic, soft spotlight"
PLAIN=", photorealistic cinematic film still, 35mm film grain"
NOSTYLE=re.compile(r"1880s|1980s|present-day|archaeolog|scientist|underwater|Iron Age|Phoenician merchant|Greek bard")
def full(kind,p):
    if kind=="art": return p+ART
    return p+(PLAIN if NOSTYLE.search(p) else STYLE)
def key(p): return hashlib.md5(p.encode()).hexdigest()[:10]
def jobs():
    j=[]
    for k,shots in SHOTS.items():
        for sh in shots:
            if sh[0] in("ai","art"): j.append(full(sh[0],sh[1]))
            if sh[0]=="split": j+=[full("ai",sh[1]), full("ai",sh[2])]
    return list(dict.fromkeys(j))
if __name__=="__main__":
    S=sys.argv[1]; OUT=f"{S}/gen"; os.makedirs(OUT,exist_ok=True)
    J=jobs(); print(len(J),"images", flush=True)
    if len(sys.argv)>2: sys.exit()
    import torch
    from diffusers import AutoPipelineForText2Image
    torch.set_num_threads(4)
    pipe=AutoPipelineForText2Image.from_pretrained("stabilityai/sdxl-turbo", dtype=torch.bfloat16, variant="fp16")
    pipe.set_progress_bar_config(disable=True)
    NEG=None
    for i,p in enumerate(J):
        fn=f"{OUT}/{key(p)}.png"
        if os.path.exists(fn): continue
        t=time.time()
        im=pipe(p, num_inference_steps=4, guidance_scale=0.0, width=1024, height=576, generator=torch.Generator().manual_seed(4321+i)).images[0]
        im.save(fn); print(i, round(time.time()-t), p[:60], flush=True)
    print("DONE", flush=True)
