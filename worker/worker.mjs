/* THE RACE — worker loop.
 *
 * Each cycle, every configured AI gets one attempt at a Millennium Prize
 * Problem; the full text and self-assessed verdict are recorded to the store
 * (local files or Upstash Redis — see store.mjs).
 *
 * Run standalone (`node worker.mjs`) for the split deployment, or let
 * server.mjs import startLoop() for the all-in-one deployment.
 *
 * Provider keys (each optional — a missing key skips that racer):
 *   ANTHROPIC_API_KEY, OPENAI_API_KEY, XAI_API_KEY
 * Optional:
 *   ANTHROPIC_MODEL (default claude-opus-4-8)
 *   OPENAI_MODEL    (default gpt-5)
 *   XAI_MODEL       (default grok-4.5)
 *   RACE_INTERVAL_MS (default 600000 — one attempt per model every 10 min)
 *   FEATURED_PROBLEM (substring, e.g. "Riemann" — biases attempts toward it)
 *   FEATURED_WEIGHT  (0..1, default 0.7 — share of attempts on the featured problem)
 */

import Anthropic from "@anthropic-ai/sdk";
import { initStore } from "./store.mjs";

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
        process.env.XAI_MODEL || "grok-4.5",
        p
      ),
  },
];

/* ---------- secret scrubbing ---------- */
/* Nothing key-shaped may ever reach storage, the public feed, or logs.
 * Provider error bodies can echo (parts of) the API key — scrub everything. */

const KEY_PATTERNS = [
  /sk-[A-Za-z0-9_-]{8,}/g,        // OpenAI + Anthropic key formats
  /xai-[A-Za-z0-9_-]{8,}/g,       // xAI key format
  /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g,
];

function scrub(str) {
  let out = String(str ?? "");
  for (const re of KEY_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out;
}

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

/* ---------- loop ---------- */

function pickProblem() {
  const featured = process.env.FEATURED_PROBLEM
    ? PROBLEMS.find((p) => p.toLowerCase().includes(process.env.FEATURED_PROBLEM.toLowerCase()))
    : null;
  const weight = Math.min(1, Math.max(0, Number(process.env.FEATURED_WEIGHT ?? 0.7)));
  if (featured && Math.random() < weight) return featured;
  return PROBLEMS[Math.floor(Math.random() * PROBLEMS.length)];
}

async function runOnce(store, racer) {
  const problem = pickProblem();
  const started = Date.now();
  try {
    const text = await racer.run(problem);
    const { verdict, reason } = parseVerdict(text);
    await store.recordAttempt({
      id: `${racer.id}-${started}`,
      ai: racer.id,
      problem,
      verdict,
      reason: scrub(reason),
      ts: new Date(started).toISOString(),
      duration_ms: Date.now() - started,
      text: scrub(text.slice(0, MAX_STORED_TEXT)),
    });
    console.log(`[${racer.id}] ${problem} → ${verdict}: ${scrub(reason)}`);
  } catch (err) {
    const safeErr = scrub(String(err.message || err));
    console.error(`[${racer.id}] attempt errored:`, safeErr);
    await store.recordAttempt({
      id: `${racer.id}-${started}`,
      ai: racer.id,
      problem,
      verdict: "FAILED",
      reason: `attempt crashed: ${safeErr.slice(0, 100)}`,
      ts: new Date(started).toISOString(),
      duration_ms: Date.now() - started,
      text: "",
    }).catch(() => {});
  }
}

/* Starts the race loop. Returns the list of active racer ids ([] if no keys). */
export function startLoop(store) {
  const active = RACERS.filter((r) => r.enabled());
  if (!active.length) return [];
  console.log(`THE RACE worker: ${active.map((r) => r.id).join(", ")} — one attempt each every ${INTERVAL / 60000} min`);
  if (process.env.FEATURED_PROBLEM) {
    console.log(`Featured problem: ${process.env.FEATURED_PROBLEM} (weight ${process.env.FEATURED_WEIGHT ?? 0.7})`);
  }
  // Stagger racers so attempts spread across the interval instead of bursting.
  for (const [i, racer] of active.entries()) {
    const stagger = (INTERVAL / active.length) * i;
    setTimeout(() => {
      runOnce(store, racer);
      setInterval(() => runOnce(store, racer), INTERVAL);
    }, stagger);
  }
  return active.map((r) => r.id);
}

/* ---------- CLI (standalone worker for the split deployment) ---------- */

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const store = initStore();
  const active = startLoop(store);
  if (!active.length) {
    console.error("No provider keys set. Set at least one of ANTHROPIC_API_KEY, OPENAI_API_KEY, XAI_API_KEY.");
    process.exit(1);
  }
}
