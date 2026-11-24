import sys, torch
from diffusers import AutoPipelineForText2Image
M=sys.argv[1]; torch.set_num_threads(4)
pipe=AutoPipelineForText2Image.from_pretrained("stabilityai/sdxl-turbo", dtype=torch.bfloat16, variant="fp16"); pipe.set_progress_bar_config(disable=True)
P="close-up of an ancient carved stone bust of a bearded man with half-closed eyes and a headband, face on the right side of the frame, dark empty left side, dramatic warm orange side light, ember sparks, photorealistic, 35mm"
for s in range(4):
    pipe(P,num_inference_steps=4,guidance_scale=0.0,width=1024,height=576,generator=torch.Generator().manual_seed(1300+s)).images[0].save(f"{M}/thumb/pk_{s}.png"); print(s,flush=True)
