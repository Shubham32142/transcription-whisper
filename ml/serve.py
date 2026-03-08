from __future__ import annotations

import os
import tempfile
import logging
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from faster_whisper import WhisperModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="WhisperSelf ML Service", version="1.0.0")

# Model cache to store loaded models
_MODELS: dict[str, WhisperModel] = {}
_MODEL_MAPPING = {
    "tiny": "Systran/faster-whisper-tiny",
    "base": "Systran/faster-whisper-base",
    "small": "Systran/faster-whisper-small",
    "medium": "Systran/faster-whisper-medium",
    "large": "Systran/faster-whisper-large-v3",
}

_DEFAULT_MODEL = "small"
_MODEL_NAME = os.getenv("MODEL_PATH", "../models/large-v3")
_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
_DEFAULT_LANGUAGE = os.getenv("WHISPER_LANGUAGE", "en")
_DEFAULT_TASK = os.getenv("WHISPER_TASK", "transcribe")
_DEFAULT_BEAM_SIZE = int(os.getenv("WHISPER_BEAM_SIZE", "5"))


def get_model(model_name: str | None = None) -> WhisperModel:
  """Load and return a Whisper model. Caches loaded models for reuse."""
  global _MODELS
  
  # Determine which model to load
  model_key = model_name or _DEFAULT_MODEL
  model_path = _MODEL_MAPPING.get(model_key, _MODEL_NAME)
  
  logger.info(f"Requesting model: {model_key} -> {model_path}")
  
  # Check if model is already loaded
  if model_key in _MODELS:
    logger.info(f"Using cached model: {model_key}")
    return _MODELS[model_key]
  
  # Load new model
  logger.info(f"Loading Whisper model: {model_path}")
  loaded_model = WhisperModel(model_path, device=_DEVICE, compute_type=_COMPUTE_TYPE)
  _MODELS[model_key] = loaded_model
  logger.info(f"Model loaded successfully: {model_key}")
  return loaded_model


def run_transcription(audio_path: str, language: str | None, task: str | None, model: str | None = None) -> dict[str, Any]:
  try:
    logger.info(f"Starting transcription: {audio_path}")
    model_obj = get_model(model)
    logger.info("Model loaded successfully")
    resolved_language = None if not language or language == "auto" else language
    resolved_task = task or _DEFAULT_TASK

    logger.info(f"Transcribing with model={model}, language={resolved_language}, task={resolved_task}")
    segments, info = model_obj.transcribe(
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

    result = {
      "transcript": " ".join(part for part in transcript_parts if part).strip(),
      "language": info.language or _DEFAULT_LANGUAGE,
      "duration": float(info.duration or 0.0),
      "segments": segment_list,
    }
    logger.info(f"Transcription complete: {len(segment_list)} segments")
    return result
  except Exception as e:
    logger.error(f"Transcription error: {str(e)}", exc_info=True)
    raise


@app.get("/health")
def health() -> dict[str, Any]:
  model_keys = list(_MODELS.keys())
  model_loaded = len(_MODELS) > 0
  return {
    "status": "ok",
    "model_loaded": model_loaded,
    "model_name": _DEFAULT_MODEL,
    "models_available": list(_MODEL_MAPPING.keys()),
    "models_cached": model_keys,
    "device": _DEVICE,
    "compute_type": _COMPUTE_TYPE,
  }


@app.post("/transcribe")
async def transcribe(
  file: UploadFile = File(...),
  model: str = Form(default=_DEFAULT_MODEL),
  language: str = Form(default="auto"),
  task: str = Form(default=_DEFAULT_TASK),
) -> dict[str, Any]:
  suffix = Path(file.filename or "audio.wav").suffix or ".wav"
  temp_file_path = ""

  try:
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
      temp_file_path = temp_file.name
      logger.info(f"Saving uploaded file: {file.filename} ({suffix})")
      content = await file.read()
      logger.info(f"File size: {len(content) / 1024 / 1024:.2f} MB")
      temp_file.write(content)

    logger.info(f"Processing file: {temp_file_path}")
    result = run_transcription(temp_file_path, language, task, model)
    logger.info("Transcription successful")
    return result
  except Exception as exc:
    logger.error(f"Transcription request failed: {str(exc)}", exc_info=True)
    raise HTTPException(status_code=500, detail=str(exc)) from exc
  finally:
    if temp_file_path and os.path.exists(temp_file_path):
      logger.info(f"Cleaning up temp file: {temp_file_path}")
      os.remove(temp_file_path)


if __name__ == "__main__":
  import uvicorn
  
  port = int(os.getenv("PORT", "8000"))
  host = os.getenv("HOST", "0.0.0.0")
  
  print(f"\n{'='*60}")
  print(f"Starting WhisperSelf ML Service")
  print(f"{'='*60}")
  print(f"Host:          {host}")
  print(f"Port:          {port}")
  print(f"Model:         {_MODEL_NAME}")
  print(f"Device:        {_DEVICE}")
  print(f"Compute Type:  {_COMPUTE_TYPE}")
  print(f"Language:      {_DEFAULT_LANGUAGE}")
  print(f"Task:          {_DEFAULT_TASK}")
  print(f"{'='*60}\n")
  
  uvicorn.run(app, host=host, port=port)
