"""Ashen Chronicles avatar v2: realistic, high-contrast concepts readable at small size.
Usage: python gen_logo_v2.py OUTDIR"""
import sys, os, time
import torch
from diffusers import AutoPipelineForText2Image

TAIL = (", centered close-up, dramatic rim light, pitch black background, high contrast, "
        "photorealistic, ultra detailed, cinematic macro photography, 85mm lens")
CONCEPTS = {
    "ember_crown": "an ancient gold royal crown half buried in grey ash, glowing orange embers and sparks rising around it",
    "burning_king": "stone face of an ancient king crumbling into ash and glowing embers on one side, eyes glowing faint orange",
    "cracked_mask": "ancient golden death mask with deep cracks, molten orange fire glowing from inside the cracks",
    "ash_hourglass": "antique bronze hourglass filled with grey ash instead of sand, tiny glowing embers falling, ancient ruins reflected in the glass",
    "ash_skull_crown": "weathered ancient human skull wearing a tarnished gold crown, drifting ash and embers",
    "ember_eye": "extreme close-up of an ancient bronze statue eye, cracked patina, orange ember light glowing in the iris, ash particles",
}
SEEDS = [11, 222, 3333]

out = sys.argv[1]; os.makedirs(out, exist_ok=True)
torch.set_num_threads(4)
pipe = AutoPipelineForText2Image.from_pretrained("stabilityai/sdxl-turbo", dtype=torch.bfloat16, variant="fp16")
pipe.set_progress_bar_config(disable=True)
for name, p in CONCEPTS.items():
    for s in SEEDS:
        fn = f"{out}/{name}_{s}.png"
        if os.path.exists(fn): continue
        t = time.time()
        im = pipe(p + TAIL, num_inference_steps=4, guidance_scale=0.0, width=768, height=768,
                  generator=torch.Generator().manual_seed(s)).images[0]
        im.save(fn); print(name, s, round(time.time() - t), flush=True)
print("DONE", flush=True)
