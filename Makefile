.PHONY: help setup clean background-start foreground-start start status stop

# Default target
help:
	@echo "🔧 OAuth2 Development Environment"
	@echo ""
	@echo "Available targets:"
	@echo "  help             - Show this help message"
	@echo "  setup            - Setup environment (idempotent, safe to re-run)"
	@echo "  clean            - Remove everything including nix store (non-interactive)"
	@echo "  background-start - Start nginx proxy in background"
	@echo "  foreground-start - Start OAuth servers in foreground"
	@echo "  start            - Start background services then foreground services"
	@echo "  status           - Check status of services"
	@echo "  stop             - Stop all services"
	@echo ""
	@echo "🚀 First time: make setup, then: make start"

# One-time setup for development environment
setup:
	@echo "🔧 Running development environment setup..."
	./setup-dev-environment.sh

# Complete cleanup including nix store (non-interactive)
clean:
	@echo "🧹 Running complete cleanup (including nix store)..."
	@echo "Stopping any running services..."
	@make stop 2>/dev/null || true
	@echo "Removing sudoers rule..."
	@sudo rm -f /etc/sudoers.d/nginx-dev || true
	@echo "Removing /etc/hosts entries..."
	@sudo sed -i.backup '/# Local development servers/,/127\\.0\\.0\\.1[[:space:]]*api/d' /etc/hosts || true
	@echo "Cleaning nix store..."
	@nix-collect-garbage -d
	@echo "✅ Complete cleanup finished!"

# Start background services (nginx proxy)
background-start:
	@echo "🌐 Starting background services (nginx proxy)..."
	nix run . -- start &
	@echo "✅ Background services started"

# Start foreground services (OAuth servers)
foreground-start:
	@echo "🚀 Starting foreground services (OAuth servers)..."
	./run-oauth-servers.sh

# Check status of services
status:
	@echo "📊 Checking service status..."
	@echo ""
	@echo "=== Nginx Proxy Status ==="
	nix run . -- status
	@echo ""
	@echo "=== OAuth Servers Status ==="
	@pgrep -f "server.js\|client.js\|api.js" > /dev/null && echo "✅ OAuth servers running" || echo "❌ OAuth servers not running"
	@echo ""
	@echo "=== Port Usage ==="
	@echo "Active ports:"
	@lsof -i :9000,9001,9002,80 2>/dev/null | grep LISTEN || echo "No development servers detected on expected ports"

# Start background services first, then foreground services
start:
	@echo "🚀 Starting OAuth development environment..."
	@echo ""
	@echo "This will start:"
	@echo "  1. Background: Nginx proxy (port 80)"
	@echo "  2. Foreground: OAuth servers (ports 9000, 9001, 9002)"
	@echo ""
	make background-start && sleep 3 && make foreground-start

# Stop all services
stop:
	@echo "🛑 Stopping all services..."
	@echo "Stopping OAuth servers..."
	@pkill -f "server.js\|client.js\|api.js" 2>/dev/null || true
	@echo "Stopping nginx proxy..."
	nix run . -- stop
	@echo "✅ All services stopped"
