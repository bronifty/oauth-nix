{ pkgs, nginxConfig }:

let
  # Simple nginx proxy script that starts nginx with our config
  nginxProxy = pkgs.writeShellScriptBin "nginx-proxy" (builtins.replaceStrings 
    ["@nginx@" "@nginxConfig@"]
    ["${pkgs.nginx}/bin/nginx" "${nginxConfig}"]
    ''
    #!/usr/bin/env bash
    set -euo pipefail
    
    NGINX_CONFIG="@nginxConfig@"
    NGINX_PID_FILE="/tmp/nginx-oauth-proxy.pid"
    
    case "''${1:-}" in
      start)
        echo "🌐 Starting nginx proxy..."
        if [ -f "$NGINX_PID_FILE" ]; then
          echo "⚠️  Nginx appears to be running (PID file exists: $NGINX_PID_FILE)"
          echo "   Use 'nginx-proxy stop' first or 'nginx-proxy restart'"
          exit 1
        fi
        @nginx@ -c "$NGINX_CONFIG" -p /tmp/
        echo "✅ Nginx proxy started"
        echo "   Config: $NGINX_CONFIG"
        echo "   PID file: $NGINX_PID_FILE"
        echo "   Logs: /dev/stdout (access), /dev/stderr (error)"
        echo ""
        echo "📋 Proxy mappings:"
        echo "   http://client → http://localhost:9000"
        echo "   http://server → http://localhost:9001"
        echo "   http://api → http://localhost:9002"
        ;;
      stop)
        echo "🛑 Stopping nginx proxy..."
        if [ -f "$NGINX_PID_FILE" ]; then
          @nginx@ -s quit -c "$NGINX_CONFIG" -p /tmp/ || true
          rm -f "$NGINX_PID_FILE" || true
          echo "✅ Nginx proxy stopped"
        else
          echo "⚠️  No PID file found ($NGINX_PID_FILE), nginx may not be running"
        fi
        ;;
      restart)
        echo "🔄 Restarting nginx proxy..."
        $0 stop
        sleep 1
        $0 start
        ;;
      status)
        if [ -f "$NGINX_PID_FILE" ]; then
          PID=$(cat "$NGINX_PID_FILE")
          if kill -0 "$PID" 2>/dev/null; then
            echo "✅ Nginx proxy is running (PID: $PID)"
            echo "   Config: $NGINX_CONFIG"
          else
            echo "❌ PID file exists but process is not running"
            rm -f "$NGINX_PID_FILE"
          fi
        else
          echo "❌ Nginx proxy is not running"
        fi
        ;;
      *)
        echo "Usage: nginx-proxy {start|stop|restart|status}"
        echo ""
        echo "Commands:"
        echo "  start   - Start the nginx proxy"
        echo "  stop    - Stop the nginx proxy"
        echo "  restart - Restart the nginx proxy"
        echo "  status  - Check nginx proxy status"
        echo ""
        echo "Proxy mappings:"
        echo "  http://client → http://localhost:9000"
        echo "  http://server → http://localhost:9001"
        echo "  http://api → http://localhost:9002"
        exit 1
        ;;
    esac
  '');

in

{
  inherit nginxProxy;
}
