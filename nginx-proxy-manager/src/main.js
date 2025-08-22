const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const { exec, spawn } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class NginxProxyManager {
  constructor() {
    this.window = null;
    this.nginxProcess = null;
    // Use user's home directory for config file (writable location)
    this.configFile = path.join(os.homedir(), '.nginx-proxy-manager', 'proxy-config.json');
    this.ensureDataDirectory();
  }

  async ensureDataDirectory() {
    const dataDir = path.dirname(this.configFile);
    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create data directory:', error);
    }
  }

  async createWindow() {
    this.window = new BrowserWindow({
      width: 900,
      height: 700,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      },
      titleBarStyle: 'hiddenInset',
      show: false
    });

    await this.window.loadFile(path.join(__dirname, 'index.html'));
    
    this.window.once('ready-to-show', () => {
      this.window.show();
    });

    if (process.argv.includes('--dev')) {
      this.window.webContents.openDevTools();
    }
  }

  async loadConfig() {
    try {
      const data = await fs.readFile(this.configFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // Return default config if file doesn't exist
      return {
        mappings: [
          { name: 'client', port: '9000' },
          { name: 'server', port: '9001' },
          { name: 'api', port: '9002' }
        ]
      };
    }
  }

  async saveConfig(config) {
    try {
      await fs.writeFile(this.configFile, JSON.stringify(config, null, 2));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  generateNginxConfig(mappings) {
    const servers = mappings.map(mapping => `
    # ${mapping.name} server (port ${mapping.port}) -> http://${mapping.name}
    server {
        listen 80;
        server_name ${mapping.name};
        
        location / {
            proxy_pass http://localhost:${mapping.port};
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # WebSocket support
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }`).join('\n');

    return `worker_processes  1;
daemon off;
pid /tmp/nginx-oauth-proxy.pid;

error_log /dev/stderr info;

events {
    worker_connections  1024;
}

http {
    default_type  application/octet-stream;
    
    access_log /dev/stdout;
    sendfile        on;
    keepalive_timeout  65;
    ${servers}
}
`;
  }

  async updateHostsFile(mappings, action = 'add') {
    const hostsEntries = mappings.map(mapping => `127.0.0.1   ${mapping.name}`);
    const entriesText = `# Local development servers (nginx-proxy-manager)\n${hostsEntries.join('\n')}`;

    if (action === 'add' || action === 'update') {
      try {
        // First, remove any existing entries (but don't fail if there aren't any)
        await this.removeHostsEntries();
        
        // Create a temporary file with the entries and try passwordless sudo first
        const tempFile = '/tmp/nginx-proxy-manager-hosts.txt';
        await fs.writeFile(tempFile, `\n${entriesText}\n`);
        
        return new Promise((resolve) => {
          // Try passwordless sudo with tee first
          exec(`cat ${tempFile} | sudo tee -a /etc/hosts`, { timeout: 30000 }, (error, stdout, stderr) => {
            // Clean up temp file
            fs.unlink(tempFile).catch(() => {});
            
            if (error) {
              // If passwordless sudo failed, fall back to AppleScript
              const applescriptCommand = `osascript -e 'do shell script "cat ${tempFile} >> /etc/hosts" with administrator privileges'`;
              
              exec(applescriptCommand, { timeout: 30000 }, (fallbackError, fallbackStdout, fallbackStderr) => {
                if (fallbackError) {
                  if (fallbackError.message.includes('User canceled')) {
                    resolve({ success: false, error: 'Operation cancelled by user' });
                  } else {
                    resolve({ success: false, error: `Failed to add hosts entries: ${fallbackError.message}` });
                  }
                } else {
                  resolve({ success: true, message: 'Hosts entries updated successfully (with password)' });
                }
              });
            } else {
              resolve({ success: true, message: 'Hosts entries updated successfully (passwordless)' });
            }
          });
        });
      } catch (error) {
        return { success: false, error: `Failed to update hosts: ${error.message}` };
      }
    } else if (action === 'remove') {
      return await this.removeHostsEntries();
    }
  }

  async removeHostsEntries() {
    return new Promise(async (resolve) => {
      try {
        // Create a cleanup script that does the work
        const cleanupScript = `
cat /etc/hosts | awk '
BEGIN { skip=0 }
/^# Local development servers \\(nginx-proxy-manager\\)$/ { skip=1; next }
/^$/ && skip==1 { skip=0; next }
skip==0 { print }
/^[^#]/ && skip==1 && !/^127\\.0\\.0\\.1/ { skip=0; print }
' > /tmp/hosts_cleaned && cp /etc/hosts /etc/hosts.backup && cp /tmp/hosts_cleaned /etc/hosts
        `;
        
        const tempScript = '/tmp/nginx-proxy-cleanup.sh';
        await fs.writeFile(tempScript, cleanupScript);
        
        // Try passwordless sudo first
        exec(`sudo bash ${tempScript}`, { timeout: 30000 }, (error, stdout, stderr) => {
          // Clean up temp script
          fs.unlink(tempScript).catch(() => {});
          fs.unlink('/tmp/hosts_cleaned').catch(() => {});
          
          if (error) {
            // If passwordless sudo failed, fall back to AppleScript
            const applescriptCommand = `osascript -e 'do shell script "bash ${tempScript}" with administrator privileges'`;
            
            exec(applescriptCommand, { timeout: 30000 }, (fallbackError, fallbackStdout, fallbackStderr) => {
              if (fallbackError && !fallbackError.message.includes('User canceled')) {
                // Don't treat this as an error if the entries don't exist or user cancels
                resolve({ success: true, message: 'Hosts entries cleanup completed' });
              } else {
                resolve({ success: true, message: 'Hosts entries removed successfully (with password)' });
              }
            });
          } else {
            resolve({ success: true, message: 'Hosts entries removed successfully (passwordless)' });
          }
        });
      } catch (error) {
        resolve({ success: true, message: 'Hosts entries cleanup completed' });
      }
    });
  }

  async writeNginxConfig(mappings) {
    try {
      const nginxConfigContent = this.generateNginxConfig(mappings);
      const configPath = '/tmp/oauth-proxy-nginx.conf';
      await fs.writeFile(configPath, nginxConfigContent);
      return { success: true, path: configPath, message: 'Nginx config written successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async startNginx(config) {
    try {
      // First check if nginx is already running
      const status = await this.getNginxStatus();
      if (status.running) {
        return { 
          success: false, 
          error: 'Nginx is already running on port 80. Use the Stop button first if you want to restart with new configuration.' 
        };
      }

      // Generate and write nginx config file
      const configResult = await this.writeNginxConfig(config.mappings);
      if (!configResult.success) {
        return { success: false, error: `Failed to write nginx config: ${configResult.error}` };
      }

      // Start nginx using Nix from the OAuth project directory
      const oauthProjectPath = '/Users/brotherniftymacbookair/codes/oauth';
      const nixCommand = `cd "${oauthProjectPath}" && nix run . -- start`;
      
      return new Promise((resolve) => {
        exec(nixCommand, { timeout: 30000 }, (error, stdout, stderr) => {
          // Check if it's actually a critical error or just nginx startup warnings
          const hasRealError = error && (
            stderr.includes('Address already in use') ||
            stderr.includes('bind() to') ||
            stderr.includes('Permission denied') ||
            (error.code !== 0 && !stderr.includes('could not open error log file'))
          );
          
          if (hasRealError) {
            // Check if it's a port binding error
            if (stderr && stderr.includes('Address already in use')) {
              resolve({ 
                success: false, 
                error: 'Port 80 is already in use by another process. Please stop other web servers or nginx instances first.',
                output: stderr 
              });
            } else {
              resolve({ success: false, error: error.message, output: stderr });
            }
          } else {
            // Nginx started successfully, treat stderr as informational
            let message = 'Nginx started successfully.';
            if (stderr && stderr.includes('could not open error log file')) {
              message += ' (Note: Using stderr for error logging instead of /var/log/nginx/error.log)';
            }
            
            resolve({ 
              success: true, 
              message: message,
              output: stdout,
              warnings: stderr || null
            });
          }
        });
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async stopNginx() {
    try {
      const oauthProjectPath = '/Users/brotherniftymacbookair/codes/oauth';
      const nixCommand = `cd "${oauthProjectPath}" && nix run . -- stop`;
      
      return new Promise((resolve) => {
        exec(nixCommand, (error, stdout, stderr) => {
          if (error) {
            resolve({ success: false, error: error.message, output: stderr });
          } else {
            this.nginxProcess = null;
            resolve({ success: true, message: 'Nginx stopped successfully', output: stdout });
          }
        });
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getNginxStatus() {
    try {
      // Check both the Nix status and direct port check
      const oauthProjectPath = '/Users/brotherniftymacbookair/codes/oauth';
      const nixCommand = `cd "${oauthProjectPath}" && nix run . -- status`;
      
      return new Promise((resolve) => {
        // First check Nix status
        exec(nixCommand, (nixError, nixStdout, nixStderr) => {
          const nixRunning = !nixError && nixStdout.includes('Nginx proxy is running');
          
          // Also check if nginx is actually running on port 80
          exec('lsof -i :80 | grep nginx', (lsofError, lsofStdout) => {
            const portRunning = !lsofError && lsofStdout.trim().length > 0;
            
            // If either method detects nginx running, consider it running
            const isRunning = nixRunning || portRunning;
            
            let statusMessage = '';
            if (nixRunning && portRunning) {
              statusMessage = 'Nginx proxy is running properly';
            } else if (portRunning && !nixRunning) {
              statusMessage = 'Nginx is running on port 80 (may not be managed by this app)';
            } else if (nixRunning && !portRunning) {
              statusMessage = 'Nix reports nginx running but port 80 is not bound';
            } else {
              statusMessage = 'Nginx proxy is not running';
            }
            
            resolve({
              success: true,
              running: isRunning,
              output: statusMessage,
              nixOutput: nixStdout || nixStderr,
              portBound: portRunning,
              error: nixError ? nixError.message : null
            });
          });
        });
      });
    } catch (error) {
      return { success: false, error: error.message, running: false };
    }
  }

  async saveConfigAndApply(config) {
    try {
      // Save the configuration
      const saveResult = await this.saveConfig(config);
      if (!saveResult.success) {
        return { success: false, error: `Failed to save config: ${saveResult.error}` };
      }

      // Update nginx config file
      const configResult = await this.writeNginxConfig(config.mappings);
      if (!configResult.success) {
        return { success: false, error: `Failed to write nginx config: ${configResult.error}` };
      }

      // Automatically update hosts file when configuration changes
      const hostsResult = await this.updateHostsFile(config.mappings, 'add');
      let hostsMessage = '';
      if (hostsResult.success) {
        hostsMessage = ' Hosts file updated.';
      } else if (!hostsResult.error.includes('User canceled')) {
        // Don't fail the entire operation if hosts update fails, but mention it
        hostsMessage = ` (Note: Hosts file update failed: ${hostsResult.error})`;
      } else {
        hostsMessage = ' (Hosts file update cancelled by user.)';
      }

      return { 
        success: true, 
        message: `Configuration saved and nginx config updated.${hostsMessage} If nginx is running, restart it to apply changes.`,
        needsRestart: true
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async setupHostsSudoers() {
    const username = os.userInfo().username;
    const sudoersContent = `# Allow ${username} passwordless hosts file management for nginx-proxy-manager
${username} ALL=(ALL) NOPASSWD: /bin/cat /tmp/nginx-proxy-manager-hosts.txt
${username} ALL=(ALL) NOPASSWD: /bin/cp /etc/hosts /etc/hosts.backup*
${username} ALL=(ALL) NOPASSWD: /bin/cp /tmp/hosts_cleaned /etc/hosts
${username} ALL=(ALL) NOPASSWD: /bin/bash /tmp/nginx-proxy-cleanup.sh
${username} ALL=(ALL) NOPASSWD: /usr/bin/tee -a /etc/hosts`;
    
    return new Promise(async (resolve) => {
      try {
        // Create temp sudoers file
        const tempSudoersFile = '/tmp/nginx-proxy-manager-hosts-sudoers';
        await fs.writeFile(tempSudoersFile, sudoersContent);
        
        // Create a simpler shell script to do the work
        const setupScript = `#!/bin/bash
SUDOERS_FILE="/etc/sudoers.d/nginx-proxy-manager-hosts"
TEMP_FILE="${tempSudoersFile}"

if [ -f "$SUDOERS_FILE" ]; then
  echo "Sudoers rule already exists"
  exit 0
fi

# Validate syntax first
if visudo -c -f "$TEMP_FILE" >/dev/null 2>&1; then
  cp "$TEMP_FILE" "$SUDOERS_FILE"
  chmod 0440 "$SUDOERS_FILE"
  echo "Sudoers rule created successfully"
else
  echo "Error: Invalid sudoers syntax" >&2
  exit 1
fi`;
        
        const tempScript = '/tmp/nginx-proxy-sudoers-setup.sh';
        await fs.writeFile(tempScript, setupScript);
        
        // Use osascript with a simpler command
        const applescriptCommand = `osascript -e 'do shell script "bash ${tempScript}" with administrator privileges'`;
        
        exec(applescriptCommand, { timeout: 30000 }, (error, stdout, stderr) => {
          // Clean up temp files
          fs.unlink(tempSudoersFile).catch(() => {});
          fs.unlink(tempScript).catch(() => {});
          
          if (error) {
            if (error.message.includes('User canceled')) {
              resolve({ success: false, error: 'Setup cancelled by user' });
            } else {
              resolve({ success: false, error: `Failed to setup sudoers: ${error.message}` });
            }
          } else {
            resolve({ success: true, message: 'Passwordless hosts file management configured' });
          }
        });
      } catch (error) {
        resolve({ success: false, error: `Failed to setup sudoers: ${error.message}` });
      }
    });
  }

  async checkHostsSudoersSetup() {
    try {
      await fs.access('/etc/sudoers.d/nginx-proxy-manager-hosts');
      return { configured: true };
    } catch (error) {
      return { configured: false };
    }
  }

  async removeHostsSudoers() {
    return new Promise((resolve) => {
      const applescriptCommand = `osascript -e 'do shell script "rm -f /etc/sudoers.d/nginx-proxy-manager-hosts" with administrator privileges'`;
      
      exec(applescriptCommand, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          if (error.message.includes('User canceled')) {
            resolve({ success: false, error: 'Removal cancelled by user' });
          } else {
            resolve({ success: false, error: `Failed to remove sudoers: ${error.message}` });
          }
        } else {
          resolve({ success: true, message: 'Hosts file sudoers configuration removed' });
        }
      });
    });
  }

  setupIPC() {
    ipcMain.handle('load-config', async () => {
      return await this.loadConfig();
    });

    ipcMain.handle('save-config', async (event, config) => {
      return await this.saveConfig(config);
    });

    ipcMain.handle('save-config-and-apply', async (event, config) => {
      return await this.saveConfigAndApply(config);
    });

    ipcMain.handle('start-nginx', async (event, config) => {
      return await this.startNginx(config);
    });

    ipcMain.handle('stop-nginx', async () => {
      return await this.stopNginx();
    });

    ipcMain.handle('get-status', async () => {
      return await this.getNginxStatus();
    });

    ipcMain.handle('update-hosts', async (event, mappings, action) => {
      return await this.updateHostsFile(mappings, action);
    });

    ipcMain.handle('write-nginx-config', async (event, mappings) => {
      return await this.writeNginxConfig(mappings);
    });

    ipcMain.handle('restart-nginx', async (event, config) => {
      try {
        const status = await this.getNginxStatus();
        if (!status.running) {
          return { success: false, error: 'Nginx is not running' };
        }

        const stopResult = await this.stopNginx();
        if (!stopResult.success) {
          return { success: false, error: `Failed to stop nginx: ${stopResult.error}` };
        }

        // Wait a moment for nginx to stop
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const startResult = await this.startNginx(config);
        return startResult;
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('show-error', async (event, title, message) => {
      dialog.showErrorBox(title, message);
    });

    ipcMain.handle('show-message', async (event, options) => {
      const result = await dialog.showMessageBox(this.window, options);
      return result;
    });

    ipcMain.handle('setup-hosts-sudoers', async () => {
      return await this.setupHostsSudoers();
    });

    ipcMain.handle('check-hosts-sudoers', async () => {
      return await this.checkHostsSudoersSetup();
    });

    ipcMain.handle('remove-hosts-sudoers', async () => {
      return await this.removeHostsSudoers();
    });
  }
}

const manager = new NginxProxyManager();

app.whenReady().then(async () => {
  manager.setupIPC();
  await manager.createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await manager.createWindow();
  }
});

// Cleanup on app quit
app.on('before-quit', async () => {
  if (manager.nginxProcess) {
    await manager.stopNginx();
  }
});
