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

## Simulation mode

The attempt feed and counters are currently a **client-side simulation** (and
the site says so on-page). To wire up real attempt logs, replace the
`ENGINE`/`tick()` section in `app.js` with a fetch or WebSocket to your
backend and keep the same render calls.

## Honesty clause

No AI model has solved a Millennium Prize Problem. If this site ever claims
otherwise, demand a peer-reviewed proof, not a screenshot. See `WARNING.TXT`
on the desktop.
