@echo off
echo ===================================================
echo   RANK REEL EDITOR - 1-CLICK PUSH TO VERCEL (GIT)
echo ===================================================
git add .
set /p msg="Type a short note for this update (or press Enter for 'Updated editor'): "
if "%msg%"=="" set msg=Updated editor
git commit -m "%msg%"
git push
echo.
echo Done! Vercel is now building your updated website automatically.
pause
