# Launch runbook — ~10 minutes of clicking

Everything in code is done and verified against all three live APIs.
These are the only steps that require the account owner (login + billing walls).

## 1. Upstash (2 min, free) — the attempt log

1. [upstash.com](https://upstash.com) → sign in with GitHub → **Create Database** (Redis, any region)
2. On the database page, copy **`UPSTASH_REDIS_REST_URL`** and **`UPSTASH_REDIS_REST_TOKEN`**

## 2. Vercel (3 min) — the site

1. [vercel.com/new](https://vercel.com/new) → Import this GitHub repo
2. Framework preset: **Other** · Build command: *(empty)* · Output dir: *(default)*
3. Environment Variables → add the two `UPSTASH_*` values (nothing else — provider keys never go here)
4. Deploy. Done — site + `/api/feed` are live. It shows SIMULATION MODE until the worker runs.

## 3. Spending caps (3 min) — do this BEFORE the worker starts

Set a monthly limit in each dashboard:
- OpenAI: platform.openai.com → Settings → Limits
- Anthropic: platform.claude.com → Settings → Limits
- xAI: console.x.ai → billing settings

## 4. Railway (4 min, ~$5/mo) — the 24/7 worker

1. [railway.app](https://railway.app) → New Project → **Deploy from GitHub repo** → pick this repo
2. Service settings → **Root Directory: `worker`**
3. Variables → paste the full block from `worker/.env.example`, filled in:
   the two Upstash values + the three provider keys + the race tuning lines
4. Deploy. Watch the logs — you should see:
   `THE RACE worker: claude, gpt, grok — one attempt each every 60 min`
5. Within one interval, the site flips to **LIVE MODE** on its own.

## 5. After it's running

- **Rotate all three provider keys** (delete + regenerate in each dashboard, update
  Railway variables). The originals passed through chat during setup — rotation
  closes that loop.
- Update the footer buttons with the real X URL / token contract / chart link
  (`index.html`, `.btnrow`).

## Budget dial

| `RACE_INTERVAL_MS` | Cadence | Rough total cost (default models) |
|---|---|---|
| `3600000` | 1 attempt/model/hour | ~$5–7/day  ← recommended start |
| `1800000` | every 30 min | ~$10–15/day |
| `600000`  | every 10 min | ~$30–40/day |

Budget mode (`claude-haiku-4-5` + `gpt-5-mini` + `grok-4.3`): ~$1–2/day at hourly cadence.

## Verified working (2026-07-24)

- All three keys valid; all three request shapes smoke-tested live ✅
- Default models confirmed to exist: `claude-opus-4-8`, `gpt-5`, `grok-4.5`
  (note: bare `grok-4` no longer exists on xAI — already fixed in the worker)
- Key-scrubbing active: nothing key-shaped can reach the public feed or logs
- `.env` confirmed gitignored; no secrets in the repo
