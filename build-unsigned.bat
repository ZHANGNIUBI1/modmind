@echo off
setlocal
set "EXIT_CODE=0"
title ModMind Unsigned Release Builder

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install Node.js and try again.
  goto :failed
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Check your Node.js installation.
  goto :failed
)

for /f "delims=" %%V in ('node -p "require('./package.json').version"') do set "CURRENT_VERSION=%%V"
echo.
echo ModMind Unsigned Release Builder
echo Current version: %CURRENT_VERSION%
echo Example version: 1.4.0
echo.

set "RELEASE_VERSION="
set /p "RELEASE_VERSION=Enter the version to build: "
if not defined RELEASE_VERSION (
  echo.
  echo Cancelled. No version files were changed.
  goto :end
)

echo.
echo [1/2] Updating the version to %RELEASE_VERSION%...
call npm version "%RELEASE_VERSION%" --no-git-tag-version --allow-same-version
if errorlevel 1 (
  echo.
  echo [ERROR] The version is invalid or the version files could not be updated.
  goto :failed
)

echo.
echo [2/2] Building the unsigned Windows release...
call npm run dist:win:unsigned
if errorlevel 1 (
  echo.
  echo [ERROR] Packaging failed. Review the log above for details.
  goto :failed
)

echo.
echo [DONE] ModMind %RELEASE_VERSION% was packaged successfully.
echo Output directory: %~dp0release
goto :end

:failed
set "EXIT_CODE=1"
echo.
echo The operation did not complete.

:end
echo.
pause
endlocal & exit /b %EXIT_CODE%
