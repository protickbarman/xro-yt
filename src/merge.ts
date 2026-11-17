import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import type { Response } from "express";
import { config } from "./config.js";
import { request } from "./http.js";
import type { FormatInfo } from "./innertube.js";

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");

const CHUNK = 4 << 20;
const MAX_TRIES = 8;

/** Read the whole (small) media track into memory, paging in 4 MiB ranges. */
async function fetchWhole(url: string, total: number): Promise<Buffer> {
  const parts: Buffer[] = [];
  for (let pos = 0; pos < total; pos += CHUNK) {
    const end = Math.min(pos + CHUNK - 1, total - 1);
    let buf: Buffer | undefined;
    for (let attempt = 1; attempt <= MAX_TRIES && !buf; attempt++) {
      try {
        const r = await request(url, {
          headers: { "User-Agent": config.client.userAgent, Range: `bytes=${pos}-${end}` },
          proxy: config.proxy,
          timeoutMs: 0,
          maxRedirects: 5,
        });
        if ((r.status === 200 || r.status === 206) && r.body.length > 0) buf = r.body;
      } catch {
        /* retry */
      }
      if (!buf) await new Promise((r) => setTimeout(r, 400 * attempt));
    }
    if (!buf) throw new Error(`failed to fetch bytes ${pos}-${end}`);
    parts.push(buf);
  }
  return Buffer.concat(parts);
}

/**
 * Download a video track and an audio track, mux them with ffmpeg, and stream
 * the result to the client. Output is MP4 (H.264/AAC passthrough) or WebM
 * depending on the input containers.
 */
export async function mergeAndStream(
  video: FormatInfo,
  audio: FormatInfo,
  res: Response,
): Promise<void> {
  const [vBuf, aBuf] = await Promise.all([
    fetchWhole(video.url, video.contentLength),
    fetchWhole(audio.url, audio.contentLength),
  ]);

  const isWebm = video.container === "webm" && audio.container === "webm";
  const muxer = isWebm ? ["-f", "webm"] : ["-f", "mp4", "-movflags", "frag_keyframe+empty_moov+default_base_moof"];
  const codecArgs = isWebm ? ["-c", "copy"] : ["-c:v", "copy", "-c:a", "copy"];

  const args = [
    "-hide_banner",
    "-loglevel", "error",
    "-i", "pipe:0",
    "-i", "pipe:3",
    ...codecArgs,
    ...muxer,
    "pipe:1",
  ];

  res.setHeader("Content-Type", isWebm ? "video/webm" : "video/mp4");
  res.setHeader("Cache-Control", "no-store");
  res.status(200);

  await new Promise<void>((resolve, reject) => {
    const ff = spawn(FFMPEG, args, {
      stdio: ["pipe", "pipe", "pipe", "pipe"],
    });
    ff.stdout.pipe(res);
    ff.stderr.on("data", (d: Buffer) => {
      const s = d.toString().trim();
      if (s) console.error("[ffmpeg]", s.slice(0, 300));
    });
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0 || res.writableEnded) resolve();
      else reject(new Error(`ffmpeg exited ${code}`));
    });
    // Feed the two inputs. Video on fd 0, audio on fd 3.
    const vIn = ff.stdio[0] as NodeJS.WritableStream;
    const aIn = ff.stdio[3] as NodeJS.WritableStream;
    vIn.end(vBuf);
    aIn.end(aBuf);
  });
}
