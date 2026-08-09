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

## Deployment

Deploy as a standard Next.js app on Vercel. Configure `OPENAI_API_KEY` only if live AI narration is required for the demo.
