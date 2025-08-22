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
        
        // Create a temporary file with the entries and use osascript for sudo
        const tempFile = '/tmp/nginx-proxy-manager-hosts.txt';
        await fs.writeFile(tempFile, `\n${entriesText}\n`);
        
        const applescriptCommand = `osascript -e 'do shell script "cat ${tempFile} >> /etc/hosts" with administrator privileges'`;
        
        return new Promise((resolve) => {
          exec(applescriptCommand, { timeout: 30000 }, (error, stdout, stderr) => {
            // Clean up temp file
            fs.unlink(tempFile).catch(() => {});
            
            if (error) {
              if (error.message.includes('User canceled')) {
                resolve({ success: false, error: 'Operation cancelled by user' });
              } else {
                resolve({ success: false, error: `Failed to add hosts entries: ${error.message}` });
              }
            } else {
              resolve({ success: true, message: 'Hosts entries updated successfully' });
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
        
        const applescriptCommand = `osascript -e 'do shell script "bash ${tempScript}" with administrator privileges'`;
        
        exec(applescriptCommand, { timeout: 30000 }, (error, stdout, stderr) => {
          // Clean up temp script
          fs.unlink(tempScript).catch(() => {});
          fs.unlink('/tmp/hosts_cleaned').catch(() => {});
          
          if (error && !error.message.includes('User canceled')) {
            // Don't treat this as an error if the entries don't exist or user cancels
            resolve({ success: true, message: 'Hosts entries cleanup completed' });
          } else {
            resolve({ success: true, message: 'Hosts entries removed successfully' });
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
    if (this.nginxProcess) {
      return { success: false, error: 'Nginx is already running' };
    }

    try {
      // Generate and write nginx config file
      const configResult = await this.writeNginxConfig(config.mappings);
      if (!configResult.success) {
        return { success: false, error: `Failed to write nginx config: ${configResult.error}` };
      }

      // Don't automatically update hosts file - let user do it manually in hosts tab
      // This avoids the sudo prompt during nginx startup

      // Start nginx using Nix from the OAuth project directory
      const oauthProjectPath = '/Users/brotherniftymacbookair/codes/oauth';
      const nixCommand = `cd "${oauthProjectPath}" && nix run . -- start`;
      
      return new Promise((resolve) => {
        exec(nixCommand, (error, stdout, stderr) => {
          if (error) {
            resolve({ success: false, error: error.message, output: stderr });
          } else {
            resolve({ 
              success: true, 
              message: 'Nginx started successfully. Remember to update /etc/hosts in the Hosts Management tab if needed.',
              output: stdout 
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
      const oauthProjectPath = '/Users/brotherniftymacbookair/codes/oauth';
      const nixCommand = `cd "${oauthProjectPath}" && nix run . -- status`;
      
      return new Promise((resolve) => {
        exec(nixCommand, (error, stdout, stderr) => {
          const isRunning = !error && stdout.includes('Nginx proxy is running');
          resolve({
            success: true,
            running: isRunning,
            output: stdout || stderr,
            error: error ? error.message : null
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

      // Don't automatically restart nginx - let the user control that
      return { 
        success: true, 
        message: `Configuration saved and nginx config updated. If nginx is running, restart it to apply changes.`,
        needsRestart: true
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
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
