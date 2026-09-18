@echo off
setlocal
cd /d "%~dp0"
where uv >nul 2>nul
if errorlevel 1 (
  echo [ERROR] uv not found. Install uv or run from the RYMCrawler environment.
  pause
  exit /b 2
)
if not exist ".rym-crawler-venv\Scripts\python.exe" uv venv .rym-crawler-venv
.rym-crawler-venv\Scripts\python.exe -c "import bs4, html5lib" >nul 2>nul
if errorlevel 1 uv pip install --python .rym-crawler-venv\Scripts\python.exe beautifulsoup4==4.15.0 html5lib==1.1
.rym-crawler-venv\Scripts\python.exe tools\import_rym_singlefile.py %*
if errorlevel 1 pause
