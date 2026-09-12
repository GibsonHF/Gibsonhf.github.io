#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${1:-8787}"

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"

echo "Relay URL for the map (local copy on any port):  http://localhost:$PORT"
if [ -n "$LAN_IP" ]; then
    echo "Relay URL for clients on your network:           http://$LAN_IP:$PORT"
fi
echo

exec node "$SCRIPT_DIR/server.mjs" "$PORT"
