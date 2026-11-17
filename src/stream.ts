import type { Response } from "express";
import { config } from "./config.js";
import { request } from "./http.js";

/**
 * Google Video Streaming will serve a media URL reliably only in modest ranges
 * (a single long-lived request stalls after ~8-12 MiB), but it will happily
 * serve any number of small sequential ranges on the same URL. So we page the
 * file ourselves in 4 MiB chunks and concatenate them onto the response, while
 * still honouring the client's own Range header so seeking works.
 */

const CHUNK = 4 << 20; // 4 MiB
const MAX_TRIES = 8;

interface ClientRange {
  start: number;
  end: number;
  partial: boolean;
}

function parseRange(header: string | undefined, total: number): ClientRange {
  if (!header) return { start: 0, end: total - 1, partial: false };
  const m = /bytes=(\d*)-(\d*)/.exec(header);
  if (!m) return { start: 0, end: total - 1, partial: false };
  const [, s, e] = m;
  let start = s ? Number(s) : 0;
  let end = e ? Number(e) : total - 1;
  if (Number.isNaN(start)) start = 0;
  if (Number.isNaN(end) || end >= total) end = total - 1;
  return { start, end, partial: true };
}

async function fetchChunk(
  url: string,
  start: number,
  end: number,
): Promise<Buffer | undefined> {
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const res = await request(url, {
        headers: { "User-Agent": config.client.userAgent, Range: `bytes=${start}-${end}` },
        proxy: config.proxy,
        timeoutMs: 0,
        maxRedirects: 5,
      });
      if ((res.status === 200 || res.status === 206) && res.body.length > 0) {
        return res.body;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  return undefined;
}

export async function streamMedia(
  mediaUrl: string,
  rangeHeader: string | undefined,
  total: number,
  res: Response,
  contentType = "video/mp4",
  headOnly = false,
): Promise<void> {
  const { start, end, partial } = parseRange(rangeHeader, total);
  const length = end - start + 1;

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "no-store");
  if (partial) {
    res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
    res.setHeader("Content-Length", String(length));
    res.status(206);
  } else {
    res.setHeader("Content-Length", String(total));
    res.status(200);
  }

  if (headOnly) {
    res.end();
    return;
  }

  let pos = start;
  while (pos <= end) {
    if (res.writableEnded || res.destroyed) return;
    const chunkEnd = Math.min(pos + CHUNK - 1, end);
    const buf = await fetchChunk(mediaUrl, pos, chunkEnd);
    if (!buf) {
      if (!res.writableEnded) res.end();
      return;
    }
    if (!res.write(buf)) {
      await new Promise<void>((resolve) => res.once("drain", () => resolve()));
    }
    pos = chunkEnd + 1;
  }
  res.end();
}
