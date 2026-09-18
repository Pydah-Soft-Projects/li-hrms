@echo off
:: Navigate to the directory shown in your screenshot
cd /d "E:\li-hrms"

:: Start the ecosystem file using PM2
call pm2 start ecosystem.config.js

:: Save the PM2 list just in case
call pm2 save

exit
