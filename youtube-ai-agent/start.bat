@echo off
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python tapilmadi. python.org saytindan yukleyin, "Add Python to PATH" qutusunu isarelayin.
  pause
  exit /b 1
)
if not exist .venv python -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install -q -r requirements.txt
python run.py
pause
