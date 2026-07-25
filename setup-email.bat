@echo off
echo ========================================
echo  SWU IFSS - Email Setup Script
echo ========================================
echo.

echo Step 1: Installing dependencies...
cd functions
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)
cd ..
echo ✓ Dependencies installed successfully
echo.

echo Step 2: Deploying Cloud Functions...
echo (This may take 1-2 minutes)
firebase deploy --only functions
if errorlevel 1 (
    echo ERROR: Failed to deploy functions
    echo Make sure you have:
    echo   1. Upgraded to Firebase Blaze plan
    echo   2. Configured email settings with:
    echo      firebase functions:config:set email.user="your@gmail.com"
    echo      firebase functions:config:set email.pass="app-password"
    pause
    exit /b 1
)
echo.

echo ========================================
echo  ✓ Setup Complete!
echo ========================================
echo.
echo Email notifications are now active.
echo.
echo Next steps:
echo  1. Test by creating a registrar account
echo  2. Check email inbox for welcome message
echo.
echo For troubleshooting, see EMAIL_SETUP_GUIDE.md
echo.
pause
