#!/bin/bash
# ==============================================================================
# MyLeaf Container Entrypoint
# Starts both Next.js and the collaboration server with authentication
# ==============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[MyLeaf]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[MyLeaf]${NC} $1"
}

error() {
    echo -e "${RED}[MyLeaf]${NC} $1"
}

# Trap signals for graceful shutdown
cleanup() {
    log "Received shutdown signal..."
    if [ -n "$COLLAB_PID" ]; then
        log "Stopping collaboration server (PID: $COLLAB_PID)..."
        kill $COLLAB_PID 2>/dev/null || true
        wait $COLLAB_PID 2>/dev/null || true
    fi
    if [ -n "$NEXTJS_PID" ]; then
        log "Stopping Next.js server (PID: $NEXTJS_PID)..."
        kill $NEXTJS_PID 2>/dev/null || true
        wait $NEXTJS_PID 2>/dev/null || true
    fi
    log "Shutdown complete."
    exit 0
}

trap cleanup SIGTERM SIGINT SIGQUIT

log "Starting MyLeaf..."

# Validate required environment variables
if [ -z "$DATABASE_URL" ]; then
    warn "DATABASE_URL not set - running without database persistence"
    warn "Demo mode only - user data will not be saved"
else
    log "Database connection configured"
fi

# Check for tectonic
if command -v tectonic &> /dev/null; then
    TECTONIC_VERSION=$(tectonic --version 2>&1 | head -n1)
    log "LaTeX engine: $TECTONIC_VERSION"
else
    error "Tectonic not found - LaTeX compilation will fail"
fi

# Start collaboration server with authentication
WS_PORT=${WS_PORT:-1234}
log "Starting collaboration server on port $WS_PORT..."
node scripts/collab-server.js &
COLLAB_PID=$!
log "Collaboration server started (PID: $COLLAB_PID)"

# Give the collab server a moment to start
sleep 1

# Verify collab server is running
if ! kill -0 $COLLAB_PID 2>/dev/null; then
    error "Collaboration server failed to start"
    exit 1
fi

# Start Next.js production server
PORT=${PORT:-3002}
log "Starting Next.js on port $PORT..."

# Use standalone server if available, otherwise use npm start
if [ -f "server.js" ]; then
    log "Using standalone server mode"
    node server.js &
    NEXTJS_PID=$!
else
    log "Using npm start"
    npm run start -- -p $PORT &
    NEXTJS_PID=$!
fi

log "Next.js server started (PID: $NEXTJS_PID)"

# Wait for Next.js to be ready
log "Waiting for services to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if wget -q --spider http://localhost:$PORT/api/health 2>/dev/null; then
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 1
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    warn "Health check timed out, but continuing..."
else
    log "Services ready!"
fi

log "======================================"
log "MyLeaf is running!"
log "Web app:      http://localhost:$PORT"
log "Collab WS:    ws://localhost:$WS_PORT"
log "======================================"

# Wait for any process to exit
wait -n $COLLAB_PID $NEXTJS_PID

# If we get here, one of the processes exited
EXIT_CODE=$?
error "A service exited unexpectedly with code $EXIT_CODE"
cleanup
exit $EXIT_CODE
