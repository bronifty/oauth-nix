#!/bin/bash

echo "🧹 Cleaning up OAuth2 Development Environment"
echo ""
echo "This script will remove:"
echo "  1. /etc/hosts entries for local development"
echo "  2. Sudoers rule for passwordless nginx operations"
echo "  3. Unused nix store packages (optional)"
echo ""
echo "You will be prompted for your password once to make these changes."
echo ""

# Remove /etc/hosts entries
echo "📝 Removing /etc/hosts entries..."
sudo sed -i.backup '/# Local development servers/,/127\.0\.0\.1[[:space:]]*api/d' /etc/hosts

echo "✅ /etc/hosts entries removed (backup saved as /etc/hosts.backup)"

# Remove sudoers rule
echo "📝 Removing sudoers rule..."
if [ -f "/etc/sudoers.d/nginx-dev" ]; then
    sudo rm -f /etc/sudoers.d/nginx-dev
    echo "✅ Sudoers rule removed"
else
    echo "✅ Sudoers rule was not present"
fi

# Validate sudoers after cleanup
echo "🔍 Validating sudoers configuration..."
if sudo visudo -c >/dev/null 2>&1; then
    echo "✅ Sudoers configuration is valid"
else
    echo "❌ Warning: Sudoers configuration may have issues"
fi

# Optional: Clean nix store
echo ""
echo "📝 Optional: Clean nix store?"
echo "This will remove unused nix packages (including nginx if not in use)."
read -p "Clean nix store? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🧹 Cleaning nix store..."
    nix-collect-garbage -d
    echo "✅ Nix store cleaned"
else
    echo "✅ Nix store cleanup skipped"
fi

echo ""
echo "🎉 Development environment cleanup complete!"
echo ""
echo "Your system has been restored to its original state."
echo "Note: The /etc/sudoers.d directory remains (as requested)"
