/* Storage backend for the race log.
 *
 * Two modes, picked automatically:
 *  - Upstash Redis (if UPSTASH_REDIS_REST_URL/_TOKEN set) — for the split
 *    Vercel + separate-worker deployment.
 *  - Local file store (default) — for the all-in-one server deployment.
 *    Attempts append to DATA_DIR/attempts.jsonl; counts in DATA_DIR/counts.json.
 *    Mount a persistent volume at DATA_DIR to keep history across redeploys.
 */

import fs from "node:fs";
import path from "node:path";

const FEED_LENGTH = 500;

export function initStore() {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.log("store: upstash redis");
    return upstashStore();
  }
  const dir = process.env.DATA_DIR || "./data";
  console.log(`store: local files in ${dir}`);
  return fileStore(dir);
}

/* ---------- upstash ---------- */

function upstashStore() {
  async function redis(command) {
    const res = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });
    if (!res.ok) throw new Error(`redis ${res.status}`);
    return (await res.json()).result;
  }

  return {
    async recordAttempt(attempt) {
      await redis(["LPUSH", "race:attempts", JSON.stringify(attempt)]);
      await redis(["LTRIM", "race:attempts", "0", String(FEED_LENGTH - 1)]);
      await redis(["HINCRBY", "race:counts", attempt.ai, "1"]);
    },
    async getFeed() {
      const [rawCounts, rawAttempts] = await Promise.all([
        redis(["HGETALL", "race:counts"]),
        redis(["LRANGE", "race:attempts", "0", "49"]),
      ]);
      const counts = {};
      for (let i = 0; i < (rawCounts || []).length; i += 2) counts[rawCounts[i]] = Number(rawCounts[i + 1]);
      const attempts = (rawAttempts || []).map((s) => {
        const a = JSON.parse(s);
        delete a.text;
        return a;
      });
      return { counts, attempts };
    },
  };
}

/* ---------- local files ---------- */

function fileStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const logPath = path.join(dir, "attempts.jsonl");
  const countsPath = path.join(dir, "counts.json");

  let counts = {};
  let recent = []; // newest first, without full text
  try {
    counts = JSON.parse(fs.readFileSync(countsPath, "utf8"));
  } catch {}
  try {
    const lines = fs.readFileSync(logPath, "utf8").trim().split("\n").slice(-FEED_LENGTH);
    recent = lines
      .map((l) => { try { const a = JSON.parse(l); delete a.text; return a; } catch { return null; } })
      .filter(Boolean)
      .reverse();
  } catch {}

  return {
    async recordAttempt(attempt) {
      fs.appendFileSync(logPath, JSON.stringify(attempt) + "\n");
      counts[attempt.ai] = (counts[attempt.ai] || 0) + 1;
      fs.writeFileSync(countsPath, JSON.stringify(counts));
      const light = { ...attempt };
      delete light.text;
      recent.unshift(light);
      if (recent.length > FEED_LENGTH) recent.length = FEED_LENGTH;
    },
    async getFeed() {
      return { counts: { ...counts }, attempts: recent.slice(0, 50) };
    },
  };
}
