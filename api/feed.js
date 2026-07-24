// Vercel serverless function: serves the live race feed from Upstash Redis.
// Returns { live: false } until UPSTASH_REDIS_REST_URL / _TOKEN are configured,
// which keeps the frontend in simulation mode.

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

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    res.status(200).json({ live: false, reason: "storage not configured" });
    return;
  }

  try {
    const [rawCounts, rawAttempts] = await Promise.all([
      redis(["HGETALL", "race:counts"]),
      redis(["LRANGE", "race:attempts", "0", "49"]),
    ]);

    // HGETALL over REST returns a flat [field, value, field, value, ...] array
    const counts = {};
    for (let i = 0; i < (rawCounts || []).length; i += 2) {
      counts[rawCounts[i]] = Number(rawCounts[i + 1]);
    }

    const attempts = (rawAttempts || []).map((s) => {
      const a = JSON.parse(s);
      delete a.text; // full attempt text stays in storage; feed stays light
      return a;
    });

    res.status(200).json({ live: true, counts, attempts });
  } catch (err) {
    res.status(200).json({ live: false, reason: String(err.message || err) });
  }
};
