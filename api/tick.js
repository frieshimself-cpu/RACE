// Vercel-only race runner: each invocation runs AT MOST one attempt, for the
// most-overdue racer. Self-rate-limited via state in Vercel Blob, so extra
// calls are free no-ops — a scheduler (GitHub Action / cron pinger) just has
// to hit this endpoint more often than RACE_INTERVAL_MS.
//
// State (Vercel Blob):
//   race/state.json          — counts, lastRun per racer, recent attempts (no text)
//   race/attempts/<id>.txt   — full unedited attempt text, write-once

const { put, head } = require("@vercel/blob");
const { Anthropic } = require("@anthropic-ai/sdk");

const STATE_PATH = "race/state.json";
const INTERVAL = Number(process.env.RACE_INTERVAL_MS || 3600000);
const MAX_TOKENS = Number(process.env.TICK_MAX_TOKENS || 6000);
const CALL_TIMEOUT_MS = 260000; // stay under the 300s function ceiling
const FEED_LENGTH = 500;

const PROBLEMS = [
  "Riemann Hypothesis",
  "P vs NP",
  "Navier–Stokes Existence and Smoothness",
  "Yang–Mills Existence and Mass Gap",
  "Hodge Conjecture",
  "Birch and Swinnerton-Dyer Conjecture",
];

const prompt = (problem) => `You are one of three AI models in a continuous public race to make
genuine progress on the Millennium Prize Problems. This attempt targets:

  ${problem}

Rules of the race:
- Make one serious, self-contained attempt at progress: a proof sketch of a
  relevant lemma, a new reduction, an analysis of why a known approach fails,
  or a concrete partial result. Do not restate the problem or survey history.
- Be rigorous. Check your own reasoning before concluding.
- Every attempt is published unedited, including this one.
- You MUST end with exactly two lines:
    VERDICT: FAILED | PARTIAL | SOLVED
    REASON: <one line, max 120 chars, honestly summarizing the outcome>
- Only write SOLVED if you have produced a complete, rigorous proof of the
  full problem — which is overwhelmingly unlikely. Overclaiming will be
  publicly visible. FAILED with a sharp reason is a respectable result.`;

/* ---------- secret scrubbing ---------- */

const KEY_PATTERNS = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /xai-[A-Za-z0-9_-]{8,}/g,
  /vercel_blob_[A-Za-z0-9_-]{8,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g,
];
function scrub(str) {
  let out = String(str ?? "");
  for (const re of KEY_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out;
}

/* ---------- providers ---------- */

async function attemptClaude(problem) {
  const client = new Anthropic({ timeout: CALL_TIMEOUT_MS });
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
    max_tokens: MAX_TOKENS,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: prompt(problem) }],
  });
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

async function openAICompatible(url, key, model, problem) {
  const res = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt(problem) }],
      max_completion_tokens: MAX_TOKENS,
    }),
  });
  if (!res.ok) throw new Error(`${url} ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

const RACERS = [
  { id: "claude", enabled: () => !!process.env.ANTHROPIC_API_KEY, run: attemptClaude },
  {
    id: "gpt",
    enabled: () => !!process.env.OPENAI_API_KEY,
    run: (p) => openAICompatible("https://api.openai.com/v1/chat/completions",
      process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL || "gpt-5", p),
  },
  {
    id: "grok",
    enabled: () => !!process.env.XAI_API_KEY,
    run: (p) => openAICompatible("https://api.x.ai/v1/chat/completions",
      process.env.XAI_API_KEY, process.env.XAI_MODEL || "grok-4.5", p),
  },
];

/* ---------- storage backends ---------- */
/* Blob (Vercel-native) if BLOB_READ_WRITE_TOKEN is set, else Upstash Redis
 * (same schema the split worker uses, so /api/feed reads both). */

const HAS_BLOB = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const HAS_REDIS = () =>
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
// GitHub-as-storage mode: state lives in the repo (committed by the
// race-tick GitHub Action); tick only READS it — the Action does the writes.
const HAS_GITHUB = () => !!process.env.STATE_RAW_URL;

async function redis(command) {
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
}

async function readState() {
  if (HAS_GITHUB()) {
    try {
      const res = await fetch(`${process.env.STATE_RAW_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`state ${res.status}`);
      return await res.json();
    } catch {
      return { counts: {}, lastRun: {}, attempts: [] };
    }
  }
  if (HAS_BLOB()) {
    try {
      const meta = await head(STATE_PATH);
      const res = await fetch(`${meta.url}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`state fetch ${res.status}`);
      return await res.json();
    } catch {
      return { counts: {}, lastRun: {}, attempts: [] };
    }
  }
  // redis: lastRun map lives in one JSON key
  try {
    const raw = await redis(["GET", "race:lastrun"]);
    return { counts: {}, lastRun: raw ? JSON.parse(raw) : {}, attempts: [] };
  } catch {
    return { counts: {}, lastRun: {}, attempts: [] };
  }
}

async function writeState(state) {
  if (HAS_GITHUB()) return; // the GitHub Action commits state, not us
  if (HAS_BLOB()) {
    await put(STATE_PATH, JSON.stringify(state), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 60,
    });
    return;
  }
  await redis(["SET", "race:lastrun", JSON.stringify(state.lastRun)]);
}

/* Record a finished attempt (backend-specific append). */
async function recordAttempt(attempt, fullText) {
  if (HAS_GITHUB()) return; // the GitHub Action commits the attempt
  if (HAS_BLOB()) {
    await put(`race/attempts/${attempt.id}.txt`, fullText.slice(0, 100000), {
      access: "public", addRandomSuffix: false, contentType: "text/plain; charset=utf-8",
    }).catch(() => {});
    const fresh = await readState();
    fresh.lastRun[attempt.ai] = fresh.lastRun[attempt.ai] || Date.now();
    fresh.counts[attempt.ai] = (fresh.counts[attempt.ai] || 0) + 1;
    fresh.attempts.unshift(attempt);
    if (fresh.attempts.length > FEED_LENGTH) fresh.attempts.length = FEED_LENGTH;
    await writeState(fresh);
    return;
  }
  // redis: worker-compatible schema, full text embedded (feed strips it)
  await redis(["LPUSH", "race:attempts", JSON.stringify({ ...attempt, text: fullText.slice(0, 20000) })]);
  await redis(["LTRIM", "race:attempts", "0", String(FEED_LENGTH - 1)]);
  await redis(["HINCRBY", "race:counts", attempt.ai, "1"]);
}

/* ---------- verdict ---------- */

function parseVerdict(text) {
  const v = /VERDICT:\s*(SOLVED|PARTIAL|FAILED)/i.exec(text);
  const r = /REASON:\s*(.+)/i.exec(text);
  let verdict = (v?.[1] || "FAILED").toUpperCase();
  if (verdict === "SOLVED") verdict = "CLAIMS SOLVED (pending human review)";
  return { verdict, reason: (r?.[1] || "no reason given").trim().slice(0, 160) };
}

/* ---------- handler ---------- */

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (!HAS_BLOB() && !HAS_REDIS() && !HAS_GITHUB()) {
    res.status(200).json({ ok: false, reason: "storage not configured" });
    return;
  }

  const state = await readState();
  const now = Date.now();

  const active = RACERS.filter((r) => r.enabled());
  if (!active.length) {
    res.status(200).json({ ok: false, reason: "no provider keys configured" });
    return;
  }

  // most-overdue racer; no-op if nobody is due yet. ?racer= narrows the pick
  // but NEVER bypasses the rate limit — only due racers can run, so this is
  // safe to expose publicly.
  const wanted = new URL(req.url, "http://x").searchParams.get("racer");
  const due = active
    .filter((r) => !wanted || r.id === wanted)
    .map((r) => ({ r, since: now - (state.lastRun[r.id] || 0) }))
    .filter((x) => x.since >= INTERVAL)
    .sort((a, b) => b.since - a.since)[0];

  if (!due) {
    const next = Math.min(...active.map((r) => (state.lastRun[r.id] || 0) + INTERVAL)) - now;
    res.status(200).json({ ok: true, idle: true, next_due_in_ms: Math.max(0, next) });
    return;
  }

  const racer = due.r;
  // claim the slot immediately so overlapping pings don't double-run
  state.lastRun[racer.id] = now;
  await writeState(state);

  const featured = process.env.FEATURED_PROBLEM
    ? PROBLEMS.find((p) => p.toLowerCase().includes(process.env.FEATURED_PROBLEM.toLowerCase()))
    : null;
  const weight = Math.min(1, Math.max(0, Number(process.env.FEATURED_WEIGHT ?? 0.7)));
  const problem = featured && Math.random() < weight
    ? featured
    : PROBLEMS[Math.floor(Math.random() * PROBLEMS.length)];

  const started = Date.now();
  let attempt;
  let fullText = "";
  try {
    const text = await racer.run(problem);
    fullText = scrub(text);
    const { verdict, reason } = parseVerdict(text);
    attempt = {
      id: `${racer.id}-${started}`,
      ai: racer.id, problem, verdict,
      reason: scrub(reason),
      ts: new Date(started).toISOString(),
      duration_ms: Date.now() - started,
    };
  } catch (err) {
    const safeErr = scrub(String((err && err.message) || err));
    attempt = {
      id: `${racer.id}-${started}`,
      ai: racer.id, problem, verdict: "FAILED",
      reason: `attempt crashed: ${safeErr.slice(0, 100)}`,
      ts: new Date(started).toISOString(),
      duration_ms: Date.now() - started,
    };
  }

  await recordAttempt(attempt, fullText);
  // In GitHub mode the caller (the race-tick Action) persists this response.
  res.status(200).json({
    ok: true,
    ran: { ...attempt, started_ms: started, text: fullText.slice(0, 20000) },
  });
};
