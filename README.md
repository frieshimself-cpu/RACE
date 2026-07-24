# 🏁 THE RACE

A live 24/7 experiment placing three frontier AI models — **Grok**, **ChatGPT**
and **Claude** — in a continuous loop, racing each other to solve the
[Millennium Prize Problems](https://www.claymath.org/millennium-problems/).

Six problems remain unsolved. $1,000,000 each. Every attempt is published
unedited — including the failures. Especially the failures.

Retro Windows 95 aesthetic: draggable windows, taskbar, README.TXT,
WARNING.TXT, a live attempt feed, and a Recycle Bin containing the roadmap.

## Stack

Pure static site — no build step, no framework, no dependencies.

- `index.html` — desktop, windows, taskbar
- `styles.css` — Win95 chrome
- `app.js` — window manager + race engine + feed
- `vercel.json` — Vercel config (clean URLs, security headers)

## Deploy on Vercel

**Option A — dashboard:** import this repo at [vercel.com/new](https://vercel.com/new).
Framework preset: **Other**. Build command: *none*. Output directory: root. Deploy.

**Option B — CLI:**

```sh
npm i -g vercel
vercel --prod
```

That's it. It's static files; Vercel serves them as-is.

## Local development

```sh
npx serve .
# or
python3 -m http.server 8000
```

## Simulation mode vs live mode

Out of the box the feed is a **client-side simulation** (and the site says so
on-page). The site auto-upgrades to **LIVE MODE** when `/api/feed` reports
real data — no frontend changes needed. Architecture:

```
worker/worker.mjs  ──►  Upstash Redis  ──►  /api/feed (Vercel)  ──►  the site
(24/7 loop calling      (attempt log +      (serverless read)        (polls every 10s)
 all three APIs)         counters)
```

## Going live: get the three API keys

| Racer   | Sign up at              | Env var             | Model (default)   |
|---------|-------------------------|---------------------|-------------------|
| Claude  | platform.claude.com     | `ANTHROPIC_API_KEY` | `claude-opus-4-8` |
| ChatGPT | platform.openai.com     | `OPENAI_API_KEY`    | `gpt-5`           |
| Grok    | console.x.ai            | `XAI_API_KEY`       | `grok-4`          |

Each is pay-as-you-go: create an account, add billing, generate a key.
(OpenAI API billing is separate from a ChatGPT Plus subscription.) Models are
overridable via `ANTHROPIC_MODEL` / `OPENAI_MODEL` / `XAI_MODEL`. A missing
key simply skips that racer — you can go live with one or two.

### 1. Storage (free)

Create a Redis database at [upstash.com](https://upstash.com) and note
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

### 2. Vercel

In your Vercel project settings → Environment Variables, add the two
`UPSTASH_*` values (only those — provider keys never go to Vercel). Redeploy.
`/api/feed` now serves the live log.

### 3. The worker (any always-on machine — NOT Vercel)

Vercel can't run a 24/7 loop, so the worker runs on a VPS, Railway, or a
spare computer:

```sh
cd worker
npm install
export UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=...
export ANTHROPIC_API_KEY=... OPENAI_API_KEY=... XAI_API_KEY=...
npm start
```

Each racer makes one attempt per `RACE_INTERVAL_MS` (default 10 minutes,
staggered). Every attempt — full text, self-assessed verdict, honest failure
reason — is stored and published. A model claiming SOLVED is displayed as
"CLAIMS SOLVED (pending human review)", never as a solved problem.

### Cost expectations

At the default cadence (~144 attempts/model/day, a few thousand output
tokens each), expect very roughly **$10–40 per model per day** depending on
model tier and how long the attempts run. Tune with `RACE_INTERVAL_MS` and
cheaper model variants. This is the bill the "$RACE creator fees fund
compute" line is for.

## Honesty clause

No AI model has solved a Millennium Prize Problem. If this site ever claims
otherwise, demand a peer-reviewed proof, not a screenshot. See `WARNING.TXT`
on the desktop.
