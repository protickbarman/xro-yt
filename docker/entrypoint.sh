#!/usr/bin/env bash
# Starts Cloudflare WARP (via usque) as a local SOCKS5 proxy, then the Node server.
# The server reaches YouTube through WARP because a datacenter IP is blocked by
# googlevideo; a WARP egress IP is not.
set -euo pipefail

CONFIG="${WARP_CONFIG:-/data/warp.json}"
SOCKS_ADDR="${WARP_SOCKS_BIND:-127.0.0.1}"
SOCKS_PORT="${WARP_SOCKS_PORT:-40000}"
SOCKS_READY_TIMEOUT="${WARP_READY_TIMEOUT:-60}"
# auto | http3 | http2 — auto tries QUIC first, then falls back to TCP+TLS.
TRANSPORT="${WARP_TRANSPORT:-auto}"

log() { printf '%s [entrypoint] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }

mkdir -p "$(dirname "$CONFIG")"

if [[ ! -s "$CONFIG" ]]; then
  log "no WARP config at $CONFIG — registering a new device"
  usque --config "$CONFIG" register --accept-tos --name "$(hostname)" \
    || { log "usque register failed"; exit 1; }
else
  log "reusing existing WARP config at $CONFIG"
fi

USQUE_PID=""
start_usque() {
  local mode="$1"; shift
  log "starting usque SOCKS5 proxy on ${SOCKS_ADDR}:${SOCKS_PORT} (${mode})"
  usque --config "$CONFIG" socks --bind "$SOCKS_ADDR" --port "$SOCKS_PORT" \
    --always-reconnect "$@" &
  USQUE_PID=$!
}

stop_usque() {
  [[ -n "$USQUE_PID" ]] || return 0
  kill "$USQUE_PID" 2>/dev/null || true
  wait "$USQUE_PID" 2>/dev/null || true
  USQUE_PID=""
}

# Waits until a real request succeeds through the SOCKS proxy. The port binds as
# soon as usque starts, before the MASQUE handshake completes, so a bare TCP
# connect is not enough — a dead QUIC tunnel still accepts connections.
wait_for_socks() {
  local deadline="${1:-$SOCKS_READY_TIMEOUT}" i
  for ((i = 0; i < deadline; i++)); do
    if curl -fsS --max-time 6 --socks5-hostname "${SOCKS_ADDR}:${SOCKS_PORT}" \
         "https://api.cloudflare.com/cdn-cgi/trace" >/dev/null 2>&1; then
      log "WARP tunnel is up after ${i}s"
      return 0
    fi
    if ! kill -0 "$USQUE_PID" 2>/dev/null; then
      log "usque exited before the tunnel came up"
      return 1
    fi
    sleep 1
  done
  log "timed out after ${deadline}s waiting for the WARP tunnel"
  return 1
}

trap 'log "shutting down"; stop_usque; exit 0' TERM INT

# QUIC (HTTP/3) is faster but needs UDP egress, which many hosts block. Fall back
# to HTTP/2 over TCP+TLS when QUIC does not come up.
case "$TRANSPORT" in
  http2)
    start_usque "http2" --http2
    wait_for_socks || exit 1
    ;;
  http3)
    start_usque "http3"
    wait_for_socks || exit 1
    ;;
  auto)
    start_usque "http3"
    if ! wait_for_socks 15; then
      log "HTTP/3 (QUIC) unavailable — falling back to HTTP/2 over TCP"
      stop_usque
      start_usque "http2" --http2
      wait_for_socks || exit 1
    fi
    ;;
  *)
    log "invalid WARP_TRANSPORT=$TRANSPORT (use auto|http3|http2)"; exit 1 ;;
esac

log "starting Node server on ${HOST:-0.0.0.0}:${PORT:-8787} via ${PROXY:-direct}"
exec node dist/index.js
