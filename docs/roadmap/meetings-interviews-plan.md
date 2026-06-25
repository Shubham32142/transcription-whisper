# Meetings & Interviews — Implementation Plan

**Use case:** transcribe multi-speaker meetings/interviews (English + occasional Hindi), and turn them into usable notes.
**Status:** planning. Sequenced for value-for-effort, grounded in the current codebase.
**Owner:** TBD · **Last updated:** 2026-06-25

> See [phase2.md](./phase2.md) for the full feature backlog. This doc is the focused, ordered plan for the meetings/interviews use case.

---

## Current state (what we build on)

- ✅ Async transcription jobs with progress polling (`ml/serve.py`, `api/.../transcribe.controller.ts`, `api/public/app.js`).
- ✅ Output already includes `segments`, `utterances`, `structuredTranscript` with timestamps.
- ⚠️ **Speaker fields are stubbed, never populated** — `utterance.speaker = None`, `speakerLabelsAvailable = false`. The UI already renders a "Speakers" note. Diarization just needs to fill these in.
- ⚠️ **`TranscriptionsRepository` exists but is never called** — transcripts are not saved server-side. UI history is `localStorage`, last 10 only.
- ⚠️ Jobs live in an in-memory dict (`_JOBS`) — lost on restart.
- 🔒 Constraint: CPU-only dev box (4 cores, ~12 GB RAM, no GPU). Diarization adds CPU cost → keep it inside the async job flow, never synchronous.

---

## Guiding principle

Meetings need three things in order: **(1) who said what**, **(2) the gist + action items**, **(3) find it again later.** Build in that order. Everything else (player, editor, exports) makes those three usable.

---

## Build status

- ✅ **2.3 Word-level timestamps** — done. `WHISPER_WORD_TIMESTAMPS=true`; each segment now includes a `words[]` array (start/end/word/probability).
- ✅ **1.1 Speaker diarization** — **done and tested end-to-end** (2-speaker clip → correct `Speaker 1`/`Speaker 2` labels). Behind `WHISPER_DIARIZATION` flag with graceful fallback. Audio loaded via `soundfile` to dodge the torch 2.10 / torchcodec decoding bug on Windows. Handles the newer pyannote `DiarizeOutput` (reads `.speaker_diarization`). Frontend renders a color-coded, speaker-labeled transcript. **Activation (one-time):** HF token in `ml/.env`, `WHISPER_DIARIZATION=true`, and accept terms for **three** gated repos: `pyannote/segmentation-3.0`, `pyannote/speaker-diarization-3.1`, `pyannote/speaker-diarization-community-1`. Currently ENABLED and warm on the running service. *Future: `DiarizeOutput.speaker_embeddings` could power cross-meeting speaker identification.*
- ⏭️ Next: **1.2 AI summary / action items**, then **1.3 persistence + search**.

---

## Milestone 1 — Meeting MVP

### 1.1 Speaker diarization ("who said what")  ·  effort: M–H  ·  ⭐ centerpiece
**What:** detect speaker turns and label each utterance `Speaker 1 / Speaker 2 / …`.

**Approach (least disruptive to current faster-whisper path):**
- Add `pyannote.audio` (`pyannote/speaker-diarization-3.1`, gated — needs a free HF token + accepting the model terms).
- In `ml/serve.py`, after transcription, run diarization on the same normalized WAV, then assign each Whisper segment/word to the speaker with the largest time overlap.
- Enabling `word_timestamps=True` (see 2.3) makes overlap assignment much more accurate near speaker switches.
- Gate behind `WHISPER_DIARIZATION=true` + `HF_TOKEN`; populate `utterance.speaker`, set `speakerLabelsAvailable=true`.
- Config: `min_speakers` / `max_speakers` (form fields, optional).
- *Alternative considered:* `whisperx` (bundles ASR+align+diarize) — cleaner end-to-end but replaces our transcription path and pins versions. Prefer pyannote-as-post-step for now.

**Key files:** `ml/serve.py`, `ml/requirements.txt`, `ml/.env`, `api/.../index.html` + `app.js` (color per speaker in the structured transcript).
**Deps:** `pyannote.audio`, torch (already present), HF token.
**Acceptance:** a 2–3 person sample yields per-utterance speaker labels; `speakerLabelsAvailable=true`; min/max speakers respected; runs within the async job (progress still updates).
**CPU note:** diarization is slow on CPU (roughly +1× realtime). Acceptable in the background job; revisit with GPU later (phase2 #15).

### 1.2 AI summary, action items & chapters  ·  effort: M  ·  ⭐ differentiator
**What:** after transcription, generate a TL;DR, key decisions, **action items (with owner when speakers are known)**, and timestamped chapters/topics.

**Approach:**
- New service `api/.../summarizer.service.ts` + endpoint `POST /transcribe/:id/summary` (and/or auto-run on completion, configurable).
- Provider-configurable: **Claude API** (best quality; `ANTHROPIC_API_KEY`) or a local model to preserve the zero-cost/self-hosted goal. Default to whichever is configured; degrade gracefully if neither is set.
- Prompt uses the speaker-labeled transcript so action items can name owners.
- Store the summary with the transcript (see 1.3); show in a "Summary" tab in the UI.

**Key files:** new `summarizer.service.ts`, `transcribe.routes.ts`, `transcribe.controller.ts`, frontend results panel.
**Acceptance:** completed meeting shows summary + bulleted action items + chapter list with clickable timestamps.

### 1.3 Server-side persistence + search  ·  effort: M  ·  foundation
**What:** actually save transcriptions (transcript, segments, speakers, summary, metadata) and make them searchable.

**Approach:**
- Wire up the existing **`TranscriptionsRepository`** (currently dead code) to Supabase; save on job completion.
- Replace `localStorage` history in `app.js` with a server-backed list + **full-text search** (Supabase `tsvector` or `ilike` to start).
- Add `GET /transcriptions` (list+search) and `GET /transcriptions/:id`.

**Key files:** `transcriptions.repository.ts`, `db/supabase-migration.sql`, new routes/controller, `app.js` history section.
**Acceptance:** transcripts persist across restarts and devices; can search past meetings by text/date/speaker.

---

## Milestone 2 — Review & export

### 2.1 Audio player + click-to-seek  ·  effort: L–M
Inline `<audio>` synced to the transcript; click any line/word to jump to its timestamp (timestamps already exist). Highlight the active segment during playback.

### 2.2 Inline transcript editor  ·  effort: M
Edit text + **rename/merge speakers** (e.g., "Speaker 1" → "Priya"), fix Hinglish errors, save corrected version (versioned in DB). Pairs with 2.1.

### 2.3 Word-level timestamps  ·  effort: L
Enable `word_timestamps=True` in faster-whisper. Improves diarization overlap (1.1), click-to-seek precision (2.1), and subtitle sync.

### 2.4 Export with speaker labels  ·  effort: L
Add a format picker (currently `.txt` only): **TXT** (speaker-prefixed), **SRT/VTT** (with speakers), **JSON**, **Markdown meeting notes** (summary + action items + full transcript). Segments+timestamps already exist, so this is mostly formatters.

---

## Milestone 3 — Scale & robustness

- **Durable jobs:** move `_JOBS` from in-memory to DB/Redis so restarts don't lose work; enables retry.
- **Batch upload / queue:** transcribe several recordings at once (phase2 #2).
- **Long-file chunking:** robust handling of 1h+ recordings with overlap (requirements.md note).

---

## Cross-cutting: accuracy (ties to earlier tuning work)

- **Custom vocabulary / `initial_prompt`:** let users supply attendee names, company/product terms, acronyms → fewer misrecognitions. Cheap, high impact for meetings. (faster-whisper `initial_prompt` / `hotwords`.)
- **Hindi/Hinglish fine-tune:** the repo already scaffolds this (`ml/finetune/`, `config.yaml` `finetune:`). The real fix for in-file code-switching; longer-term.
- Reminder: distil-large-v3 is English-only — meetings with Hindi must use `large-v3` (or `medium`). See [transcription perf notes in agent memory].

---

## Recommended first PR

**Speaker diarization (1.1) behind a flag + word timestamps (2.3).** It's the defining meetings feature, the data model is already shaped for it, and word timestamps make it (and later features) accurate. Then 1.2 (summary) for immediate "wow", then 1.3 (persistence) to make it durable.

## Effort summary

| # | Feature | Effort | Tier |
|---|---|---|---|
| 1.1 | Speaker diarization | M–H | MVP ⭐ |
| 1.2 | AI summary / action items | M | MVP ⭐ |
| 1.3 | Persistence + search | M | MVP |
| 2.1 | Player + click-to-seek | L–M | Review |
| 2.2 | Inline editor + speaker rename | M | Review |
| 2.3 | Word-level timestamps | L | Review (do with 1.1) |
| 2.4 | Export w/ speaker labels (SRT/VTT/MD/JSON) | L | Review |
| 3.x | Durable jobs / batch / chunking | M | Scale |
