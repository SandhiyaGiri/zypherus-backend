#!/bin/bash

set -euo pipefail

# Load environment variables if they exist
if [ -f .env ]; then
  # shellcheck disable=SC1091
  . .env
fi

# Use system CA bundle for TLS verification
unset NODE_TLS_REJECT_UNAUTHORIZED
unset NODE_EXTRA_CA_CERTS

# Bind dev-server to Render's dynamic PORT; keep LLM internal on 4300
export DEV_SERVER_PORT="${PORT:-4000}"
export LLM_SERVICE_PORT="${LLM_SERVICE_PORT:-4300}"
export LLM_SERVICE_URL="http://127.0.0.1:${LLM_SERVICE_PORT}"

# Build the services first
echo "Building services..."
pnpm run build

# Set up paths for the built services
DEV_SERVER_DIR="./apps/dev-server"
STT_WORKER_DIR="./apps/stt-worker"
LLM_SERVICE_DIR="./apps/llm-service"

trap 'kill 0' INT TERM EXIT

echo "Starting services..."
node "$DEV_SERVER_DIR/dist/index.js" &
node "$STT_WORKER_DIR/dist/index.js" &
node "$LLM_SERVICE_DIR/dist/index.js" &
wait -n
