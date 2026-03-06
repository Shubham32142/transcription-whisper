#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is not installed. Please install ffmpeg first."
  exit 1
fi

cd "$ROOT_DIR/api"
corepack enable
pnpm install

cd "$ROOT_DIR/ml"
pip install -r requirements.txt

echo "Setup complete."
