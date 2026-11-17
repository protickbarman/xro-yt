# syntax=docker/dockerfile:1

# ---------- stage 1: build TypeScript ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- stage 2: runtime (Node server + WARP via usque) ----------
FROM node:22-bookworm-slim AS runtime

# ca-certificates: TLS to googlevideo. curl: usque download + healthcheck.
# tini: reap the usque child so the container stops cleanly.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl tini unzip \
 && rm -rf /var/lib/apt/lists/*

# usque exposes Cloudflare WARP as a local SOCKS5 proxy (MASQUE/QUIC).
ARG USQUE_VERSION=4.2.1
RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
      amd64) usque_arch=amd64; usque_sha=4117e20695078af9c11edecd1a826c009bbc7ea0b7f64458612b4198910bc313 ;; \
      arm64) usque_arch=arm64; usque_sha=c88b061c2a567f30813d7505637d1fb6fe7ec5898b5b61fd05122409fa5ad925 ;; \
      *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
    esac; \
    base="https://github.com/Diniboy1123/usque/releases/download/v${USQUE_VERSION}"; \
    zip="usque_${USQUE_VERSION}_linux_${usque_arch}.zip"; \
    curl -fsSL -o /tmp/usque.zip "${base}/${zip}"; \
    echo "${usque_sha}  /tmp/usque.zip" | sha256sum -c -; \
    unzip -j -o /tmp/usque.zip usque -d /usr/local/bin; \
    chmod +x /usr/local/bin/usque; \
    rm -f /tmp/usque.zip; \
    /usr/local/bin/usque version

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    PROXY=socks5://127.0.0.1:40000 \
    WARP_CONFIG=/data/warp.json

# Only the app port is published; the SOCKS proxy stays on loopback.
EXPOSE 8787
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
