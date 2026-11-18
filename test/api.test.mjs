/**
 * Local HTTP tests. They start the built server but make no upstream requests.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.TEST_PORT ?? 8799);
const BASE = `http://127.0.0.1:${PORT}`;
let child;

before(async () => {
  child = spawn("node", ["dist/index.js"], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(PORT) },
    stdio: ["ignore", "inherit", "inherit"],
  });
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      const response = await fetch(`${BASE}/health`);
      if (response.ok) return;
    } catch {
      // The server may still be starting.
    }
    if (Date.now() >= deadline) throw new Error("server did not become healthy in 30s");
    await sleep(300);
  }
});

after(() => {
  if (child && !child.killed) child.kill("SIGTERM");
});

test("health reports local status", async () => {
  const response = await fetch(`${BASE}/health`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(typeof body.uptimeSeconds, "number");
  assert.equal(typeof body.client, "string");
});

test("search rejects missing and invalid input", async () => {
  const missing = await fetch(`${BASE}/api/search`);
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).ok, false);

  const invalid = await fetch(`${BASE}/api/search?q=test&type=bogus`);
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).ok, false);
});

test("media routes reject missing parameters", async () => {
  for (const path of ["/api/info", "/api/link", "/api/download", "/api/merge"]) {
    const response = await fetch(`${BASE}${path}`);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).ok, false);
  }
});

test("unknown route returns JSON route guidance", async () => {
  const response = await fetch(`${BASE}/definitely-not-a-route`);
  const body = await response.json();
  assert.equal(response.status, 404);
  assert.equal(body.ok, false);
  assert.ok(body.routes.includes("GET /api/search?q="));
  assert.ok(body.routes.includes("GET /api/merge?v="));
});
