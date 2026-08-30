@echo off
REM Device-test queue board - double-clickable launcher.
REM
REM Exists because the .js itself cannot be opened from Explorer: Windows runs
REM .js through Windows Script Host (legacy JScript), which dies on modern
REM syntax with "Invalid character / JavaScript compilation error". This .cmd
REM routes it through Node instead.
REM
REM Resolves the script via %~dp0 (this file own folder), so it works from any
REM checkout location and any user - no PATH entry needed, and no PowerShell
REM execution policy in the way (npm .ps1 shim is blocked under Restricted).
REM
REM Must stay CRLF - cmd.exe misparses an LF-only batch file. See .gitattributes.
REM
REM Double-click  -> live board, refreshing (--watch).
REM From a shell  -> flags pass through: dtq-board.cmd --repo alate --all
setlocal
title Device Test Queue
if "%~1"=="" (
  set "DTQ_ARGS=--watch"
) else (
  set "DTQ_ARGS=%*"
)
node "%~dp0status-board.js" %DTQ_ARGS%
REM Keep the window up when double-clicked, so a crash or a finished one-shot
REM run stays readable instead of vanishing.
echo.
echo (stopped - press any key to close)
pause >nul
endlocal
