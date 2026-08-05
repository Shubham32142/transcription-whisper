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
from faster_whisper import BatchedInferencePipeline, WhisperModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables from .env so tuning (model, beam size, batch size, ...)
# actually applies. Without this, the values in ml/.env are silently ignored.
try:
  from dotenv import load_dotenv

  load_dotenv(Path(__file__).resolve().parent / ".env")  # ml/.env
  load_dotenv()  # also pick up a .env in the current working directory
except ImportError:
  logger.warning(
    "python-dotenv not installed; .env files are ignored. Install with: pip install python-dotenv"
  )

app = FastAPI(title="WhisperSelf ML Service", version="1.0.0")

# Model cache to store loaded models (and their batched pipelines)
_MODELS: dict[str, WhisperModel] = {}
# Tracks the cpu_threads each cached model was loaded with, so a request asking
# for a different core count triggers a reload rather than reusing the old one.
_MODEL_CPU_THREADS: dict[str, int] = {}
_BATCHED_MODELS: dict[str, BatchedInferencePipeline] = {}
_MODEL_LOAD_LOCK = threading.Lock()
_MAX_CPU_THREADS = os.cpu_count() or 8
# Diarization pipeline is loaded lazily; _DIARIZATION_LOAD_FAILED avoids retrying a bad load.
_DIARIZATION_PIPELINE: Any = None
_DIARIZATION_LOAD_FAILED = False
_MODEL_MAPPING = {
    "tiny": "Systran/faster-whisper-tiny",
    "base": "Systran/faster-whisper-base",
    "small": "Systran/faster-whisper-small",
    "medium": "Systran/faster-whisper-medium",
    "large": "Systran/faster-whisper-large-v3",
    "large-v3": "Systran/faster-whisper-large-v3",
    # Distil-Whisper large-v3: near large-v3 accuracy for English at a fraction of the
    # compute cost. English transcription only (no translation / non-English).
    "distil-large-v3": "Systran/faster-distil-whisper-large-v3",
}

_DEFAULT_MODEL = os.getenv("WHISPER_DEFAULT_MODEL", "distil-large-v3")
_MODEL_NAME = os.getenv("MODEL_PATH", "../models/large-v3")
_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
_DEFAULT_LANGUAGE = os.getenv("WHISPER_LANGUAGE", "en")
_DEFAULT_TASK = os.getenv("WHISPER_TASK", "transcribe")
_DEFAULT_BEAM_SIZE = int(os.getenv("WHISPER_BEAM_SIZE", "5"))
_DEFAULT_BEST_OF = int(os.getenv("WHISPER_BEST_OF", "5"))
_DEFAULT_VAD_FILTER = os.getenv("WHISPER_VAD_FILTER", "true").lower() == "true"
_DEFAULT_CONDITION_ON_PREVIOUS_TEXT = (
  os.getenv("WHISPER_CONDITION_ON_PREVIOUS_TEXT", "false").lower() == "true"
)
_DEFAULT_CPU_THREADS = int(os.getenv("WHISPER_CPU_THREADS", str(max(1, os.cpu_count() or 1))))
_DEFAULT_NUM_WORKERS = int(os.getenv("WHISPER_NUM_WORKERS", "1"))
# Batched inference (faster-whisper >= 1.1) gives a big speedup on GPU / many-core machines.
# On a saturated CPU the benefit is negligible (measured ~1.02x), and it costs extra RAM and
# makes job progress choppier, so default it on only for CUDA. VAD silence-skipping works in
# both modes, so CPU transcription loses nothing by leaving batching off.
_USE_BATCHED = (
  os.getenv("WHISPER_USE_BATCHED", "true" if _DEVICE.startswith("cuda") else "false").lower()
  == "true"
)
_DEFAULT_BATCH_SIZE = int(os.getenv("WHISPER_BATCH_SIZE", "8"))

# Word-level timestamps: cheap, powers click-to-seek + precise subtitles + diarization assignment.
_WORD_TIMESTAMPS = os.getenv("WHISPER_WORD_TIMESTAMPS", "true").lower() == "true"

# Speaker diarization ("who said what"). Off by default: needs pyannote.audio installed, a
# Hugging Face token (HF_TOKEN), and one-time acceptance of the gated model's terms on HF.
# When any of those is missing the service logs a warning and transcribes without speakers.
_DIARIZATION_ENABLED = os.getenv("WHISPER_DIARIZATION", "false").lower() == "true"
_DIARIZATION_MODEL = os.getenv("DIARIZATION_MODEL", "pyannote/speaker-diarization-3.1")
_HF_TOKEN = (
  os.getenv("HF_TOKEN")
  or os.getenv("HUGGINGFACE_TOKEN")
  or os.getenv("HUGGING_FACE_HUB_TOKEN")
)
# 0 = let the model decide the number of speakers.
_DIARIZATION_MIN_SPEAKERS = int(os.getenv("WHISPER_MIN_SPEAKERS", "0")) or None
_DIARIZATION_MAX_SPEAKERS = int(os.getenv("WHISPER_MAX_SPEAKERS", "0")) or None

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


def resolve_cpu_threads(cpu_threads: int | None) -> int:
  """Clamp a requested CPU thread count to [1, number of cores]; 0/None -> default."""
  if not cpu_threads or cpu_threads <= 0:
    return _DEFAULT_CPU_THREADS
  return max(1, min(int(cpu_threads), _MAX_CPU_THREADS))


def get_model(model_name: str | None = None, cpu_threads: int | None = None) -> WhisperModel:
  """Load and return a Whisper model. Caches loaded models for reuse (thread-safe).

  cpu_threads controls how many CPU cores the model uses. Because the thread count
  is fixed when the model is constructed, a request for a different count reloads
  the model (replacing the cached instance).
  """
  model_key = model_name or _DEFAULT_MODEL
  model_path = _MODEL_MAPPING.get(model_key, _MODEL_NAME)
  threads = resolve_cpu_threads(cpu_threads)

  cached = _MODELS.get(model_key)
  if cached is not None and _MODEL_CPU_THREADS.get(model_key) == threads:
    return cached

  # Serialize loads so a warmup thread and an incoming request never load twice.
  with _MODEL_LOAD_LOCK:
    cached = _MODELS.get(model_key)
    if cached is not None and _MODEL_CPU_THREADS.get(model_key) == threads:
      return cached

    logger.info(f"Loading Whisper model: {model_key} -> {model_path} (cpu_threads={threads})")
    loaded_model = WhisperModel(
      model_path,
      device=_DEVICE,
      compute_type=_COMPUTE_TYPE,
      cpu_threads=threads,
      num_workers=_DEFAULT_NUM_WORKERS,
    )
    _MODELS[model_key] = loaded_model
    _MODEL_CPU_THREADS[model_key] = threads
    # Thread count changed -> drop any batched pipeline built on the old instance.
    _BATCHED_MODELS.pop(model_key, None)
    logger.info(f"Model loaded successfully: {model_key} (cpu_threads={threads})")
    return loaded_model


def get_batched_model(
  model_name: str | None = None, cpu_threads: int | None = None
) -> BatchedInferencePipeline:
  """Return a cached BatchedInferencePipeline wrapping the requested model."""
  model_key = model_name or _DEFAULT_MODEL

  # Ensure the base model matches the requested thread count first (may reload it,
  # which clears any stale batched pipeline for this key).
  base_model = get_model(model_key, cpu_threads)
  cached = _BATCHED_MODELS.get(model_key)
  if cached is not None:
    return cached

  with _MODEL_LOAD_LOCK:
    cached = _BATCHED_MODELS.get(model_key)
    if cached is not None:
      return cached

    logger.info(f"Building batched pipeline for model: {model_key}")
    pipeline = BatchedInferencePipeline(model=base_model)
    _BATCHED_MODELS[model_key] = pipeline
    return pipeline


def resolve_model_key(model_name: str | None, resolved_task: str) -> str:
  """Resolve the effective model, guarding against unsupported model/task combos."""
  model_key = model_name or _DEFAULT_MODEL
  # Distil-Whisper models are English transcription only; fall back for translation.
  if model_key.startswith("distil") and resolved_task == "translate":
    logger.info("Distil model does not support translation; falling back to 'large'.")
    return "large"
  return model_key


def transcribe_audio(
  audio_path: str,
  resolved_language: str | None,
  resolved_task: str,
  model_name: str | None,
  cpu_threads: int | None = None,
) -> tuple[Any, Any]:
  """Transcribe via the batched pipeline when enabled, else the plain model.

  Returns the (segments, info) tuple produced by faster-whisper.
  """
  model_key = resolve_model_key(model_name, resolved_task)
  params: dict[str, Any] = {
    "language": resolved_language,
    "task": resolved_task,
    "beam_size": _DEFAULT_BEAM_SIZE,
    "best_of": _DEFAULT_BEST_OF,
    "vad_filter": _DEFAULT_VAD_FILTER,
    "condition_on_previous_text": _DEFAULT_CONDITION_ON_PREVIOUS_TEXT,
    "word_timestamps": _WORD_TIMESTAMPS,
  }

  if _USE_BATCHED:
    pipeline = get_batched_model(model_key, cpu_threads)
    return pipeline.transcribe(audio_path, batch_size=_DEFAULT_BATCH_SIZE, **params)

  model_obj = get_model(model_key, cpu_threads)
  return model_obj.transcribe(audio_path, **params)


def serialize_segment(seg: Any) -> tuple[dict[str, Any], dict[str, Any], str]:
  """Convert a faster-whisper segment into our segment + utterance dicts."""
  clean_text = seg.text.strip()
  start = float(seg.start)
  end = float(seg.end)

  words: list[dict[str, Any]] = []
  for word in getattr(seg, "words", None) or []:
    words.append(
      {
        "start": float(word.start),
        "end": float(word.end),
        "word": word.word,
        "probability": float(getattr(word, "probability", 0.0) or 0.0),
      }
    )

  segment = {"start": start, "end": end, "text": clean_text, "speaker": None, "words": words}
  utterance = {
    "speaker": None,
    "start": start,
    "end": end,
    "text": clean_text,
    "timestamp": f"{format_timestamp(start)} - {format_timestamp(end)}",
  }
  return segment, utterance, clean_text


def get_diarization_pipeline() -> Any:
  """Load (once) and return the pyannote diarization pipeline, or None if unavailable."""
  global _DIARIZATION_PIPELINE, _DIARIZATION_LOAD_FAILED

  if _DIARIZATION_PIPELINE is not None:
    return _DIARIZATION_PIPELINE
  if _DIARIZATION_LOAD_FAILED:
    return None

  with _MODEL_LOAD_LOCK:
    if _DIARIZATION_PIPELINE is not None:
      return _DIARIZATION_PIPELINE
    if _DIARIZATION_LOAD_FAILED:
      return None

    try:
      import torch
      from pyannote.audio import Pipeline
    except ImportError:
      logger.warning(
        "pyannote.audio not installed; diarization disabled. Install: pip install pyannote.audio"
      )
      _DIARIZATION_LOAD_FAILED = True
      return None

    if not _HF_TOKEN:
      logger.warning(
        "Diarization enabled but HF_TOKEN is not set; disabling. Set HF_TOKEN and accept the "
        "model terms at https://hf.co/%s",
        _DIARIZATION_MODEL,
      )
      _DIARIZATION_LOAD_FAILED = True
      return None

    try:
      logger.info(f"Loading diarization pipeline: {_DIARIZATION_MODEL}")
      try:
        # pyannote.audio >= 3.1 / newer huggingface_hub uses `token`
        pipeline = Pipeline.from_pretrained(_DIARIZATION_MODEL, token=_HF_TOKEN)
      except TypeError:
        # Older versions used `use_auth_token`
        pipeline = Pipeline.from_pretrained(_DIARIZATION_MODEL, use_auth_token=_HF_TOKEN)
      pipeline.to(torch.device("cuda" if _DEVICE.startswith("cuda") else "cpu"))
      _DIARIZATION_PIPELINE = pipeline
      logger.info("Diarization pipeline loaded")
      return pipeline
    except Exception as exc:  # noqa: BLE001
      logger.error(
        "Failed to load diarization pipeline (valid HF_TOKEN + accepted model terms on HF?): %s",
        exc,
      )
      _DIARIZATION_LOAD_FAILED = True
      return None


def _load_waveform_for_diarization(audio_path: str) -> Any:
  """Load audio into an in-memory {waveform, sample_rate} dict for pyannote.

  Avoids torchaudio's file decoding, which is broken on this stack (torch 2.10 + Windows
  routes decoding through torchcodec, whose native libs fail to load). Reading with
  soundfile and handing pyannote the tensor directly sidesteps that entirely.
  Returns the file path as a fallback if soundfile can't read it (e.g. non-WAV input).
  """
  try:
    import numpy as np
    import soundfile as sf
    import torch

    data, sample_rate = sf.read(audio_path, dtype="float32", always_2d=True)  # (time, channels)
    waveform = torch.from_numpy(np.ascontiguousarray(data.T))  # (channels, time)
    return {"waveform": waveform, "sample_rate": sample_rate}
  except Exception as exc:  # noqa: BLE001
    logger.warning(f"soundfile could not load audio for diarization ({exc}); passing path instead")
    return audio_path


def _annotation_to_turns(annotation: Any) -> list[tuple[float, float, str]]:
  return [
    (float(turn.start), float(turn.end), str(speaker))
    for turn, _, speaker in annotation.itertracks(yield_label=True)
  ]


def _extract_turns(diarization: Any) -> list[tuple[float, float, str]]:
  """Pull speaker turns from a pyannote result across API versions.

  - Classic pyannote (<=3.x): the result is an Annotation with .itertracks().
  - Newer pyannote (4.x): the result wraps the Annotation in a DiarizeOutput-style object,
    exposed via .speaker_diarization (or similar) — find the field that has .itertracks().
  """
  if hasattr(diarization, "itertracks"):
    return _annotation_to_turns(diarization)

  for attr in ("speaker_diarization", "diarization", "annotation", "prediction", "output"):
    candidate = getattr(diarization, attr, None)
    if candidate is not None and hasattr(candidate, "itertracks"):
      return _annotation_to_turns(candidate)

  # Tuple/namedtuple result: scan elements for the Annotation.
  if isinstance(diarization, (tuple, list)):
    for item in diarization:
      if hasattr(item, "itertracks"):
        return _annotation_to_turns(item)

  raise TypeError(f"Unrecognized diarization output type: {type(diarization).__name__}")


def diarize_audio(audio_path: str) -> list[tuple[float, float, str]] | None:
  """Return [(start, end, raw_speaker_label), ...] sorted by start, or None on failure."""
  pipeline = get_diarization_pipeline()
  if pipeline is None:
    return None

  try:
    kwargs: dict[str, Any] = {}
    if _DIARIZATION_MIN_SPEAKERS:
      kwargs["min_speakers"] = _DIARIZATION_MIN_SPEAKERS
    if _DIARIZATION_MAX_SPEAKERS:
      kwargs["max_speakers"] = _DIARIZATION_MAX_SPEAKERS

    diarization = pipeline(_load_waveform_for_diarization(audio_path), **kwargs)
    turns = _extract_turns(diarization)
    turns.sort(key=lambda item: item[0])
    return turns or None
  except Exception as exc:  # noqa: BLE001
    logger.error(f"Diarization failed: {exc}", exc_info=True)
    return None


def assign_speakers(
  segment_list: list[dict[str, Any]],
  utterance_list: list[dict[str, Any]],
  turns: list[tuple[float, float, str]],
) -> None:
  """Label each segment/utterance with the speaker whose turns overlap it most."""
  # Friendly, stable names ("Speaker 1", "Speaker 2") in order of first appearance.
  label_map: dict[str, str] = {}
  for _, _, raw in turns:
    if raw not in label_map:
      label_map[raw] = f"Speaker {len(label_map) + 1}"

  for segment, utterance in zip(segment_list, utterance_list):
    start, end = segment["start"], segment["end"]
    best_raw, best_overlap = None, 0.0
    for turn_start, turn_end, raw in turns:
      overlap = min(end, turn_end) - max(start, turn_start)
      if overlap > best_overlap:
        best_overlap, best_raw = overlap, raw

    speaker = label_map.get(best_raw) if best_raw else None
    segment["speaker"] = speaker
    utterance["speaker"] = speaker


def build_structured_transcript(utterances: list[dict[str, Any]], with_speakers: bool) -> str:
  """Render the timestamped transcript, prefixing speaker names when available."""
  lines: list[str] = []
  for utt in utterances:
    if not utt["text"]:
      continue
    if with_speakers and utt.get("speaker"):
      lines.append(f"{utt['speaker']} [{utt['timestamp']}]: {utt['text']}")
    else:
      lines.append(f"[{utt['timestamp']}] {utt['text']}")
  return "\n".join(lines).strip()


def finalize_result(
  audio_path: str,
  segment_list: list[dict[str, Any]],
  utterance_list: list[dict[str, Any]],
  transcript_parts: list[str],
  info: Any,
) -> dict[str, Any]:
  """Run diarization (if enabled) and assemble the final response payload."""
  speaker_labels_available = False
  if _DIARIZATION_ENABLED and segment_list:
    turns = diarize_audio(audio_path)
    if turns:
      assign_speakers(segment_list, utterance_list, turns)
      speaker_labels_available = True

  return {
    "transcript": " ".join(part for part in transcript_parts if part).strip(),
    "language": info.language or _DEFAULT_LANGUAGE,
    "duration": float(info.duration or 0.0),
    "segments": segment_list,
    "utterances": utterance_list,
    "structuredTranscript": build_structured_transcript(utterance_list, speaker_labels_available),
    "speakerLabelsAvailable": speaker_labels_available,
  }


def run_transcription(
  audio_path: str,
  language: str | None,
  task: str | None,
  model: str | None = None,
  cpu_threads: int | None = None,
) -> dict[str, Any]:
  try:
    logger.info(f"Starting transcription: {audio_path}")
    resolved_language = None if not language or language == "auto" else language
    resolved_task = task or _DEFAULT_TASK

    logger.info(
      f"Transcribing with model={model}, language={resolved_language}, "
      f"task={resolved_task}, batched={_USE_BATCHED}, cpu_threads={resolve_cpu_threads(cpu_threads)}"
    )
    segments, info = transcribe_audio(audio_path, resolved_language, resolved_task, model, cpu_threads)

    segment_list: list[dict[str, Any]] = []
    utterance_list: list[dict[str, Any]] = []
    transcript_parts: list[str] = []

    for seg in segments:
      segment, utterance, clean_text = serialize_segment(seg)
      segment_list.append(segment)
      utterance_list.append(utterance)
      transcript_parts.append(clean_text)

    result = finalize_result(audio_path, segment_list, utterance_list, transcript_parts, info)
    logger.info(
      f"Transcription complete: {len(segment_list)} segments, "
      f"speakers={result['speakerLabelsAvailable']}"
    )
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
  cpu_threads: int | None = None,
) -> dict[str, Any]:
  started_at = time.monotonic()

  try:
    logger.info(f"Starting job transcription: job_id={job_id}, path={audio_path}")
    update_job(job_id, status="processing", progress=build_progress(stage="loading_model", percentage=2.0))
    resolved_language = None if not language or language == "auto" else language
    resolved_task = task or _DEFAULT_TASK

    update_job(job_id, progress=build_progress(stage="transcribing", percentage=5.0))
    segments, info = transcribe_audio(audio_path, resolved_language, resolved_task, model, cpu_threads)

    total_seconds = float(info.duration or 0.0) or None
    segment_list: list[dict[str, Any]] = []
    utterance_list: list[dict[str, Any]] = []
    transcript_parts: list[str] = []

    for seg in segments:
      segment, utterance, clean_text = serialize_segment(seg)
      segment_list.append(segment)
      utterance_list.append(utterance)
      transcript_parts.append(clean_text)

      end = segment["end"]
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

    if _DIARIZATION_ENABLED and segment_list:
      update_job(
        job_id,
        progress=build_progress(
          stage="diarizing",
          percentage=99.0,
          processed_seconds=total_seconds or 0.0,
          total_seconds=total_seconds,
          elapsed_seconds=time.monotonic() - started_at,
        ),
      )

    result = finalize_result(audio_path, segment_list, utterance_list, transcript_parts, info)
    logger.info(
      f"Transcription job complete: job_id={job_id}, segments={len(segment_list)}, "
      f"speakers={result['speakerLabelsAvailable']}"
    )
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
  cpu_threads: int | None = None,
) -> None:
  started_at = time.monotonic()

  try:
    result = await asyncio.to_thread(
      run_transcription_job, job_id, temp_file_path, language, task, model, cpu_threads
    )
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


@app.on_event("startup")
def warmup_default_model() -> None:
  """Pre-load the default model in the background so the first request is fast."""

  def _load() -> None:
    try:
      logger.info(f"Warming up default model: {_DEFAULT_MODEL} (batched={_USE_BATCHED})")
      if _USE_BATCHED:
        get_batched_model(_DEFAULT_MODEL)
      else:
        get_model(_DEFAULT_MODEL)
      if _DIARIZATION_ENABLED:
        get_diarization_pipeline()
      logger.info("Warmup complete")
    except Exception as exc:  # noqa: BLE001
      logger.error(f"Model warmup failed: {exc}", exc_info=True)

  threading.Thread(target=_load, name="model-warmup", daemon=True).start()


@app.get("/health")
def health() -> dict[str, Any]:
  model_keys = list(_MODELS.keys())
  model_loaded = len(_MODELS) > 0
  return {
    "status": "ok",
    "model_loaded": model_loaded,
    "model_name": _DEFAULT_MODEL,
    "default_model": _DEFAULT_MODEL,
    "models_available": list(_MODEL_MAPPING.keys()),
    "models_cached": model_keys,
    "device": _DEVICE,
    "compute_type": _COMPUTE_TYPE,
    "use_batched": _USE_BATCHED,
    "batch_size": _DEFAULT_BATCH_SIZE,
    "beam_size": _DEFAULT_BEAM_SIZE,
    "best_of": _DEFAULT_BEST_OF,
    "vad_filter": _DEFAULT_VAD_FILTER,
    "condition_on_previous_text": _DEFAULT_CONDITION_ON_PREVIOUS_TEXT,
    "cpu_threads": _DEFAULT_CPU_THREADS,
    "num_workers": _DEFAULT_NUM_WORKERS,
    "word_timestamps": _WORD_TIMESTAMPS,
    "diarization_enabled": _DIARIZATION_ENABLED,
    "diarization_ready": _DIARIZATION_PIPELINE is not None,
    "hf_token_set": bool(_HF_TOKEN),
  }


@app.post("/transcribe")
async def transcribe(
  file: UploadFile = File(...),
  model: str = Form(default=_DEFAULT_MODEL),
  language: str = Form(default="auto"),
  task: str = Form(default=_DEFAULT_TASK),
  cpu_threads: int = Form(default=0),
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
    result = run_transcription(temp_file_path, language, task, model, cpu_threads)
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
  cpu_threads: int = Form(default=0),
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

    asyncio.create_task(
      process_transcription_job(job_id, temp_file_path, language, task, model, cpu_threads)
    )
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
  print(f"Default Model: {_DEFAULT_MODEL}")
  print(f"Device:        {_DEVICE}")
  print(f"Compute Type:  {_COMPUTE_TYPE}")
  print(f"Batched:       {_USE_BATCHED}")
  print(f"Batch Size:    {_DEFAULT_BATCH_SIZE}")
  print(f"Beam Size:     {_DEFAULT_BEAM_SIZE}")
  print(f"Best Of:       {_DEFAULT_BEST_OF}")
  print(f"VAD Filter:    {_DEFAULT_VAD_FILTER}")
  print(f"CPU Threads:   {_DEFAULT_CPU_THREADS}")
  print(f"Workers:       {_DEFAULT_NUM_WORKERS}")
  print(f"Word Stamps:   {_WORD_TIMESTAMPS}")
  print(f"Diarization:   {_DIARIZATION_ENABLED} (HF token set: {bool(_HF_TOKEN)})")
  print(f"Language:      {_DEFAULT_LANGUAGE}")
  print(f"Task:          {_DEFAULT_TASK}")
  print(f"{'='*60}\n")
  
  uvicorn.run(app, host=host, port=port)
