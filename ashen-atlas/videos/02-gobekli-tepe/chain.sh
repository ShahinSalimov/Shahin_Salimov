#!/bin/bash
G=/tmp/claude-0/-home-user-Shahin-Salimov/4df16a1c-c402-531b-9541-cec4397ad2a6/scratchpad/gt; S=/tmp/claude-0/-home-user-Shahin-Salimov/4df16a1c-c402-531b-9541-cec4397ad2a6/scratchpad
while [ ! -f $G/narration/manifest.json ]; do sleep 15; done
cd $G && python3 -I $G/tools/paras.py $G > $G/paras.log 2>&1
while ! grep -q DONE $G/gen.log; do sleep 20; done
. $S/venv2/bin/activate; export HF_HUB_DISABLE_XET=1
python -I $G/tools/short.py $G img > $G/short.log 2>&1 &
cd $G && python -I $G/tools/render.py $G $G/deliver/voice_only.mp4 > $G/render.log 2>&1
python -I $G/tools/music.py $G > $G/music.log 2>&1
ffmpeg -y -loglevel error -i $G/deliver/voice_only.mp4 -i $G/mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -ar 48000 -b:a 192k -shortest -movflags +faststart $G/deliver/Gobekli-Tepe_MUSIC_1080p.mp4
python -I $G/tools/srt.py $G $G/deliver/Gobekli-Tepe_EN.srt >> $G/render.log 2>&1
wait
python -I $G/tools/short.py $G render >> $G/short.log 2>&1
echo CHAIN_DONE >> $G/render.log
