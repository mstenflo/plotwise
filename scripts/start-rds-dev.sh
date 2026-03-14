#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AWS_REGION="${AWS_REGION:-us-east-2}"
RDS_BASTION_INSTANCE_ID="${RDS_BASTION_INSTANCE_ID:-i-0431b05da5c97b8cc}"
RDS_HOST="${RDS_HOST:-plotwise-sql.crauuk6ck45m.us-east-2.rds.amazonaws.com}"
RDS_PORT="${RDS_PORT:-5432}"
LOCAL_DB_PORT="${LOCAL_DB_PORT:-5432}"
TUNNEL_LOG_FILE="${TUNNEL_LOG_FILE:-/tmp/plotwise-ssm-tunnel.log}"

cleanup() {
  if [[ -n "${TUNNEL_PID:-}" ]] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

require_command aws
require_command session-manager-plugin
require_command nc

if lsof -iTCP:"$LOCAL_DB_PORT" -sTCP:LISTEN -Pn >/dev/null 2>&1; then
  echo "Local port $LOCAL_DB_PORT is already in use. Stop the existing process or change LOCAL_DB_PORT." >&2
  exit 1
fi

echo "Starting SSM tunnel on 127.0.0.1:$LOCAL_DB_PORT -> $RDS_HOST:$RDS_PORT"

aws ssm start-session \
  --region "$AWS_REGION" \
  --target "$RDS_BASTION_INSTANCE_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=$RDS_HOST,portNumber=$RDS_PORT,localPortNumber=$LOCAL_DB_PORT" \
  >"$TUNNEL_LOG_FILE" 2>&1 &

TUNNEL_PID=$!

for _ in $(seq 1 30); do
  if nc -z 127.0.0.1 "$LOCAL_DB_PORT" >/dev/null 2>&1; then
    echo "SSM tunnel is ready"
    cd "$ROOT_DIR"
    npm run dev
    exit $?
  fi

  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "SSM tunnel exited before becoming ready. See $TUNNEL_LOG_FILE" >&2
    exit 1
  fi

  sleep 1
done

echo "Timed out waiting for the SSM tunnel on 127.0.0.1:$LOCAL_DB_PORT. See $TUNNEL_LOG_FILE" >&2
exit 1