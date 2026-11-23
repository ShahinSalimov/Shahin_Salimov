@echo off
cd /d %~dp0
if not exist .venv (python -m venv .venv)
call .venv\Scripts\activate
pip install -q -r requirements.txt
python run.py
pause
