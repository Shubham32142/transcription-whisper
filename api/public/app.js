// No API key needed for local use
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB default, updated from server

// Model information with estimated times per minute of audio
const MODELS = {
    tiny: { name: 'Tiny', estimatedSecondsPerMin: 1, file: 'Systran/faster-whisper-tiny' },
    base: { name: 'Base', estimatedSecondsPerMin: 10, file: 'Systran/faster-whisper-base' },
    small: { name: 'Small', estimatedSecondsPerMin: 30, file: 'Systran/faster-whisper-small' },
    medium: { name: 'Medium', estimatedSecondsPerMin: 120, file: 'Systran/faster-whisper-medium' },
    large: { name: 'Large', estimatedSecondsPerMin: 600, file: 'Systran/faster-whisper-large-v3' },
};

let selectedFile;
let progressInterval;
let estimatedDuration;

// Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const recordBtn = document.getElementById('recordBtn');
const submitBtn = document.getElementById('submitBtn');
const modelSelect = document.getElementById('model');
const languageSelect = document.getElementById('language');
const taskSelect = document.getElementById('task');
const loadingSection = document.getElementById('loadingSection');
const loadingText = document.getElementById('loadingText');
const progressBar = document.getElementById('progressBar');
const estimatedTimeDisplay = document.getElementById('estimatedTime');
const resultsSection = document.getElementById('resultsSection');
const results = document.getElementById('results');
const limitInfo = document.getElementById('limitInfo');
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
        const response = await fetch('/api/config');
        if (response.ok) {
            const apiResponse = await response.json();
            const config = apiResponse.data || apiResponse;
            const maxSizeMB = config.upload?.maxFileSizeMb || 100;
            const allowedTypes = config.upload?.allowedMimeTypes || [];
            limitInfo.textContent = `Maximum file size: ${maxSizeMB} MB | Supported: ${allowedTypes.join(', ')}`;
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
}

// Transcription
async function transcribe() {
    if (!selectedFile) {
        showToast('Please select a file', 'error');
        return;
    }

    // Get selected model
    const selectedModel = modelSelect.value;
    const modelInfo = MODELS[selectedModel];

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('model', selectedModel);
    formData.append('language', languageSelect.value);
    formData.append('task', taskSelect.value);

    // Disable all interactive elements
    submitBtn.disabled = true;
    uploadArea.style.pointerEvents = 'none';
    uploadArea.style.opacity = '0.6';
    languageSelect.disabled = true;
    taskSelect.disabled = true;
    modelSelect.disabled = true;

    // Estimate duration based on model (rough estimate: assume 50 seconds average audio)
    // This will be updated once we know the actual audio duration
    estimatedDuration = 50; // seconds, will be refined

    // Calculate estimated processing time: duration * (seconds per minute of audio / 60)
    const selectedModelFormatType = selectedModel;
    const estimatedSeconds = (estimatedDuration / 60) * modelInfo.estimatedSecondsPerMin;

    // Update loading text and show progress bar
    loadingText.textContent = `Processing with ${modelInfo.name} model...`;
    estimatedTimeDisplay.textContent = `Estimated time: ${formatSeconds(estimatedSeconds)}`;

    loadingSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    progressBar.style.width = '0%';

    // Start progress bar animation
    let progressValue = 0;
    const progressStep = 100 / (estimatedSeconds * 10); // Increment over estimated time
    progressInterval = setInterval(() => {
        progressValue = Math.min(progressValue + progressStep, 95); // Cap at 95% until complete
        progressBar.style.width = progressValue + '%';
    }, 100);

    try {
        // Create abort controller with 30 minute timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000 * 60 * 30); // 30 minutes

        const response = await fetch('/transcribe', {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        clearInterval(progressInterval);
        progressBar.style.width = '100%';

        if (!response.ok) {
            const errorResponse = await response.json();
            throw new Error(errorResponse.error?.message || errorResponse.message || 'Transcription failed');
        }

        const apiResponse = await response.json();
        const data = apiResponse.data || apiResponse;
        displayResults(data);
        saveToHistory(data);
        showToast('Transcription completed!', 'success');
    } catch (error) {
        if (error.name === 'AbortError') {
            showToast('Request timeout - transcription took too long', 'error');
        } else {
            showToast(`Error: ${error.message}`, 'error');
        }
        // Re-enable buttons on error
        submitBtn.disabled = false;
        uploadArea.style.pointerEvents = 'auto';
        uploadArea.style.opacity = '1';
        languageSelect.disabled = false;
        taskSelect.disabled = false;
        modelSelect.disabled = false;
    } finally {
        loadingSection.classList.add('hidden');
        if (progressInterval) {
            clearInterval(progressInterval);
        }
        progressBar.style.width = '0%';
        estimatedTimeDisplay.textContent = '';
        loadingText.textContent = 'Transcribing your audio...';
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

function formatSeconds(seconds) {
    if (seconds < 60) {
        return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
        const minutes = Math.round(seconds / 60);
        return `${minutes}m`;
    } else {
        const hours = Math.round(seconds / 3600);
        return `${hours}h`;
    }
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