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

    const selectedModel = modelSelect.value;

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

    loadingSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    progressBar.style.width = '0%';
    loadingText.textContent = 'Uploading audio...';
    estimatedTimeDisplay.textContent = 'Preparing transcription job';

    try {
        const jobResponse = await createTranscriptionJob(formData);
        const createdJob = jobResponse.data || jobResponse;
        const completedJob = await pollTranscriptionJob(createdJob.id);
        const data = completedJob.result;

        progressBar.style.width = '100%';
        displayResults(data);
        saveToHistory(data);
        showToast('Transcription completed!', 'success');
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
        // Re-enable buttons on error
        submitBtn.disabled = false;
        uploadArea.style.pointerEvents = 'auto';
        uploadArea.style.opacity = '1';
        languageSelect.disabled = false;
        taskSelect.disabled = false;
        modelSelect.disabled = false;
    } finally {
        loadingSection.classList.add('hidden');
        progressBar.style.width = '0%';
        estimatedTimeDisplay.textContent = '';
        loadingText.textContent = 'Transcribing your audio...';
    }
}

// Display Results
function displayResults(data) {
    const structuredTranscript = data.structuredTranscript || '';
    const speakerNote = data.speakerLabelsAvailable
        ? 'Speaker labels detected'
        : 'Speaker labels are not available with the current model';

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
        ${data.utterances?.length ? `
            <div class="result-item metadata">
                <strong>Structured Entries:</strong> ${data.utterances.length}
            </div>
            <div class="result-item metadata">
                <strong>Speakers:</strong> ${speakerNote}
            </div>
            <div class="result-item transcript structured-transcript">
                ${structuredTranscript.replaceAll('\n', '<br>')}
            </div>
        ` : ''}
    `;
    resultsSection.classList.remove('hidden');
    window.currentTranscript = data.transcript;
    enableControls();
}

function createTranscriptionJob(formData) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/transcribe/jobs');
        xhr.responseType = 'json';

        xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) {
                return;
            }

            const percent = (event.loaded / event.total) * 100;
            progressBar.style.width = `${Math.min(percent, 100)}%`;
            loadingText.textContent = 'Uploading audio...';
            estimatedTimeDisplay.textContent = `${percent.toFixed(1)}% uploaded`;
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.response);
                return;
            }

            const errorMessage = xhr.response?.error?.message
                || xhr.response?.message
                || 'Failed to create transcription job';
            reject(new Error(errorMessage));
        };

        xhr.onerror = () => {
            reject(new Error('Network error while uploading audio'));
        };

        xhr.send(formData);
    });
}

async function pollTranscriptionJob(jobId) {
    while (true) {
        const response = await fetch(`/transcribe/jobs/${jobId}`);
        if (!response.ok) {
            const errorResponse = await response.json().catch(() => null);
            throw new Error(errorResponse?.error?.message || errorResponse?.message || 'Failed to fetch transcription status');
        }

        const apiResponse = await response.json();
        const job = apiResponse.data || apiResponse;
        updateJobProgress(job);

        if (job.status === 'completed') {
            return job;
        }

        if (job.status === 'failed') {
            throw new Error(job.error || 'Transcription failed');
        }

        await delay(1000);
    }
}

function updateJobProgress(job) {
    const progress = job.progress || {};
    const percentage = Number.isFinite(progress.percentage) ? progress.percentage : 0;
    const processedSeconds = Number.isFinite(progress.processedSeconds) ? progress.processedSeconds : 0;
    const totalSeconds = Number.isFinite(progress.totalSeconds) ? progress.totalSeconds : null;
    const elapsedSeconds = Number.isFinite(progress.elapsedSeconds) ? progress.elapsedSeconds : 0;
    const modelName = MODELS[job.model]?.name || job.model;

    progressBar.style.width = `${Math.min(Math.max(percentage, 0), 100)}%`;

    if (job.status === 'queued') {
        loadingText.textContent = 'Queued for transcription...';
    } else if (job.status === 'processing') {
        loadingText.textContent = `Processing with ${modelName} model... ${percentage.toFixed(1)}%`;
    } else if (job.status === 'completed') {
        loadingText.textContent = 'Transcription completed';
    } else {
        loadingText.textContent = 'Transcription failed';
    }

    const detailParts = [];
    if (totalSeconds !== null && totalSeconds > 0) {
        detailParts.push(`${formatDetailedSeconds(processedSeconds)} / ${formatDetailedSeconds(totalSeconds)} processed`);
    } else if (processedSeconds > 0) {
        detailParts.push(`${formatDetailedSeconds(processedSeconds)} processed`);
    }

    if (elapsedSeconds > 0) {
        detailParts.push(`Elapsed ${formatDetailedSeconds(elapsedSeconds)}`);
    }

    if (progress.currentText) {
        detailParts.push(progress.currentText.length > 80 ? `${progress.currentText.slice(0, 77)}...` : progress.currentText);
    }

    estimatedTimeDisplay.textContent = detailParts.join(' • ');
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

function formatDetailedSeconds(seconds) {
    const safeSeconds = Math.max(0, Math.round(seconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const secs = safeSeconds % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}