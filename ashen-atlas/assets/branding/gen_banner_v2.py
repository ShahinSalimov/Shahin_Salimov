"""Ashen Crown banner v2 backgrounds (Ember Eye style). Usage: python gen_banner_v2.py OUTDIR"""
import sys, os, time
import torch
from diffusers import AutoPipelineForText2Image

TAIL = (", wide panoramic, dark moody night, glowing orange embers and grey ash drifting in the air, "
        "bronze and charcoal tones, photorealistic cinematic film still, 35mm film grain, high contrast")
BGS = {
    "burning_ruins": "ruins of an ancient temple with fallen stone columns, smouldering fires among the rubble",
    "ash_city": "silhouette of a ruined ancient city on the horizon under a smoky sky, distant fires glowing",
    "bronze_statues": "row of giant weathered bronze statues of ancient kings half buried in ash, faint ember glow",
}
SEEDS = [7, 77]
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
torch.set_num_threads(4)
pipe = AutoPipelineForText2Image.from_pretrained("stabilityai/sdxl-turbo", dtype=torch.bfloat16, variant="fp16")
pipe.set_progress_bar_config(disable=True)
for name, p in BGS.items():
    for s in SEEDS:
        fn = f"{out}/{name}_{s}.png"
        if os.path.exists(fn): continue
        t = time.time()
        im = pipe(p + TAIL, num_inference_steps=4, guidance_scale=0.0, width=1024, height=576,
                  generator=torch.Generator().manual_seed(s)).images[0]
        im.save(fn); print(name, s, round(time.time() - t), flush=True)
print("DONE", flush=True)
