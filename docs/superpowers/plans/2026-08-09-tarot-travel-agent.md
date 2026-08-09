# Tarot Travel Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vercel-ready Next.js prototype where a 3D tarot ritual chooses a Russian travel destination and confirms it with Tutu MCP transport and hotel offers.

**Architecture:** Use Next.js App Router with a client-side 3D ritual scene and server-side route handlers for AI narration plus Tutu MCP. Keep domain selection deterministic through local tarot and travel atlas modules, then layer AI copy and MCP results on top.

**Tech Stack:** Next.js App Router, TypeScript, React, React Three Fiber, Three.js, Motion for React, Vitest, Testing Library, Playwright, server-side fetch, optional OpenAI-compatible AI narration.

## Global Constraints

- The first screen is the actual product experience, not a marketing landing page.
- The selected direction is `3D-сеанс`.
- The app chooses destinations only in Russia.
- `https://provereno.tutu.ru/` is the primary editorial source.
- `https://www.tutu.ru/geo/` is the secondary Tutu source.
- The runtime should not scrape these sites on every user request.
- Destination selection should be deterministic and explainable.
- Use AI only to narrate the chosen match, not to invent arbitrary destinations.
- Tutu MCP is mandatory for practical results.
- The browser must not call Tutu MCP directly.
- Tutu editorial links should appear after the ritual result, not inside the initial card reveal.
- The app should be deployable to Vercel without custom servers.
- No runtime filesystem writes.
- No long-running background processes.
- Motion should respect `prefers-reduced-motion`.
- The main page must work on mobile and desktop.
- User accounts, payments, booking inside the app, full 78-card deck completeness, multi-step trip planning, user-edited destination preferences, and runtime scraping are out of scope for MVP.

---

## File Structure

- `package.json`: scripts and dependencies for Next.js, tests, and browser checks.
- `tsconfig.json`: TypeScript configuration.
- `next.config.ts`: Next.js configuration.
- `vitest.config.ts`: unit/integration test configuration.
- `playwright.config.ts`: browser test configuration.
- `src/app/layout.tsx`: app shell metadata and global styles.
- `src/app/page.tsx`: main product page.
- `src/app/globals.css`: visual theme and responsive layout.
- `src/app/api/ritual/route.ts`: API route for the ritual request.
- `src/domain/types.ts`: shared domain interfaces.
- `src/domain/tarot/cards.ts`: MVP tarot card set.
- `src/domain/tarot/engine.ts`: deterministic card draw and archetype mapping.
- `src/domain/travel/atlas.ts`: curated Russian travel atlas.
- `src/domain/travel/scoring.ts`: deterministic destination scoring.
- `src/server/oracle/narrator.ts`: AI narration wrapper and template fallback.
- `src/server/tutu/mcpClient.ts`: server-side Tutu MCP JSON-RPC client.
- `src/server/tutu/normalize.ts`: offer normalization for UI.
- `src/server/ritual/runRitual.ts`: orchestration service used by the API route.
- `src/components/TripIntentForm.tsx`: form for departure city, dates, travelers.
- `src/components/RitualStage.tsx`: client state machine and timeline coordination.
- `src/components/RitualScene3D.tsx`: React Three Fiber table, deck, cards, camera.
- `src/components/RitualSceneFallback.tsx`: reduced-motion and 3D failure fallback.
- `src/components/TarotCardView.tsx`: reusable card face/back UI.
- `src/components/TravelResult.tsx`: prediction, source proof links, offers.
- `src/components/OfferList.tsx`: transport and hotel offer rendering.
- `tests/domain/tarot-engine.test.ts`: tarot determinism tests.
- `tests/domain/travel-scoring.test.ts`: atlas scoring tests.
- `tests/server/narrator.test.ts`: AI fallback tests.
- `tests/server/tutu-normalize.test.ts`: MCP normalization tests.
- `tests/server/run-ritual.test.ts`: orchestration tests.
- `tests/api/ritual-route.test.ts`: route-level contract tests.
- `tests/e2e/ritual-flow.spec.ts`: browser flow test.

---

### Task 1: Project Foundation

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `tests/project-foundation.test.ts`

**Interfaces:**
- Produces: a runnable Next.js project with `npm run dev`, `npm run test`, `npm run lint`, `npm run build`, and `npm run test:e2e`.
- Consumes: existing `.gitignore` and design spec.

- [ ] **Step 1: Install dependencies**

Run:

```bash
npm install next@latest react@latest react-dom@latest three @react-three/fiber @react-three/drei motion zod
npm install -D typescript @types/node @types/react @types/react-dom eslint eslint-config-next vitest jsdom @testing-library/react @testing-library/jest-dom @playwright/test
```

Expected: `package.json` and `package-lock.json` are created or updated.

- [ ] **Step 2: Write the package scripts**

Create `package.json` with these scripts while preserving dependency versions installed by npm:

```json
{
  "name": "tutu-ai-hackathon26",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 3: Add TypeScript and Next configuration**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

- [ ] **Step 4: Add test configuration**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
```

Create `tests/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } }
  ],
});
```

- [ ] **Step 5: Add minimal app shell**

Create `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Таро-турагент",
  description: "3D tarot ritual for Russian travel planning with Tutu routes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
```

Create `src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main className="app-shell">
      <section className="ritual-surface">
        <h1>Таро-турагент</h1>
        <p>Колода выберет маршрут по России, а Туту подтвердит дорогу.</p>
      </section>
    </main>
  );
}
```

Create `src/app/globals.css`:

```css
:root {
  color-scheme: dark;
  --ink: #f4edf7;
  --muted: #c8bed1;
  --bg: #151016;
  --wine: #7a1f35;
  --jade: #1a8f7a;
  --brass: #c59b4d;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
  font-family: Arial, Helvetica, sans-serif;
}

button,
input {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.ritual-surface {
  width: min(100%, 1080px);
}
```

- [ ] **Step 6: Write the foundation test**

Create `tests/project-foundation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("project foundation", () => {
  it("enables React strict mode", () => {
    expect(nextConfig.reactStrictMode).toBe(true);
  });
});
```

- [ ] **Step 7: Run foundation checks**

Run:

```bash
npm run test -- tests/project-foundation.test.ts
npm run build
```

Expected: both commands pass.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts vitest.config.ts playwright.config.ts src/app tests
git commit -m "chore: scaffold next app"
```

---

### Task 2: Tarot And Travel Domain

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/tarot/cards.ts`
- Create: `src/domain/tarot/engine.ts`
- Create: `src/domain/travel/atlas.ts`
- Create: `src/domain/travel/scoring.ts`
- Create: `tests/domain/tarot-engine.test.ts`
- Create: `tests/domain/travel-scoring.test.ts`

**Interfaces:**
- Produces: `drawTarotSpread(input: TarotDrawInput): TarotSpread`
- Produces: `selectDestination(input: DestinationSelectionInput): DestinationSelection`
- Consumes: no application runtime modules.

- [ ] **Step 1: Write tarot determinism tests**

Create `tests/domain/tarot-engine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { drawTarotSpread } from "@/domain/tarot/engine";

describe("drawTarotSpread", () => {
  it("returns the same cards for the same normalized inputs", () => {
    const input = {
      departureCity: "Москва",
      dateFrom: "2026-09-10",
      dateTo: "2026-09-17",
      travelerCount: 2,
    };

    expect(drawTarotSpread(input)).toEqual(drawTarotSpread(input));
  });

  it("returns three named card positions", () => {
    const spread = drawTarotSpread({
      departureCity: "Пермь",
      dateFrom: "2026-10-01",
      dateTo: "2026-10-05",
      travelerCount: 1,
    });

    expect(spread.cards.map((card) => card.position)).toEqual([
      "Зов",
      "Путь",
      "Дар маршрута",
    ]);
    expect(new Set(spread.cards.map((card) => card.id)).size).toBe(3);
  });
});
```

- [ ] **Step 2: Run tarot test to verify it fails**

Run:

```bash
npm run test -- tests/domain/tarot-engine.test.ts
```

Expected: FAIL because `@/domain/tarot/engine` does not exist.

- [ ] **Step 3: Add domain types and tarot engine**

Create `src/domain/types.ts`:

```ts
export type TarotPosition = "Зов" | "Путь" | "Дар маршрута";

export type TarotArchetype =
  | "solitude"
  | "road"
  | "cliffs"
  | "water"
  | "north"
  | "culture"
  | "food"
  | "sun"
  | "renewal"
  | "mystery";

export interface TripIntent {
  departureCity: string;
  dateFrom: string;
  dateTo: string;
  travelerCount: number;
}

export interface TarotCardDefinition {
  id: string;
  name: string;
  image?: string;
  archetypes: TarotArchetype[];
  meaning: string;
}

export interface DrawnTarotCard extends TarotCardDefinition {
  position: TarotPosition;
}

export interface TarotSpread {
  seed: string;
  cards: DrawnTarotCard[];
  archetypes: TarotArchetype[];
}

export interface TravelAtlasItem {
  id: string;
  name: string;
  region: string;
  routeTitle: string;
  anchorPlace: string;
  nearestTransportHub: string;
  hotelSearchCity: string;
  tags: string[];
  season: string[];
  mood: string[];
  tarotArchetypes: TarotArchetype[];
  source: "provereno.tutu" | "geo.tutu" | "fallback";
  sourceUrl: string;
  geoUrl?: string;
  image?: string;
}

export interface DestinationSelection {
  destination: TravelAtlasItem;
  score: number;
  reasons: string[];
}
```

Create `src/domain/tarot/cards.ts`:

```ts
import type { TarotCardDefinition } from "@/domain/types";

export const tarotCards: TarotCardDefinition[] = [
  {
    id: "hermit",
    name: "Отшельник",
    archetypes: ["solitude", "mystery", "cliffs"],
    meaning: "дорога к тишине и высокому месту",
  },
  {
    id: "chariot",
    name: "Колесница",
    archetypes: ["road", "renewal"],
    meaning: "путь складывается через движение и смену горизонта",
  },
  {
    id: "tower",
    name: "Башня",
    archetypes: ["cliffs", "renewal"],
    meaning: "камень, высота и резкая перемена взгляда",
  },
  {
    id: "star",
    name: "Звезда",
    archetypes: ["north", "water", "mystery"],
    meaning: "северный свет, вода и надежда",
  },
  {
    id: "sun",
    name: "Солнце",
    archetypes: ["sun", "food", "renewal"],
    meaning: "тепло, вкус и открытая дорога",
  },
  {
    id: "lovers",
    name: "Влюбленные",
    archetypes: ["culture", "food", "water"],
    meaning: "место для близости, прогулок и красивого выбора",
  },
  {
    id: "wheel",
    name: "Колесо Фортуны",
    archetypes: ["road", "mystery"],
    meaning: "маршрут сам поворачивает в нужную сторону",
  },
  {
    id: "judgement",
    name: "Суд",
    archetypes: ["culture", "renewal"],
    meaning: "старые истории возвращаются новым смыслом",
  },
];
```

Create `src/domain/tarot/engine.ts`:

```ts
import type { TarotArchetype, TarotPosition, TarotSpread, TripIntent } from "@/domain/types";
import { tarotCards } from "./cards";

const positions: TarotPosition[] = ["Зов", "Путь", "Дар маршрута"];

function normalizeIntent(input: TripIntent): string {
  return [
    input.departureCity.trim().toLocaleLowerCase("ru-RU"),
    input.dateFrom,
    input.dateTo,
    String(input.travelerCount),
  ].join("|");
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 4294967296;
  };
}

export function drawTarotSpread(input: TripIntent): TarotSpread {
  const seed = normalizeIntent(input);
  const random = nextRandom(hashSeed(seed));
  const deck = [...tarotCards];
  const cards = positions.map((position) => {
    const index = Math.floor(random() * deck.length);
    const [card] = deck.splice(index, 1);
    return { ...card, position };
  });
  const archetypes = Array.from(
    new Set(cards.flatMap((card) => card.archetypes)),
  ) as TarotArchetype[];

  return { seed, cards, archetypes };
}
```

- [ ] **Step 4: Run tarot test to verify it passes**

Run:

```bash
npm run test -- tests/domain/tarot-engine.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write destination scoring tests**

Create `tests/domain/travel-scoring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { selectDestination } from "@/domain/travel/scoring";

describe("selectDestination", () => {
  it("selects Usvinskie Stolby for cliffs and road archetypes", () => {
    const result = selectDestination({
      archetypes: ["cliffs", "road", "solitude"],
      dateFrom: "2026-09-10",
      dateTo: "2026-09-17",
      departureCity: "Москва",
      travelerCount: 2,
    });

    expect(result.destination.id).toBe("usvinskie-stolby");
    expect(result.reasons.join(" ")).toContain("cliffs");
  });

  it("returns a Russian destination with Tutu source metadata", () => {
    const result = selectDestination({
      archetypes: ["north", "water", "mystery"],
      dateFrom: "2026-02-10",
      dateTo: "2026-02-14",
      departureCity: "Санкт-Петербург",
      travelerCount: 1,
    });

    expect(result.destination.region.length).toBeGreaterThan(0);
    expect(result.destination.sourceUrl).toMatch(/^https:\/\//);
  });
});
```

- [ ] **Step 6: Run destination test to verify it fails**

Run:

```bash
npm run test -- tests/domain/travel-scoring.test.ts
```

Expected: FAIL because `@/domain/travel/scoring` does not exist.

- [ ] **Step 7: Add the travel atlas and scoring**

Create `src/domain/travel/atlas.ts`:

```ts
import type { TravelAtlasItem } from "@/domain/types";

export const travelAtlas: TravelAtlasItem[] = [
  {
    id: "usvinskie-stolby",
    name: "Усьвинские Столбы",
    region: "Пермский край",
    routeTitle: "Каменная дорога к Усьвинским Столбам",
    anchorPlace: "Усьвинские Столбы",
    nearestTransportHub: "Пермь",
    hotelSearchCity: "Пермь",
    tags: ["cliffs", "railway", "nature", "silence"],
    season: ["spring", "summer", "autumn"],
    mood: ["dramatic", "solitude", "road"],
    tarotArchetypes: ["cliffs", "road", "solitude", "mystery"],
    source: "fallback",
    sourceUrl: "https://ru.wikipedia.org/wiki/Усьвинские_Столбы",
    geoUrl: "https://www.tutu.ru/geo/",
  },
  {
    id: "karelia-ruskeala",
    name: "Рускеала",
    region: "Республика Карелия",
    routeTitle: "Мрамор, вода и северная дорога",
    anchorPlace: "Горный парк Рускеала",
    nearestTransportHub: "Сортавала",
    hotelSearchCity: "Сортавала",
    tags: ["water", "stone", "north", "train"],
    season: ["spring", "summer", "autumn", "winter"],
    mood: ["mystery", "renewal"],
    tarotArchetypes: ["water", "north", "mystery", "road"],
    source: "geo.tutu",
    sourceUrl: "https://www.tutu.ru/geo/",
  },
  {
    id: "murmansk-teriberka",
    name: "Териберка",
    region: "Мурманская область",
    routeTitle: "Северный край, океан и звезда",
    anchorPlace: "Териберка",
    nearestTransportHub: "Мурманск",
    hotelSearchCity: "Мурманск",
    tags: ["north", "water", "aurora", "edge"],
    season: ["winter", "spring", "autumn"],
    mood: ["mystery", "solitude"],
    tarotArchetypes: ["north", "water", "star", "mystery"],
    source: "provereno.tutu",
    sourceUrl: "https://provereno.tutu.ru/",
    geoUrl: "https://www.tutu.ru/geo/",
  },
  {
    id: "kaliningrad",
    name: "Калининградская область",
    region: "Калининградская область",
    routeTitle: "Балтийская прогулка и янтарный свет",
    anchorPlace: "Калининград",
    nearestTransportHub: "Калининград",
    hotelSearchCity: "Калининград",
    tags: ["water", "culture", "food", "sea"],
    season: ["spring", "summer", "autumn"],
    mood: ["culture", "food", "sun"],
    tarotArchetypes: ["water", "culture", "food", "sun"],
    source: "provereno.tutu",
    sourceUrl: "https://provereno.tutu.ru/",
    geoUrl: "https://www.tutu.ru/geo/",
  },
  {
    id: "suzdal",
    name: "Суздаль",
    region: "Владимирская область",
    routeTitle: "Белокаменный город и тихий поворот времени",
    anchorPlace: "Суздаль",
    nearestTransportHub: "Владимир",
    hotelSearchCity: "Суздаль",
    tags: ["culture", "history", "slow"],
    season: ["spring", "summer", "autumn", "winter"],
    mood: ["culture", "renewal"],
    tarotArchetypes: ["culture", "renewal", "solitude"],
    source: "geo.tutu",
    sourceUrl: "https://www.tutu.ru/geo/",
  },
];
```

Create `src/domain/travel/scoring.ts`:

```ts
import type { DestinationSelection, TarotArchetype, TripIntent } from "@/domain/types";
import { travelAtlas } from "./atlas";

export interface DestinationSelectionInput extends TripIntent {
  archetypes: TarotArchetype[];
}

function monthToSeason(month: number): string {
  if ([12, 1, 2].includes(month)) return "winter";
  if ([3, 4, 5].includes(month)) return "spring";
  if ([6, 7, 8].includes(month)) return "summer";
  return "autumn";
}

export function selectDestination(input: DestinationSelectionInput): DestinationSelection {
  const month = Number(input.dateFrom.slice(5, 7));
  const season = monthToSeason(month);
  const scored = travelAtlas.map((destination) => {
    const archetypeHits = destination.tarotArchetypes.filter((tag) =>
      input.archetypes.includes(tag),
    );
    const seasonScore = destination.season.includes(season) ? 2 : 0;
    const sourceScore = destination.source === "provereno.tutu" ? 1.5 : destination.source === "geo.tutu" ? 1 : 0;
    const score = archetypeHits.length * 3 + seasonScore + sourceScore;

    return {
      destination,
      score,
      reasons: [
        ...archetypeHits.map((tag) => `matched archetype ${tag}`),
        `season ${season}`,
        `source ${destination.source}`,
      ],
    };
  });

  scored.sort((a, b) => b.score - a.score || a.destination.name.localeCompare(b.destination.name, "ru"));
  return scored[0];
}
```

- [ ] **Step 8: Run domain tests**

Run:

```bash
npm run test -- tests/domain/tarot-engine.test.ts tests/domain/travel-scoring.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/domain tests/domain
git commit -m "feat: add tarot and travel domain"
```

---

### Task 3: AI Narration With Template Fallback

**Files:**
- Create: `src/server/oracle/narrator.ts`
- Create: `tests/server/narrator.test.ts`

**Interfaces:**
- Consumes: `TripIntent`, `TarotSpread`, `DestinationSelection`
- Produces: `createPrediction(input: PredictionInput): Promise<PredictionText>`

- [ ] **Step 1: Write narration fallback tests**

Create `tests/server/narrator.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createPrediction } from "@/server/oracle/narrator";

describe("createPrediction", () => {
  it("returns template prediction when no AI key is configured", async () => {
    const result = await createPrediction({
      intent: {
        departureCity: "Москва",
        dateFrom: "2026-09-10",
        dateTo: "2026-09-17",
        travelerCount: 2,
      },
      spread: {
        seed: "москва|2026-09-10|2026-09-17|2",
        archetypes: ["cliffs", "road"],
        cards: [
          { id: "tower", name: "Башня", position: "Зов", archetypes: ["cliffs"], meaning: "камень и высота" },
          { id: "chariot", name: "Колесница", position: "Путь", archetypes: ["road"], meaning: "дорога" },
          { id: "hermit", name: "Отшельник", position: "Дар маршрута", archetypes: ["solitude"], meaning: "тишина" },
        ],
      },
      selection: {
        score: 10,
        reasons: ["matched archetype cliffs"],
        destination: {
          id: "usvinskie-stolby",
          name: "Усьвинские Столбы",
          region: "Пермский край",
          routeTitle: "Каменная дорога",
          anchorPlace: "Усьвинские Столбы",
          nearestTransportHub: "Пермь",
          hotelSearchCity: "Пермь",
          tags: ["cliffs"],
          season: ["autumn"],
          mood: ["dramatic"],
          tarotArchetypes: ["cliffs", "road"],
          source: "fallback",
          sourceUrl: "https://ru.wikipedia.org/wiki/Усьвинские_Столбы",
        },
      },
      offers: { transport: [], hotels: [] },
      aiApiKey: undefined,
    });

    expect(result.headline).toContain("Усьвинские Столбы");
    expect(result.cardReadings).toHaveLength(3);
    expect(result.summary).toContain("Пермский край");
  });
});
```

- [ ] **Step 2: Run narration test to verify it fails**

Run:

```bash
npm run test -- tests/server/narrator.test.ts
```

Expected: FAIL because `@/server/oracle/narrator` does not exist.

- [ ] **Step 3: Implement narrator**

Create `src/server/oracle/narrator.ts`:

```ts
import type { DestinationSelection, TarotSpread, TripIntent } from "@/domain/types";

export interface OfferHighlights {
  transport: string[];
  hotels: string[];
}

export interface PredictionInput {
  intent: TripIntent;
  spread: TarotSpread;
  selection: DestinationSelection;
  offers: OfferHighlights;
  aiApiKey?: string;
}

export interface PredictionText {
  headline: string;
  opening: string;
  cardReadings: Array<{
    position: string;
    cardName: string;
    text: string;
  }>;
  summary: string;
}

function templatePrediction(input: PredictionInput): PredictionText {
  const { destination } = input.selection;
  return {
    headline: `Карты указывают на ${destination.name}`,
    opening: `Маршрут из города ${input.intent.departureCity} тянется к месту, где ${destination.routeTitle.toLocaleLowerCase("ru-RU")}.`,
    cardReadings: input.spread.cards.map((card) => ({
      position: card.position,
      cardName: card.name,
      text: `${card.name} в позиции «${card.position}» говорит: ${card.meaning}. Поэтому ${destination.anchorPlace} становится главным знаком расклада.`,
    })),
    summary: `Предсказание ведет в ${destination.region}. Практическая часть маршрута ищется через Туту: дорога до ${destination.nearestTransportHub}, отели в городе ${destination.hotelSearchCity}.`,
  };
}

export async function createPrediction(input: PredictionInput): Promise<PredictionText> {
  if (!input.aiApiKey) {
    return templatePrediction(input);
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.aiApiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: "Write theatrical Russian tarot travel copy. Do not invent destinations. Do not claim supernatural certainty.",
          },
          {
            role: "user",
            content: JSON.stringify({
              intent: input.intent,
              cards: input.spread.cards,
              destination: input.selection.destination,
              offers: input.offers,
            }),
          },
        ],
      }),
    });

    if (!response.ok) return templatePrediction(input);
    const data = (await response.json()) as { output_text?: string };
    const text = data.output_text?.trim();
    if (!text) return templatePrediction(input);

    return {
      headline: `Карты указывают на ${input.selection.destination.name}`,
      opening: text,
      cardReadings: input.spread.cards.map((card) => ({
        position: card.position,
        cardName: card.name,
        text: `${card.name}: ${card.meaning}`,
      })),
      summary: `Маршрут подтверждается источниками Туту и поиском вариантов дороги.`,
    };
  } catch {
    return templatePrediction(input);
  }
}
```

- [ ] **Step 4: Run narration test**

Run:

```bash
npm run test -- tests/server/narrator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/oracle tests/server/narrator.test.ts
git commit -m "feat: add oracle narration fallback"
```

---

### Task 4: Tutu MCP Client And Offer Normalization

**Files:**
- Create: `src/server/tutu/mcpClient.ts`
- Create: `src/server/tutu/normalize.ts`
- Create: `tests/server/tutu-normalize.test.ts`

**Interfaces:**
- Produces: `searchTutuOffers(input: TutuSearchInput): Promise<TutuSearchResult>`
- Produces: `normalizeTransportOffers(raw: unknown): NormalizedOffer[]`
- Produces: `normalizeHotelOffers(raw: unknown): NormalizedOffer[]`
- Consumes: `TripIntent` and selected `TravelAtlasItem`

- [ ] **Step 1: Write normalization tests**

Create `tests/server/tutu-normalize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeHotelOffers, normalizeTransportOffers } from "@/server/tutu/normalize";

describe("Tutu offer normalization", () => {
  it("normalizes transport offers with price and checkout URL", () => {
    const offers = normalizeTransportOffers({
      items: [
        {
          title: "Москва - Пермь",
          price: { amount: 4200, currency: "RUB" },
          checkout_url: "https://www.tutu.ru/checkout/example",
          departure: "10:00",
          arrival: "18:30",
        },
      ],
    });

    expect(offers[0]).toEqual({
      id: "transport-0",
      title: "Москва - Пермь",
      price: "4200 RUB",
      subtitle: "10:00 - 18:30",
      url: "https://www.tutu.ru/checkout/example",
    });
  });

  it("returns an empty list for unknown hotel payloads", () => {
    expect(normalizeHotelOffers({ unexpected: true })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run normalization test to verify it fails**

Run:

```bash
npm run test -- tests/server/tutu-normalize.test.ts
```

Expected: FAIL because `@/server/tutu/normalize` does not exist.

- [ ] **Step 3: Implement normalization**

Create `src/server/tutu/normalize.ts`:

```ts
export interface NormalizedOffer {
  id: string;
  title: string;
  price?: string;
  subtitle?: string;
  url?: string;
}

function readItems(raw: unknown): unknown[] {
  if (raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)) {
    return (raw as { items: unknown[] }).items;
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readPrice(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const price = value as { amount?: unknown; currency?: unknown };
  if (typeof price.amount !== "number") return undefined;
  return `${price.amount} ${typeof price.currency === "string" ? price.currency : "RUB"}`;
}

export function normalizeTransportOffers(raw: unknown): NormalizedOffer[] {
  return readItems(raw).slice(0, 5).map((item, index) => {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const departure = readString(record.departure);
    const arrival = readString(record.arrival);
    return {
      id: `transport-${index}`,
      title: readString(record.title) || "Вариант дороги",
      price: readPrice(record.price),
      subtitle: departure && arrival ? `${departure} - ${arrival}` : readString(record.subtitle),
      url: readString(record.checkout_url) || readString(record.checkoutUrl) || readString(record.url),
    };
  });
}

export function normalizeHotelOffers(raw: unknown): NormalizedOffer[] {
  return readItems(raw).slice(0, 5).map((item, index) => {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      id: `hotel-${index}`,
      title: readString(record.name) || readString(record.title) || "Вариант проживания",
      price: readPrice(record.price),
      subtitle: readString(record.address) || readString(record.subtitle),
      url: readString(record.checkout_url) || readString(record.checkoutUrl) || readString(record.url),
    };
  });
}
```

- [ ] **Step 4: Implement MCP client**

Create `src/server/tutu/mcpClient.ts`:

```ts
import type { TravelAtlasItem, TripIntent } from "@/domain/types";
import { normalizeHotelOffers, normalizeTransportOffers, type NormalizedOffer } from "./normalize";

const DEFAULT_MCP_URL = "https://mcp.tutu.ru/mcp";

export interface TutuSearchInput {
  intent: TripIntent;
  destination: TravelAtlasItem;
  endpoint?: string;
}

export interface TutuSearchResult {
  transport: NormalizedOffer[];
  hotels: NormalizedOffer[];
  warnings: string[];
}

async function callTool(endpoint: string, name: string, args: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${name}-${Date.now()}`,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  if (!response.ok) throw new Error(`Tutu MCP ${name} failed with ${response.status}`);
  return response.json();
}

export async function searchTutuOffers(input: TutuSearchInput): Promise<TutuSearchResult> {
  const endpoint = input.endpoint || process.env.TUTU_MCP_URL || DEFAULT_MCP_URL;
  const warnings: string[] = [];
  let transport: NormalizedOffer[] = [];
  let hotels: NormalizedOffer[] = [];

  try {
    const rawTransport = await callTool(endpoint, "search_multitransport", {
      from: input.intent.departureCity,
      to: input.destination.nearestTransportHub,
      date: input.intent.dateFrom,
      passengers: input.intent.travelerCount,
      page_size: 5,
    });
    transport = normalizeTransportOffers(rawTransport);
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Tutu transport search failed");
  }

  try {
    const rawHotels = await callTool(endpoint, "search_hotels", {
      city: input.destination.hotelSearchCity,
      date_from: input.intent.dateFrom,
      date_to: input.intent.dateTo,
      guests: input.intent.travelerCount,
      page_size: 5,
    });
    hotels = normalizeHotelOffers(rawHotels);
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Tutu hotel search failed");
  }

  return { transport, hotels, warnings };
}
```

- [ ] **Step 5: Run Tutu server tests**

Run:

```bash
npm run test -- tests/server/tutu-normalize.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/tutu tests/server/tutu-normalize.test.ts
git commit -m "feat: add tutu mcp client"
```

---

### Task 5: Ritual Orchestration And API Route

**Files:**
- Create: `src/server/ritual/runRitual.ts`
- Create: `src/app/api/ritual/route.ts`
- Create: `tests/server/run-ritual.test.ts`
- Create: `tests/api/ritual-route.test.ts`

**Interfaces:**
- Consumes: `drawTarotSpread`, `selectDestination`, `createPrediction`, `searchTutuOffers`
- Produces: `runRitual(input: TripIntent, deps?: RitualDeps): Promise<RitualResult>`
- Produces: `POST /api/ritual`

- [ ] **Step 1: Write orchestration test**

Create `tests/server/run-ritual.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runRitual } from "@/server/ritual/runRitual";

describe("runRitual", () => {
  it("returns cards, destination, prediction, source links, and offer arrays", async () => {
    const result = await runRitual(
      {
        departureCity: "Москва",
        dateFrom: "2026-09-10",
        dateTo: "2026-09-17",
        travelerCount: 2,
      },
      {
        searchOffers: async () => ({
          transport: [{ id: "transport-0", title: "Москва - Пермь", price: "4200 RUB" }],
          hotels: [{ id: "hotel-0", title: "Отель в Перми" }],
          warnings: [],
        }),
        aiApiKey: undefined,
      },
    );

    expect(result.cards).toHaveLength(3);
    expect(result.destination.name.length).toBeGreaterThan(0);
    expect(result.prediction.headline.length).toBeGreaterThan(0);
    expect(result.transportOffers).toHaveLength(1);
    expect(result.hotelOffers).toHaveLength(1);
    expect(result.sourceLinks[0].url).toMatch(/^https:\/\//);
  });
});
```

- [ ] **Step 2: Run orchestration test to verify it fails**

Run:

```bash
npm run test -- tests/server/run-ritual.test.ts
```

Expected: FAIL because `@/server/ritual/runRitual` does not exist.

- [ ] **Step 3: Implement orchestration**

Create `src/server/ritual/runRitual.ts`:

```ts
import type { DrawnTarotCard, TravelAtlasItem, TripIntent } from "@/domain/types";
import { drawTarotSpread } from "@/domain/tarot/engine";
import { selectDestination } from "@/domain/travel/scoring";
import { createPrediction, type PredictionText } from "@/server/oracle/narrator";
import { searchTutuOffers } from "@/server/tutu/mcpClient";
import type { NormalizedOffer } from "@/server/tutu/normalize";

export interface RitualResult {
  ritualId: string;
  seed: string;
  cards: DrawnTarotCard[];
  destination: TravelAtlasItem;
  prediction: PredictionText;
  transportOffers: NormalizedOffer[];
  hotelOffers: NormalizedOffer[];
  sourceLinks: Array<{ label: string; url: string }>;
  warnings: string[];
}

export interface RitualDeps {
  searchOffers?: typeof searchTutuOffers;
  aiApiKey?: string;
}

export async function runRitual(input: TripIntent, deps: RitualDeps = {}): Promise<RitualResult> {
  const spread = drawTarotSpread(input);
  const selection = selectDestination({ ...input, archetypes: spread.archetypes });
  const searchOffers = deps.searchOffers || searchTutuOffers;
  const offers = await searchOffers({ intent: input, destination: selection.destination });
  const prediction = await createPrediction({
    intent: input,
    spread,
    selection,
    offers: {
      transport: offers.transport.map((offer) => offer.title),
      hotels: offers.hotels.map((offer) => offer.title),
    },
    aiApiKey: deps.aiApiKey ?? process.env.OPENAI_API_KEY,
  });

  const sourceLinks = [
    { label: selection.destination.source === "provereno.tutu" ? "Проверенный маршрут Туту" : "Источник маршрута", url: selection.destination.sourceUrl },
    ...(selection.destination.geoUrl ? [{ label: "Путеводитель Туту", url: selection.destination.geoUrl }] : []),
  ];

  return {
    ritualId: Buffer.from(spread.seed).toString("base64url").slice(0, 12),
    seed: spread.seed,
    cards: spread.cards,
    destination: selection.destination,
    prediction,
    transportOffers: offers.transport,
    hotelOffers: offers.hotels,
    sourceLinks,
    warnings: offers.warnings,
  };
}
```

- [ ] **Step 4: Write API route tests**

Create `tests/api/ritual-route.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/ritual/route";

describe("POST /api/ritual", () => {
  it("rejects invalid traveler count", async () => {
    const request = new Request("http://localhost/api/ritual", {
      method: "POST",
      body: JSON.stringify({
        departureCity: "Москва",
        dateFrom: "2026-09-10",
        dateTo: "2026-09-17",
        travelerCount: 0,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 5: Implement API route**

Create `src/app/api/ritual/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { runRitual } from "@/server/ritual/runRitual";

const ritualRequestSchema = z.object({
  departureCity: z.string().trim().min(2),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  travelerCount: z.number().int().min(1).max(8),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = ritualRequestSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_ritual_request" }, { status: 400 });
  }

  if (parsed.data.dateTo < parsed.data.dateFrom) {
    return NextResponse.json({ error: "invalid_date_range" }, { status: 400 });
  }

  const result = await runRitual(parsed.data);
  return NextResponse.json(result);
}
```

- [ ] **Step 6: Run server tests**

Run:

```bash
npm run test -- tests/server/run-ritual.test.ts tests/api/ritual-route.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/ritual src/app/api tests/server/run-ritual.test.ts tests/api/ritual-route.test.ts
git commit -m "feat: add ritual api orchestration"
```

---

### Task 6: Form And Client Ritual State

**Files:**
- Create: `src/components/TripIntentForm.tsx`
- Create: `src/components/RitualStage.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Create: `tests/components/trip-intent-form.test.tsx`

**Interfaces:**
- Produces: `TripIntentForm({ onSubmit }: { onSubmit(intent: TripIntent): void })`
- Produces: `RitualStage()`
- Consumes: `POST /api/ritual` response shape from Task 5.

- [ ] **Step 1: Write form test**

Create `tests/components/trip-intent-form.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TripIntentForm } from "@/components/TripIntentForm";

describe("TripIntentForm", () => {
  it("submits normalized trip intent", () => {
    const onSubmit = vi.fn();
    render(<TripIntentForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Город вылета"), { target: { value: " Москва " } });
    fireEvent.change(screen.getByLabelText("Дата начала"), { target: { value: "2026-09-10" } });
    fireEvent.change(screen.getByLabelText("Дата конца"), { target: { value: "2026-09-17" } });
    fireEvent.change(screen.getByLabelText("Путешественники"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Начать расклад" }));

    expect(onSubmit).toHaveBeenCalledWith({
      departureCity: "Москва",
      dateFrom: "2026-09-10",
      dateTo: "2026-09-17",
      travelerCount: 2,
    });
  });
});
```

- [ ] **Step 2: Run form test to verify it fails**

Run:

```bash
npm run test -- tests/components/trip-intent-form.test.tsx
```

Expected: FAIL because `TripIntentForm` does not exist.

- [ ] **Step 3: Implement form**

Create `src/components/TripIntentForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { TripIntent } from "@/domain/types";

export function TripIntentForm({ onSubmit }: { onSubmit(intent: TripIntent): void }) {
  const [departureCity, setDepartureCity] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [travelerCount, setTravelerCount] = useState(2);

  return (
    <form
      className="intent-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          departureCity: departureCity.trim(),
          dateFrom,
          dateTo,
          travelerCount,
        });
      }}
    >
      <label>
        Город вылета
        <input value={departureCity} onChange={(event) => setDepartureCity(event.target.value)} required />
      </label>
      <label>
        Дата начала
        <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} required />
      </label>
      <label>
        Дата конца
        <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} required />
      </label>
      <label>
        Путешественники
        <input
          type="number"
          min={1}
          max={8}
          value={travelerCount}
          onChange={(event) => setTravelerCount(Number(event.target.value))}
          required
        />
      </label>
      <button type="submit">Начать расклад</button>
    </form>
  );
}
```

- [ ] **Step 4: Implement ritual stage**

Create `src/components/RitualStage.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { TripIntent } from "@/domain/types";
import { TripIntentForm } from "./TripIntentForm";

type Stage = "idle" | "ritual-started" | "awaiting-result" | "result" | "error";

interface RitualApiResult {
  prediction: { headline: string; opening: string; summary: string };
  destination: { name: string; region: string };
}

export function RitualStage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<RitualApiResult | null>(null);

  async function startRitual(intent: TripIntent) {
    setStage("ritual-started");
    try {
      const response = await fetch("/api/ritual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intent),
      });
      if (!response.ok) throw new Error("ritual_failed");
      const data = (await response.json()) as RitualApiResult;
      setResult(data);
      setStage("result");
    } catch {
      setStage("error");
    }
  }

  return (
    <section className="ritual-layout" data-stage={stage}>
      <div className="ritual-copy">
        <h1>Таро-турагент</h1>
        <p>Колода выбирает маршрут по России, а Туту проверяет дорогу и ночлег.</p>
      </div>
      {stage === "idle" ? <TripIntentForm onSubmit={startRitual} /> : null}
      {stage === "ritual-started" || stage === "awaiting-result" ? <p className="ritual-status">Карты ложатся на стол...</p> : null}
      {stage === "result" && result ? (
        <div className="result-shell">
          <p>{result.prediction.headline}</p>
          <h2>{result.destination.name}</h2>
          <p>{result.destination.region}</p>
        </div>
      ) : null}
      {stage === "error" ? <button onClick={() => setStage("idle")}>Попробовать снова</button> : null}
    </section>
  );
}
```

Modify `src/app/page.tsx`:

```tsx
import { RitualStage } from "@/components/RitualStage";

export default function HomePage() {
  return (
    <main className="app-shell">
      <RitualStage />
    </main>
  );
}
```

- [ ] **Step 5: Add responsive layout styles**

Append to `src/app/globals.css`:

```css
.ritual-layout {
  width: min(100%, 1120px);
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 380px);
  gap: 32px;
  align-items: end;
}

.ritual-copy h1 {
  margin: 0 0 12px;
  font-size: 48px;
  letter-spacing: 0;
}

.ritual-copy p,
.ritual-status {
  color: var(--muted);
}

.intent-form {
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid rgba(197, 155, 77, 0.34);
  border-radius: 8px;
  background: rgba(21, 16, 22, 0.82);
}

.intent-form label {
  display: grid;
  gap: 6px;
  color: var(--muted);
}

.intent-form input {
  width: 100%;
  min-height: 42px;
  border: 1px solid rgba(244, 237, 247, 0.22);
  border-radius: 6px;
  padding: 8px 10px;
  background: #201826;
  color: var(--ink);
}

.intent-form button,
.ritual-layout button {
  min-height: 44px;
  border: 0;
  border-radius: 6px;
  padding: 10px 14px;
  background: var(--brass);
  color: #151016;
  cursor: pointer;
}

.result-shell {
  padding: 18px;
  border: 1px solid rgba(26, 143, 122, 0.38);
  border-radius: 8px;
  background: rgba(26, 143, 122, 0.12);
}

@media (max-width: 760px) {
  .app-shell {
    place-items: start;
  }

  .ritual-layout {
    grid-template-columns: 1fr;
  }

  .ritual-copy h1 {
    font-size: 36px;
  }
}
```

- [ ] **Step 6: Run component test and build**

Run:

```bash
npm run test -- tests/components/trip-intent-form.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app src/components tests/components
git commit -m "feat: add ritual form flow"
```

---

### Task 7: 3D Ritual Scene And Fallback

**Files:**
- Create: `src/components/TarotCardView.tsx`
- Create: `src/components/RitualScene3D.tsx`
- Create: `src/components/RitualSceneFallback.tsx`
- Modify: `src/components/RitualStage.tsx`
- Modify: `src/app/globals.css`
- Create: `tests/components/tarot-card-view.test.tsx`

**Interfaces:**
- Produces: `RitualScene3D({ stage }: { stage: RitualVisualStage })`
- Produces: `RitualSceneFallback({ stage }: { stage: RitualVisualStage })`
- Produces: `TarotCardView({ name, revealed }: { name: string; revealed: boolean })`
- Consumes: client ritual stages from Task 6.

- [ ] **Step 1: Write card view test**

Create `tests/components/tarot-card-view.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TarotCardView } from "@/components/TarotCardView";

describe("TarotCardView", () => {
  it("hides the card name before reveal", () => {
    render(<TarotCardView name="Отшельник" revealed={false} />);
    expect(screen.queryByText("Отшельник")).not.toBeInTheDocument();
  });

  it("shows the card name after reveal", () => {
    render(<TarotCardView name="Отшельник" revealed />);
    expect(screen.getByText("Отшельник")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run card test to verify it fails**

Run:

```bash
npm run test -- tests/components/tarot-card-view.test.tsx
```

Expected: FAIL because `TarotCardView` does not exist.

- [ ] **Step 3: Implement tarot card view**

Create `src/components/TarotCardView.tsx`:

```tsx
export function TarotCardView({ name, revealed }: { name: string; revealed: boolean }) {
  return (
    <div className="tarot-card" data-revealed={revealed}>
      <div className="tarot-card__back" aria-hidden={revealed}>
        <span />
      </div>
      {revealed ? (
        <div className="tarot-card__face">
          <span>{name}</span>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Implement 3D scene**

Create `src/components/RitualScene3D.tsx`:

```tsx
"use client";

import { Canvas } from "@react-three/fiber";
import { Float, PerspectiveCamera } from "@react-three/drei";

export type RitualVisualStage = "idle" | "ritual-started" | "dealing" | "revealing" | "result" | "error";

function TableScene({ stage }: { stage: RitualVisualStage }) {
  const revealed = stage === "revealing" || stage === "result";
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 4.5, 6]} rotation={[-0.62, 0, 0]} />
      <ambientLight intensity={0.55} />
      <pointLight position={[0, 4, 2]} intensity={18} color="#c59b4d" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[8, 5]} />
        <meshStandardMaterial color="#26131d" roughness={0.86} />
      </mesh>
      {[ -1.5, 0, 1.5 ].map((x, index) => (
        <Float key={x} speed={revealed ? 1.2 : 2.2} rotationIntensity={revealed ? 0.06 : 0.18} floatIntensity={revealed ? 0.08 : 0.28}>
          <mesh position={[x, 0.04, revealed ? 0 : -0.4 + index * 0.18]} rotation={[-Math.PI / 2, 0, (index - 1) * 0.08]}>
            <boxGeometry args={[0.9, 1.35, 0.04]} />
            <meshStandardMaterial color={revealed ? "#e8d3a0" : "#1a8f7a"} roughness={0.6} metalness={0.08} />
          </mesh>
        </Float>
      ))}
      <mesh position={[0, 0.16, 1.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <boxGeometry args={[0.95, 1.4, 0.22]} />
        <meshStandardMaterial color="#7a1f35" roughness={0.72} />
      </mesh>
    </>
  );
}

export function RitualScene3D({ stage }: { stage: RitualVisualStage }) {
  return (
    <div className="ritual-scene" aria-label="3D tarot ritual scene">
      <Canvas dpr={[1, 1.75]}>
        <TableScene stage={stage} />
      </Canvas>
    </div>
  );
}
```

- [ ] **Step 5: Implement fallback scene**

Create `src/components/RitualSceneFallback.tsx`:

```tsx
"use client";

import type { RitualVisualStage } from "./RitualScene3D";
import { TarotCardView } from "./TarotCardView";

export function RitualSceneFallback({ stage }: { stage: RitualVisualStage }) {
  const revealed = stage === "revealing" || stage === "result";
  return (
    <div className="ritual-fallback" aria-label="Tarot ritual scene">
      {["Зов", "Путь", "Дар маршрута"].map((position) => (
        <TarotCardView key={position} name={position} revealed={revealed} />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Wire scene into RitualStage**

Modify `src/components/RitualStage.tsx` so it imports and renders the scene:

```tsx
import { RitualScene3D, type RitualVisualStage } from "./RitualScene3D";
import { RitualSceneFallback } from "./RitualSceneFallback";
```

Add this helper inside the component:

```tsx
const visualStage: RitualVisualStage =
  stage === "ritual-started" ? "dealing" : stage === "result" ? "result" : stage;
```

Render before the form/result content:

```tsx
<div className="scene-shell">
  <RitualScene3D stage={visualStage} />
  <div className="reduced-motion-scene">
    <RitualSceneFallback stage={visualStage} />
  </div>
</div>
```

- [ ] **Step 7: Add scene styles**

Append to `src/app/globals.css`:

```css
.scene-shell {
  grid-column: 1 / -1;
  min-height: 360px;
  position: relative;
}

.ritual-scene {
  height: 360px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(197, 155, 77, 0.24);
  background: #120d14;
}

.reduced-motion-scene {
  display: none;
}

.ritual-fallback {
  min-height: 280px;
  display: grid;
  grid-template-columns: repeat(3, minmax(80px, 140px));
  gap: 16px;
  align-items: center;
  justify-content: center;
}

.tarot-card {
  aspect-ratio: 2 / 3;
  border: 1px solid rgba(197, 155, 77, 0.55);
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #1a8f7a, #7a1f35);
  color: var(--ink);
}

.tarot-card__face {
  width: calc(100% - 16px);
  height: calc(100% - 16px);
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: #e8d3a0;
  color: #151016;
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .ritual-scene {
    display: none;
  }

  .reduced-motion-scene {
    display: block;
  }
}
```

- [ ] **Step 8: Run component tests and build**

Run:

```bash
npm run test -- tests/components/tarot-card-view.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components src/app/globals.css tests/components/tarot-card-view.test.tsx
git commit -m "feat: add 3d ritual scene"
```

---

### Task 8: Result Presentation With Tutu Proof Links

**Files:**
- Create: `src/components/OfferList.tsx`
- Create: `src/components/TravelResult.tsx`
- Modify: `src/components/RitualStage.tsx`
- Modify: `src/app/globals.css`
- Create: `tests/components/travel-result.test.tsx`

**Interfaces:**
- Produces: `TravelResult({ result }: { result: RitualResultViewModel })`
- Consumes: `RitualResult` response shape from Task 5.

- [ ] **Step 1: Write result rendering test**

Create `tests/components/travel-result.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TravelResult } from "@/components/TravelResult";

describe("TravelResult", () => {
  it("renders prediction before Tutu proof links", () => {
    render(
      <TravelResult
        result={{
          prediction: {
            headline: "Карты указывают на Усьвинские Столбы",
            opening: "Башня говорит о камне.",
            summary: "Путь подтвержден.",
            cardReadings: [],
          },
          destination: { name: "Усьвинские Столбы", region: "Пермский край" },
          sourceLinks: [{ label: "Путеводитель Туту", url: "https://www.tutu.ru/geo/" }],
          transportOffers: [{ id: "transport-0", title: "Москва - Пермь", price: "4200 RUB" }],
          hotelOffers: [{ id: "hotel-0", title: "Отель в Перми" }],
          warnings: [],
        }}
      />,
    );

    expect(screen.getByText("Карты указывают на Усьвинские Столбы")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Путеводитель Туту" })).toHaveAttribute("href", "https://www.tutu.ru/geo/");
    expect(screen.getByText("Москва - Пермь")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run result test to verify it fails**

Run:

```bash
npm run test -- tests/components/travel-result.test.tsx
```

Expected: FAIL because `TravelResult` does not exist.

- [ ] **Step 3: Implement offer list**

Create `src/components/OfferList.tsx`:

```tsx
import type { NormalizedOffer } from "@/server/tutu/normalize";

export function OfferList({ title, offers }: { title: string; offers: NormalizedOffer[] }) {
  if (offers.length === 0) {
    return (
      <section className="offer-section">
        <h3>{title}</h3>
        <p>Карты оставили эту часть маршрута в тумане. Попробуйте другие даты.</p>
      </section>
    );
  }

  return (
    <section className="offer-section">
      <h3>{title}</h3>
      <div className="offer-grid">
        {offers.map((offer) => (
          <a key={offer.id} className="offer-card" href={offer.url || "#"} target={offer.url ? "_blank" : undefined} rel={offer.url ? "noreferrer" : undefined}>
            <span>{offer.title}</span>
            {offer.subtitle ? <small>{offer.subtitle}</small> : null}
            {offer.price ? <strong>{offer.price}</strong> : null}
          </a>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Implement travel result**

Create `src/components/TravelResult.tsx`:

```tsx
import type { PredictionText } from "@/server/oracle/narrator";
import type { NormalizedOffer } from "@/server/tutu/normalize";
import { OfferList } from "./OfferList";

export interface RitualResultViewModel {
  prediction: PredictionText;
  destination: { name: string; region: string };
  sourceLinks: Array<{ label: string; url: string }>;
  transportOffers: NormalizedOffer[];
  hotelOffers: NormalizedOffer[];
  warnings: string[];
}

export function TravelResult({ result }: { result: RitualResultViewModel }) {
  return (
    <section className="travel-result">
      <div className="prediction-panel">
        <p className="result-kicker">Предсказанный маршрут</p>
        <h2>{result.prediction.headline}</h2>
        <p>{result.prediction.opening}</p>
        <p>{result.prediction.summary}</p>
      </div>
      <div className="proof-links" aria-label="Подтверждения Туту">
        {result.sourceLinks.map((link) => (
          <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
            {link.label}
          </a>
        ))}
      </div>
      <OfferList title="Билеты по предсказанию" offers={result.transportOffers} />
      <OfferList title="Где остановиться" offers={result.hotelOffers} />
    </section>
  );
}
```

- [ ] **Step 5: Wire result into RitualStage**

Modify `src/components/RitualStage.tsx`:

```tsx
import { TravelResult, type RitualResultViewModel } from "./TravelResult";
```

Change the local result state type:

```tsx
const [result, setResult] = useState<RitualResultViewModel | null>(null);
```

Replace the existing result shell with:

```tsx
{stage === "result" && result ? <TravelResult result={result} /> : null}
```

- [ ] **Step 6: Add result styles**

Append to `src/app/globals.css`:

```css
.travel-result {
  grid-column: 1 / -1;
  display: grid;
  gap: 18px;
}

.prediction-panel {
  max-width: 780px;
}

.result-kicker {
  margin: 0 0 8px;
  color: var(--brass);
}

.prediction-panel h2 {
  margin: 0 0 12px;
  font-size: 32px;
  letter-spacing: 0;
}

.proof-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.proof-links a {
  color: var(--ink);
  border-bottom: 1px solid rgba(197, 155, 77, 0.7);
  text-decoration: none;
}

.offer-section {
  display: grid;
  gap: 10px;
}

.offer-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.offer-card {
  min-height: 92px;
  display: grid;
  gap: 6px;
  padding: 14px;
  border: 1px solid rgba(244, 237, 247, 0.18);
  border-radius: 8px;
  color: var(--ink);
  text-decoration: none;
  background: rgba(244, 237, 247, 0.06);
}

.offer-card small {
  color: var(--muted);
}
```

- [ ] **Step 7: Run result tests and build**

Run:

```bash
npm run test -- tests/components/travel-result.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components src/app/globals.css tests/components/travel-result.test.tsx
git commit -m "feat: show tutu-backed travel result"
```

---

### Task 9: End-To-End Verification And Vercel Readiness

**Files:**
- Create: `.env.example`
- Create: `tests/e2e/ritual-flow.spec.ts`
- Modify: `README.md`
- Modify: `src/server/tutu/mcpClient.ts`

**Interfaces:**
- Consumes: complete application from previous tasks.
- Produces: browser test coverage and deployment notes.

- [ ] **Step 1: Add env example**

Create `.env.example`:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
TUTU_MCP_URL=https://mcp.tutu.ru/mcp
```

- [ ] **Step 2: Add E2E test with mocked API route**

Create `tests/e2e/ritual-flow.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("ritual flow reaches Tutu-backed result", async ({ page }) => {
  await page.route("**/api/ritual", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ritualId: "demo",
        seed: "москва|2026-09-10|2026-09-17|2",
        cards: [],
        destination: { name: "Усьвинские Столбы", region: "Пермский край" },
        prediction: {
          headline: "Карты указывают на Усьвинские Столбы",
          opening: "Башня зовет к камню.",
          summary: "Дорога подтверждается Туту.",
          cardReadings: [],
        },
        transportOffers: [{ id: "transport-0", title: "Москва - Пермь", price: "4200 RUB" }],
        hotelOffers: [{ id: "hotel-0", title: "Отель в Перми" }],
        sourceLinks: [{ label: "Путеводитель Туту", url: "https://www.tutu.ru/geo/" }],
        warnings: [],
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Город вылета").fill("Москва");
  await page.getByLabel("Дата начала").fill("2026-09-10");
  await page.getByLabel("Дата конца").fill("2026-09-17");
  await page.getByLabel("Путешественники").fill("2");
  await page.getByRole("button", { name: "Начать расклад" }).click();

  await expect(page.getByText("Карты указывают на Усьвинские Столбы")).toBeVisible();
  await expect(page.getByRole("link", { name: "Путеводитель Туту" })).toBeVisible();
  await expect(page.getByText("Москва - Пермь")).toBeVisible();
});
```

- [ ] **Step 3: Add README**

Create `README.md`:

```md
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
```

- [ ] **Step 4: Add MCP endpoint timeout**

Modify `src/server/tutu/mcpClient.ts` inside `callTool`:

```ts
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 12_000);
try {
  const response = await fetch(endpoint, {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${name}-${Date.now()}`,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  if (!response.ok) throw new Error(`Tutu MCP ${name} failed with ${response.status}`);
  return response.json();
} finally {
  clearTimeout(timeout);
}
```

- [ ] **Step 5: Run full local verification**

Run:

```bash
npm run test
npm run build
npm run test:e2e
```

Expected: all commands pass.

- [ ] **Step 6: Manual browser check**

Run:

```bash
npm run dev
```

Open `http://localhost:3000` and verify:

- The first screen is the product experience.
- The form fits at desktop and mobile widths.
- The 3D scene is visible and nonblank.
- Submitting valid inputs reaches the prediction result.
- Tutu proof links appear after the prediction.
- No console errors appear during the main flow.

- [ ] **Step 7: Commit**

```bash
git add .env.example README.md tests/e2e src/server/tutu/mcpClient.ts
git commit -m "test: add e2e flow and deployment notes"
```

---

## Plan Self-Review

- Spec coverage: Tasks cover Next.js scaffold, 3D ritual, Russia-only atlas, Проверено Туту and Geo source links, deterministic selection, AI narration fallback, Tutu MCP transport/hotel calls, result UI, Vercel constraints, and verification.
- Red-flag scan: No incomplete task, no unbounded scraping step, no runtime filesystem write.
- Type consistency: `TripIntent`, `TarotSpread`, `DestinationSelection`, `PredictionText`, `NormalizedOffer`, and `RitualResult` are introduced before dependent tasks use them.
