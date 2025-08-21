#!/bin/bash

# Define the required hosts entries
REQUIRED_ENTRIES=(
  "127.0.0.1   client"
  "127.0.0.1   server"
  "127.0.0.1   api"
)

# Check if all required entries exist in /etc/hosts
MISSING_ENTRIES=0
for entry in "${REQUIRED_ENTRIES[@]}"; do
  if ! grep -q "^$entry" /etc/hosts; then
    MISSING_ENTRIES=1
    break
  fi
done

# If check_only flag is provided, only check if entries exist
if [ "$1" = "check_only" ]; then
  if [ $MISSING_ENTRIES -eq 1 ]; then
    echo "❌ Error: Required /etc/hosts entries are missing."
    echo ""
    echo "Run this one-liner to add them:"
    echo ""
    echo "sudo tee -a /etc/hosts <<EOL"
    echo ""
    echo "# Local development servers"
    for entry in "${REQUIRED_ENTRIES[@]}"; do
      echo "$entry"
    done
    echo "EOL"
    exit 1
  else
    echo "✅ All required /etc/hosts entries found."
    exit 0
  fi
fi

# If not check_only, proceed with updating /etc/hosts
echo "Setting up /etc/hosts entries..."

# Backup original hosts file if not already backed up
if [ ! -f /etc/hosts.backup ]; then
  sudo cp /etc/hosts /etc/hosts.backup
  echo "Created backup at /etc/hosts.backup"
fi

# Remove any existing entries
sudo sed -i.tmp '/# Local development servers/,/^$/d' /etc/hosts

# Add our entries
echo "" | sudo tee -a /etc/hosts
echo "# Local development servers" | sudo tee -a /etc/hosts
for entry in "${REQUIRED_ENTRIES[@]}"; do
  echo "$entry" | sudo tee -a /etc/hosts
done

echo "✅ /etc/hosts updated"
