# Launch runbook

Everything in code is done and smoke-tested against all three live APIs.

## ★ EASY MODE — one service, ~5 minutes (recommended)

One Railway service runs everything: the site, the feed API, and the 24/7
race loop. No Vercel, no Upstash.

1. **Set spending caps first** (one per dashboard):
   OpenAI: platform.openai.com → Settings → Limits ·
   Anthropic: platform.claude.com → Settings → Limits ·
   xAI: console.x.ai → billing
2. [railway.app](https://railway.app) → sign in with GitHub → **New Project →
   Deploy from GitHub repo** → pick this repo (repo root — don't change anything)
3. Service → **Variables** → paste, with your real keys:

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   OPENAI_API_KEY=sk-proj-...
   XAI_API_KEY=xai-...
   FEATURED_PROBLEM=Riemann
   RACE_INTERVAL_MS=3600000
   ```

4. Service → Settings → **Networking → Generate Domain** (this is your public URL)
5. Deploy. Logs should show
   `THE RACE worker: claude, gpt, grok — one attempt each every 60 min`,
   and the site flips to LIVE MODE once the first attempt lands.
6. *(Optional but recommended)* Service → **Volume** → mount at `/data` — keeps
   the full attempt history across redeploys. Without it, history resets on
   redeploy (the race keeps going either way).
7. *(Optional)* Custom domain: Settings → Networking → Custom Domain.

That's the whole deployment.

## PRO MODE — Vercel site + separate worker (optional alternative)

Site + `/api/feed` on Vercel (Upstash Redis as shared storage), worker
deployed separately with root directory `worker`. Use this only if you
specifically want the site on Vercel. Steps:

1. upstash.com → create Redis DB → copy `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
2. vercel.com/new → import repo (preset **Other**, no build command) → add the two `UPSTASH_*` vars
3. Railway → deploy repo with **Root Directory `worker`** → add the two
   `UPSTASH_*` vars + provider keys + race tuning (see `worker/.env.example`)

The worker auto-detects Upstash and uses it instead of local files.

## After launch (either mode)

- **Rotate all three provider keys** (delete + regenerate, update Railway
  variables). The originals passed through chat during setup.
- Wire the footer buttons to the real X URL / token contract / chart link
  (`index.html`, `.btnrow`).

## Budget dial

| `RACE_INTERVAL_MS` | Cadence | Rough total cost (default models) |
|---|---|---|
| `3600000` | 1 attempt/model/hour | ~$5–7/day  ← recommended start |
| `1800000` | every 30 min | ~$10–15/day |
| `600000`  | every 10 min | ~$30–40/day |

Budget mode (`ANTHROPIC_MODEL=claude-haiku-4-5`, `OPENAI_MODEL=gpt-5-mini`,
`XAI_MODEL=grok-4.3`): ~$1–2/day at hourly cadence.

## Verified working (2026-07-24)

- All three keys valid; all three request shapes smoke-tested live ✅
- Default models confirmed to exist: `claude-opus-4-8`, `gpt-5`, `grok-4.5`
  (bare `grok-4` no longer exists on xAI — already fixed)
- All-in-one server tested: static site, `/api/feed`, live-mode flip,
  path-traversal and `.env` access blocked ✅
- Key-scrubbing active: nothing key-shaped can reach the public feed or logs
- `.env` gitignored; no secrets in the repo
