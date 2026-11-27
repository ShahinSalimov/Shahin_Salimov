# Ashen Crown: documentary production pipeline

Code for the Ashen Crown YouTube channel (renamed from Ashen Atlas on 26 Nov 2026 because other channels share the old name; briefly Ashen Chronicles the same day). Each long documentary ships with 3 Shorts, thumbnails, Short covers, SRT subtitles and metadata. Videos, images and models are not stored here (too large). Everything is regenerated from these scripts.

## Brand (from Video #4)

- Name: Ashen Crown. Handle: @AshenCrown-i6f (YouTube-assigned suffix, kept by the user on 26 Nov 2026). Never say or show the handle in videos; use the channel name and links. Tagline: Real people · Lost worlds · Forgotten stories.
- Logo: assets/logo.png (= assets/branding/logo_1_green_king.png, swap if the user picks variant 2 or 3). Old compass logo: assets/logo_atlas_compass_old.png.
- Banners and logo variants: assets/branding/. Fonts: Cinzel (OFL). Name chosen to match the crowned bronze king logo.
- On-screen name, outro line and metadata tags use "Ashen Crown". Videos #1-#3 keep the old name.
- Template for new videos: videos/04-otzi/ (brand strings already updated).

## Publishing plan

- Long documentaries: 10-15 min, never longer than 16 min (27 Nov 2026 data review: 14-min video kept 30%, 34-min video only 8%). Each ships with 3 Shorts (25-33 s, hook in the first second): 2 cut from the long video + 1 "Modern vs Past" test Short (see below).
- Production and publishing every other day from 26 Nov 2026, start 01:25 Baku time.
- Published: #1 Mohenjo-daro (24 Nov), #2 Göbekli Tepe (25 Nov), #3 Bronze Age Collapse (26 Nov, 14:27, last Ken Burns video). From #4 on: motion format.
- Queue (human-centred, user direction 26 Nov 2026): Bronze Age Collapse (published 26 Nov), next:
  Ötzi the Iceman (who killed him?), The Egtved Girl (a Bronze Age teenager who travelled across Europe),
  Pompeii's last day through the lives of its people, Çatalhöyük (a family in a 9,000-year-old town),
  Tutankhamun (the boy king's short life), The Tollund Man, The Lady of Cao, Puabi the Queen of Ur.
- Human-centred rule (from early Shorts data; refined on 27 Nov, see Data review): every video and Short
  is told through a person: a face, a name or a life (who were they, how did they live, how did they die).
  Open on a human face + question, follow one character through the story, end on what their life tells us.

## Pipeline (per video folder)

| Step | Script | Output |
|---|---|---|
| Script | `script.py` (or `parse.py` from a PDF) | `sections.json` |
| Narration | `tts.py ROOT am_michael 0.92 en-us ROOT/narration` | WAV per section + `manifest.json` |
| Paragraph timing | `paras.py ROOT` | `paras.json` |
| Shot list | `shots.py` (edit) | prompts per paragraph |
| Images | `gen.py ROOT` (SDXL-Turbo, 1024x576, 4 steps) | `ROOT/gen/*.png` |
| Review | `sheet.py ROOT FROM TO out.jpg` | contact sheet |
| Graphics | `graphics.py ROOT` | maps, timeline, diagrams |
| Video | `render.py ROOT out.mp4` (uses `motion.py`; `MOTION=0` for old Ken Burns) | 1080p25 video + `timeline.json` |
| Music | `music.py ROOT` | original procedural score, ducked under the voice, `mix.wav` |
| Subtitles | `srt.py ROOT out.srt` | English SRT |
| Shorts | `gshort.py ROOT img ID`, then `render ID` | 1080x1920 Shorts |
| Thumbnails | `thumbs.py ROOT`, `covers.py LOGO OUT mohenjo/gobekli` | 1280x720 + 1080x1920 covers |

`chain.sh` / `chain2.sh` run the steps in order. They contain absolute scratchpad paths from the session that produced them. Edit the paths before reusing.

## Motion format (from Video #4 on)

Every still is animated by `motion.py`, never shown as a flat Ken Burns pan:

- Depth map per image (Depth-Anything-V2-Small, CPU, ~3.5 s each, cached in `ROOT/depth/`).
- 2.5D parallax camera: near layers move and grow faster than the background. Six moves cycle per shot: push-in, truck right, push-in + drift, crane up, pull-out, truck left.
- Atmosphere chosen from prompt keywords: dust motes always; embers + light flicker for fire/torch/lamp/smoke; drifting ground fog for sea/coast/mist/storm/mountain/night/ruin; snow for ice/snow/glacier. Film grain on every frame.
- Cost: ~125 ms per frame, about 45-60 min for a 14-min video.
- Write shot prompts with a clear foreground subject (person, object) against a deeper background: parallax only reads when there is depth in the picture.

## Environment

- Python venv with: `kokoro-onnx onnxruntime soundfile numpy scipy torch diffusers transformers pillow opencv-python-headless "geopandas<1.0"`
- Depth model `depth-anything/Depth-Anything-V2-Small-hf` downloads from Hugging Face on first run (~100 MB).
- Kokoro TTS model files `kokoro-v1.0.onnx` and `voices-v1.0.bin` in `ROOT/models/` (from the kokoro-onnx releases).
- SDXL-Turbo (`stabilityai/sdxl-turbo`) downloads from Hugging Face on first run.
- ffmpeg, Inter and DejaVu fonts.
- Channel logo: `assets/logo.png` (copy to `ROOT/img/i-001.png`).

## Lessons learned

- "T-shaped pillar" makes SDXL draw Roman columns. Describe "flat rectangular limestone monoliths, no columns, no lintels" instead.
- Ask for "prehistoric stone tools only" or the model adds metal tools.
- Always review contact sheets before the final render.
- Keep the title and the thumbnail on the same promise.
- The first Short (44 s) averaged 52% viewed. Shorts are now 25-35 s with no slow explanation in the middle.
- Never run two SDXL pipelines at once: 16 GB RAM, the second one is OOM-killed.
- SDXL anachronisms seen on Video #3: galleons/marinas for 'ship' (ask for 'long low wooden galley with oars, one short mast'), Roman arches for 'ruins', Corinthian helmets for any helmet, guitars for 'lyre', Latin letters on tablets (use extreme shallow depth of field).
- Files over ~440 MiB failed to send. Re-encode at ~1.6 Mb/s (about 250 MB for 20 min).

## Shorts formula (from data)

- First second: the concrete object or face itself on screen + a number or a famous name + a question. No establishing shot, no slow intro.
- Strongest pattern (27 Nov): famous name or concrete discovery ("Did a Chariot Kill Tutankhamun?" 93% viewed, "A Diver Found This 3,300-Year-Old Ship" 43%). Abstract titles fail even when they get first-day views ("Priest or King?" 15%, "The Last Letter of a Dying Kingdom" 13%).
- 25-33 s. 40-45 s Shorts fell to 18-38%. No slow middle.
- Judge a Short by average percentage viewed after 48 h, not by first-day views (the first-day burst is YouTube's test audience).
- Never delete old Shorts: the Vulture Stone Short took off on day 3 (617 views in one day).
- TikTok versions: run any Short script with `TT=1` → ending "Follow for more lost worlds. The full documentary is on YouTube.", output `*_TikTok.mp4`. Captions and posting plan in `tiktok/`.
- Long-video thumbnails use the same formula: face on the right, 2-4 word question on the left (`thumbs2.py`, `thumbs_m.py`).

## Data review 27 Nov 2026 (first 3 days, 3,243 views, 19.95 h, +10 subscribers)

| Short | Views | Avg viewed |
|---|---|---|
| Did a Chariot Kill Tutankhamun? (motion test, few hours of data) | 103 | 93% |
| A Diver Found This 3,300-Year-Old Ship | 660 | 43% |
| This City Had Drains 4,500 Years Ago (45 s) | 214 | 38% |
| The 11,500-Year-Old Vulture Stone | 625 | 34% |
| She's 10 cm Tall and 4,500 Years Old | 263 | 31% |
| They Thought These Were Gravestones | 230 | 28% |
| Who Were the Sea Peoples? | 206 | 25% |
| 4,500-Year-Old Writing That No One Can Read | 147 | 25% |
| Someone Carved This 11,500 Years Ago (40 s) | 125 | 18% |
| Priest or King? Nobody Knows Who Ruled This City | 354 | 15% |
| The Last Letter of a Dying Kingdom | 129 | 13% |

Long videos: Bronze Age Collapse 14:27, 30% viewed, CTR 1.46%; Stonehenge 19:31, 18%, CTR 2.47%; City With No Palace 34:18, 8%, CTR 1.54%.
Actions: long videos 10-15 min; thumbnail = one object or face + max 3 words, target CTR 4%+; Shorts by the formula above; re-check the Tutankhamun Short at 48 h (if it stays above 70% at 300+ views, motion + famous name becomes the default).

## Growth goal: YouTube Partner Program

- Full YPP (ad revenue): 1,000 subscribers + either 10 million public Shorts views in 90 days or 4,000 public watch hours on long videos in 12 months.
- Early tier (memberships, Super Thanks): 500 subscribers + 3 public uploads in 90 days + 3 million Shorts views in 90 days or 3,000 watch hours. Thresholds can differ by country; check YouTube Studio > Earn.
- 10 M Shorts views in 90 days is about 110,000 views per day. Day 3 was about 1,000-1,300. One viral Short (1 M+) changes this, so the plan is volume + testing: many Shorts, double down on any format that beats 60% viewed.

## Content pillar 2: Modern vs Past (test from 27 Nov 2026, user direction)

Link something people use or watch today (phones, supercars, luxury brands, drones, missiles, social media, fast food, billionaires) to its ancestor in the past. Cover the whole world, not only Europe: China, India, Persia, the Mongols, Mali, the Aztecs, the Inca, Egypt, Mesopotamia.

Rules:
- Every comparison must be historically real; hedge disputed claims ("may have", "historians debate"). Never invent an "ancient smartphone".
- Modern wars: compare the technology only (drones, armour, rockets). Never name sides or show real victims of current conflicts, no gore. Keeps videos advertiser-friendly.
- No real modern brand logos or car badges in images; describe "a modern luxury supercar" instead.
- Format: Short, 25-33 s. Open on a split image or a modern object morphing into the ancient one + question. Title: "Today's X Has a 2,000-Year-Old Ancestor" style.
- One test Short per production day. After 6 tests compare average viewed against pillar 1. A pillar that wins gets long videos too (e.g. "The War Machines That Came Before Drones", 10-15 min).

Test queue (facts to verify again before scripting):
1. War drones: Austria sent unmanned bomb balloons over Venice in 1849.
2. Rockets: Tipu Sultan's iron-cased Mysore rockets (1780s-1790s, India) inspired Britain's Congreve rockets.
3. Supercars: Tutankhamun was buried with six chariots, some covered in gold (the "Lamborghini of Egypt"). Follows up the Chariot Short.
4. Sports-star salaries: the Roman charioteer Gaius Appuleius Diocles is said to have earned about 35 million sesterces.
5. Richest person: Mansa Musa of Mali (1324 pilgrimage to Mecca, his gold reportedly hit prices in Cairo).
6. Internet / messaging: the Mongol Yam relay stations, the Persian Royal Road couriers.
7. Data storage: Inca khipu, knotted strings that recorded numbers.
8. Fast food: Pompeii's thermopolia, Roman street-food counters.
9. Tanks: Hussite war wagons (15th century, Bohemia).
10. Encryption: the Spartan scytale and the Caesar cipher.
11. Social media: graffiti on Pompeii's walls.
12. Luxury brand: Tyrian purple, a dye worth more than gold.

Channel name: keep "Ashen Crown" (it names no era or region). If Modern vs Past wins, widen the tagline first (e.g. "The past behind everything"), and add to the name only if the tagline is not enough.
