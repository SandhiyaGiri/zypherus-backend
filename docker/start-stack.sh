#!/bin/bash

set -euo pipefail

if [ -f /opt/zypherus/.env ]; then
  # shellcheck disable=SC1091
  . /opt/zypherus/.env
fi

# Fix SSL certificate issues in Railway environment
export NODE_EXTRA_CA_CERTS=""
export NODE_TLS_REJECT_UNAUTHORIZED="0"

DEV_SERVER_DIR="/opt/zypherus/services/dev-server"
STT_WORKER_DIR="/opt/zypherus/services/stt-worker"
LLM_SERVICE_DIR="/opt/zypherus/services/llm-service"

trap 'kill 0' INT TERM EXIT

node "$DEV_SERVER_DIR/dist/index.js" &
node "$STT_WORKER_DIR/dist/index.js" &
node "$LLM_SERVICE_DIR/dist/index.js" &
wait -n
