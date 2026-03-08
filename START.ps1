# Voice Transcription App - Startup Script
# Run this script to start both ML and API services

Write-Host "`n=== Voice Transcription App Startup ===" -ForegroundColor Cyan
Write-Host ""

$projectRoot = $PSScriptRoot

# Function to check if port is in use
function Test-Port {
    param($Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return $null -ne $connection
}

# Kill processes on ports if already running
if (Test-Port 8000) {
    Write-Host "Stopping existing ML service on port 8000..." -ForegroundColor Yellow
    Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | 
        Select-Object -ExpandProperty OwningProcess | 
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 1
}

if (Test-Port 3000) {
    Write-Host "Stopping existing API service on port 3000..." -ForegroundColor Yellow
    Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | 
        Select-Object -ExpandProperty OwningProcess | 
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 1
}

Write-Host "`nStarting services..." -ForegroundColor Cyan

# Start ML Service in background
Write-Host "1. Starting ML Service (port 8000)..." -ForegroundColor Green
$mlJob = Start-Job -ScriptBlock {
    param($root)
    Set-Location $root
    & "$root\.venv\Scripts\Activate.ps1"
    Set-Location "$root\ml"
    python serve.py
} -ArgumentList $projectRoot

Start-Sleep -Seconds 3

# Start API Service in background
Write-Host "2. Starting API Service (port 3000)..." -ForegroundColor Green
$apiJob = Start-Job -ScriptBlock {
    param($root)
    Set-Location "$root\api"
    pnpm dev
} -ArgumentList $projectRoot

Write-Host "`nWaiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Check status
Write-Host "`n=== SERVICE STATUS ===" -ForegroundColor Cyan
$mlOk = $false
$apiOk = $false

try {
    $ml = Invoke-RestMethod http://localhost:8000/health -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✅ ML Service (port 8000) - Running" -ForegroundColor Green
    $mlOk = $true
} catch {
    Write-Host "❌ ML Service (port 8000) - Check job: Get-Job -Id $($mlJob.Id)" -ForegroundColor Red
}

try {
    $api = Invoke-RestMethod http://localhost:3000/api/config -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✅ API Service (port 3000) - Running" -ForegroundColor Green
    $apiOk = $true
} catch {
    Write-Host "❌ API Service (port 3000) - Check job: Get-Job -Id $($apiJob.Id)" -ForegroundColor Red
}

if ($mlOk -and $apiOk) {
    Write-Host "`n🎉 SUCCESS! App is ready!" -ForegroundColor Green
    Write-Host "`n👉 Open in browser: " -NoNewline
    Write-Host "http://localhost:3000" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Features:" -ForegroundColor Gray
    Write-Host "  • Upload audio/video files" -ForegroundColor Gray
    Write-Host "  • Record from microphone" -ForegroundColor Gray
    Write-Host "  • AI transcription with Whisper" -ForegroundColor Gray
    Write-Host "  • No API key required!" -ForegroundColor Gray
    Write-Host ""
    Write-Host "To view logs:" -ForegroundColor Yellow
    Write-Host "  ML Service: " -NoNewline; Write-Host "Receive-Job -Id $($mlJob.Id) -Keep" -ForegroundColor Gray
    Write-Host "  API Service: " -NoNewline; Write-Host "Receive-Job -Id $($apiJob.Id) -Keep" -ForegroundColor Gray
    Write-Host ""
    Write-Host "To stop services:" -ForegroundColor Yellow
    Write-Host "  Stop-Job -Id $($mlJob.Id),$($apiJob.Id)" -ForegroundColor Gray
    Write-Host "  Or press Ctrl+C and close this window" -ForegroundColor Gray
} else {
    Write-Host "`n⚠️ Some services failed to start" -ForegroundColor Red
    Write-Host "Check job outputs:" -ForegroundColor Yellow
    Write-Host "  Receive-Job -Id $($mlJob.Id)" -ForegroundColor Gray
    Write-Host "  Receive-Job -Id $($apiJob.Id)" -ForegroundColor Gray
}

Write-Host "`nPress Ctrl+C to exit and stop services..." -ForegroundColor Gray
try {
    while ($true) {
        Start-Sleep -Seconds 30
        # Keep script alive
    }
} finally {
    Write-Host "`nStopping services..." -ForegroundColor Yellow
    Stop-Job -Id $mlJob.Id, $apiJob.Id -ErrorAction SilentlyContinue
    Remove-Job -Id $mlJob.Id, $apiJob.Id -Force -ErrorAction SilentlyContinue
}
