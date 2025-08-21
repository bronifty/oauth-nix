#!/bin/bash

case "${1:-start}" in
  start)
    # If we have the --no-hosts flag, don't update hosts, just check it
    if [ "$2" = "--no-hosts" ]; then
      @setupHosts@/bin/setup-hosts check_only
    else
      @setupHosts@/bin/setup-hosts
    fi
    @startProxy@/bin/start-proxy
    ;;
  stop)
    echo "Stopping nginx..."
    sudo pkill nginx || true
    echo "✅ Nginx stopped"
    ;;
  clean)
    echo "Stopping nginx..."
    sudo pkill nginx || true
    @cleanupHosts@/bin/cleanup-hosts
    echo "✅ Development proxy cleaned up"
    ;;
  check)
    @setupHosts@/bin/setup-hosts check_only
    ;;
  status)
    echo "Checking nginx status..."
    if pgrep nginx > /dev/null; then
      echo "✅ Nginx is running"
      sudo lsof -i :80 || true
    else
      echo "❌ Nginx is not running"
    fi
    echo ""
    echo "Current /etc/hosts entries:"
    grep -A 10 "Local development servers" /etc/hosts 2>/dev/null || echo "No development entries found"
    ;;
  *)
    echo "Usage: dev-proxy [start|stop|clean|check|status]"
    echo ""
    echo "Commands:"
    echo "  start          - Setup hosts and start proxy (default)"
    echo "  start --no-hosts - Start proxy without modifying hosts file (checks only)"
    echo "  stop           - Stop nginx proxy"
    echo "  clean          - Stop proxy and restore /etc/hosts"
    echo "  check          - Check if required /etc/hosts entries exist"
    echo "  status         - Check proxy status"
    ;;
esac
