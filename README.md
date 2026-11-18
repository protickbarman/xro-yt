# xro-yt

A Node.js and TypeScript HTTP API for media metadata, search, range streaming,
and optional server-side muxing. It includes a small browser interface and a
Docker-based self-hosting option.

**This project is intended for lawful personal use and software development.
Use it only with content and sources you are authorized to access.** It is not
affiliated with or endorsed by YouTube, Google, Vidmate, or any other upstream
platform or content provider.

## Features

- Keyword search and channel or playlist discovery
- Media metadata and format listing
- Range-compatible streaming and `HEAD` requests
- Optional video and audio muxing
- Browser UI and JSON API responses
- Optional SOCKS5 proxy/WARP egress for self-hosted deployments

## Requirements

- Node.js 20 or newer
- FFmpeg is provided by `ffmpeg-static` for muxing
- A network route to the configured upstream media service

## Quick start

```bash
npm ci
npm run dev
```

The development server listens on `http://localhost:8787`. Open `/` for the
browser UI or `/health` for service status.

For a built, local process:

```bash
npm run build
npm start
```

## Docker

```bash
docker compose up -d --build
```

This repository also includes an image based on Node 22 with an optional
Cloudflare WARP/USQUE SOCKS5 setup. The proxy remains on loopback and is not
published. Keep proxy and media-fetch settings consistent when generating links;
some upstream URLs are bound to the requesting network location.

| Environment variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | HTTP listen port |
| `HOST` | `0.0.0.0` | HTTP listen address |
| `PUBLIC_BASE_URL` | *(request origin)* | Canonical public origin, for example `https://media.example.com` |
| `PROXY` | *(direct)* | SOCKS5 proxy URL |
| `UPSTREAM_API_KEY` | built-in key | Upstream API key |
| `UPSTREAM_HOSTS` | built-in host | Comma-separated upstream hosts |
| `UPSTREAM_CLIENT_NAME` | `VISIONOS` | Upstream client name |
| `UPSTREAM_CLIENT_VERSION` | `1.02` | Upstream client version |
| `TIMEOUT_MS` | `30000` | API request timeout |
| `RETRIES` | `6` | Player request retry count |

Expose only the intended HTTP port. Protect any public deployment with an
appropriate reverse proxy, request limits, logging policy, and network controls.

## API overview

| Route | Purpose |
|---|---|
| `GET /health` | Local health and active configuration summary |
| `GET /api/search?q=...` | Search videos, channels, playlists, or all |
| `GET /api/info?v=...` | Metadata and available formats |
| `GET /api/link?v=...` | One selected direct or proxy link |
| `GET /api/download?v=...&itag=...` | Range-compatible track download |
| `GET /api/merge?v=...&video=...` | Server-side video/audio mux |

Video inputs accept a video ID or common YouTube URL forms. JSON responses use
`ok: true|false`; `400` indicates invalid input, `404` indicates an unavailable
resource, and `502` indicates an upstream failure.

For example:

```bash
curl "http://localhost:8787/api/search?q=example&type=video"
curl "http://localhost:8787/api/info?v=VIDEO_ID"
curl -L "http://localhost:8787/api/download?v=VIDEO_ID&itag=140&dl=1"
```

Short-lived upstream URLs and remote ranges are not guaranteed to remain valid.

## Acceptable use and legal notice

You are responsible for compliance with applicable laws and the terms of the
platforms and services you access. Do not use this software to infringe
copyright, evade access controls or technical restrictions, scrape at scale,
violate a service's terms, collect credentials or personal data, or distribute
unauthorized copies.

The software provides general-purpose URL and media handling infrastructure.
It does not grant a license to third-party media, and it does not bypass or
replace platform entitlements. Operators may need to restrict features or
remove content where required. There is no claim of durability, availability,
commercial suitability, or compliance with a particular jurisdiction.

If you deploy this project publicly, add a clear copyright and takedown policy,
document acceptable use, minimize logs, rate-limit requests, and provide
appropriate moderation and abuse-reporting channels.

## Tests

The default test suite is local and makes no third-party network requests:

```bash
npm test
```

It starts the built server and covers health reporting and local HTTP validation
and routing behavior. External upstream and real media-download checks are not
part of the default suite.

Before a public deployment, separately test the configured upstream service,
proxy, muxing, range handling, and resource limits in an environment you control.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup and submission guidance.
Security reports should follow [SECURITY.md](SECURITY.md). Please do not open a
public issue for a vulnerability.

## License

The source code in this repository is licensed under the
[MIT License](LICENSE). Copyright (c) 2026 Protick Barman.

MIT applies to this project's original code only. Third-party names,
trademarks, media, dependencies, upstream services, and Docker components remain
owned by their respective rights holders and may be subject to separate terms.
