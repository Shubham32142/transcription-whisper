from __future__ import annotations

import argparse
import json
import os
from faster_whisper import WhisperModel


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="WhisperSelf standalone transcriber")
  parser.add_argument("--file", required=True, help="Path to normalized WAV file")
  parser.add_argument("--model-path", default=os.getenv("MODEL_PATH", "../models/large-v3"))
  parser.add_argument("--language", default=os.getenv("WHISPER_LANGUAGE", "auto"))
  parser.add_argument("--task", default=os.getenv("WHISPER_TASK", "transcribe"))
  parser.add_argument("--device", default=os.getenv("WHISPER_DEVICE", "cpu"))
  parser.add_argument("--compute-type", default=os.getenv("WHISPER_COMPUTE_TYPE", "int8"))
  parser.add_argument("--beam-size", type=int, default=int(os.getenv("WHISPER_BEAM_SIZE", "5")))
  return parser.parse_args()


def main() -> None:
  args = parse_args()
  resolved_language = None if args.language == "auto" else args.language

  model = WhisperModel(args.model_path, device=args.device, compute_type=args.compute_type)
  segments, info = model.transcribe(
    args.file,
    language=resolved_language,
    task=args.task,
    beam_size=args.beam_size,
    vad_filter=True,
  )

  segment_list = []
  transcript_parts = []

  for seg in segments:
    text = seg.text.strip()
    segment_list.append({"start": float(seg.start), "end": float(seg.end), "text": text})
    transcript_parts.append(text)

  payload = {
    "transcript": " ".join(part for part in transcript_parts if part).strip(),
    "language": info.language,
    "duration": float(info.duration or 0.0),
    "segments": segment_list,
  }

  print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
  main()
