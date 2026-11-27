# Salimofff Garage — daily production runbook

Channel: youtube.com/@salimofff.garage (English, US/EU audience)
Niche: Forgotten Legends (long documentaries) + Shorts cut from the same story.
Owner uploads and publishes himself. Explain to him in Azerbaijani; scripts/prompts in English.

## Schedule (Asia/Baku time)
- Day 1 = 2026-11-27 (DeLorean, done). Days 2-7 (2026-11-28 .. 2026-12-03): every day 1 long + 2 Shorts.
- From 2026-12-05: every other day (12-05, 12-07, 12-09, ...): 1 long + 1 Short. Odd days in between: nothing.
- Check `state.json` → `next_episode` and today's Baku date before doing anything. If today is an off day, stop.

## Setup in a fresh container (about 20 s)
```bash
cd salimofff-garage && bash setup.sh
export SSL_CERT_FILE=/root/.ccr/ca-bundle.crt
V=.venv/bin/python; T=tools; W=work/epNN   # work/ is gitignored
```

## Steps per episode
1. Topic: `state.json` → `topics[next_episode]` (owner may override in chat). Write `episodes/epNN/scenes.json`
   (same schema as ep01): ~1250 words, 30-36 scenes, cold open hook, 6 chapters, CTA asking for the next car in comments.
   - Facts: only well-known facts; soften uncertain numbers with "around/about". Web pages are blocked here.
   - Real people: never show faces (seen from behind, silhouette, hands). No real brand logos/badges or readable text in prompts.
   - `"model"`: `nb2` (nano-banana-2-lite, 4 credits) only where the specific car must look right, max ~12 per long;
     everything else `z` (z-image, 0.8 credits).
2. Shorts: `episodes/epNN/short_a/scenes.json` (+ `short_b` on days 2-7). 7-8 lines, 35-45 s, hook in line 1,
   vertical prompts. Short A loops back to its first line; Short B ends with "Full story on Salimofff Garage".
3. Copy scenes into `$W`, then:
```bash
python3 -I $T/gen_images.py $W 16:9            # long images -> $W/img_scenes
python3 -I $T/gen_images.py $W/short_a 9:16
$V -I $T/tts.py $W en-US-ChristopherNeural scenes -6%
$V -I $T/tts.py $W/short_a en-US-ChristopherNeural scenes +4%
```
4. QA: build a contact sheet of every image and look at it. Regenerate wrong cars, readable text, faces of real people.
5. Render (long takes ~25-30 min; run in background):
```bash
$V -I $T/music.py $W/music.wav <long_seconds+15> <seed> doc
$V -I $T/render_long.py $W assets/fonts assets/sfx $W/music.wav      # -> $W/epNN_long.mp4 (~200 MB)
python3 -I $T/make_srt.py $W $W/epNN_long.en.srt
$V -I $T/music.py $W/music_a.wav 45 <seed> drive
$V -I $T/render_short.py $W/short_a assets/fonts $W/music_a.wav $W/epNN_short_A.mp4 assets/sfx
```
   render_long.py expects `assets/fonts` to contain Anton.ttf and Oswald.ttf (it does).
6. Thumbnail: one nb2 16:9 image (car on right 2/3, dark left third), then 2-3 words in Anton on the left
   (white + red word + gold subtitle), 1280x720 JPG. See ep01 for the style.
6b. Short covers: `$V -I $T/short_cover.py $W/short_a/img_scenes/00.png assets/fonts "LINE ONE" "LINE TWO" $W/epNN_cover_short_A.jpg`
   (2-4 punchy words per line, white + gold). Also send the Short frames (img_scenes) as JPG; the owner wants them.
7. QA the renders: frames at several timestamps, captions never stacked, loudness about -14 LUFS.
8. Write `$W/epNN_upload_info.md` (title, description with chapters from `$W/chapters.txt`, tags, pinned comment,
   Short titles, "Altered or synthetic content: YES", Baku publish times 17:00 / 21:00 / 03:00).
9. Deliver with SendUserFile: long mp4, shorts, thumbnail, Short covers + Short frames, srt, upload_info.
10. Update `state.json` (`done`, `next_episode`, `credits_left`), commit `episodes/epNN/*.json`, upload_info and state, push.

## Budget
Owner tops up kie.ai with $5/month (1 credit = $0.005). Check balance first:
`curl -s https://api.kie.ai/api/v1/chat/credit -H "Authorization: Bearer dummy"`
- Target ≤ 80 credits per episode day.
- Below 80 credits: use only `z` images except thumbnail. Below 10: stop and tell the owner to top up.

## Known environment limits
- Wikimedia / Pexels / YouTube upload are not reachable from the cloud container (owner declined network change).
- kie.ai result files: download through `POST /api/v1/common/download-url` (tools/kie.py does this).
