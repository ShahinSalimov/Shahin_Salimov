#!/bin/bash
. /tmp/claude-0/-home-user-Shahin-Salimov/4df16a1c-c402-531b-9541-cec4397ad2a6/scratchpad/venv2/bin/activate; export HF_HUB_DISABLE_XET=1 HF_HUB_OFFLINE=1
while ! grep -q DONE /tmp/claude-0/-home-user-Shahin-Salimov/4df16a1c-c402-531b-9541-cec4397ad2a6/scratchpad/bac/gen.log; do sleep 20; done
for id in seapeoples ugarit ship; do python -I /tmp/claude-0/-home-user-Shahin-Salimov/4df16a1c-c402-531b-9541-cec4397ad2a6/scratchpad/bac/tools/gshort.py /tmp/claude-0/-home-user-Shahin-Salimov/4df16a1c-c402-531b-9541-cec4397ad2a6/scratchpad/bac img $id >> /tmp/claude-0/-home-user-Shahin-Salimov/4df16a1c-c402-531b-9541-cec4397ad2a6/scratchpad/bac/shortimg.log 2>&1; done
echo SHORTIMG_DONE >> /tmp/claude-0/-home-user-Shahin-Salimov/4df16a1c-c402-531b-9541-cec4397ad2a6/scratchpad/bac/shortimg.log
