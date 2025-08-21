#!/bin/bash

echo "🔧 Setting up OAuth2 Development Environment"
echo ""
echo "This script will configure:"
echo "  1. /etc/hosts entries for local development"
echo "  2. Sudoers rule for passwordless nginx operations"
echo ""
echo "First, let's check system prerequisites..."
echo ""

# Check if sudoers.d directory exists and is configured
echo "🔍 Checking sudoers.d support..."
if [ ! -d "/etc/sudoers.d" ]; then
    echo "❌ Error: /etc/sudoers.d directory does not exist"
    echo "This system may not support sudoers.d files"
    exit 1
fi

# Check if main sudoers file includes sudoers.d
if ! sudo grep -qE "^#includedir.*sudoers\.d|^@includedir.*sudoers\.d" /etc/sudoers; then
    echo "❌ Error: /etc/sudoers does not include sudoers.d directory"
    echo "Your system is not configured to read files from /etc/sudoers.d"
    echo "Please contact your system administrator"
    exit 1
fi

echo "✅ sudoers.d support confirmed"

# Check if we can write to /etc/hosts
echo "🔍 Checking /etc/hosts write access..."
if [ ! -w "/etc/hosts" ] && ! sudo -n true 2>/dev/null; then
    echo "✅ /etc/hosts requires sudo (expected)"
else
    echo "✅ /etc/hosts access confirmed"
fi

echo "✅ All prerequisites met!"
echo ""
echo "You will be prompted for your password once to make these changes."
echo ""

# Get the current username
USERNAME=$(whoami)

# Add /etc/hosts entries (idempotent)
echo "📝 Checking /etc/hosts entries..."
if grep -q "# Local development servers" /etc/hosts; then
    echo "✅ /etc/hosts entries already exist, skipping"
else
    echo "Adding /etc/hosts entries..."
    sudo tee -a /etc/hosts <<EOL

# Local development servers
127.0.0.1   client
127.0.0.1   server
127.0.0.1   api
EOL
    echo "✅ /etc/hosts entries added"
fi

# Add sudoers rule for nginx (idempotent)
echo "📝 Checking sudoers rule for passwordless nginx..."
if [ -f "/etc/sudoers.d/nginx-dev" ]; then
    echo "✅ Sudoers rule already exists, skipping"
else
    echo "Adding sudoers rule..."
    sudo tee /etc/sudoers.d/nginx-dev <<EOL
# Allow nginx development without password
$USERNAME ALL=(ALL) NOPASSWD: /nix/store/*/bin/nginx
$USERNAME ALL=(ALL) NOPASSWD: /usr/bin/pkill nginx
$USERNAME ALL=(ALL) NOPASSWD: /usr/bin/pkill -f nginx
EOL

    # Set correct permissions for sudoers file
    sudo chmod 0440 /etc/sudoers.d/nginx-dev
    echo "✅ Sudoers rule added with correct permissions"
fi

# Validate sudoers file syntax
echo "🔍 Validating sudoers configuration..."
if sudo visudo -c >/dev/null 2>&1; then
    echo "✅ Sudoers configuration is valid"
else
    echo "❌ Error: Sudoers configuration has syntax errors"
    echo "Removing invalid sudoers file..."
    sudo rm -f /etc/sudoers.d/nginx-dev
    exit 1
fi

echo ""
echo "🎉 Development environment setup complete!"
echo ""
echo "You can now run:"
echo "  make start    - Start all services (no password required)"
echo "  make status   - Check service status"
echo "  make stop     - Stop all services (no password required)"
echo ""
echo "Access your OAuth services at:"
echo "  http://client  -> OAuth Client"
echo "  http://server  -> Authorization Server"
echo "  http://api     -> Protected Resource"
