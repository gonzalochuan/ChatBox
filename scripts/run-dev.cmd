@echo off
setlocal

REM Configure your Node.js path once here
set "NODEBIN=E:\NodeJS"
set "PATH=%NODEBIN%;%PATH%"

REM Start LAN server (port 4000) in a new window
start "ChatBox Server" cmd /k "cd /d C:\Users\developer\chatbox\server && npm run dev"

REM Start Web app (port 3000) in a new window
start "ChatBox Web" cmd /k "cd /d C:\Users\developer\chatbox\web && npm run dev"

endlocal
