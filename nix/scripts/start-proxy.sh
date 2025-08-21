#!/bin/bash

# First check if hosts entries exist
@setupHosts@/bin/setup-hosts check_only

echo "🚀 Starting development proxy server..."
echo "Access your servers at:"
echo "  http://client  -> localhost:9000"
echo "  http://server  -> localhost:9001" 
echo "  http://api     -> localhost:9002"
echo ""
echo "Press Ctrl+C to stop"

sudo @nginx@/bin/nginx -c @nginxConfig@
