// Initialize
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    // Set base URL dynamically
    const baseUrl = window.location.origin;
    document.getElementById('baseUrl').textContent = baseUrl;
});

// Code snippets for copying
const healthResponse = `{
  "success": true,
  "status": "ok"
}`;

const configResponse = `{
  "maxFileSizeMB": 100,
  "allowedTypes": [
    "audio/mpeg",
    "audio/wav",
    "audio/webm",
    "audio/mp4",
    "audio/ogg"
  ]
}`;

const transcribeResponse = `{
  "success": true,
  "transcript": "Hello, this is a test transcription.",
  "language": "en",
  "duration": 5.23,
  "segments": [
    {
      "start": 0.0,
      "end": 5.23,
      "text": "Hello, this is a test transcription."
    }
  ]
}`;

const curlExample = `curl -X POST http://localhost:3000/transcribe \\
  -H "x-api-key: YOUR_API_KEY" \\
  -F "file=@/path/to/audio.mp3" \\
  -F "language=auto" \\
  -F "task=transcribe"`;

const pythonExample = `import requests

url = "http://localhost:3000/transcribe"
headers = {"x-api-key": "YOUR_API_KEY"}
files = {"file": open("audio.mp3", "rb")}
data = {"language": "auto", "task": "transcribe"}

response = requests.post(url, headers=headers, files=files, data=data)
result = response.json()
print(result["transcript"])`;

const jsNodeExample = `const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');

const form = new FormData();
form.append('file', fs.createReadStream('audio.mp3'));
form.append('language', 'auto');
form.append('task', 'transcribe');

axios.post('http://localhost:3000/transcribe', form, {
  headers: {
    ...form.getHeaders(),
    'x-api-key': 'YOUR_API_KEY'
  }
})
.then(response => console.log(response.data.transcript))
.catch(error => console.error(error));`;

const jsBrowserExample = `const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('language', 'auto');
formData.append('task', 'transcribe');

fetch('http://localhost:3000/transcribe', {
  method: 'POST',
  headers: {
    'x-api-key': 'YOUR_API_KEY'
  },
  body: formData
})
.then(response => response.json())
.then(data => console.log(data.transcript))
.catch(error => console.error(error));`;

// Copy code to clipboard
function copyCode(button, code) {
    navigator.clipboard.writeText(code)
        .then(() => {
            const originalHTML = button.innerHTML;
            button.innerHTML = '<i data-lucide="check" class="btn-icon"></i> Copied!';
            lucide.createIcons();

            setTimeout(() => {
                button.innerHTML = originalHTML;
                lucide.createIcons();
            }, 2000);

            showToast('Code copied to clipboard!', 'success');
        })
        .catch(err => {
            console.error('Failed to copy:', err);
            showToast('Failed to copy code', 'error');
        });
}

// Toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
