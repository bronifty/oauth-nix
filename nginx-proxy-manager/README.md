# Nginx Proxy Manager

A beautiful, user-friendly GUI application for managing nginx development proxies with automatic hosts file management.

![Nginx Proxy Manager](https://img.shields.io/badge/platform-macOS-blue) ![Electron](https://img.shields.io/badge/built%20with-Electron-brightgreen) ![Nix](https://img.shields.io/badge/powered%20by-Nix-purple)

## Features

### 🖥️ **Modern GUI Interface**
- Beautiful, intuitive user interface with multiple tabs
- Real-time status monitoring with visual indicators
- Dynamic configuration management

### ⚙️ **Configuration Management**
- **Dynamic Mapping Editor**: Add unlimited port-to-domain mappings
- **Visual Form Builder**: Easy-to-use interface for adding/removing mappings
- **Configuration Validation**: Prevents duplicate domains and validates input
- **Persistent Storage**: Automatically saves and loads your configurations

### 🌐 **Hosts File Integration**
- **Automatic /etc/hosts Management**: Safely add/remove domain entries
- **Privileged Operations**: Handles sudo permissions securely
- **Backup & Restore**: Creates backups before making changes
- **Smart Detection**: Avoids duplicate entries

### 🔧 **Nginx Proxy Control**
- **One-Click Start/Stop**: Simple proxy management
- **Nix Integration**: Uses your existing Nix nginx setup
- **Real-time Status**: Live monitoring of proxy status
- **Error Handling**: Clear error messages and recovery options

### 🔒 **Security Features**
- **Isolated Processes**: Secure IPC communication between main and renderer
- **Privilege Escalation**: Only requests sudo when necessary
- **Safe Operations**: Validates all operations before execution

## Screenshots

### Dashboard - Monitor & Control
- Real-time status display with visual indicators
- One-click start/stop controls
- Current mappings overview

### Configuration - Setup Your Mappings  
- Dynamic form for unlimited mappings
- Real-time validation
- Export/import configurations

### Hosts Management - System Integration
- Safe /etc/hosts file management
- Administrator privilege handling
- Backup and restore functionality

## Installation & Usage

### Prerequisites
- macOS 10.14 or later
- [Nix package manager](https://nixos.org/download.html) installed
- Administrator access (for hosts file modifications)

### Quick Start

1. **Download the App**
   ```bash
   # Download the DMG from releases or build from source
   open "Nginx Proxy Manager-1.0.0.dmg"
   ```

2. **Install & Launch**
   - Drag to Applications folder
   - Launch "Nginx Proxy Manager"
   - Grant necessary permissions when prompted

3. **Configure Mappings**
   - Go to "Configuration" tab
   - Add your port-to-domain mappings (e.g., `client` → `9000`)
   - Click "Save Configuration"

4. **Setup Hosts**
   - Go to "Hosts Management" tab
   - Click "Add Hosts Entries" (requires sudo password)

5. **Start Proxy**
   - Return to "Dashboard"
   - Click "Start Proxy"
   - Your proxy is now running!

### Example Configuration
```
client  → http://localhost:9000
server  → http://localhost:9001  
api     → http://localhost:9002
```

After setup, access your services at:
- `http://client` instead of `http://localhost:9000`
- `http://server` instead of `http://localhost:9001`
- `http://api` instead of `http://localhost:9002`

## Building from Source

### Development Setup
```bash
# Clone the repository
cd nginx-proxy-manager

# Install dependencies
npm install

# Run in development mode
npm run dev
```

### Building for Distribution
```bash
# Build for macOS
npm run build-mac

# Output will be in dist/ directory:
# - Nginx Proxy Manager-1.0.0.dmg (installer)
# - Nginx Proxy Manager-1.0.0-mac.zip (portable)
```

## Architecture

### Technology Stack
- **Electron**: Cross-platform desktop app framework
- **Node.js**: Backend runtime and process management
- **Nix**: Package management and nginx configuration
- **HTML/CSS/JS**: Modern web technologies for the UI

### Security Model
- **Context Isolation**: Renderer process is isolated from main process
- **IPC Communication**: Secure inter-process communication
- **Privilege Escalation**: Only requests sudo for specific operations
- **Input Validation**: All user inputs are validated before processing

### File Structure
```
nginx-proxy-manager/
├── src/
│   ├── main.js          # Main Electron process
│   ├── preload.js       # Secure IPC bridge
│   ├── index.html       # Main UI
│   └── renderer.js      # UI logic and interactions
├── build/
│   └── entitlements.mac.plist  # macOS permissions
├── dist/                # Built applications
└── data/               # User configurations (created at runtime)
```

## Integration with Nix OAuth Project

This app is designed to work seamlessly with the nginx proxy setup in your OAuth development environment:

- **Automatic Detection**: Finds your Nix oauth project automatically
- **Configuration Sync**: Uses the same nginx configuration format
- **Command Integration**: Leverages your existing `nix run . -- start/stop/status` commands
- **No Conflicts**: Safely coexists with your command-line workflow

## Troubleshooting

### Common Issues

**"Permission Denied" Errors**
- Ensure the app has permission to execute sudo commands
- Try running the app with administrator privileges

**"Port 80 in use" Errors**  
- Stop any existing web servers on port 80
- Check if nginx is already running: `sudo lsof -i :80`

**"Nix not found" Errors**
- Ensure Nix is installed and in your PATH
- Try running `which nix` in Terminal

**Domains not resolving**
- Verify hosts entries were added: `cat /etc/hosts`
- Check that entries include your domain names
- Clear DNS cache: `sudo dscacheutil -flushcache`

### Support
For issues, feature requests, or contributions, please refer to the main OAuth project repository.

## License
MIT License - see LICENSE file for details.

---

**Made with ❤️ for developers who love clean, simple tools.**
