# Voice Transcription - stop both services
$ErrorActionPreference = 'SilentlyContinue'

# Stop the ML service (python serve.py)
Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
    Where-Object { $_.CommandLine -like '*serve.py*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

# Stop whatever is listening on the API port 3000 (node/tsx)
Get-NetTCPConnection -LocalPort 3000 -State Listen |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force }

Write-Host 'Voice Transcription services stopped.'
