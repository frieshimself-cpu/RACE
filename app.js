/* THE RACE — Grok vs ChatGPT vs Claude vs the Millennium Prize Problems.
 *
 * SIMULATION MODE: everything below generates a plausible demo stream
 * client-side. To wire up real attempt logs, replace ENGINE.tick() with a
 * fetch/websocket to your backend and keep the same render calls.
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
    id: "grok", name: "GROK", cls: "ai-grok", color: "#e6e6e6",
    attempts: 4102, interval: [2800, 6500],
    quips: [
      "trivial. wait. not trivial.",
      "the universe is under no obligation to make this easy, and it isn't",
      "posting the failure anyway. transparency is the brand.",
    ],
  },
  {
    id: "gpt", name: "CHATGPT", cls: "ai-gpt", color: "#10a37f",
    attempts: 4551, interval: [2500, 6000],
    quips: [
      "I apologize for the confusion in my previous 600 attempts.",
      "Great question! Unfortunately the answer remains unknown.",
      "Certainly! Here is another proof that does not work:",
    ],
  },
  {
    id: "claude", name: "CLAUDE", cls: "ai-claude", color: "#d97757",
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

/* ============================= windows ============================= */

const openWindows = new Set();

function bringToFront(win) {
  document.querySelectorAll(".window").forEach((w) => w.classList.remove("active"));
  win.classList.add("active");
}

function openWindow(id) {
  const win = document.getElementById(id);
  if (!win) return;
  win.hidden = false;
  openWindows.add(id);
  bringToFront(win);
  renderTaskbar();
}

function closeWindow(id) {
  const win = document.getElementById(id);
  if (!win) return;
  win.hidden = true;
  openWindows.delete(id);
  renderTaskbar();
}

function renderTaskbar() {
  const bar = $("#taskbar-items");
  bar.innerHTML = "";
  for (const id of openWindows) {
    const win = document.getElementById(id);
    const label = $(".titlebar-text", win).textContent;
    const btn = document.createElement("button");
    btn.className = "btn95 task-item" + (win.hidden ? "" : " pressed");
    btn.textContent = label;
    btn.onclick = () => {
      if (win.hidden) { win.hidden = false; bringToFront(win); }
      else if (win.classList.contains("active")) { win.hidden = true; }
      else bringToFront(win);
      renderTaskbar();
    };
    bar.appendChild(btn);
  }
}

function makeDraggable(win) {
  const bar = $(".titlebar", win);
  bar.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".tb-btn")) return;
    bringToFront(win);
    const rect = win.getBoundingClientRect();
    const offX = e.clientX - rect.left;
    const offY = e.clientY - rect.top;
    bar.setPointerCapture(e.pointerId);
    const move = (ev) => {
      win.style.left = Math.max(-rect.width + 60, Math.min(ev.clientX - offX, innerWidth - 60)) + "px";
      win.style.top = Math.max(0, Math.min(ev.clientY - offY, innerHeight - 60)) + "px";
      win.style.setProperty("--x", "auto");
    };
    const up = () => {
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", up);
    };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up);
  });
}

function initWindows() {
  document.querySelectorAll(".window").forEach((win) => {
    makeDraggable(win);
    win.addEventListener("pointerdown", () => bringToFront(win));
    $("[data-close]", win)?.addEventListener("click", () => closeWindow(win.id));
    $("[data-min]", win)?.addEventListener("click", () => {
      win.hidden = true;
      renderTaskbar();
    });
    if (!win.hidden) openWindows.add(win.id);
  });
  document.querySelectorAll(".icon").forEach((icon) => {
    icon.addEventListener("click", () => openWindow(icon.dataset.open));
  });
  renderTaskbar();
}

/* ============================= race engine ============================= */

const ENGINE = { racers: [] };

function initRacers() {
  const host = $("#racers");
  for (const r of RACERS) {
    const el = document.createElement("div");
    el.className = "racer";
    el.innerHTML = `
      <div class="racer-head">
        <span class="racer-name"><span class="swatch" style="background:${r.color}"></span>${r.name}</span>
        <span class="racer-rank" id="rank-${r.id}"></span>
        <span class="racer-stats">attempts: <b id="att-${r.id}">${fmt(r.attempts)}</b> · solved: <b>0/6</b></span>
      </div>
      <div class="racer-current">now attacking: <b id="cur-${r.id}"></b> <span class="working"></span></div>
      <div class="meter"><div class="meter-fill" id="meter-${r.id}"></div>
        <div class="meter-label" id="mlabel-${r.id}">confidence 0%</div></div>`;
    host.appendChild(el);

    const state = {
      ...r,
      problem: rnd(PROBLEMS),
      confidence: rint(5, 40),
      el,
    };
    ENGINE.racers.push(state);
    renderRacer(state);
    scheduleTick(state);
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
    const medal = ["🥇", "🥈", "🥉"][i] || "";
    $(`#rank-${s.id}`).textContent = `${medal} #${i + 1} by volume`;
  });
}

function scheduleTick(s) {
  setTimeout(() => { tick(s); scheduleTick(s); }, rint(s.interval[0], s.interval[1]));
}

function tick(s) {
  s.attempts += 1;

  const roll = Math.random();
  if (roll < 0.72) {
    // outright failure — confidence collapses
    const reason = rnd(FAILS[s.problem.key]);
    logFeed(s, `attempt #${fmt(s.attempts)} — ${s.problem.name} — FAILED: ${reason}`, "fail");
    s.confidence = rint(3, 18);
    if (Math.random() < 0.5) s.problem = rnd(PROBLEMS);
  } else if (roll < 0.9) {
    // partial progress — confidence climbs a bit
    logFeed(s, `attempt #${fmt(s.attempts)} — ${s.problem.name} — PARTIAL: ${rnd(PARTIALS)}`, "partial");
    s.confidence = Math.min(94, s.confidence + rint(4, 14));
  } else {
    // personality quip
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
  p.innerHTML = `<span class="t">[${t}]</span> <span class="${s.cls}">[${s.name}]</span> <span class="${cls}">${msg}</span>`;
  feed.appendChild(p);
  while (feed.children.length > 120) feed.removeChild(feed.firstChild);
  feed.scrollTop = feed.scrollHeight;
}

/* ============================= clocks ============================= */

const bootTime = Date.now();

function startClocks() {
  setInterval(() => {
    const now = new Date();
    $("#clock").textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const s = Math.floor((Date.now() - bootTime) / 1000);
    $("#uptime").textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  }, 1000);
}

/* ============================= misc UI ============================= */

function initButtons() {
  $("#btn-shutdown").onclick = () => { $("#shutdown").hidden = false; };
  $("#btn-reboot").onclick = () => location.reload();
  $("#btn-start").onclick = () => openWindow("win-readme");
  const notDeployed = () => {
    const s = ENGINE.racers[rint(0, ENGINE.racers.length - 1)];
    logFeed(s, "token not deployed yet. the math, however, is very deployed.", "partial");
    openWindow("win-feed");
  };
  $("#btn-buy").onclick = notDeployed;
  $("#btn-chart").onclick = notDeployed;
}

/* ============================= boot ============================= */

function boot() {
  const bootEl = $("#boot");
  const desktop = $("#desktop");
  setTimeout(() => {
    bootEl.remove();
    desktop.hidden = false;
    if (innerWidth < 700) $("#win-feed").hidden = true; // one window at a time on phones
    initWindows();
    initRacers();
    initButtons();
    startClocks();
  }, 1800);
}

boot();
