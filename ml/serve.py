from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from faster_whisper import WhisperModel

app = FastAPI(title="WhisperSelf ML Service", version="1.0.0")

_MODEL: WhisperModel | None = None
_MODEL_NAME = os.getenv("MODEL_PATH", "../models/large-v3")
_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
_DEFAULT_LANGUAGE = os.getenv("WHISPER_LANGUAGE", "en")
_DEFAULT_TASK = os.getenv("WHISPER_TASK", "transcribe")
_DEFAULT_BEAM_SIZE = int(os.getenv("WHISPER_BEAM_SIZE", "5"))


def get_model() -> WhisperModel:
  global _MODEL
  if _MODEL is None:
    _MODEL = WhisperModel(_MODEL_NAME, device=_DEVICE, compute_type=_COMPUTE_TYPE)
  return _MODEL


def run_transcription(audio_path: str, language: str | None, task: str | None) -> dict[str, Any]:
  model = get_model()
  resolved_language = None if not language or language == "auto" else language
  resolved_task = task or _DEFAULT_TASK

  segments, info = model.transcribe(
    audio_path,
    language=resolved_language,
    task=resolved_task,
    beam_size=_DEFAULT_BEAM_SIZE,
    vad_filter=True,
  )

  segment_list: list[dict[str, Any]] = []
  transcript_parts: list[str] = []

  for seg in segments:
    clean_text = seg.text.strip()
    segment_list.append({
      "start": float(seg.start),
      "end": float(seg.end),
      "text": clean_text,
    })
    transcript_parts.append(clean_text)

  return {
    "transcript": " ".join(part for part in transcript_parts if part).strip(),
    "language": info.language or _DEFAULT_LANGUAGE,
    "duration": float(info.duration or 0.0),
    "segments": segment_list,
  }


@app.get("/health")
def health() -> dict[str, Any]:
  model_loaded = _MODEL is not None
  return {
    "status": "ok",
    "model_loaded": model_loaded,
    "model_name": _MODEL_NAME,
    "device": _DEVICE,
    "compute_type": _COMPUTE_TYPE,
  }


@app.post("/transcribe")
async def transcribe(
  file: UploadFile = File(...),
  language: str = Form(default="auto"),
  task: str = Form(default=_DEFAULT_TASK),
) -> dict[str, Any]:
  suffix = Path(file.filename or "audio.wav").suffix or ".wav"
  temp_file_path = ""

  try:
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
      temp_file_path = temp_file.name
      content = await file.read()
      temp_file.write(content)

    return run_transcription(temp_file_path, language, task)
  except Exception as exc:
    raise HTTPException(status_code=500, detail=str(exc)) from exc
  finally:
    if temp_file_path and os.path.exists(temp_file_path):
      os.remove(temp_file_path)
