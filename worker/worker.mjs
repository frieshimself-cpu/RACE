/* THE RACE — worker loop.
 *
 * Runs 24/7 on any always-on machine (VPS, Railway, spare PC — NOT Vercel,
 * which can't host long-running processes). Each cycle, every configured AI
 * gets one attempt at a randomly chosen Millennium Prize Problem. The full
 * attempt text and a self-assessed verdict are pushed to Upstash Redis,
 * where /api/feed serves them to the site.
 *
 * Required env vars:
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 * Provider keys (each one is optional — a missing key just skips that racer):
 *   ANTHROPIC_API_KEY, OPENAI_API_KEY, XAI_API_KEY
 * Optional:
 *   ANTHROPIC_MODEL (default claude-opus-4-8)
 *   OPENAI_MODEL    (default gpt-5)
 *   XAI_MODEL       (default grok-4)
 *   RACE_INTERVAL_MS (default 600000 — one attempt per model every 10 min)
 */

import Anthropic from "@anthropic-ai/sdk";

const PROBLEMS = [
  "Riemann Hypothesis",
  "P vs NP",
  "Navier–Stokes Existence and Smoothness",
  "Yang–Mills Existence and Mass Gap",
  "Hodge Conjecture",
  "Birch and Swinnerton-Dyer Conjecture",
];

const INTERVAL = Number(process.env.RACE_INTERVAL_MS || 600000);
const MAX_STORED_TEXT = 20000;
const FEED_LENGTH = 500;

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

/* ---------- storage ---------- */

async function redis(command) {
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`redis ${res.status}: ${await res.text()}`);
  return (await res.json()).result;
}

async function recordAttempt(attempt) {
  await redis(["LPUSH", "race:attempts", JSON.stringify(attempt)]);
  await redis(["LTRIM", "race:attempts", "0", String(FEED_LENGTH - 1)]);
  await redis(["HINCRBY", "race:counts", attempt.ai, "1"]);
}

/* ---------- providers ---------- */

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

async function attemptClaude(problem) {
  const msg = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: prompt(problem) }],
  });
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

async function openAICompatible(url, key, model, problem) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt(problem) }],
      max_completion_tokens: 8000,
    }),
  });
  if (!res.ok) throw new Error(`${url} ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

const RACERS = [
  {
    id: "claude",
    enabled: () => !!anthropic,
    run: (p) => attemptClaude(p),
  },
  {
    id: "gpt",
    enabled: () => !!process.env.OPENAI_API_KEY,
    run: (p) =>
      openAICompatible(
        "https://api.openai.com/v1/chat/completions",
        process.env.OPENAI_API_KEY,
        process.env.OPENAI_MODEL || "gpt-5",
        p
      ),
  },
  {
    id: "grok",
    enabled: () => !!process.env.XAI_API_KEY,
    run: (p) =>
      openAICompatible(
        "https://api.x.ai/v1/chat/completions",
        process.env.XAI_API_KEY,
        process.env.XAI_MODEL || "grok-4",
        p
      ),
  },
];

/* ---------- verdict parsing ---------- */

function parseVerdict(text) {
  const v = /VERDICT:\s*(SOLVED|PARTIAL|FAILED)/i.exec(text);
  const r = /REASON:\s*(.+)/i.exec(text);
  let verdict = (v?.[1] || "FAILED").toUpperCase();
  // A "SOLVED" self-assessment is a claim, not a fact — flag it for human
  // review instead of displaying a solved Millennium problem.
  if (verdict === "SOLVED") verdict = "CLAIMS SOLVED (pending human review)";
  return { verdict, reason: (r?.[1] || "no reason given").trim().slice(0, 160) };
}

/* ---------- main loop ---------- */

async function runOnce(racer) {
  const problem = PROBLEMS[Math.floor(Math.random() * PROBLEMS.length)];
  const started = Date.now();
  try {
    const text = await racer.run(problem);
    const { verdict, reason } = parseVerdict(text);
    const attempt = {
      id: `${racer.id}-${started}`,
      ai: racer.id,
      problem,
      verdict,
      reason,
      ts: new Date(started).toISOString(),
      duration_ms: Date.now() - started,
      text: text.slice(0, MAX_STORED_TEXT),
    };
    await recordAttempt(attempt);
    console.log(`[${racer.id}] ${problem} → ${verdict}: ${reason}`);
  } catch (err) {
    console.error(`[${racer.id}] attempt errored:`, err.message || err);
    await recordAttempt({
      id: `${racer.id}-${started}`,
      ai: racer.id,
      problem,
      verdict: "FAILED",
      reason: `attempt crashed: ${String(err.message || err).slice(0, 100)}`,
      ts: new Date(started).toISOString(),
      duration_ms: Date.now() - started,
      text: "",
    }).catch(() => {});
  }
}

async function main() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error("Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN first.");
    process.exit(1);
  }
  const active = RACERS.filter((r) => r.enabled());
  if (!active.length) {
    console.error("No provider keys set. Set at least one of ANTHROPIC_API_KEY, OPENAI_API_KEY, XAI_API_KEY.");
    process.exit(1);
  }
  console.log(`THE RACE worker: ${active.map((r) => r.id).join(", ")} — one attempt each every ${INTERVAL / 60000} min`);

  // Stagger racers so attempts spread across the interval instead of bursting.
  for (const [i, racer] of active.entries()) {
    const stagger = (INTERVAL / active.length) * i;
    setTimeout(() => {
      runOnce(racer);
      setInterval(() => runOnce(racer), INTERVAL);
    }, stagger);
  }
}

main();
