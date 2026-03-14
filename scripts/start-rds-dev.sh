#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/backend/.env}"
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
  read_env_value() {
    local key="$1"

    if [[ ! -f "$ENV_FILE" ]]; then
      return 1
    fi

    local line
    line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"

    if [[ -z "$line" ]]; then
      return 1
    fi

    local value="${line#*=}"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"

    printf '%s\n' "$value"
  }

  read_database_url_part() {
    local key="$1"

    node -e 'const [key, rawUrl] = process.argv.slice(1); const url = new URL(rawUrl); if (key === "host") { process.stdout.write(url.hostname); process.exit(0); } if (key === "port") { process.stdout.write(url.port || "5432"); process.exit(0); } process.exit(1);' "$key" "$DATABASE_URL"
  }

  read_region_from_rds_host() {
    node -e 'const host = process.argv[1]; const match = host.match(/\.([a-z0-9-]+)\.rds\.amazonaws\.com$/); if (!match) { process.exit(1); } process.stdout.write(match[1]);' "$RDS_HOST"
  }


require_command aws
require_command session-manager-plugin
  require_command node

  DATABASE_URL="${DATABASE_URL:-$(read_env_value DATABASE_URL || true)}"
  RDS_BASTION_INSTANCE_ID="${RDS_BASTION_INSTANCE_ID:-$(read_env_value RDS_BASTION_INSTANCE_ID || true)}"
  RDS_HOST="${RDS_HOST:-$(read_env_value RDS_HOST || true)}"
  RDS_PORT="${RDS_PORT:-$(read_env_value RDS_PORT || true)}"
  LOCAL_DB_PORT="${LOCAL_DB_PORT:-$(read_env_value DB_PORT || true)}"
  AWS_REGION="${AWS_REGION:-$(read_env_value AWS_REGION || true)}"

  if [[ -z "$DATABASE_URL" && -z "$RDS_HOST" ]]; then
    echo "Set DATABASE_URL or RDS_HOST in $ENV_FILE, or export them before running npm run dev:rds." >&2
    exit 1
  fi

  if [[ -z "$RDS_BASTION_INSTANCE_ID" ]]; then
    echo "Set RDS_BASTION_INSTANCE_ID in $ENV_FILE, or export it before running npm run dev:rds." >&2
    exit 1
  fi

  if [[ -z "$RDS_HOST" ]]; then
    RDS_HOST="$(read_database_url_part host)"
  fi

  if [[ -z "$RDS_PORT" ]]; then
    RDS_PORT="$(read_database_url_part port)"
  fi

  if [[ -z "$LOCAL_DB_PORT" ]]; then
    LOCAL_DB_PORT="5432"
  fi

  if [[ -z "$AWS_REGION" ]]; then
    AWS_REGION="$(read_region_from_rds_host || true)"
  fi

  if [[ -z "$AWS_REGION" ]]; then
    echo "Set AWS_REGION in $ENV_FILE or export it before running npm run dev:rds." >&2
    exit 1
  fi

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