# Voice Transcription - one-click launcher
# Starts the ML (8000) and API (3000) services if they aren't already running,
# then opens the app in your default browser. Safe to click repeatedly.

$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot          # scripts/ -> project root
$py = Join-Path $root '.venv\Scripts\python.exe'
$logs = Join-Path $root 'logs'
$env:HF_HUB_DISABLE_SYMLINKS_WARNING = '1'

if (-not (Test-Path $logs)) { New-Item -ItemType Directory -Path $logs | Out-Null }

function Test-Port($port) {
    return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

# 1) ML service (FastAPI / faster-whisper) on port 8000
if (-not (Test-Port 8000)) {
    Start-Process -FilePath $py -ArgumentList 'serve.py' `
        -WorkingDirectory (Join-Path $root 'ml') `
        -RedirectStandardOutput (Join-Path $logs 'ml.out.log') `
        -RedirectStandardError  (Join-Path $logs 'ml.err.log') `
        -WindowStyle Hidden
}

# 2) API service (Express) on port 3000
if (-not (Test-Port 3000)) {
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    $pnpmCjs = Join-Path $env:APPDATA 'npm\node_modules\pnpm\bin\pnpm.cjs'
    if ($node -and (Test-Path $pnpmCjs)) {
        Start-Process -FilePath $node -ArgumentList "`"$pnpmCjs`"", 'dev' `
            -WorkingDirectory (Join-Path $root 'api') `
            -RedirectStandardOutput (Join-Path $logs 'api.out.log') `
            -RedirectStandardError  (Join-Path $logs 'api.err.log') `
            -WindowStyle Hidden
    } else {
        Start-Process -FilePath 'pnpm.cmd' -ArgumentList 'dev' `
            -WorkingDirectory (Join-Path $root 'api') -WindowStyle Hidden
    }
}

# 3) Wait for the API to accept connections (up to ~45s), then open the browser
$deadline = (Get-Date).AddSeconds(45)
do {
    Start-Sleep -Milliseconds 1000
} until ((Test-Port 3000) -or (Get-Date) -gt $deadline)

Start-Process 'http://localhost:3000'
