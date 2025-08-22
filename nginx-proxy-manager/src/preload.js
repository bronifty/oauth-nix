const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  saveConfigAndApply: (config) => ipcRenderer.invoke('save-config-and-apply', config),
  startNginx: (config) => ipcRenderer.invoke('start-nginx', config),
  stopNginx: () => ipcRenderer.invoke('stop-nginx'),
  restartNginx: (config) => ipcRenderer.invoke('restart-nginx', config),
  getStatus: () => ipcRenderer.invoke('get-status'),
  updateHosts: (mappings, action) => ipcRenderer.invoke('update-hosts', mappings, action),
  writeNginxConfig: (mappings) => ipcRenderer.invoke('write-nginx-config', mappings),
  showError: (title, message) => ipcRenderer.invoke('show-error', title, message),
  showMessage: (options) => ipcRenderer.invoke('show-message', options),
  setupHostsSudoers: () => ipcRenderer.invoke('setup-hosts-sudoers'),
  checkHostsSudoers: () => ipcRenderer.invoke('check-hosts-sudoers'),
  removeHostsSudoers: () => ipcRenderer.invoke('remove-hosts-sudoers')
});
