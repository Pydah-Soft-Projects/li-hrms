@echo off
echo ========================================
echo Running Tests for Based on Present Days
echo ========================================
echo.

echo Installing dependencies...
call npm install
echo.

echo Running all tests...
call npm test
echo.

echo ========================================
echo Test execution complete!
echo ========================================
pause
