from __future__ import annotations

import argparse
from pathlib import Path

from faster_whisper import WhisperModel


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Download faster-whisper model")
  parser.add_argument("--model", default="large-v3", help="Model size/id")
  parser.add_argument("--output", default="./models", help="Output directory")
  parser.add_argument("--device", default="cpu")
  parser.add_argument("--compute-type", default="int8")
  return parser.parse_args()


def main() -> None:
  args = parse_args()
  output = Path(args.output)
  output.mkdir(parents=True, exist_ok=True)

  WhisperModel(
    args.model,
    device=args.device,
    compute_type=args.compute_type,
    download_root=str(output),
  )
  print(f"Model {args.model} cached under {output}")


if __name__ == "__main__":
  main()
