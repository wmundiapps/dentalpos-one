#!/usr/bin/env bash
# Sobe o backend em modo dev, espera o /health responder, roda o smoke test
# do EduMaster Pro (scripts/edu-smoke-test.ts) e derruba o servidor ao final
# — mesmo se o teste falhar. Uso: npm run test:smoke
set -u
cd "$(dirname "$0")/.."

LOG_FILE="$(mktemp)"
npx tsx watch src/server.ts > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null
  wait "$SERVER_PID" 2>/dev/null
  rm -f "$LOG_FILE"
}
trap cleanup EXIT

API_URL="${SMOKE_API_URL:-http://localhost:3000/api}"
HEALTH_URL="${API_URL%/api}/health"

for i in $(seq 1 30); do
  if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Backend não respondeu em $HEALTH_URL a tempo. Log do servidor:"
    cat "$LOG_FILE"
    exit 1
  fi
  sleep 1
done

npx tsx scripts/edu-smoke-test.ts
EXIT_CODE=$?

exit $EXIT_CODE
