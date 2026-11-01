@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js не найден. Установи Node.js 18+ с https://nodejs.org и запусти снова.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Установка зависимостей...
  call npm install
)
echo Запуск FORGE...
call npm run dev
pause
