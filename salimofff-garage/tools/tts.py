import asyncio,json,sys,os,edge_tts
ep,voice=sys.argv[1],sys.argv[2]; key=sys.argv[3] if len(sys.argv)>3 else "scenes"; rate=sys.argv[4] if len(sys.argv)>4 else "+0%"
d=json.load(open(f"{ep}/scenes.json")); os.makedirs(f"{ep}/tts_{key}",exist_ok=True)
async def one(i,t):
    c=edge_tts.Communicate(t,voice,rate=rate,boundary="WordBoundary"); words=[]
    with open(f"{ep}/tts_{key}/{i:02d}.mp3","wb") as f:
        async for ch in c.stream():
            if ch["type"]=="audio": f.write(ch["data"])
            elif ch["type"]=="WordBoundary": words.append([ch["offset"]/1e7,(ch["offset"]+ch["duration"])/1e7,ch["text"]])
    json.dump(words,open(f"{ep}/tts_{key}/{i:02d}.json","w"))
async def main():
    for i,s in enumerate(d[key]): await one(i,s["text"])
asyncio.run(main())
