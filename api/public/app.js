const API_KEY = 'test_key';
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB default, updated from server

let mediaRecorder;
let audioChunks = [];
let recordingStartTime;
let timerInterval;
let selectedFile;
let audioContext;
let analyser;
let recordingStream;

// Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const recordBtn = document.getElementById('recordBtn');
const submitBtn = document.getElementById('submitBtn');
const languageSelect = document.getElementById('language');
const taskSelect = document.getElementById('task');
const loadingSection = document.getElementById('loadingSection');
const resultsSection = document.getElementById('resultsSection');
const results = document.getElementById('results');
const limitInfo = document.getElementById('limitInfo');
const waveform = document.getElementById('waveform');
const timer = document.getElementById('timer');
const historySection = document.getElementById('historySection');
const historyList = document.getElementById('history');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    await fetchServerLimits();
    loadHistory();
    setupEventListeners();
});

// Fetch server limits
async function fetchServerLimits() {
    try {
        const response = await fetch('/api/config', {
            headers: { 'x-api-key': API_KEY }
        });
        if (response.ok) {
            const config = await response.json();
            const maxSizeMB = config.maxFileSizeMB || 100;
            limitInfo.textContent = `Maximum file size: ${maxSizeMB} MB | Supported: ${config.allowedTypes.join(', ')}`;
            window.MAX_FILE_SIZE = maxSizeMB * 1024 * 1024;
        }
    } catch (error) {
        console.error('Error fetching server config:', error);
        limitInfo.textContent = 'Maximum file size: 100 MB';
    }
}

// Event Listeners
function setupEventListeners() {
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });

    recordBtn.addEventListener('click', toggleRecording);
    submitBtn.addEventListener('click', transcribe);

    document.getElementById('copyBtn')?.addEventListener('click', copyToClipboard);
    document.getElementById('downloadBtn')?.addEventListener('click', downloadTranscript);
    document.getElementById('newBtn')?.addEventListener('click', resetUI);
}

// File Selection
function handleFileSelect(file) {
    // Check file size
    if (file.size > window.MAX_FILE_SIZE) {
        showToast(`File size exceeds ${window.MAX_FILE_SIZE / 1024 / 1024}MB limit`, 'error');
        return;
    }

    selectedFile = file;
    document.getElementById('fileName').innerHTML = `<i data-lucide="file" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 6px;"></i>${file.name}`;
    document.getElementById('fileSize').innerHTML = `<i data-lucide="hard-drive" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 6px;"></i>${formatFileSize(file.size)}`;
    lucide.createIcons();
    fileInfo.classList.remove('hidden');
    submitBtn.disabled = false;

    // Clear waveform if recording was done
    waveform.classList.add('hidden');
}

// Recording
async function toggleRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        try {
            audioChunks = [];
            recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(recordingStream);

            // Setup visualizer
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamAudioDestination();
            analyser.connect(audioContext.destination);
            recordingStream.getTracks().forEach(track => {
                const mediaSource = audioContext.createMediaStreamSource(recordingStream);
                mediaSource.connect(analyser);
            });

            mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
            mediaRecorder.onstop = handleRecordingStop;
            mediaRecorder.start();

            recordBtn.innerHTML = '<i data-lucide="square" class="btn-icon"></i><span>Stop Recording</span>';
            recordBtn.classList.add('recording');
            lucide.createIcons();
            recordingStartTime = Date.now();
            startTimer();
            visualizeAudio();
        } catch (error) {
            showToast('Microphone access denied', 'error');
        }
    } else {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        recordBtn.innerHTML = '<i data-lucide="mic" class="btn-icon"></i><span>Start Recording</span>';
        recordBtn.classList.remove('recording');
        lucide.createIcons();
        clearInterval(timerInterval);
    }
}

function handleRecordingStop() {
    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
    const file = new File([audioBlob], `recording-${Date.now()}.wav`, { type: 'audio/wav' });
    handleFileSelect(file);
    timer.classList.add('hidden');
    waveform.classList.add('hidden');
}

function startTimer() {
    timer.classList.remove('hidden');
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        timer.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }, 100);
}

function visualizeAudio() {
    waveform.classList.remove('hidden');
    waveform.innerHTML = '';
    const bars = 20;
    for (let i = 0; i < bars; i++) {
        const bar = document.createElement('div');
        bar.className = 'waveform-bar';
        bar.style.animationDelay = `${i * 0.05}s`;
        waveform.appendChild(bar);
    }
}

// Transcription
async function transcribe() {
    if (!selectedFile) {
        showToast('Please select a file or record audio', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('language', languageSelect.value);
    formData.append('task', taskSelect.value);

    // Disable all interactive elements
    submitBtn.disabled = true;
    submitBtn.textContent = 'Transcribing...';
    recordBtn.disabled = true;
    uploadArea.style.pointerEvents = 'none';
    uploadArea.style.opacity = '0.6';
    languageSelect.disabled = true;
    taskSelect.disabled = true;

    loadingSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');

    try {
        const response = await fetch('/transcribe', {
            method: 'POST',
            headers: { 'x-api-key': API_KEY },
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Transcription failed');
        }

        const data = await response.json();
        displayResults(data);
        saveToHistory(data);
        showToast('Transcription completed!', 'success');
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
        // Re-enable buttons on error
        submitBtn.disabled = false;
        submitBtn.textContent = 'Start Transcription';
        recordBtn.disabled = false;
        uploadArea.style.pointerEvents = 'auto';
        uploadArea.style.opacity = '1';
        languageSelect.disabled = false;
        taskSelect.disabled = false;
    } finally {
        loadingSection.classList.add('hidden');
    }
}

// Display Results
function displayResults(data) {
    results.innerHTML = `
        <div class="result-item transcript">
            ${data.transcript || '(No speech detected)'}
        </div>
        <div class="result-item metadata">
            <strong>Language:</strong> ${data.language}
        </div>
        <div class="result-item metadata">
            <strong>Duration:</strong> ${data.duration.toFixed(2)}s
        </div>
        ${data.segments ? `
            <div class="result-item metadata">
                <strong>Segments:</strong> ${data.segments.length}
            </div>
        ` : ''}
    `;
    resultsSection.classList.remove('hidden');
    window.currentTranscript = data.transcript;
    enableControls();
}

// History
function saveToHistory(data) {
    let history = JSON.parse(localStorage.getItem('transcriptionHistory') || '[]');
    history.unshift({
        id: Date.now(),
        text: data.transcript.substring(0, 100) + (data.transcript.length > 100 ? '...' : ''),
        transcript: data.transcript,
        timestamp: new Date().toLocaleString(),
        language: data.language,
        duration: data.duration
    });
    history = history.slice(0, 10); // Keep last 10
    localStorage.setItem('transcriptionHistory', JSON.stringify(history));
    loadHistory();
}

function loadHistory() {
    const history = JSON.parse(localStorage.getItem('transcriptionHistory') || '[]');
    if (history.length === 0) {
        historyList.innerHTML = '<div class="history-empty">No transcriptions yet</div>';
        historySection.classList.add('hidden');
        return;
    }

    historySection.classList.remove('hidden');
    historyList.innerHTML = history.map(item => `
        <div class="history-item" onclick="loadHistoryItem('${item.id}')">
            <div class="history-item-text">${item.text}</div>
            <div class="history-item-meta">${item.timestamp} • ${item.language}</div>
        </div>
    `).join('');
    lucide.createIcons();
}

function loadHistoryItem(id) {
    const history = JSON.parse(localStorage.getItem('transcriptionHistory') || '[]');
    const item = history.find(h => h.id == id);
    if (item) {
        window.currentTranscript = item.transcript;
        results.innerHTML = `
            <div class="result-item transcript">${item.transcript}</div>
            <div class="result-item metadata">
                <strong>Language:</strong> ${item.language}
            </div>
            <div class="result-item metadata">
                <strong>Duration:</strong> ${item.duration.toFixed(2)}s
            </div>
            <div class="result-item metadata">
                <strong>Recorded:</strong> ${item.timestamp}
            </div>
        `;
        resultsSection.classList.remove('hidden');
    }
}

// Re-enable all controls after successful transcription
function enableControls() {
    recordBtn.disabled = false;
    uploadArea.style.pointerEvents = 'auto';
    uploadArea.style.opacity = '1';
    languageSelect.disabled = false;
    taskSelect.disabled = false;
}

// Actions
function copyToClipboard() {
    if (window.currentTranscript) {
        navigator.clipboard.writeText(window.currentTranscript);
        showToast('Copied to clipboard!', 'success');
    }
}

function downloadTranscript() {
    if (window.currentTranscript) {
        const element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(window.currentTranscript));
        element.setAttribute('download', `transcript-${Date.now()}.txt`);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        showToast('Transcript downloaded!', 'success');
    }
}

function resetUI() {
    selectedFile = null;
    fileInfo.classList.add('hidden');
    resultsSection.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Start Transcription';
    fileInput.value = '';
    document.getElementById('fileName').textContent = '';
    document.getElementById('fileSize').textContent = '';
    enableControls();
}

// Utilities
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
// Toggle history section
function toggleHistory() {
    const historySection = document.getElementById('historySection');
    const chevron = document.getElementById('historyChevron');

    historySection.classList.toggle('hidden');
    chevron.classList.toggle('rotated');
    lucide.createIcons();
}