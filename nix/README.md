# Nix Development Environment Structure

This directory contains the modular nix configuration for the OAuth development proxy server.

## Directory Structure

```
nix/
├── README.md              # This file
├── config/
│   └── nginx.conf         # Nginx reverse proxy configuration
├── scripts/
│   ├── setup-hosts.sh     # Script to setup /etc/hosts entries
│   ├── cleanup-hosts.sh   # Script to cleanup /etc/hosts entries
│   ├── start-proxy.sh     # Script to start nginx proxy
│   └── dev-proxy.sh       # Main development environment script
└── modules/
    ├── nginx.nix          # Nginx configuration module
    └── scripts.nix        # Shell scripts module
```

## How It Works

### Configuration Files
- **`config/nginx.conf`**: Contains the nginx reverse proxy configuration template
  - Uses `@nginx@` placeholder that gets replaced with the nix nginx path
  - Defines proxy rules for three services: client (port 9000), server (port 9001), api (port 9002)

### Shell Scripts
All shell scripts are stored as separate `.sh` files for easy editing and version control:

- **`setup-hosts.sh`**: Manages `/etc/hosts` entries
  - Can check existing entries without modifying (`check_only` mode)
  - Provides copy-paste error message with heredoc syntax
  - Backs up original hosts file before modifications

- **`cleanup-hosts.sh`**: Removes development entries from `/etc/hosts`
  - Restores from backup if available
  - Falls back to sed removal if no backup exists

- **`start-proxy.sh`**: Starts the nginx reverse proxy
  - Checks hosts entries first
  - Uses placeholder `@nginx@` and `@nginxConfig@` for nix substitution

- **`dev-proxy.sh`**: Main command interface
  - Supports multiple commands: start, stop, clean, check, status
  - Handles `--no-hosts` flag for non-modifying host checks
  - Uses placeholders for script dependencies

### Nix Modules

- **`nginx.nix`**: 
  - Reads the nginx.conf template
  - Substitutes `@nginx@` with the actual nix nginx path
  - Returns a `writeText` derivation

- **`scripts.nix`**:
  - Contains a `makeScript` helper function for template substitution
  - Creates all shell script packages with proper dependencies
  - Handles script interdependencies (dev-proxy depends on other scripts)

### Main Flake
The main `flake.nix` is now much simpler:
- Imports the nginx and scripts modules
- Composes them together
- Exposes all packages and the development shell

## Benefits

1. **Separation of Concerns**: Each component has its own file
2. **Easy Editing**: Shell scripts can be edited like normal bash files
3. **Version Control Friendly**: Changes are isolated to specific files
4. **Testability**: Individual scripts can be tested separately
5. **Maintainability**: Much easier to understand and modify
6. **Reusability**: Modules can be reused in other projects

## Usage

The usage remains the same:
```bash
nix develop                    # Enter development shell
dev-proxy start                # Start with hosts modification
dev-proxy start --no-hosts     # Start with hosts check only
dev-proxy check                # Check hosts entries
dev-proxy status               # Check status
dev-proxy stop                 # Stop proxy
dev-proxy clean                # Stop and cleanup
```
