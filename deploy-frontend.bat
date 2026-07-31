@echo off
chcp 65001 >nul

set "BACKUP_ROOT=C:\Users\User\Desktop\Новая папка (2)\backup\frontend"

cd /d "%~dp0"

echo ==========================================
echo Publishing frontend to GitHub Pages...
echo ==========================================

echo.
echo ==========================================
echo 0. Running automated tests
echo ==========================================
set "FRONTEND_PROJECT_DIR=%~dp0"
node --test "%~dp0..\tests\*.test.js"
if errorlevel 1 (
    echo.
    echo TESTS FAILED - see output above.
    echo DEPLOY STOPPED - fix failing tests first.
    pause
    exit /b 1
)
echo All tests passed.

echo.
set /p "COMMIT_MSG=Describe your changes: "
git add -A
git commit -m "%COMMIT_MSG%" > "%TEMP%\fe_commit_out.txt" 2>&1
set COMMIT_ERR=%errorlevel%
type "%TEMP%\fe_commit_out.txt"

set COMMIT_FAILED=0
if not %COMMIT_ERR%==0 set COMMIT_FAILED=1
findstr /C:"nothing to commit" /C:"nothing added to commit" "%TEMP%\fe_commit_out.txt" >nul
if not errorlevel 1 set COMMIT_FAILED=0

if %COMMIT_FAILED%==1 (
    echo.
    echo ERROR: git commit failed, see message above.
    echo DEPLOY STOPPED - no push was made.
    pause
    exit /b 1
)

echo.
echo Extra local backup outside project...
for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set TS=%%t
robocopy "%~dp0.." "%BACKUP_ROOT%\%TS%" /E /XD .git node_modules /NFL /NDL /NJH /NJS
echo Backup source: %~dp0.. (includes deploy/, tests/, package.json)
echo Backup saved to %BACKUP_ROOT%\%TS%
forfiles /p "%BACKUP_ROOT%" /d -30 /c "cmd /c if @isdir==TRUE rd /s /q @path" 2>nul

git push origin main

echo.
echo ==========================================
echo Done. GitHub Pages will update within a minute.
echo ==========================================
pause
