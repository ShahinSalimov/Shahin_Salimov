# Ashen Atlas: documentary production pipeline

Code for the Ashen Atlas YouTube channel. Each long documentary ships with 3 Shorts, thumbnails, Short covers, SRT subtitles and metadata. Videos, images and models are not stored here (too large). Everything is regenerated from these scripts.

## Publishing plan

- Long documentaries: 12-18 min, never longer than 20 min (user rule, 26 Nov 2026). Each ships with 3 Shorts (25-30 s, hook in the first second).
- Production and publishing every other day from 26 Nov 2026, start 01:25 Baku time.
- Published: #1 Mohenjo-daro (24 Nov), #2 Göbekli Tepe (25 Nov).
- Queue (human-centred, user direction 26 Nov 2026): Bronze Age Collapse (in production), then
  Ötzi the Iceman (who killed him?), The Egtved Girl (a Bronze Age teenager who travelled across Europe),
  Pompeii's last day through the lives of its people, Çatalhöyük (a family in a 9,000-year-old town),
  Tutankhamun (the boy king's short life), The Tollund Man, The Lady of Cao, Puabi the Queen of Ur.
- Human-centred rule (from Shorts data: Priest-King, Dancing Girl and Gravestones Shorts led): every video and Short
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
| Video | `render.py ROOT out.mp4` | 1080p25 video + `timeline.json` |
| Music | `music.py ROOT` | original procedural score, ducked under the voice, `mix.wav` |
| Subtitles | `srt.py ROOT out.srt` | English SRT |
| Shorts | `gshort.py ROOT img ID`, then `render ID` | 1080x1920 Shorts |
| Thumbnails | `thumbs.py ROOT`, `covers.py LOGO OUT mohenjo/gobekli` | 1280x720 + 1080x1920 covers |

`chain.sh` / `chain2.sh` run the steps in order. They contain absolute scratchpad paths from the session that produced them. Edit the paths before reusing.

## Environment

- Python venv with: `kokoro-onnx onnxruntime soundfile numpy scipy torch diffusers pillow opencv-python-headless "geopandas<1.0"`
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
- Files over ~440 MiB failed to send. Re-encode at ~1.6 Mb/s (about 250 MB for 20 min).

## Shorts formula (from data)

- First second: big close-up FACE (statue, relief, person) + a question hook ("Priest or King?"). Priest-King Short: 268 views in 4 h vs 126 in 48 h for the earlier drains Short.
- 25-30 s, no slow middle.
- TikTok versions: run any Short script with `TT=1` → ending "Follow for more lost worlds. The full documentary is on YouTube.", output `*_TikTok.mp4`. Captions and posting plan in `tiktok/`.
- Long-video thumbnails use the same formula: face on the right, 2-4 word question on the left (`thumbs2.py`, `thumbs_m.py`).
