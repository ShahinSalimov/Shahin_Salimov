import sys, torch
from diffusers import AutoPipelineForText2Image
S=sys.argv[1]; torch.set_num_threads(4)
pipe=AutoPipelineForText2Image.from_pretrained("stabilityai/sdxl-turbo", dtype=torch.bfloat16, variant="fp16"); pipe.set_progress_bar_config(disable=True)
Q=", photorealistic cinematic film still, high contrast, 35mm"
J={"t1":("dramatic wide shot of the ruins of an ancient brick city with a stupa on a mound on the right, silhouetted against a blazing orange sunset, ember sparks in the air, dark empty sky on the left"+Q,1024,576),
   "t2":("ruins of an ancient brick citadel mound on the right under a deep purple twilight sky with stars, mysterious violet glow behind the mound, dark empty left side"+Q,1024,576),
   "t3":("golden sunrise over an ancient sunken brick pool with wide staircases on the right, glowing warm light, dust, dark shadowed left side"+Q,1024,576),
   "sc":("vertical close-up of water flowing through an ancient covered brick drain, one brick slab lifted, glowing orange light, ember sparks, dark top"+Q,576,1024)}
for k,(p,w,h) in J.items():
    for s in range(3):
        pipe(p,num_inference_steps=4,guidance_scale=0.0,width=w,height=h,generator=torch.Generator().manual_seed(900+s)).images[0].save(f"{S}/thumb/{k}_{s}.png"); print(k,s,flush=True)
