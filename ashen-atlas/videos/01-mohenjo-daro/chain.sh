#!/bin/bash
S=/tmp/claude-0/-home-user-Shahin-Salimov/4df16a1c-c402-531b-9541-cec4397ad2a6/scratchpad
while pgrep -f "tools/gen.py" >/dev/null; do sleep 20; done
. $S/venv2/bin/activate; export HF_HUB_DISABLE_XET=1
python -I $S/tools/gen.py $S > $S/gen2.log 2>&1
cd $S && python -I $S/tools/render.py $S $S/deliver/Mohenjo-daro_FULL_1080p.mp4 > $S/render.log 2>&1
echo CHAIN_DONE >> $S/render.log
