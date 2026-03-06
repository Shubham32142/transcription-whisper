import requests
import json
from pathlib import Path

mp4_file = Path("2026-03-06 14-59-57.mp4")
if not mp4_file.exists():
    print(f"Error: {mp4_file} not found")
    exit(1)

with open(mp4_file, "rb") as f:
    files = {"file": (mp4_file.name, f, "video/mp4")}
    data = {"language": "auto", "task": "transcribe"}
    headers = {"x-api-key": "test_key"}
    
    print(f"Uploading {mp4_file.name} ({mp4_file.stat().st_size} bytes)...")
    response = requests.post(
        "http://localhost:3001/transcribe",
        files=files,
        data=data,
        headers=headers,
        timeout=600
    )

print(f"Status: {response.status_code}")
result = response.json()
print(json.dumps(result, indent=2))
