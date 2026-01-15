#!/bin/bash
# ==============================================================================
# MyLeaf Container Entrypoint
# Starts both Next.js and y-websocket collaboration server
# ==============================================================================

set -e

echo "🍃 Starting MyLeaf..."

# Start y-websocket server in background (collaboration)
if [ -n "$ENABLE_COLLABORATION" ] && [ "$ENABLE_COLLABORATION" = "true" ]; then
    echo "📡 Starting collaboration server on port 1234..."
    npx y-websocket --port 1234 &
    COLLAB_PID=$!
fi

# Start Next.js production server on port 3002
echo "🚀 Starting Next.js on port 3002..."
exec npm run start -- -p 3002
