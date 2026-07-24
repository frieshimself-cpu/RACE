/* THE RACE — all-in-one server (the easy deployment).
 *
 * One process serves the static site, the /api/feed endpoint, and runs the
 * 24/7 race loop. Deploy the repo root to Railway (Dockerfile at repo root)
 * and this is the entrypoint. No Vercel, no Upstash needed — attempts are
 * stored in DATA_DIR (mount a Railway volume there to keep history forever).
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initStore } from "./store.mjs";
import { startLoop } from "./worker.mjs";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8080);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const store = initStore();
const activeRacers = startLoop(store);
if (!activeRacers.length) {
  console.warn("No provider keys set — serving the site in simulation mode (no race loop).");
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://x").pathname;

  if (pathname === "/api/feed") {
    try {
      const data = await store.getFeed();
      data.live = activeRacers.length > 0 || data.attempts.length > 0;
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ live: false, reason: "store error" }));
    }
    return;
  }

  // static site, confined to SITE_DIR
  const rel = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = path.resolve(SITE_DIR, rel);
  if (!file.startsWith(SITE_DIR + path.sep) || rel.startsWith("worker/") || rel.startsWith("api/")) {
    res.writeHead(404); res.end("not found"); return;
  }
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(body);
  });
});

server.listen(PORT, () => {
  console.log(`THE RACE serving on :${PORT} — racers: ${activeRacers.join(", ") || "none (simulation)"}`);
});
