import json,sys,time,urllib.request
# usage: kie.py model out_path '{"prompt":...,"aspect_ratio":...}'
model,out,inp=sys.argv[1],sys.argv[2],json.loads(sys.argv[3])
H={"Authorization":"Bearer dummy","Content-Type":"application/json"}
def call(url,data=None):
    r=urllib.request.Request(url,data=json.dumps(data).encode() if data is not None else None,headers=H,method="POST" if data is not None else "GET")
    return json.load(urllib.request.urlopen(r,timeout=60))
j=call("https://api.kie.ai/api/v1/jobs/createTask",{"model":model,"input":inp})
if j.get("code")!=200: print("ERR",j); sys.exit(1)
tid=j["data"]["taskId"]
for i in range(120):
    time.sleep(4); s=call(f"https://api.kie.ai/api/v1/jobs/recordInfo?taskId={tid}")["data"]
    if s.get("state") in("success","fail"): break
print(out,"state:",s.get("state"),"credits:",s.get("creditsConsumed"),s.get("failMsg") or "")
if s.get("state")=="success":
    u=json.loads(s["resultJson"])["resultUrls"][0]
    d=call("https://api.kie.ai/api/v1/common/download-url",{"url":u})["data"]
    urllib.request.urlretrieve(d,out)
