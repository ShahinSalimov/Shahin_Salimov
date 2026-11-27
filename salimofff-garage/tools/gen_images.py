import json,sys,subprocess,os
from concurrent.futures import ThreadPoolExecutor
ep,aspect=sys.argv[1],sys.argv[2]; key=sys.argv[3] if len(sys.argv)>3 else "scenes"
d=json.load(open(f"{ep}/scenes.json")); os.makedirs(f"{ep}/img_{key}",exist_ok=True)
tool=os.path.join(os.path.dirname(__file__),"kie.py")
M={"nb2":"nano-banana-2-lite","z":"z-image"}
def job(i_s):
    i,s=i_s; out=f"{ep}/img_{key}/{i:02d}.png"
    if os.path.exists(out): return
    p=s["img"].replace("{car}",d["car"])+", "+d["style"]
    for t in range(2):
        r=subprocess.run(["python3","-I",tool,M[s["model"]],out,json.dumps({"prompt":p,"aspect_ratio":aspect})],capture_output=True,text=True)
        print(r.stdout.strip()[-120:],r.stderr.strip()[-200:]); 
        if os.path.exists(out): return
with ThreadPoolExecutor(6) as ex: list(ex.map(job,enumerate(d[key])))
