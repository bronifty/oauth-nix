// State management
let currentConfig = { mappings: [] };
let currentStatus = { running: false };

// DOM elements
const elements = {
    // Sidebar
    sidebarItems: document.querySelectorAll('.sidebar-item'),
    contentSections: document.querySelectorAll('.content-section'),
    
    // Dashboard
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    statusDetails: document.getElementById('statusDetails'),
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    startLoading: document.getElementById('startLoading'),
    stopLoading: document.getElementById('stopLoading'),
    alertContainer: document.getElementById('alertContainer'),
    currentMappings: document.getElementById('currentMappings'),
    
    // Configuration
    mappingsContainer: document.getElementById('mappingsContainer'),
    addMappingBtn: document.getElementById('addMappingBtn'),
    saveConfigBtn: document.getElementById('saveConfigBtn'),
    resetConfigBtn: document.getElementById('resetConfigBtn'),
    configAlerts: document.getElementById('configAlerts'),
    
    // Hosts management
    addHostsBtn: document.getElementById('addHostsBtn'),
    removeHostsBtn: document.getElementById('removeHostsBtn'),
    writeConfigBtn: document.getElementById('writeConfigBtn'),
    hostsPreview: document.getElementById('hostsPreview'),
    hostsAlerts: document.getElementById('hostsAlerts')
};

// Utility functions
function showAlert(container, message, type = 'info', duration = 5000) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    container.appendChild(alert);
    
    if (duration > 0) {
        setTimeout(() => {
            if (alert.parentNode) {
                alert.parentNode.removeChild(alert);
            }
        }, duration);
    }
    
    return alert;
}

function clearAlerts(container) {
    container.innerHTML = '';
}

// Sidebar navigation
function initializeSidebar() {
    elements.sidebarItems.forEach(item => {
        item.addEventListener('click', () => {
            const sectionId = item.dataset.section;
            showSection(sectionId);
            
            // Update active states
            elements.sidebarItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

function showSection(sectionId) {
    elements.contentSections.forEach(section => {
        section.classList.remove('active');
    });
    
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
        
        // Load section-specific data
        if (sectionId === 'dashboard') {
            refreshStatus();
        } else if (sectionId === 'configuration') {
            loadConfiguration();
        } else if (sectionId === 'hosts') {
            updateHostsPreview();
        }
    }
}

// Configuration management
function createMappingRow(mapping = { name: '', port: '' }, index) {
    const row = document.createElement('div');
    row.className = 'form-row';
    row.innerHTML = `
        <div class="input-group">
            <label>Domain Name</label>
            <input type="text" 
                   placeholder="e.g., client" 
                   value="${mapping.name}" 
                   data-field="name" 
                   data-index="${index}">
        </div>
        <div class="input-group">
            <label>Port</label>
            <input type="number" 
                   placeholder="e.g., 9000" 
                   value="${mapping.port}" 
                   data-field="port" 
                   data-index="${index}">
        </div>
        <button class="btn-remove" onclick="removeMapping(${index})" title="Remove mapping">
            ×
        </button>
    `;
    
    // Add event listeners for real-time updates
    const inputs = row.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('input', updateMappingFromInput);
    });
    
    return row;
}

function updateMappingFromInput(event) {
    const input = event.target;
    const index = parseInt(input.dataset.index);
    const field = input.dataset.field;
    
    if (currentConfig.mappings[index]) {
        currentConfig.mappings[index][field] = input.value;
    }
}

function addMapping() {
    const newMapping = { name: '', port: '' };
    currentConfig.mappings.push(newMapping);
    renderMappings();
}

function removeMapping(index) {
    currentConfig.mappings.splice(index, 1);
    renderMappings();
}

function renderMappings() {
    elements.mappingsContainer.innerHTML = '';
    
    currentConfig.mappings.forEach((mapping, index) => {
        const row = createMappingRow(mapping, index);
        elements.mappingsContainer.appendChild(row);
    });
    
    // Update current mappings display
    updateCurrentMappingsDisplay();
}

function updateCurrentMappingsDisplay() {
    if (currentConfig.mappings.length === 0) {
        elements.currentMappings.innerHTML = '<p>No mappings configured.</p>';
        return;
    }
    
    elements.currentMappings.innerHTML = currentConfig.mappings
        .map(mapping => `
            <div class="mapping-item">
                <div>
                    <div class="mapping-info">${mapping.name}</div>
                    <div class="mapping-url">http://${mapping.name} → http://localhost:${mapping.port}</div>
                </div>
            </div>
        `).join('');
}

async function loadConfiguration() {
    try {
        const config = await window.electronAPI.loadConfig();
        currentConfig = config;
        renderMappings();
        clearAlerts(elements.configAlerts);
    } catch (error) {
        console.error('Failed to load configuration:', error);
        showAlert(elements.configAlerts, 'Failed to load configuration: ' + error.message, 'error');
    }
}

async function saveConfiguration() {
    try {
        // Validate mappings
        const validMappings = currentConfig.mappings.filter(mapping => 
            mapping.name.trim() && mapping.port.trim()
        );
        
        if (validMappings.length === 0) {
            showAlert(elements.configAlerts, 'Please add at least one valid mapping.', 'error');
            return;
        }
        
        // Check for duplicate names
        const names = validMappings.map(m => m.name.trim().toLowerCase());
        const uniqueNames = new Set(names);
        if (names.length !== uniqueNames.size) {
            showAlert(elements.configAlerts, 'Domain names must be unique.', 'error');
            return;
        }
        
        const configToSave = { mappings: validMappings };
        
        // Show loading state
        elements.saveConfigBtn.disabled = true;
        elements.saveConfigBtn.textContent = '💾 Saving...';
        clearAlerts(elements.configAlerts);
        
        // Use the new save-and-apply method that automatically handles nginx config updates
        const result = await window.electronAPI.saveConfigAndApply(configToSave);
        
        if (result.success) {
            currentConfig = configToSave;
            showAlert(elements.configAlerts, result.message, 'success');
            updateCurrentMappingsDisplay();
            updateHostsPreview(); // Update hosts preview with new config
        } else {
            showAlert(elements.configAlerts, 'Failed to save configuration: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Failed to save configuration:', error);
        showAlert(elements.configAlerts, 'Failed to save configuration: ' + error.message, 'error');
    } finally {
        // Reset button state
        elements.saveConfigBtn.disabled = false;
        elements.saveConfigBtn.textContent = '💾 Save Configuration';
    }
}

function resetConfiguration() {
    currentConfig = {
        mappings: [
            { name: 'client', port: '9000' },
            { name: 'server', port: '9001' },
            { name: 'api', port: '9002' }
        ]
    };
    renderMappings();
    showAlert(elements.configAlerts, 'Configuration reset to defaults.', 'info');
}

// Status management
async function refreshStatus() {
    try {
        const status = await window.electronAPI.getStatus();
        currentStatus = status;
        updateStatusDisplay();
    } catch (error) {
        console.error('Failed to get status:', error);
        elements.statusText.textContent = 'Status check failed';
        elements.statusDetails.textContent = error.message;
        elements.statusDot.classList.remove('running');
    }
}

function updateStatusDisplay() {
    if (currentStatus.running) {
        elements.statusDot.classList.add('running');
        elements.statusText.textContent = 'Nginx Proxy Running';
        elements.statusDetails.textContent = 'Your development proxy is active and ready to handle requests.';
        elements.startBtn.disabled = true;
        elements.stopBtn.disabled = false;
    } else {
        elements.statusDot.classList.remove('running');
        elements.statusText.textContent = 'Nginx Proxy Stopped';
        elements.statusDetails.textContent = 'The proxy is not running. Click "Start Proxy" to begin.';
        elements.startBtn.disabled = false;
        elements.stopBtn.disabled = true;
    }
}

// Proxy control
async function startProxy() {
    elements.startLoading.style.display = 'inline-block';
    elements.startBtn.disabled = true;
    clearAlerts(elements.alertContainer);
    
    try {
        const result = await window.electronAPI.startNginx(currentConfig);
        
        if (result.success) {
            showAlert(elements.alertContainer, 'Nginx proxy started successfully!', 'success');
            setTimeout(refreshStatus, 1000);
        } else {
            showAlert(elements.alertContainer, 'Failed to start proxy: ' + result.error, 'error');
            elements.startBtn.disabled = false;
        }
    } catch (error) {
        console.error('Failed to start proxy:', error);
        showAlert(elements.alertContainer, 'Failed to start proxy: ' + error.message, 'error');
        elements.startBtn.disabled = false;
    }
    
    elements.startLoading.style.display = 'none';
}

async function stopProxy() {
    elements.stopLoading.style.display = 'inline-block';
    elements.stopBtn.disabled = true;
    clearAlerts(elements.alertContainer);
    
    try {
        const result = await window.electronAPI.stopNginx();
        
        if (result.success) {
            showAlert(elements.alertContainer, 'Nginx proxy stopped successfully!', 'success');
            setTimeout(refreshStatus, 1000);
        } else {
            showAlert(elements.alertContainer, 'Failed to stop proxy: ' + result.error, 'error');
            elements.stopBtn.disabled = false;
        }
    } catch (error) {
        console.error('Failed to stop proxy:', error);
        showAlert(elements.alertContainer, 'Failed to stop proxy: ' + error.message, 'error');
        elements.stopBtn.disabled = false;
    }
    
    elements.stopLoading.style.display = 'none';
}

// Hosts management
function updateHostsPreview() {
    if (currentConfig.mappings.length === 0) {
        elements.hostsPreview.innerHTML = '<p>No domain mappings configured. Go to Configuration tab to add mappings.</p>';
        elements.addHostsBtn.disabled = true;
        elements.removeHostsBtn.disabled = true;
        elements.writeConfigBtn.disabled = true;
        return;
    }
    
    const hostsEntries = currentConfig.mappings
        .filter(mapping => mapping.name.trim())
        .map(mapping => `127.0.0.1   ${mapping.name.trim()}`)
        .join('\n');
    
    elements.hostsPreview.innerHTML = `
        <h4>Hosts entries to be added/managed:</h4>
        <pre style="background: #f8f9fa; padding: 15px; border-radius: 6px; border-left: 4px solid #74b9ff;"># Local development servers (nginx-proxy-manager)
${hostsEntries}</pre>
        <p><small><strong>Location:</strong> /etc/hosts</small></p>
    `;
    
    elements.addHostsBtn.disabled = false;
    elements.removeHostsBtn.disabled = false;
    elements.writeConfigBtn.disabled = false;
}

async function addHostsEntries() {
    clearAlerts(elements.hostsAlerts);
    
    if (currentConfig.mappings.length === 0) {
        showAlert(elements.hostsAlerts, 'No mappings configured. Please configure mappings first.', 'error');
        return;
    }
    
    try {
        elements.addHostsBtn.disabled = true;
        elements.addHostsBtn.textContent = '📝 Adding...';
        
        const result = await window.electronAPI.updateHosts(currentConfig.mappings, 'add');
        
        if (result.success) {
            showAlert(elements.hostsAlerts, result.message || 'Hosts entries added successfully!', 'success');
        } else {
            showAlert(elements.hostsAlerts, 'Failed to add hosts entries: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Failed to add hosts entries:', error);
        showAlert(elements.hostsAlerts, 'Failed to add hosts entries: ' + error.message, 'error');
    }
    
    elements.addHostsBtn.disabled = false;
    elements.addHostsBtn.textContent = '📝 Update /etc/hosts';
}

async function removeHostsEntries() {
    clearAlerts(elements.hostsAlerts);
    
    try {
        elements.removeHostsBtn.disabled = true;
        elements.removeHostsBtn.textContent = '🗑️ Removing...';
        
        const result = await window.electronAPI.updateHosts(currentConfig.mappings, 'remove');
        
        if (result.success) {
            showAlert(elements.hostsAlerts, result.message || 'Hosts entries removed successfully!', 'success');
        } else {
            showAlert(elements.hostsAlerts, 'Failed to remove hosts entries: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Failed to remove hosts entries:', error);
        showAlert(elements.hostsAlerts, 'Failed to remove hosts entries: ' + error.message, 'error');
    }
    
    elements.removeHostsBtn.disabled = false;
    elements.removeHostsBtn.textContent = '🗑️ Remove Hosts Entries';
}

// Nginx config management
async function writeNginxConfig() {
    clearAlerts(elements.hostsAlerts);
    
    if (currentConfig.mappings.length === 0) {
        showAlert(elements.hostsAlerts, 'No mappings configured. Please configure mappings first.', 'error');
        return;
    }
    
    try {
        elements.writeConfigBtn.disabled = true;
        elements.writeConfigBtn.textContent = '⚙️ Writing...';
        
        const result = await window.electronAPI.writeNginxConfig(currentConfig.mappings);
        
        if (result.success) {
            showAlert(elements.hostsAlerts, `Nginx config written to ${result.path}`, 'success');
        } else {
            showAlert(elements.hostsAlerts, 'Failed to write nginx config: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Failed to write nginx config:', error);
        showAlert(elements.hostsAlerts, 'Failed to write nginx config: ' + error.message, 'error');
    }
    
    elements.writeConfigBtn.disabled = false;
    elements.writeConfigBtn.textContent = '⚙️ Write Nginx Config';
}

// Global functions (for onclick handlers)
window.removeMapping = removeMapping;

// Event listeners
function initializeEventListeners() {
    // Dashboard controls
    elements.startBtn.addEventListener('click', startProxy);
    elements.stopBtn.addEventListener('click', stopProxy);
    elements.refreshBtn.addEventListener('click', refreshStatus);
    
    // Configuration controls
    elements.addMappingBtn.addEventListener('click', addMapping);
    elements.saveConfigBtn.addEventListener('click', saveConfiguration);
    elements.resetConfigBtn.addEventListener('click', resetConfiguration);
    
    // Hosts management
    elements.addHostsBtn.addEventListener('click', addHostsEntries);
    elements.removeHostsBtn.addEventListener('click', removeHostsEntries);
    elements.writeConfigBtn.addEventListener('click', writeNginxConfig);
}

// Initialize the application
async function initializeApp() {
    console.log('Initializing Nginx Proxy Manager...');
    
    try {
        // Initialize UI components
        initializeSidebar();
        initializeEventListeners();
        
        // Load initial data
        await loadConfiguration();
        await refreshStatus();
        
        console.log('Nginx Proxy Manager initialized successfully');
    } catch (error) {
        console.error('Failed to initialize app:', error);
        document.body.innerHTML = `
            <div style="padding: 20px; text-align: center;">
                <h1>Failed to Initialize</h1>
                <p>Error: ${error.message}</p>
                <button onclick="location.reload()">Retry</button>
            </div>
        `;
    }
}

// Start the application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
