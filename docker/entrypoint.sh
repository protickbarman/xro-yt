#!/usr/bin/env bash
# Starts Cloudflare WARP (via usque) as a local SOCKS5 proxy, then the Node server.
# The server reaches YouTube through WARP because a datacenter IP is blocked by
# googlevideo; a WARP egress IP is not.
set -euo pipefail

CONFIG="${WARP_CONFIG:-/data/warp.json}"
SOCKS_ADDR="${WARP_SOCKS_BIND:-127.0.0.1}"
SOCKS_PORT="${WARP_SOCKS_PORT:-40000}"
SOCKS_READY_TIMEOUT="${WARP_READY_TIMEOUT:-60}"

log() { printf '%s [entrypoint] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }

mkdir -p "$(dirname "$CONFIG")"

if [[ ! -s "$CONFIG" ]]; then
  log "no WARP config at $CONFIG — registering a new device"
  usque --config "$CONFIG" register --accept-tos --name "$(hostname)" \
    || { log "usque register failed"; exit 1; }
else
  log "reusing existing WARP config at $CONFIG"
fi

log "starting usque SOCKS5 proxy on ${SOCKS_ADDR}:${SOCKS_PORT}"
usque --config "$CONFIG" socks --bind "$SOCKS_ADDR" --port "$SOCKS_PORT" \
  --always-reconnect &
USQUE_PID=$!

# usque owns the tunnel; if it dies the server is useless, so exit and let the
# container restart rather than serving 0-byte downloads.
trap 'log "shutting down"; kill "$USQUE_PID" 2>/dev/null || true; exit 0' TERM INT

# The SOCKS port only accepts connections once the MASQUE handshake completes.
for ((i = 0; i < SOCKS_READY_TIMEOUT; i++)); do
  if (exec 3<>"/dev/tcp/${SOCKS_ADDR}/${SOCKS_PORT}") 2>/dev/null; then
    exec 3>&- 3<&-
    log "WARP SOCKS proxy is up after ${i}s"
    break
  fi
  if ! kill -0 "$USQUE_PID" 2>/dev/null; then
    log "usque exited before the proxy came up"; exit 1
  fi
  sleep 1
  if (( i == SOCKS_READY_TIMEOUT - 1 )); then
    log "timed out waiting for WARP SOCKS proxy"; exit 1
  fi
done

log "starting Node server on ${HOST:-0.0.0.0}:${PORT:-8787} via ${PROXY:-direct}"
exec node dist/index.js
