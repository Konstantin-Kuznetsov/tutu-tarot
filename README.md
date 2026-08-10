# Таро-турагент

Next.js prototype for Tutu AI Hackathon 2026.

The app performs a 3D tarot ritual, chooses a Russian destination from a curated Tutu-inspired atlas, narrates the result with optional AI, and searches real transport and hotel options through Tutu MCP.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

Copy `.env.example` to `.env.local` when AI narration is needed.

`OPENAI_API_KEY` is optional. Without it, the app uses template narration.

`TUTU_MCP_URL` defaults to `https://mcp.tutu.ru/mcp`.

## Verification

```bash
npm run test
npm run build
npm run test:e2e
```

### Live smoke against real Tutu MCP

```bash
PORT=3100 npm run dev   # in one terminal
npm run smoke           # in another
```

`npm run smoke` runs `scripts/smoke-ritual.mjs`, which posts two ritual
requests (a short haul and a long haul) to a running dev server and checks
that each response has 3 cards, a destination, and — when `roadChoice.mode`
is set — that the third card actually serves that mode and the hero offer
links to `tutu.ru`. It needs a running dev server (`SMOKE_BASE_URL` overrides
the default `http://127.0.0.1:3100`) and live network access to Tutu MCP. It
is the only check in this repo that would catch a drift in the MCP contract
(wrong tool name, a renamed field, an invalid mode literal) — every other
test runs against a mock. If MCP is unreachable, `/api/ritual` still returns
HTTP 200 with `roadChoice.mode: null` and a fog reason; the smoke script
treats that as a reportable outcome, not a crash, but it is not the same as
a verified contract.

## Card artwork

The 22 Major Arcana are scans of the Rider-Waite-Smith deck (published 1909,
artwork by Pamela Colman Smith, died 1951), obtained from Wikimedia Commons and
in the public domain. `npm run tarot:images` downloads the originals, applies a
single duotone treatment, and writes the committed WebP files under
`public/tarot/`. The script is run by hand; nothing is fetched at runtime.

## Deployment

Deploy as a standard Next.js app on Vercel. Configure `OPENAI_API_KEY` only if live AI narration is required for the demo.
