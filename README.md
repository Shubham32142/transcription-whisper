# WhisperSelf — Self-Hosted Speech Transcription API

WhisperSelf is a self-hosted speech-to-text API built with `faster-whisper`, FastAPI, and Node.js/Express. Features include a modern web UI, API key management, and comprehensive developer documentation.

## Features

- 🎤 **Web UI**: Upload files or record voice directly in the browser
- 🔐 **API Key Management**: Create and manage API keys through admin panel
- 📚 **Developer Docs**: Complete API documentation with code examples
- 🎯 **Minimalistic Design**: Clean, single-page interface
- 🔊 **Multi-format Support**: Audio and video files (MP3, WAV, MP4, WebM, etc.)
- 🌍 **Multi-language**: Auto-detect or specify language (13+ languages supported)
- 📊 **Usage Tracking**: Monitor API key usage and transcription history

## Quick Start

1. **Install dependencies:**
   - API: `cd api && pnpm install`
   - ML: `cd ../ml && pip install -r requirements.txt`

2. **Copy environment variables:**
   ```bash
   cp .env.example .env
   ```
3. **Download Whisper model:**

   ```bash
   python scripts/download_model.py --model large-v3 --output ./models
   ```

4. **Run ML service:**

   ```bash
   cd ml && uvicorn serve:app --host 0.0.0.0 --port 8000 --reload
   ```

5. **Run API service:**

   ```bash
   cd api && pnpm dev
   ```

6. **Access the application:**
   - Web UI: http://localhost:3000
   - Admin Panel: http://localhost:3000/admin.html
   - API Docs: http://localhost:3000/developer.html

## Getting an API Key

### For End Users (Web UI)

No API key needed! Just visit http://localhost:3000 and start transcribing.

### For Developers (API Access)

1. Go to the **Admin Panel**: http://localhost:3000/admin.html
2. Login with admin key (default: `admin_secret_key`)
3. Click "+ Generate Key" and provide a name
4. Copy the generated API key immediately (you won't see it again!)
5. Use the key in your API requests with header: `x-api-key: YOUR_API_KEY`

**Default API Key**: A test key is auto-created on first run. Check the admin panel to view it.

**Security Note**: Change the `ADMIN_KEY` environment variable in production!

## API Usage

### Endpoint: `POST /transcribe`

**Headers:**

```
x-api-key: YOUR_API_KEY
```

**Body** (`multipart/form-data`):

- `file` (required): Audio or video file
- `language` (optional): Language code (default: `auto`)
- `task` (optional): `transcribe` or `translate` (default: `transcribe`)

**Response:**

```json
{
  "success": true,
  "transcript": "Hello, this is a test.",
  "language": "en",
  "duration": 3.5,
  "segments": [{ "start": 0.0, "end": 3.5, "text": "Hello, this is a test." }]
}
```

**Example (cURL):**

```bash
curl -X POST http://localhost:3000/transcribe \
  -H "x-api-key: YOUR_API_KEY" \
  -F "file=@audio.mp3" \
  -F "language=auto" \
  -F "task=transcribe"
```

See http://localhost:3000/developer.html for more examples in Python, JavaScript, and other languages.

## Admin Panel

Access at `/admin.html` to:

- Generate new API keys
- View all API keys and their usage
- Deactivate compromised keys
- Monitor transcription statistics

**Default Admin Key**: `admin_secret_key` (set via `ADMIN_KEY` env variable)

## Database

WhisperSelf uses SQLite for:

- API key storage and validation
- Usage tracking and statistics
- Transcription history

Database file: `whisperself.db` (created automatically in project root)

**Backup**: Simply copy the `whisperself.db` file

## Docker Deployment

Build and run both services:

```bash
cd docker && docker-compose up --build
```

## Environment Variables

Create `.env` file in project root:

```env
# API Configuration
PORT=3000
MAX_FILE_SIZE_MB=100
ALLOWED_AUDIO_TYPES=audio/mpeg,audio/wav,audio/webm,audio/mp4,audio/ogg

# Admin Configuration
ADMIN_KEY=your_secure_admin_key_here

# ML Service
ML_SERVICE_URL=http://localhost:8000
MODEL_PATH=./models/large-v3
```

## System Requirements

- **Node.js** 20+ and pnpm
- **Python** 3.9+ with pip
- **ffmpeg** (for audio normalization)
- **SQLite** (included)

## Notes

- Uploaded temp files are deleted after transcription
- ML service should remain internal/localhost in production
- First run creates a default test API key automatically
- Web UI stores transcription history in browser localStorage

## License

MIT
