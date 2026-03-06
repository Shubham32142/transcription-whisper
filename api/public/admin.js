let adminKey = '';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    // Check if already logged in (from session storage)
    const savedKey = sessionStorage.getItem('adminKey');
    if (savedKey) {
        adminKey = savedKey;
        showDashboard();
    }
});

// Login
async function login() {
    const input = document.getElementById('adminKeyInput');
    const key = input.value.trim();

    if (!key) {
        showToast('Please enter admin key', 'error');
        return;
    }

    // Test the key by fetching stats
    try {
        const response = await fetch('/admin/stats', {
            headers: { 'x-admin-key': key }
        });

        if (response.ok) {
            adminKey = key;
            sessionStorage.setItem('adminKey', key);
            showDashboard();
            showToast('Login successful!', 'success');
        } else {
            showToast('Invalid admin key', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showToast('Login failed', 'error');
    }
}

// Show dashboard
function showDashboard() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    loadStats();
    loadKeys();
}

// Load statistics
async function loadStats() {
    try {
        const response = await fetch('/admin/stats', {
            headers: { 'x-admin-key': adminKey }
        });

        if (response.ok) {
            const data = await response.json();
            document.getElementById('totalKeys').textContent = data.stats.total_keys;
            document.getElementById('activeKeys').textContent = data.stats.active_keys;
            document.getElementById('totalTranscriptions').textContent = data.stats.total_transcriptions;
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// Load API keys
async function loadKeys() {
    try {
        const response = await fetch('/admin/keys', {
            headers: { 'x-admin-key': adminKey }
        });

        if (!response.ok) {
            showToast('Failed to load keys', 'error');
            return;
        }

        const data = await response.json();
        displayKeys(data.keys);
        lucide.createIcons();
    } catch (error) {
        console.error('Failed to load keys:', error);
        showToast('Failed to load keys', 'error');
    }
}

// Display keys
function displayKeys(keys) {
    const container = document.getElementById('keysList');

    if (keys.length === 0) {
        container.innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 40px;">No API keys yet. Create one to get started!</p>';
        return;
    }

    container.innerHTML = keys.map(key => {
        const isActive = key.is_active === 1;
        const createdDate = new Date(key.created_at).toLocaleString();
        const lastUsed = key.last_used ? new Date(key.last_used).toLocaleString() : 'Never';

        return `
            <div class="key-card">
                <div class="key-card-header">
                    <div class="key-card-title">
                        <i data-lucide="key"></i>
                        <h4>${key.name}</h4>
                    </div>
                    <span class="key-badge ${isActive ? 'badge-active' : 'badge-inactive'}">
                        ${isActive ? 'Active' : 'Inactive'}
                    </span>
                </div>
                <div class="key-value">${key.key}</div>
                <div class="key-meta">
                    <div class="key-meta-item">
                        <i data-lucide="calendar"></i>
                        <span>Created: ${createdDate}</span>
                    </div>
                    <div class="key-meta-item">
                        <i data-lucide="clock"></i>
                        <span>Last used: ${lastUsed}</span>
                    </div>
                    <div class="key-meta-item">
                        <i data-lucide="activity"></i>
                        <span>Uses: ${key.usage_count}</span>
                    </div>
                </div>
                <div class="key-actions">
                    <button onclick="copyKey('${key.key}')" class="btn-copy">
                        <i data-lucide="copy" class="btn-icon"></i> Copy
                    </button>
                    ${isActive ? `
                        <button onclick="deactivateKey('${key.key}')" class="btn btn-danger">
                            <i data-lucide="x-circle" class="btn-icon"></i> Deactivate
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    lucide.createIcons();
}

// Create new API key
async function createKey() {
    const nameInput = document.getElementById('keyName');
    const name = nameInput.value.trim();

    if (!name) {
        showToast('Please enter a name for the key', 'error');
        return;
    }

    try {
        const response = await fetch('/admin/keys', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-key': adminKey
            },
            body: JSON.stringify({ name })
        });

        if (!response.ok) {
            throw new Error('Failed to create key');
        }

        const data = await response.json();

        // Show the new key in a modal
        document.getElementById('newKeyValue').textContent = data.key.key;
        document.getElementById('keyModal').classList.remove('hidden');
        lucide.createIcons();

        // Clear input and reload
        nameInput.value = '';
        loadKeys();
        loadStats();
    } catch (error) {
        console.error('Failed to create key:', error);
        showToast('Failed to create key', 'error');
    }
}

// Copy key to clipboard
function copyKey(key) {
    navigator.clipboard.writeText(key)
        .then(() => showToast('API key copied to clipboard!', 'success'))
        .catch(() => showToast('Failed to copy', 'error'));
}

// Copy new key from modal
function copyNewKey() {
    const key = document.getElementById('newKeyValue').textContent;
    copyKey(key);
}

// Deactivate key
async function deactivateKey(key) {
    if (!confirm('Are you sure you want to deactivate this API key? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`/admin/keys/${encodeURIComponent(key)}`, {
            method: 'DELETE',
            headers: { 'x-admin-key': adminKey }
        });

        if (!response.ok) {
            throw new Error('Failed to deactivate key');
        }

        showToast('API key deactivated', 'success');
        loadKeys();
        loadStats();
    } catch (error) {
        console.error('Failed to deactivate key:', error);
        showToast('Failed to deactivate key', 'error');
    }
}

// Close modal
function closeModal() {
    document.getElementById('keyModal').classList.add('hidden');
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

// Allow Enter key for login
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const loginSection = document.getElementById('loginSection');
        if (!loginSection.classList.contains('hidden')) {
            login();
        }
    }
});
