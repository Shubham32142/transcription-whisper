from __future__ import annotations

import asyncio
import os
import tempfile
import logging
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

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
_DEFAULT_BEAM_SIZE = int(os.getenv("WHISPER_BEAM_SIZE", "1"))
_DEFAULT_BEST_OF = int(os.getenv("WHISPER_BEST_OF", "1"))
_DEFAULT_VAD_FILTER = os.getenv("WHISPER_VAD_FILTER", "true").lower() == "true"
_DEFAULT_CONDITION_ON_PREVIOUS_TEXT = (
  os.getenv("WHISPER_CONDITION_ON_PREVIOUS_TEXT", "false").lower() == "true"
)
_DEFAULT_CPU_THREADS = int(os.getenv("WHISPER_CPU_THREADS", str(max(1, os.cpu_count() or 1))))
_DEFAULT_NUM_WORKERS = int(os.getenv("WHISPER_NUM_WORKERS", "1"))
_JOB_RETENTION_SECONDS = int(os.getenv("JOB_RETENTION_SECONDS", "3600"))

_JOBS: dict[str, dict[str, Any]] = {}
_JOB_LOCK = threading.Lock()


def utc_now_iso() -> str:
  return datetime.now(timezone.utc).isoformat()


def build_progress(
  *,
  stage: str,
  percentage: float,
  processed_seconds: float = 0.0,
  total_seconds: float | None = None,
  elapsed_seconds: float = 0.0,
  current_text: str | None = None,
) -> dict[str, Any]:
  return {
    "stage": stage,
    "percentage": round(max(0.0, min(percentage, 100.0)), 2),
    "processedSeconds": round(max(processed_seconds, 0.0), 2),
    "totalSeconds": round(total_seconds, 2) if total_seconds is not None else None,
    "elapsedSeconds": round(max(elapsed_seconds, 0.0), 2),
    "currentText": current_text or "",
  }


def snapshot_job(job_id: str) -> dict[str, Any]:
  with _JOB_LOCK:
    job = _JOBS.get(job_id)
    if job is None:
      raise KeyError(job_id)

    return {
      **job,
      "progress": dict(job["progress"]),
      "result": dict(job["result"]) if job.get("result") else None,
    }


def update_job(job_id: str, **updates: Any) -> None:
  with _JOB_LOCK:
    job = _JOBS.get(job_id)
    if job is None:
      return

    job.update(updates)
    job["updatedAt"] = utc_now_iso()


def remove_job(job_id: str) -> dict[str, Any] | None:
  with _JOB_LOCK:
    return _JOBS.pop(job_id, None)


def prune_jobs() -> None:
  cutoff = time.time() - _JOB_RETENTION_SECONDS

  with _JOB_LOCK:
    expired_job_ids = []

    for job_id, job in _JOBS.items():
      if job["status"] not in {"completed", "failed"}:
        continue

      completed_at = job.get("completedAt") or job.get("updatedAt")
      if not completed_at:
        continue

      try:
        completed_ts = datetime.fromisoformat(completed_at).timestamp()
      except ValueError:
        continue

      if completed_ts < cutoff:
        expired_job_ids.append(job_id)

    for job_id in expired_job_ids:
      _JOBS.pop(job_id, None)


def format_timestamp(seconds: float) -> str:
  total_milliseconds = int(round(seconds * 1000))
  hours, remainder = divmod(total_milliseconds, 3600000)
  minutes, remainder = divmod(remainder, 60000)
  secs, milliseconds = divmod(remainder, 1000)

  if hours > 0:
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{milliseconds:03d}"

  return f"{minutes:02d}:{secs:02d}.{milliseconds:03d}"


def create_job_payload(
  *,
  job_id: str,
  file_name: str,
  model: str,
  language: str,
  task: str,
) -> dict[str, Any]:
  timestamp = utc_now_iso()
  return {
    "id": job_id,
    "status": "queued",
    "fileName": file_name,
    "model": model,
    "language": language,
    "task": task,
    "createdAt": timestamp,
    "updatedAt": timestamp,
    "completedAt": None,
    "error": None,
    "result": None,
    "progress": build_progress(stage="queued", percentage=0.0),
  }


def get_model(model_name: str | None = None) -> WhisperModel:
  """Load and return a Whisper model. Caches loaded models for reuse."""
  # _MODELS is defined at module level; no need for global
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
  loaded_model = WhisperModel(
    model_path,
    device=_DEVICE,
    compute_type=_COMPUTE_TYPE,
    cpu_threads=_DEFAULT_CPU_THREADS,
    num_workers=_DEFAULT_NUM_WORKERS,
  )
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
      best_of=_DEFAULT_BEST_OF,
      vad_filter=_DEFAULT_VAD_FILTER,
      condition_on_previous_text=_DEFAULT_CONDITION_ON_PREVIOUS_TEXT,
    )

    segment_list: list[dict[str, Any]] = []
    utterance_list: list[dict[str, Any]] = []
    transcript_parts: list[str] = []
    structured_lines: list[str] = []

    for seg in segments:
      clean_text = seg.text.strip()
      start = float(seg.start)
      end = float(seg.end)
      speaker = None

      segment = {
        "start": start,
        "end": end,
        "text": clean_text,
      }
      utterance = {
        "speaker": speaker,
        "start": start,
        "end": end,
        "text": clean_text,
        "timestamp": f"{format_timestamp(start)} - {format_timestamp(end)}",
      }

      segment_list.append(segment)
      utterance_list.append(utterance)
      transcript_parts.append(clean_text)
      structured_lines.append(f"[{utterance['timestamp']}] {clean_text}")

    result = {
      "transcript": " ".join(part for part in transcript_parts if part).strip(),
      "language": info.language or _DEFAULT_LANGUAGE,
      "duration": float(info.duration or 0.0),
      "segments": segment_list,
      "utterances": utterance_list,
      "structuredTranscript": "\n".join(line for line in structured_lines if line).strip(),
      "speakerLabelsAvailable": False,
    }
    logger.info(f"Transcription complete: {len(segment_list)} segments")
    return result
  except Exception as e:
    logger.error(f"Transcription error: {str(e)}", exc_info=True)
    raise


def run_transcription_job(
  job_id: str,
  audio_path: str,
  language: str | None,
  task: str | None,
  model: str | None = None,
) -> dict[str, Any]:
  started_at = time.monotonic()

  try:
    logger.info(f"Starting job transcription: job_id={job_id}, path={audio_path}")
    update_job(job_id, status="processing", progress=build_progress(stage="loading_model", percentage=2.0))
    model_obj = get_model(model)

    resolved_language = None if not language or language == "auto" else language
    resolved_task = task or _DEFAULT_TASK

    update_job(job_id, progress=build_progress(stage="transcribing", percentage=5.0))
    segments, info = model_obj.transcribe(
      audio_path,
      language=resolved_language,
      task=resolved_task,
      beam_size=_DEFAULT_BEAM_SIZE,
      best_of=_DEFAULT_BEST_OF,
      vad_filter=_DEFAULT_VAD_FILTER,
      condition_on_previous_text=_DEFAULT_CONDITION_ON_PREVIOUS_TEXT,
    )

    total_seconds = float(info.duration or 0.0) or None
    segment_list: list[dict[str, Any]] = []
    utterance_list: list[dict[str, Any]] = []
    transcript_parts: list[str] = []
    structured_lines: list[str] = []

    for seg in segments:
      clean_text = seg.text.strip()
      start = float(seg.start)
      end = float(seg.end)
      speaker = None

      segment = {
        "start": start,
        "end": end,
        "text": clean_text,
      }
      utterance = {
        "speaker": speaker,
        "start": start,
        "end": end,
        "text": clean_text,
        "timestamp": f"{format_timestamp(start)} - {format_timestamp(end)}",
      }

      segment_list.append(segment)
      utterance_list.append(utterance)
      transcript_parts.append(clean_text)
      structured_lines.append(f"[{utterance['timestamp']}] {clean_text}")

      elapsed_seconds = time.monotonic() - started_at
      processed_seconds = min(end, total_seconds) if total_seconds is not None else end
      percentage = (processed_seconds / total_seconds) * 100 if total_seconds else 10 + len(segment_list)
      update_job(
        job_id,
        progress=build_progress(
          stage="transcribing",
          percentage=min(percentage, 99.0),
          processed_seconds=processed_seconds,
          total_seconds=total_seconds,
          elapsed_seconds=elapsed_seconds,
          current_text=clean_text,
        ),
      )

    result = {
      "transcript": " ".join(part for part in transcript_parts if part).strip(),
      "language": info.language or _DEFAULT_LANGUAGE,
      "duration": float(info.duration or 0.0),
      "segments": segment_list,
      "utterances": utterance_list,
      "structuredTranscript": "\n".join(line for line in structured_lines if line).strip(),
      "speakerLabelsAvailable": False,
    }
    logger.info(f"Transcription job complete: job_id={job_id}, segments={len(segment_list)}")
    return result
  except Exception as exc:
    logger.error(f"Job transcription error: job_id={job_id}, error={str(exc)}", exc_info=True)
    raise


async def process_transcription_job(
  job_id: str,
  temp_file_path: str,
  language: str,
  task: str,
  model: str,
) -> None:
  started_at = time.monotonic()

  try:
    result = await asyncio.to_thread(run_transcription_job, job_id, temp_file_path, language, task, model)
    elapsed_seconds = time.monotonic() - started_at
    total_seconds = float(result.get("duration") or 0.0) or None
    update_job(
      job_id,
      status="completed",
      completedAt=utc_now_iso(),
      result=result,
      progress=build_progress(
        stage="completed",
        percentage=100.0,
        processed_seconds=total_seconds or 0.0,
        total_seconds=total_seconds,
        elapsed_seconds=elapsed_seconds,
      ),
    )
  except Exception as exc:
    elapsed_seconds = time.monotonic() - started_at
    existing_job = snapshot_job(job_id)
    update_job(
      job_id,
      status="failed",
      completedAt=utc_now_iso(),
      error=str(exc),
      progress=build_progress(
        stage="failed",
        percentage=existing_job["progress"].get("percentage", 0.0),
        processed_seconds=existing_job["progress"].get("processedSeconds", 0.0),
        total_seconds=existing_job["progress"].get("totalSeconds"),
        elapsed_seconds=elapsed_seconds,
        current_text=existing_job["progress"].get("currentText"),
      ),
    )
  finally:
    if temp_file_path and os.path.exists(temp_file_path):
      logger.info(f"Cleaning up temp file: {temp_file_path}")
      os.remove(temp_file_path)


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
    "beam_size": _DEFAULT_BEAM_SIZE,
    "best_of": _DEFAULT_BEST_OF,
    "vad_filter": _DEFAULT_VAD_FILTER,
    "condition_on_previous_text": _DEFAULT_CONDITION_ON_PREVIOUS_TEXT,
    "cpu_threads": _DEFAULT_CPU_THREADS,
    "num_workers": _DEFAULT_NUM_WORKERS,
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


@app.post("/transcribe/jobs")
async def create_transcription_job(
  file: UploadFile = File(...),
  model: str = Form(default=_DEFAULT_MODEL),
  language: str = Form(default="auto"),
  task: str = Form(default=_DEFAULT_TASK),
) -> dict[str, Any]:
  prune_jobs()

  suffix = Path(file.filename or "audio.wav").suffix or ".wav"

  try:
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
      temp_file_path = temp_file.name
      logger.info(f"Queueing uploaded file for job: {file.filename} ({suffix})")
      content = await file.read()
      temp_file.write(content)

    job_id = str(uuid4())
    job = create_job_payload(
      job_id=job_id,
      file_name=file.filename or Path(temp_file_path).name,
      model=model,
      language=language,
      task=task,
    )

    with _JOB_LOCK:
      _JOBS[job_id] = job

    asyncio.create_task(process_transcription_job(job_id, temp_file_path, language, task, model))
    return snapshot_job(job_id)
  except Exception as exc:
    logger.error(f"Failed to create transcription job: {str(exc)}", exc_info=True)
    raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/transcribe/jobs/{job_id}")
def get_transcription_job(job_id: str) -> dict[str, Any]:
  prune_jobs()

  try:
    return snapshot_job(job_id)
  except KeyError as exc:
    raise HTTPException(status_code=404, detail="Job not found") from exc


@app.delete("/transcribe/jobs/{job_id}")
def delete_transcription_job(job_id: str) -> dict[str, Any]:
  deleted_job = remove_job(job_id)
  if deleted_job is None:
    raise HTTPException(status_code=404, detail="Job not found")

  return {"id": job_id, "deleted": True}


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
  print(f"Beam Size:     {_DEFAULT_BEAM_SIZE}")
  print(f"Best Of:       {_DEFAULT_BEST_OF}")
  print(f"VAD Filter:    {_DEFAULT_VAD_FILTER}")
  print(f"CPU Threads:   {_DEFAULT_CPU_THREADS}")
  print(f"Workers:       {_DEFAULT_NUM_WORKERS}")
  print(f"Language:      {_DEFAULT_LANGUAGE}")
  print(f"Task:          {_DEFAULT_TASK}")
  print(f"{'='*60}\n")
  
  uvicorn.run(app, host=host, port=port)
