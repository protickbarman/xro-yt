/**
 * Central configuration. Everything is overridable via environment variables so
 * the server can be pointed at a different egress (SOCKS/HTTP proxy) or client.
 */

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? "0.0.0.0",

  /** InnerTube API key recovered from the Vidmate APK. */
  apiKey: process.env.YT_API_KEY ?? "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",

  /** Innertube hosts, tried in order. */
  hosts: (process.env.YT_HOSTS ?? "https://youtubei.googleapis.com").split(","),

  /**
   * Optional proxy for all outbound traffic, e.g.
   *   socks5://127.0.0.1:40000   (Cloudflare WARP via usque)
   *   socks5://127.0.0.1:40001   (WireGuard via wireproxy)
   * Leave empty for direct.
   */
  proxy: process.env.PROXY ?? process.env.HTTPS_PROXY ?? "",

  /** Request timeout for API calls (ms). */
  timeoutMs: Number(process.env.TIMEOUT_MS ?? 30000),

  /** How many times to retry a player call before giving up. */
  retries: Number(process.env.RETRIES ?? 6),

  /**
   * Client used for the player call.
   *
   * VISIONOS is the key finding: unlike IOS / ANDROID_VR / WEB, it serves the
   * *entire* media file from a flagged/datacenter IP (no ~5% preview cap) and
   * needs no PO token.
   */
  client: {
    clientName: process.env.YT_CLIENT_NAME ?? "VISIONOS",
    clientVersion: process.env.YT_CLIENT_VERSION ?? "1.02",
    clientNameHeader: process.env.YT_CLIENT_HEADER ?? "101",
    userAgent:
      process.env.YT_USER_AGENT ??
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
    deviceMake: "Apple",
    deviceModel: "RealityDevice17,1",
    osName: "visionOS",
    osVersion: "1.3.0.22O473",
  },
} as const;

export type Config = typeof config;
