@echo off
setlocal
cd /d "%~dp0"
set "MICROFLYERS_NODE=node"
where node >nul 2>nul
if errorlevel 1 (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
    set "MICROFLYERS_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  ) else (
    echo Please install Node.js 24 from https://nodejs.org and try again.
    pause
    exit /b 1
  )
)
echo Open http://localhost:4173 in your browser, then select Take flight.
echo Leave this window open while playing. Press Ctrl+C to stop.
"%MICROFLYERS_NODE%" scripts\serve.mjs
pause
