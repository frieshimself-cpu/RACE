/* THE RACE — Grok vs ChatGPT vs Claude vs the Millennium Prize Problems.
 *
 * SIMULATION MODE by default: a plausible demo stream generated client-side.
 * The page auto-upgrades to LIVE MODE when /api/feed reports real attempts
 * (worker/ + Upstash configured) — see the "live mode" section below.
 */

"use strict";

/* ============================= data ============================= */

const PROBLEMS = [
  { key: "riemann", name: "Riemann Hypothesis" },
  { key: "pnp", name: "P vs NP" },
  { key: "navier", name: "Navier–Stokes" },
  { key: "yangmills", name: "Yang–Mills Mass Gap" },
  { key: "hodge", name: "Hodge Conjecture" },
  { key: "bsd", name: "Birch & Swinnerton-Dyer" },
];

const FAILS = {
  riemann: [
    "zero-density estimate insufficient past height 10^13",
    "argument assumes RH at step 847 to prove RH",
    "critical line contour collapsed under scrutiny",
    "explicit formula diverges; proof retracted by author (itself)",
  ],
  pnp: [
    "hit the relativization barrier, again",
    "natural proofs barrier — construction self-defeats",
    "SAT lower bound evaporated under closer reading",
    "reduced P vs NP to P vs NP (progress unclear)",
  ],
  navier: [
    "energy estimate blows up in finite time",
    "vorticity unbounded near t = 0.003",
    "smoothness lost exactly where it was needed",
    "weak solution refuses to become strong",
  ],
  yangmills: [
    "mass gap vanished under renormalization",
    "measure on gauge fields not actually constructed",
    "lattice limit does not converge as promised",
    "gap proven for a theory nobody asked about",
  ],
  hodge: [
    "cycle class map not surjective where claimed",
    "counterexample suspected, then retracted, then re-suspected",
    "(p,p)-class stubbornly non-algebraic",
    "proof works only in the trivial case",
  ],
  bsd: [
    "rank computation diverged after 6 hours",
    "L-function vanished to unexpected order at s = 1",
    "Tate–Shafarevich group presumed finite without cause",
    "heights matrix went singular at the worst moment",
  ],
};

const PARTIALS = [
  "verified a known lemma (already proved in 1987)",
  "rediscovered a result from the literature, cited nobody",
  "produced 40 pages; pages 12–40 depend on a typo on page 11",
  "numerics consistent with the conjecture (as they have been for decades)",
  "found a genuinely elegant restatement of the problem",
];

const RACERS = [
  {
    id: "grok", name: "GROK", cls: "ai-grok", color: "var(--grok)",
    attempts: 4102, interval: [2800, 6500],
    quips: [
      "trivial. wait. not trivial.",
      "the universe is under no obligation to make this easy, and it isn't",
      "posting the failure anyway. transparency is the brand.",
    ],
  },
  {
    id: "gpt", name: "CHATGPT", cls: "ai-gpt", color: "var(--gpt)",
    attempts: 4551, interval: [2500, 6000],
    quips: [
      "I apologize for the confusion in my previous 600 attempts.",
      "Great question! Unfortunately the answer remains unknown.",
      "Certainly! Here is another proof that does not work:",
    ],
  },
  {
    id: "claude", name: "CLAUDE", cls: "ai-claude", color: "var(--claude)",
    attempts: 4287, interval: [2600, 6200],
    quips: [
      "I should be careful here — step 3 doesn't actually follow.",
      "I want to flag significant uncertainty about everything above.",
      "On reflection, I've proven a weaker statement. Much weaker.",
    ],
  },
];

/* ============================= utils ============================= */

const $ = (sel, root = document) => root.querySelector(sel);
const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const fmt = (n) => n.toLocaleString("en-US");
const pad = (n) => String(n).padStart(2, "0");

/* ============================= race engine ============================= */

const ENGINE = { racers: [] };

function initRacers(sim = true) {
  const host = $("#racers");
  for (const r of RACERS) {
    const startAttempts = sim ? r.attempts : 0;
    const el = document.createElement("article");
    el.className = "racer";
    el.style.setProperty("--ac", r.color);
    el.innerHTML = `
      <div class="racer-top">
        <span class="pos" id="rank-${r.id}">P–</span>
        <h3>${r.name}</h3>
        <span class="odo">attempts <b id="att-${r.id}">${fmt(startAttempts)}</b> · solved <b>0/6</b></span>
      </div>
      <div class="lane"><div class="lane-fill" id="meter-${r.id}"></div><div class="lane-finish"></div></div>
      <div class="racer-meta"><span id="mlabel-${r.id}"></span> · attacking <b id="cur-${r.id}"></b><span class="working"></span></div>`;
    host.appendChild(el);

    const state = {
      ...r,
      attempts: startAttempts,
      problem: rnd(PROBLEMS),
      confidence: rint(5, 40),
      el,
    };
    ENGINE.racers.push(state);
    renderRacer(state);
    if (sim) scheduleTick(state);
  }
  renderRanks();
}

function renderRacer(s) {
  $(`#att-${s.id}`).textContent = fmt(s.attempts);
  $(`#cur-${s.id}`).textContent = s.problem.name;
  $(`#meter-${s.id}`).style.width = s.confidence + "%";
  $(`#mlabel-${s.id}`).textContent = `confidence ${s.confidence}% (unwarranted)`;
}

function renderRanks() {
  const sorted = [...ENGINE.racers].sort((a, b) => b.attempts - a.attempts);
  sorted.forEach((s, i) => {
    $(`#rank-${s.id}`).textContent = `P${i + 1}`;
  });
  const total = ENGINE.racers.reduce((n, s) => n + s.attempts, 0);
  $("#stat-attempts").textContent = fmt(total);
}

function scheduleTick(s) {
  setTimeout(() => { tick(s); scheduleTick(s); }, rint(s.interval[0], s.interval[1]));
}

function tick(s) {
  s.attempts += 1;

  const roll = Math.random();
  if (roll < 0.72) {
    const reason = rnd(FAILS[s.problem.key]);
    logFeed(s, `attempt #${fmt(s.attempts)} — ${s.problem.name} — FAILED: ${reason}`, "fail");
    s.confidence = rint(3, 18);
    if (Math.random() < 0.5) s.problem = rnd(PROBLEMS);
  } else if (roll < 0.9) {
    logFeed(s, `attempt #${fmt(s.attempts)} — ${s.problem.name} — PARTIAL: ${rnd(PARTIALS)}`, "partial");
    s.confidence = Math.min(94, s.confidence + rint(4, 14));
  } else {
    logFeed(s, rnd(s.quips), "");
    s.confidence = Math.max(2, s.confidence - rint(0, 6));
  }

  renderRacer(s);
  renderRanks();
}

/* ============================= feed ============================= */

function logFeed(s, msg, cls) {
  const feed = $("#feed");
  const now = new Date();
  const t = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const p = document.createElement("p");
  p.innerHTML = `<span class="t">[${t}]</span> <span class="${s.cls}">${s.name}</span> <span class="${cls}">${msg}</span>`;
  feed.appendChild(p);
  while (feed.children.length > 150) feed.removeChild(feed.firstChild);
  feed.scrollTop = feed.scrollHeight;
}

/* ============================= live mode ============================= */
/* If /api/feed reports live data (worker + Redis configured), the simulation
 * is disabled and the feed/counters come from real attempts. */

const LIVE = { seen: new Set() };

async function fetchLive() {
  try {
    const r = await fetch("/api/feed", { cache: "no-store" });
    if (!r.ok) return null;
    const data = await r.json();
    return data && data.live ? data : null;
  } catch {
    return null;
  }
}

function applyLiveData(data) {
  for (const s of ENGINE.racers) {
    const n = Number(data.counts?.[s.id] || 0);
    if (n > s.attempts) s.attempts = n;
  }
  const attempts = (data.attempts || []).slice().reverse(); // oldest first
  for (const a of attempts) {
    if (!a.id || LIVE.seen.has(a.id)) continue;
    LIVE.seen.add(a.id);
    const s = ENGINE.racers.find((r) => r.id === a.ai);
    if (!s) continue;
    const failed = /^FAILED/i.test(a.verdict);
    logFeed(s, `${a.problem} — ${a.verdict}: ${a.reason}`, failed ? "fail" : "partial");
    const p = PROBLEMS.find((p) => p.name.startsWith(a.problem.split(" ")[0]));
    if (p) s.problem = p;
    s.confidence = failed ? rint(3, 18) : Math.min(94, s.confidence + rint(4, 14));
  }
  ENGINE.racers.forEach(renderRacer);
  renderRanks();
}

function startLiveMode(initialData) {
  $(".feed-note").innerHTML =
    "LIVE MODE — attempts generated by real model runs (see <code>worker/</code>). Published unedited.";
  applyLiveData(initialData);
  setInterval(async () => {
    const d = await fetchLive();
    if (d) applyLiveData(d);
  }, 10000);
}

/* ============================= uptime ============================= */

const bootTime = Date.now();

function startClocks() {
  setInterval(() => {
    const s = Math.floor((Date.now() - bootTime) / 1000);
    $("#uptime").textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  }, 1000);
}

/* ============================= buttons ============================= */

function initButtons() {
  const notDeployed = () => {
    const s = ENGINE.racers[rint(0, ENGINE.racers.length - 1)];
    logFeed(s, "token not deployed yet. the math, however, is very deployed.", "partial");
    document.getElementById("wire").scrollIntoView({ behavior: "smooth" });
  };
  $("#btn-buy").onclick = notDeployed;
  $("#btn-chart").onclick = notDeployed;
}

/* ============================= boot ============================= */

(async function boot() {
  const liveData = await fetchLive();
  initRacers(!liveData);
  if (liveData) startLiveMode(liveData);
  initButtons();
  startClocks();
})();
