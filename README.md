# Таро-турагент

Next.js prototype for Tutu AI Hackathon 2026.

The app performs a tarot ritual, chooses a Russian destination from a curated Tutu-inspired atlas, narrates the result with optional AI, and searches real transport and hotel options through Tutu MCP.

## Local Development

```bash
npm install
PORT=3100 npm run dev
```

Open `http://localhost:3100`.

## Environment

Copy `.env.example` to `.env.local` when AI narration is needed.

`TUTU_MCP_URL` defaults to `https://mcp.tutu.ru/mcp`.

## AI narration

AI narration is optional. With no `AI_API_KEY` (or legacy `OPENAI_API_KEY`)
configured, the app degrades to written-in template copy — the same
headline, opening and card text every time, deterministic and free.

When a key is configured, the model writes the three card readings (one per
drawn card, aware of the card's name, its position in the spread and whether
it fell reversed) and one closing line, in Russian. That is the entire
surface it controls.

It cannot touch the destination, its region, the road choice (transport
mode, price, links) or the Tutu source attribution. Those are rendered
straight from `RitualResult` — deterministic tarot-atlas scoring plus a real
Tutu MCP search — regardless of what the model returns; there is no code
path from the model's output to any of those fields.

Free-text output from a model can't be proven safe by pattern-matching
alone: a lexical check catches known place names, not ones we've never
curated. `validateNarration` (`src/server/oracle/validate.ts`) rejects known
`travelAtlas` names other than the chosen one, URLs, non-Cyrillic text and
out-of-range length — it reduces bad copy, it does not eliminate it. The
real guarantee is structural: the route itself is never asked of the model
and is never read from its reply, so nothing a validation gap lets through
can redirect the trip. Any failure at any stage — no key, network error,
timeout (8s, so a slow gateway can't eat the route's 30s budget), invalid
JSON, or a validation rejection — falls back to the template unchanged.

Point this at a different provider or a corporate gateway purely through
environment variables — no code change required:

| Variable | Meaning | Default |
| --- | --- | --- |
| `AI_BASE_URL` | Chat-completions endpoint | `https://api.openai.com/v1/chat/completions` |
| `AI_API_KEY` | Credential (falls back to `OPENAI_API_KEY`) | — |
| `AI_MODEL` | Model identifier | `gpt-4.1-mini` |
| `AI_AUTH_HEADER` | Header carrying the credential | `Authorization` |
| `AI_AUTH_PREFIX` | Value prefix before the credential | `Bearer ` |

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

Deploy as a standard Next.js app on Vercel. Configure `AI_API_KEY` (and, if
pointing at a non-default gateway, `AI_BASE_URL`/`AI_MODEL`/`AI_AUTH_HEADER`/
`AI_AUTH_PREFIX`) only if live AI narration is required for the demo.
