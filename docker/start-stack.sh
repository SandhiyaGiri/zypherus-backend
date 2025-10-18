#!/bin/bash

set -euo pipefail

if [ -f /opt/zypherus/.env ]; then
  # shellcheck disable=SC1091
  . /opt/zypherus/.env
fi

# Use system CA bundle (installed in Dockerfile) for TLS verification
unset NODE_TLS_REJECT_UNAUTHORIZED
unset NODE_EXTRA_CA_CERTS

# Bind dev-server to Railway's dynamic PORT; keep LLM internal on 4300
export DEV_SERVER_PORT="${PORT:-4000}"
export LLM_SERVICE_PORT="${LLM_SERVICE_PORT:-4300}"
export LLM_SERVICE_URL="http://127.0.0.1:${LLM_SERVICE_PORT}"

DEV_SERVER_DIR="/opt/zypherus/services/dev-server"
STT_WORKER_DIR="/opt/zypherus/services/stt-worker"
LLM_SERVICE_DIR="/opt/zypherus/services/llm-service"

trap 'kill 0' INT TERM EXIT

node "$DEV_SERVER_DIR/dist/index.js" &
node "$STT_WORKER_DIR/dist/index.js" &
node "$LLM_SERVICE_DIR/dist/index.js" &
wait -n
