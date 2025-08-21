#!/bin/bash

echo "Removing /etc/hosts entries..."
if [ -f /etc/hosts.backup ]; then
  sudo cp /etc/hosts.backup /etc/hosts
  echo "✅ Restored original /etc/hosts"
else
  sudo sed -i.tmp '/# Local development servers/,/^$/d' /etc/hosts
  echo "✅ Removed development entries from /etc/hosts"
fi
