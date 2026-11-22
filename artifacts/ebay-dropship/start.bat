@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Paketler qurasdirilir...
  call npm install --omit=dev
)
if not exist .env copy .env.example .env
start "" http://localhost:3000
node --env-file-if-exists=.env src/index.ts
pause
