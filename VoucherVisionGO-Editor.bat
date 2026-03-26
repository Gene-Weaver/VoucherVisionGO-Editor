@echo off
REM Double-click this file to launch VoucherVisionGO Editor on Windows
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
node_modules\.bin\electron .
