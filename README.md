# vidmate-yt-api

Node.js + TypeScript server that returns a **working YouTube download link** using
Vidmate's own mechanism: YouTube's InnerTube `/player` API driven with the
**VISIONOS** client, which (unlike IOS / ANDROID_VR / WEB) serves the *entire*
media file from a flagged/datacenter IP and needs no PO token.

The server also **proxies the media bytes** so the link works straight from a
browser/curl (no CORS or hotlink problems) and supports `Range` seeking.

## Requirements

- Node.js >= 20 (tested on 24)
- Optional: a SOCKS5 proxy for the egress that mints the URLs, e.g. Cloudflare
  WARP (`socks5://127.0.0.1:40000`) or WireGuard via wireproxy.

> Important: the media URL is bound to the IP that requested it. If you mint the
> URL through a proxy, the media fetch must use the **same** proxy. Keep `PROXY`
> set consistently.

## Install & run

```bash
cd server
npm install
npm run dev          # tsx watch, http://localhost:8787
# or production:
npm run build && npm start
```

With a proxy:

```bash
PROXY=socks5://127.0.0.1:40000 npm run dev
```

## Configuration (env)

| Var | Default | Meaning |
|-----|---------|---------|
| `PORT` | `8787` | Listen port |
| `HOST` | `0.0.0.0` | Listen address |
| `PROXY` | *(empty = direct)* | SOCKS5 proxy, e.g. `socks5://127.0.0.1:40000` |
| `YT_API_KEY` | Vidmate key | InnerTube API key |
| `YT_HOSTS` | `https://youtubei.googleapis.com` | Comma-separated hosts |
| `YT_CLIENT_NAME` | `VISIONOS` | InnerTube client name |
| `YT_CLIENT_VERSION` | `1.02` | InnerTube client version |
| `YT_CLIENT_HEADER` | `101` | `X-Youtube-Client-Name` header value |
| `TIMEOUT_MS` | `30000` | Per-request timeout for API calls |
| `RETRIES` | `6` | Player-call retry count |

## API

### Browser UI — `GET /` (or `GET /?v=<id|url>`)

Open the root URL in a browser to get a page where you paste a link, pick
**Video / Audio / Video+Audio / All**, and see every format with two links:

- **Direct URL** — the raw googlevideo link (with a Copy button).
- **Download** — proxied through this server (always works, Range/seek OK).
- **+audio** (video rows) — one-shot mux of that track with the best matching
  audio, via `/api/merge`.

`?v=` auto-loads a video. Any `/api/*` endpoint opened in a browser without its
required params also shows this page instead of an error.

### `GET /health`

```json
{ "ok": true, "uptimeSeconds": 7, "client": "VISIONOS", "proxy": "direct" }
```

### `GET /api/info?v=<id|url>[&format=video|audio|muxed][&maxHeight=1080]`

Returns metadata plus every available format, each with a `directUrl`
(googlevideo, short-lived), a `proxyUrl` (through this server), and — for video
tracks — a `mergeUrl` (that track muxed with the best matching audio).

```bash
curl "http://localhost:8787/api/info?v=64f_JnZuJPo"
curl "http://localhost:8787/api/info?v=https://youtu.be/64f_JnZuJPo&format=audio"
```

```json
{
  "itag": 251, "kind": "audio", "container": "webm", "codec": "opus",
  "directUrl": "https://rr1---sn-....googlevideo.com/videoplayback?...",
  "proxyUrl": "http://localhost:8787/api/download?v=KXPwKTI1zQQ&itag=251"
}
```

### `GET /api/merge?v=<id|url>&video=<itag>[&audio=<itag>][&dl=1]`

Downloads the video track and the best matching audio track server-side and
muxes them into one file (MP4 for H.264+AAC, WebM for VP9+Opus). The audio
container is matched to the video's so players do not choke on Opus-in-MP4.

```bash
curl -L -o out.mp4 "http://localhost:8787/api/merge?v=KXPwKTI1zQQ&video=137&dl=1"
```

### `GET /api/link?v=<id|url>[&itag=][&quality=best|1080|720|360|worst][&format=video|audio|any]`

Returns a single best-matching download link (plus the paired audio track when
the chosen video is not muxed).

```bash
curl "http://localhost:8787/api/link?v=64f_JnZuJPo&quality=720"
```

```json
{
  "ok": true,
  "downloadUrl": "http://localhost:8787/api/download?v=64f_JnZuJPo&itag=298",
  "audioUrl": "http://localhost:8787/api/download?v=64f_JnZuJPo&itag=140",
  "selected": { "video": { "itag": 298, "quality": "720p60" }, "audio": { "itag": 140 } }
}
```

### `GET /api/download?v=<id|url>&itag=<itag>[&dl=1]`

Streams the media. Supports `Range` (seeking), `HEAD`, and `?dl=1` to force an
attachment filename. Internally pages googlevideo in 4 MiB chunks, because a
single long-lived request stalls after ~8-12 MiB.

```bash
# full file
curl -L -o out.mp4 "http://localhost:8787/api/download?v=64f_JnZuJPo&itag=134&dl=1"

# seek (bytes 40,000,000 onward)
curl -H "Range: bytes=40000000-" -o tail.bin \
  "http://localhost:8787/api/download?v=64f_JnZuJPo&itag=134"
```

## How it works

1. `POST /youtubei/v1/visitor_id` → `visitorData`.
2. `POST /youtubei/v1/player` with the **VISIONOS** client + `visitorData`.
   Most clients return only a ~5% "preview" of each media URL on flagged IPs;
   VISIONOS returns the whole file.
3. For each `adaptiveFormats[]` entry, expose the signed `url`.
4. `GET /api/download` pages that URL in 4 MiB `Range` requests, following
   googlevideo's 302 load-balancer redirects, and writes the bytes to the client.

## Verified

| Item | Result |
|------|--------|
| `/api/download` itag 140 (audio) | 16,422,403 B, exact |
| `/api/download` itag 134 (360p) | 45,653,379 B, exact |
| Range seek / HEAD | `206` + `Content-Range`, correct lengths |
| Throughput (WARP SOCKS) | ~2.9–5.6 MB/s |

See `../DOWNLOAD-ANALYSIS.md` for the reverse-engineering write-up.

## Notes & limits

- Media URLs expire (`expiresInSeconds` in `/api/info`); `/api/download`
  re-mints on each request, so links handed out by `/api/link` are short-lived.
- The 4 MiB chunk size is deliberate; larger single ranges stall.
- This is for personal/research use. Respect YouTube's Terms of Service and
  copyright.
