# WhisperSelf — Self-Hosted Speech Transcription API

## Overview

WhisperSelf is a fully self-hosted, production-ready speech-to-text transcription API built on top of OpenAI's open-source Whisper model, served using `faster-whisper` for optimized inference, and exposed via a Node.js/Express REST API. It supports fine-tuning on custom audio datasets and requires **zero per-minute API cost**.

---

## Purpose

OpenAI's hosted Whisper API charges $0.006/min. This project lets you:

- Run the same (or better, fine-tuned) Whisper model on your own server
- Build a domain-specific transcription service (custom accents, jargon, languages)
- Integrate transcription into any backend at zero variable cost
- Maintain full data privacy — audio never leaves your infrastructure

---

## Tech Stack

| Layer | Technology |
|---|---|
| Transcription Model | `faster-whisper` (CTranslate2 port of OpenAI Whisper) |
| Fine-tuning | Python, Hugging Face `transformers` + `datasets` |
| API Server | Node.js, Express, TypeScript |
| Audio Processing | `ffmpeg` (preprocessing), `multer` (file uploads) |
| Model Storage | Hugging Face Hub (free) or local `/models` directory |
| Deployment | Docker + any VPS (Hetzner, DigitalOcean, Railway) |
| Package Manager | `pnpm` (Node), `pip` / `uv` (Python) |

---

## What We Are Building

```
Audio File (mp3/wav/webm)
        ↓
Node.js API receives upload
        ↓
ffmpeg converts to 16kHz mono WAV
        ↓
Python faster-whisper process transcribes
        ↓
JSON response: { transcript, language, segments, duration }
```

The Node.js server acts as the API gateway. It handles auth, file validation, and preprocessing, then calls a Python subprocess (or a local Python microservice) that runs `faster-whisper`. This keeps the TypeScript backend clean while Python handles the heavy ML work.

---

## Folder Structure

```
whisper-self/
│
├── api/                          # Node.js/Express TypeScript API
│   ├── src/
│   │   ├── index.ts              # Entry point, Express app setup
│   │   ├── routes/
│   │   │   └── transcribe.ts     # POST /transcribe route
│   │   ├── middleware/
│   │   │   ├── upload.ts         # multer config for audio files
│   │   │   ├── validate.ts       # File type/size validation
│   │   │   └── auth.ts           # API key auth middleware
│   │   ├── services/
│   │   │   └── transcriber.ts    # Calls Python subprocess or microservice
│   │   ├── utils/
│   │   │   └── ffmpeg.ts         # Audio normalization helper
│   │   └── types/
│   │       └── index.ts          # Shared TypeScript interfaces
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── ml/                           # Python ML layer
│   ├── serve.py                  # FastAPI microservice wrapping faster-whisper
│   ├── transcribe.py             # Standalone script (called as subprocess)
│   ├── finetune/
│   │   ├── prepare_dataset.py    # Load + preprocess audio dataset
│   │   ├── train.py              # Fine-tune Whisper using HF Trainer
│   │   ├── evaluate.py           # WER/CER evaluation on test set
│   │   └── push_to_hub.py        # Upload fine-tuned model to HF Hub
│   ├── requirements.txt
│   └── config.yaml               # Model size, language, training hyperparams
│
├── models/                       # Local model weights (gitignored)
│   └── .gitkeep
│
├── uploads/                      # Temp audio uploads (gitignored)
│   └── .gitkeep
│
├── docker/
│   ├── Dockerfile.api            # Node.js API container
│   ├── Dockerfile.ml             # Python ML container
│   └── docker-compose.yml        # Orchestrates both services
│
├── scripts/
│   ├── setup.sh                  # One-shot environment setup
│   └── download_model.py         # Download faster-whisper model weights
│
├── .env.example
├── .gitignore
└── README.md
```

---

## Step-by-Step Setup

### Prerequisites

- Node.js >= 20, `pnpm`
- Python >= 3.10, `pip`
- `ffmpeg` installed on the system (`sudo apt install ffmpeg`)
- Docker + Docker Compose (for deployment)
- A Hugging Face account (free) — for model storage

---

### Step 1 — Clone and Install

```bash
git clone https://github.com/your-username/whisper-self.git
cd whisper-self

# Node.js API
cd api
pnpm install

# Python ML layer
cd ../ml
pip install -r requirements.txt
```

**`ml/requirements.txt` should contain:**
```
faster-whisper==1.1.0
transformers>=4.40.0
datasets>=2.18.0
torch>=2.2.0
torchaudio>=2.2.0
evaluate
jiwer
fastapi
uvicorn
python-multipart
huggingface_hub
```

---

### Step 2 — Download the Base Model

```bash
python scripts/download_model.py --model large-v3 --output ./models
```

`scripts/download_model.py` should use `faster_whisper.WhisperModel` to download and cache the model locally. Available sizes: `tiny`, `base`, `small`, `medium`, `large-v2`, `large-v3`.

> **Note:** `small` is recommended for CPU-only servers. `large-v3` needs 6GB+ VRAM.

---

### Step 3 — Configure Environment

```bash
cp .env.example .env
```

**`.env.example`:**
```env
# API Config
PORT=3000
API_KEY=your_secret_api_key_here

# ML Service Config
ML_SERVICE_URL=http://localhost:8000
MODEL_PATH=./models/large-v3
WHISPER_LANGUAGE=en
WHISPER_TASK=transcribe        # or "translate" to always output English
WHISPER_BEAM_SIZE=5
WHISPER_DEVICE=cpu             # or "cuda" if GPU available
WHISPER_COMPUTE_TYPE=int8      # int8 for CPU, float16 for GPU

# Upload Config
MAX_FILE_SIZE_MB=25
ALLOWED_AUDIO_TYPES=audio/mpeg,audio/wav,audio/webm,audio/mp4,audio/ogg

# Temp upload dir
UPLOAD_DIR=./uploads
```

---

### Step 4 — Run the Python ML Microservice

```bash
cd ml
uvicorn serve:app --host 0.0.0.0 --port 8000 --reload
```

`ml/serve.py` should expose:
```
POST /transcribe   — accepts audio file, returns transcript JSON
GET  /health       — returns model status and loaded model name
```

The response schema should be:
```json
{
  "transcript": "full text here",
  "language": "en",
  "duration": 12.4,
  "segments": [
    { "start": 0.0, "end": 3.2, "text": "Hello world" }
  ]
}
```

---

### Step 5 — Run the Node.js API

```bash
cd api
pnpm dev
```

The API will start on `http://localhost:3000`.

**Endpoint:**
```
POST /transcribe
Headers: x-api-key: <your_api_key>
Body: multipart/form-data
  - file: <audio file>
  - language: (optional) "en" | "hi" | "auto"
  - task: (optional) "transcribe" | "translate"
```

**Example using curl:**
```bash
curl -X POST http://localhost:3000/transcribe \
  -H "x-api-key: your_secret_api_key_here" \
  -F "file=@audio.mp3" \
  -F "language=en"
```

---

### Step 6 — (Optional) Fine-Tune on Custom Data

Only do this if base Whisper accuracy is insufficient for your use case (e.g., heavy Indian accents, domain-specific vocabulary).

#### 6a — Prepare your dataset

Your dataset must follow this structure:
```
data/
├── train/
│   ├── audio/    ← .wav files, 16kHz mono
│   └── metadata.csv   ← columns: file_name, transcription
└── test/
    ├── audio/
    └── metadata.csv
```

Run:
```bash
cd ml
python finetune/prepare_dataset.py \
  --data_dir ../data \
  --output_dir ./processed_dataset \
  --model_name openai/whisper-small
```

#### 6b — Train

```bash
python finetune/train.py \
  --model_name openai/whisper-small \
  --dataset_path ./processed_dataset \
  --output_dir ./fine_tuned_model \
  --num_epochs 10 \
  --batch_size 8 \
  --learning_rate 1e-5 \
  --language Hindi \
  --task transcribe
```

Key training parameters in `config.yaml`:
```yaml
model_name: openai/whisper-small
language: Hindi
task: transcribe
num_train_epochs: 10
per_device_train_batch_size: 8
gradient_accumulation_steps: 2
learning_rate: 1e-5
warmup_steps: 500
fp16: false         # set true if GPU available
generation_max_length: 225
```

#### 6c — Evaluate

```bash
python finetune/evaluate.py \
  --model_path ./fine_tuned_model \
  --dataset_path ./processed_dataset
```

This outputs **WER (Word Error Rate)** — lower is better. Whisper-large baseline is ~3–5% WER on clean English.

#### 6d — Push to Hugging Face Hub

```bash
python finetune/push_to_hub.py \
  --model_path ./fine_tuned_model \
  --repo_name your-hf-username/whisper-small-hindi-finetuned
```

Then update `MODEL_PATH` in `.env` to point to your HF model ID.

---

### Step 7 — Docker Deployment

```bash
docker-compose up --build
```

**`docker/docker-compose.yml`** should define two services:
- `api` — Node.js container on port 3000
- `ml` — Python FastAPI container on port 8000, with `./models` volume mounted

Both services share a Docker network so the Node.js API can reach `http://ml:8000/transcribe` internally.

---

## API Reference

### `POST /transcribe`

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | File | ✅ | Audio file (mp3, wav, webm, mp4, ogg) |
| `language` | string | ❌ | ISO language code or "auto" (default: auto) |
| `task` | string | ❌ | "transcribe" or "translate" (default: transcribe) |

**Success Response `200`:**
```json
{
  "success": true,
  "transcript": "Hello, this is a test.",
  "language": "en",
  "duration": 3.5,
  "segments": [
    { "start": 0.0, "end": 3.5, "text": "Hello, this is a test." }
  ]
}
```

**Error Response `400/401/500`:**
```json
{
  "success": false,
  "error": "Unsupported file type"
}
```

---

## Performance Guidelines

- Use `whisper-small` + `int8` compute on CPU — roughly **2–5x real-time** (a 60s audio file takes ~12–30s)
- Use `whisper-large-v3` + `float16` on GPU — roughly **10–20x real-time** (a 60s audio file takes ~3–6s)
- For long audio files (>5 min), implement chunking with overlap in `serve.py`
- Set `vad_filter=True` in `faster-whisper` to skip silence — cuts processing time significantly
- For real-time/streaming use cases, integrate `whisper-streaming` instead of batch processing

---

## Security Guidelines

- Always validate file MIME type **and** file signature (magic bytes) — not just extension
- Sanitize filenames before saving to disk — use `uuid` for temp file names
- Delete temp audio files immediately after transcription
- Rate-limit the `/transcribe` endpoint (e.g., 10 req/min per API key)
- Never expose the Python ML service port (8000) publicly — keep it internal only
- Store API keys hashed, not plaintext

---

## .gitignore

```
node_modules/
dist/
uploads/*
!uploads/.gitkeep
models/*
!models/.gitkeep
*.pyc
__pycache__/
.env
*.egg-info/
processed_dataset/
fine_tuned_model/
```

---

## Roadmap / Future Improvements

- [ ] WebSocket endpoint for real-time streaming transcription
- [ ] Speaker diarization (who said what) using `pyannote.audio`
- [ ] Word-level timestamps in response
- [ ] Queue system (BullMQ) for handling concurrent long audio jobs
- [ ] Dashboard UI to monitor jobs and review transcripts
- [ ] Hindi + Hinglish fine-tuned model

---

## License

MIT
