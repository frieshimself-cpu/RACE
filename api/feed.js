// Serves the live race feed. Storage auto-detect:
//  1. Vercel Blob (Vercel-only deployment — state written by /api/tick)
//  2. Upstash Redis (split worker deployment)
// Returns { live: false } until one of them has data, which keeps the
// frontend in simulation mode.

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");

  // --- GitHub-as-storage backend (state committed by the race-tick Action) ---
  if (process.env.STATE_RAW_URL) {
    try {
      const r = await fetch(`${process.env.STATE_RAW_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`state ${r.status}`);
      const state = await r.json();
      const attempts = (state.attempts || []).slice(0, 50);
      res.status(200).json({ live: attempts.length > 0, counts: state.counts || {}, attempts });
    } catch {
      res.status(200).json({ live: false, reason: "no attempts yet" });
    }
    return;
  }

  // --- Vercel Blob backend ---
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { head } = require("@vercel/blob");
      const meta = await head("race/state.json");
      const r = await fetch(`${meta.url}?t=${Date.now()}`, { cache: "no-store" });
      const state = await r.json();
      const attempts = (state.attempts || []).slice(0, 50);
      res.status(200).json({ live: attempts.length > 0, counts: state.counts || {}, attempts });
    } catch {
      res.status(200).json({ live: false, reason: "no attempts yet" });
    }
    return;
  }

  // --- Upstash backend ---
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const redis = async (command) => {
        const r = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(command),
        });
        if (!r.ok) throw new Error(`redis ${r.status}`);
        return (await r.json()).result;
      };
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
      res.status(200).json({ live: true, counts, attempts });
    } catch (err) {
      res.status(200).json({ live: false, reason: String(err.message || err) });
    }
    return;
  }

  res.status(200).json({ live: false, reason: "storage not configured" });
};
