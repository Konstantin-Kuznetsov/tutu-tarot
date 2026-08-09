# Real Tarot Deck And Tutu Multitransport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the ritual into a real tarot reading whose third card names a road that Tutu MCP has confirmed actually exists.

**Architecture:** The ritual runs in two phases. Two cards choose the destination; Tutu MCP is then asked for air, rail and bus in a single `search_multitransport` call; the third card is drawn only from arcana whose transport affinity matches a road that exists and is sane for the trip length. A one-off script bakes 22 public-domain Rider-Waite-Smith scans into duotone WebP committed under `public/`.

**Tech Stack:** Next 16 (App Router), React 19, TypeScript, zod, Vitest, Playwright, sharp (build-time only).

Spec: `docs/superpowers/specs/2026-08-09-real-deck-and-multitransport-design.md`

## Global Constraints

- The browser never calls Tutu MCP. All MCP traffic goes through `POST /api/ritual`.
- AI may only return a validated flavour key. It must never name or choose a destination. Do not weaken this boundary.
- No runtime filesystem writes, no runtime scraping, no long-running background processes. Must deploy to Vercel with no custom server.
- Styling is hand-written plain CSS in `src/app/globals.css`. There is no Tailwind and no UI library. Do not add one.
- No 3D and no WebGL. `three`, `@react-three/*` and `motion` were deliberately removed; do not reinstall them.
- All motion must respect `prefers-reduced-motion`.
- The page must work at 375px and 1280px. Long carrier and hotel names must not break the grid.
- UI copy is Russian. Code, comments, commits and docs are English.
- Before writing any Next-specific code (image component, route segment config), read the relevant guide in `node_modules/next/dist/docs/`. This Next version differs from training data; `AGENTS.md` requires it.
- Tutu MCP facts, all measured live on 2026-08-09 — do not "correct" them from memory:
  - Passenger count is `adults` in `search_avia`/`search_bus` but `passengers` in `search_rail`.
  - Mode literals are `avia | railway | bus | etrain`. `rail` fails validation.
  - Tool-level errors arrive as plain text inside `result.content[].text`, not as a JSON-RPC `error`.
  - `search_multitransport` returns `{ variants, meta }`; `meta.modes_summary` carries per-mode `count`, `min_price`, `min_duration_min`.
- Run `npm run lint` and `npx tsc --noEmit` before every commit. Both must be clean.

---

### Task 1: Deck data model and 22 Major Arcana

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/tarot/cards.ts`
- Test: `tests/domain/deck.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `TransportMode`, the extended `TarotCardDefinition`, and a `tarotCards` array of exactly 22 entries. Every later task depends on these names.

- [ ] **Step 1: Write the failing test**

Create `tests/domain/deck.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { tarotCards } from "@/domain/tarot/cards";
import type { TarotArchetype, TransportMode } from "@/domain/types";

const VOCABULARY: TarotArchetype[] = [
  "solitude", "road", "cliffs", "water", "north", "culture",
  "food", "sun", "renewal", "mystery", "star",
];
const MODES: TransportMode[] = ["avia", "railway", "bus"];

describe("tarot deck", () => {
  it("holds all 22 Major Arcana with unique ids and numbers", () => {
    expect(tarotCards).toHaveLength(22);
    expect(new Set(tarotCards.map((card) => card.id)).size).toBe(22);
    expect(tarotCards.map((card) => card.number).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 22 }, (_, index) => index),
    );
  });

  it("keeps every archetype inside the existing vocabulary", () => {
    for (const card of tarotCards) {
      expect(card.archetypes.length).toBeGreaterThan(0);
      for (const archetype of card.archetypes) {
        expect(VOCABULARY).toContain(archetype);
      }
    }
  });

  it("carries every transport mode on at least six cards", () => {
    for (const mode of MODES) {
      const carriers = tarotCards.filter((card) => card.transport.includes(mode));
      expect(carriers.length, `mode ${mode}`).toBeGreaterThanOrEqual(6);
    }
  });

  it("gives every card both meanings and an image path", () => {
    for (const card of tarotCards) {
      expect(card.meaning.length).toBeGreaterThan(10);
      expect(card.meaningReversed.length).toBeGreaterThan(10);
      expect(card.image).toMatch(/^\/tarot\/\d{2}-[a-z_]+\.webp$/);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/domain/deck.test.ts`
Expected: FAIL — the deck holds 8 cards, and `meaningReversed`, `number`, `transport` do not exist on the type.

- [ ] **Step 3: Extend the types**

In `src/domain/types.ts`, add `TransportMode`, change `TarotPosition`, and extend the card types. Replace the existing `TarotPosition`, `TarotCardDefinition` and `DrawnTarotCard` declarations with:

```ts
export type TarotPosition = "Зов" | "Дар" | "Путь";

export type TransportMode = "avia" | "railway" | "bus";

export interface TarotCardDefinition {
  id: string;
  number: number;
  name: string;
  image: string;
  archetypes: TarotArchetype[];
  transport: TransportMode[];
  meaning: string;
  meaningReversed: string;
}

export interface DrawnTarotCard extends TarotCardDefinition {
  position: TarotPosition;
  reversed: boolean;
}
```

Leave `TarotArchetype`, `TripIntent`, `TravelAtlasItem` and `DestinationSelection` untouched. `TarotSpread` is replaced in Task 3; leave it for now even though it will not compile against the new card shape — Step 4 of this task only runs the deck test.

- [ ] **Step 4: Write the 22-card deck**

Replace the whole body of `src/domain/tarot/cards.ts`. The eight existing cards keep their ids, names and upright meanings verbatim.

```ts
import type { TarotCardDefinition } from "@/domain/types";

export const tarotCards: TarotCardDefinition[] = [
  {
    id: "fool", number: 0, name: "Шут", image: "/tarot/00-fool.webp",
    archetypes: ["road", "renewal", "sun"], transport: ["avia"],
    meaning: "шаг в пустоту без плана — и он оказывается верным",
    meaningReversed: "шаг сделан слишком рано, дорога потребует осторожности",
  },
  {
    id: "magician", number: 1, name: "Маг", image: "/tarot/01-magician.webp",
    archetypes: ["culture", "mystery", "renewal"], transport: ["avia"],
    meaning: "всё нужное для поездки уже под рукой",
    meaningReversed: "замысел красив, но детали ещё не собраны",
  },
  {
    id: "priestess", number: 2, name: "Жрица", image: "/tarot/02-priestess.webp",
    archetypes: ["mystery", "water", "solitude"], transport: ["railway"],
    meaning: "место откроется только тому, кто помолчит",
    meaningReversed: "тайна закрывается, ответ придёт позже",
  },
  {
    id: "empress", number: 3, name: "Императрица", image: "/tarot/03-empress.webp",
    archetypes: ["food", "sun", "renewal"], transport: ["bus"],
    meaning: "земля щедра: вкус, тепло и полные руки",
    meaningReversed: "изобилие обманчиво, брать придётся понемногу",
  },
  {
    id: "emperor", number: 4, name: "Император", image: "/tarot/04-emperor.webp",
    archetypes: ["culture", "cliffs"], transport: ["bus"],
    meaning: "камень, порядок и крепкие стены",
    meaningReversed: "жёсткий план мешает увидеть место",
  },
  {
    id: "hierophant", number: 5, name: "Иерофант", image: "/tarot/05-hierophant.webp",
    archetypes: ["culture", "mystery"], transport: ["bus", "railway"],
    meaning: "дорога к старой традиции и её хранителям",
    meaningReversed: "обряд без смысла, стоит искать своё",
  },
  {
    id: "lovers", number: 6, name: "Влюблённые", image: "/tarot/06-lovers.webp",
    archetypes: ["culture", "food", "water"], transport: ["railway", "bus"],
    meaning: "место для близости, прогулок и красивого выбора",
    meaningReversed: "выбор откладывается, спутник тянет в другую сторону",
  },
  {
    id: "chariot", number: 7, name: "Колесница", image: "/tarot/07-chariot.webp",
    archetypes: ["road", "renewal"], transport: ["avia"],
    meaning: "путь складывается через движение и смену горизонта",
    meaningReversed: "рывок не выходит, дорога сопротивляется",
  },
  {
    id: "strength", number: 8, name: "Сила", image: "/tarot/08-strength.webp",
    archetypes: ["sun", "cliffs", "road"], transport: ["bus"],
    meaning: "мягкое упорство одолеет длинный перегон",
    meaningReversed: "сил меньше, чем кажется, маршрут стоит укоротить",
  },
  {
    id: "hermit", number: 9, name: "Отшельник", image: "/tarot/09-hermit.webp",
    archetypes: ["solitude", "mystery", "cliffs"], transport: ["railway"],
    meaning: "дорога к тишине и высокому месту",
    meaningReversed: "одиночество тяготит, нужен попутчик",
  },
  {
    id: "wheel", number: 10, name: "Колесо Фортуны", image: "/tarot/10-wheel.webp",
    archetypes: ["road", "mystery"], transport: ["railway", "bus"],
    meaning: "маршрут сам поворачивает в нужную сторону",
    meaningReversed: "колесо встало, расписание переиграет планы",
  },
  {
    id: "justice", number: 11, name: "Справедливость", image: "/tarot/11-justice.webp",
    archetypes: ["culture", "north"], transport: ["bus"],
    meaning: "прямая дорога и честный расчёт",
    meaningReversed: "цена и ценность не сходятся",
  },
  {
    id: "hanged", number: 12, name: "Повешенный", image: "/tarot/12-hanged.webp",
    archetypes: ["solitude", "water", "mystery"], transport: ["railway"],
    meaning: "время в пути замедлится, и это подарок",
    meaningReversed: "задержка без смысла, ожидание утомит",
  },
  {
    id: "death", number: 13, name: "Смерть", image: "/tarot/13-death.webp",
    archetypes: ["renewal", "north", "mystery"], transport: ["railway"],
    meaning: "переход: прежнее остаётся на перроне",
    meaningReversed: "старое цепляется, отпустить пока не выходит",
  },
  {
    id: "temperance", number: 14, name: "Умеренность", image: "/tarot/14-temperance.webp",
    archetypes: ["water", "food", "renewal"], transport: ["railway", "avia"],
    meaning: "ровный ход, смешение вкусов и мера во всём",
    meaningReversed: "перебор в планах, день придётся разгрузить",
  },
  {
    id: "devil", number: 15, name: "Дьявол", image: "/tarot/15-devil.webp",
    archetypes: ["cliffs", "mystery", "food"], transport: ["bus"],
    meaning: "тянет туда, где неудобно и очень хочется",
    meaningReversed: "соблазн отпускает, дорога становится проще",
  },
  {
    id: "tower", number: 16, name: "Башня", image: "/tarot/16-tower.webp",
    archetypes: ["cliffs", "renewal"], transport: ["avia"],
    meaning: "камень, высота и резкая перемена взгляда",
    meaningReversed: "обвал случился раньше, теперь строят заново",
  },
  {
    id: "star", number: 17, name: "Звезда", image: "/tarot/17-star.webp",
    archetypes: ["north", "water", "mystery"], transport: ["avia"],
    meaning: "северный свет, вода и надежда",
    meaningReversed: "свет тусклый, ориентир придётся искать самому",
  },
  {
    id: "moon", number: 18, name: "Луна", image: "/tarot/18-moon.webp",
    archetypes: ["north", "water", "solitude", "mystery"], transport: ["railway"],
    meaning: "ночная дорога, туман и то, что видно только впотьмах",
    meaningReversed: "туман рассеивается, страх был напрасным",
  },
  {
    id: "sun", number: 19, name: "Солнце", image: "/tarot/19-sun.webp",
    archetypes: ["sun", "food", "renewal"], transport: ["avia"],
    meaning: "тепло, вкус и открытая дорога",
    meaningReversed: "солнце печёт, радость придётся поискать в тени",
  },
  {
    id: "judgement", number: 20, name: "Суд", image: "/tarot/20-judgement.webp",
    archetypes: ["culture", "renewal"], transport: ["railway", "avia"],
    meaning: "старые истории возвращаются новым смыслом",
    meaningReversed: "прошлое зовёт назад, а идти нужно вперёд",
  },
  {
    id: "world", number: 21, name: "Мир", image: "/tarot/21-world.webp",
    archetypes: ["road", "culture", "sun", "star"], transport: ["avia"],
    meaning: "круг замыкается на самой дальней точке",
    meaningReversed: "круг не закрыт, поездка станет первой из двух",
  },
];
```

Mode counts, for reference: avia 9, railway 10, bus 8. All clear the floor of six.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- tests/domain/deck.test.ts`
Expected: PASS, 4 tests.

`npm run test` as a whole and `npx tsc --noEmit` will still fail here — the engine, narrator and components have not caught up yet. That is expected and is fixed in Task 3. Do not "fix" them by weakening this task.

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/domain/tarot/cards.ts tests/domain/deck.test.ts
git commit -m "feat: grow tarot deck to 22 major arcana"
```

---

### Task 2: Card image pipeline

**Files:**
- Create: `scripts/prepare-tarot-images.mjs`
- Modify: `package.json` (devDependency + script)
- Modify: `.gitignore`
- Modify: `README.md`
- Test: `tests/domain/deck-images.test.ts` (create)
- Output (committed): `public/tarot/*.webp`

**Interfaces:**
- Consumes: `tarotCards` from Task 1 — specifically the `image` paths.
- Produces: 22 files on disk at exactly the paths the deck declares.

- [ ] **Step 1: Write the failing test**

Create `tests/domain/deck-images.test.ts`:

```ts
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tarotCards } from "@/domain/tarot/cards";

describe("tarot card images", () => {
  it("has a committed image file for every card", () => {
    const missing = tarotCards
      .map((card) => card.image)
      .filter((image) => !existsSync(path.join(process.cwd(), "public", image)));
    expect(missing).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/domain/deck-images.test.ts`
Expected: FAIL — `missing` lists all 22 paths.

- [ ] **Step 3: Add sharp explicitly and ignore the download cache**

`sharp` is currently present only transitively through Next and could vanish on any upgrade.

```bash
npm install --save-dev sharp
```

Append to `.gitignore`:

```
.cache/
```

Add to the `scripts` block in `package.json`:

```json
"tarot:images": "node scripts/prepare-tarot-images.mjs"
```

- [ ] **Step 4: Write the preparation script**

Create `scripts/prepare-tarot-images.mjs`. Note the two non-obvious requirements: Wikimedia returns `429` to unthrottled scripted access — verified, thirteen of twenty-two failed that way — so the script must send a descriptive User-Agent and sleep between downloads; and the duotone is done with a per-channel `linear()` after greyscale, which maps black to the shadow colour and white to the highlight colour.

```js
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Replace these two with the duotone recipe from the design pass.
const SHADOW = "#1b1024";
const HIGHLIGHT = "#e8c887";

const WIDTH = 600;
const CACHE_DIR = path.join(process.cwd(), ".cache", "tarot-originals");
const OUT_DIR = path.join(process.cwd(), "public", "tarot");
const USER_AGENT = "TarotTravelAgent/0.1 (Tutu hackathon prototype)";
const THROTTLE_MS = 1500;

const CARDS = [
  ["00-fool", "RWS_Tarot_00_Fool.jpg"],
  ["01-magician", "RWS_Tarot_01_Magician.jpg"],
  ["02-priestess", "RWS_Tarot_02_High_Priestess.jpg"],
  ["03-empress", "RWS_Tarot_03_Empress.jpg"],
  ["04-emperor", "RWS_Tarot_04_Emperor.jpg"],
  ["05-hierophant", "RWS_Tarot_05_Hierophant.jpg"],
  ["06-lovers", "RWS_Tarot_06_Lovers.jpg"],
  ["07-chariot", "RWS_Tarot_07_Chariot.jpg"],
  ["08-strength", "RWS_Tarot_08_Strength.jpg"],
  ["09-hermit", "RWS_Tarot_09_Hermit.jpg"],
  ["10-wheel", "RWS_Tarot_10_Wheel_of_Fortune.jpg"],
  ["11-justice", "RWS_Tarot_11_Justice.jpg"],
  ["12-hanged", "RWS_Tarot_12_Hanged_Man.jpg"],
  ["13-death", "RWS_Tarot_13_Death.jpg"],
  ["14-temperance", "RWS_Tarot_14_Temperance.jpg"],
  ["15-devil", "RWS_Tarot_15_Devil.jpg"],
  ["16-tower", "RWS_Tarot_16_Tower.jpg"],
  ["17-star", "RWS_Tarot_17_Star.jpg"],
  ["18-moon", "RWS_Tarot_18_Moon.jpg"],
  ["19-sun", "RWS_Tarot_19_Sun.jpg"],
  ["20-judgement", "RWS_Tarot_20_Judgement.jpg"],
  ["21-world", "RWS_Tarot_21_World.jpg"],
];

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function fetchOriginal(commonsName, cacheFile) {
  if (await exists(cacheFile)) return readFile(cacheFile);

  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${commonsName}`;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`${commonsName} -> HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(cacheFile, bytes);
  await sleep(THROTTLE_MS);
  return bytes;
}

function vignette(width, height) {
  return Buffer.from(
    `<svg width="${width}" height="${height}">
       <defs>
         <radialGradient id="v" cx="50%" cy="50%" r="75%">
           <stop offset="55%" stop-color="#ffffff"/>
           <stop offset="100%" stop-color="#8d7f96"/>
         </radialGradient>
       </defs>
       <rect width="${width}" height="${height}" fill="url(#v)"/>
     </svg>`,
  );
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  const lo = hexToRgb(SHADOW);
  const hi = hexToRgb(HIGHLIGHT);
  const slope = [(hi.r - lo.r) / 255, (hi.g - lo.g) / 255, (hi.b - lo.b) / 255];
  const offset = [lo.r, lo.g, lo.b];

  for (const [id, commonsName] of CARDS) {
    const original = await fetchOriginal(commonsName, path.join(CACHE_DIR, commonsName));

    const base = sharp(original).resize({ width: WIDTH });
    const { width, height } = await base.clone().toBuffer({ resolveWithObject: true })
      .then((result) => result.info);

    const output = await base
      .clone()
      .greyscale()
      .toColourspace("srgb")
      .linear(slope, offset)
      .composite([{ input: vignette(width, height), blend: "multiply" }])
      .webp({ quality: 82 })
      .toBuffer();

    await writeFile(path.join(OUT_DIR, `${id}.webp`), output);
    console.log(`${id}.webp  ${(output.length / 1024).toFixed(0)} KB  ${width}x${height}`);
  }
}

await main();
```

- [ ] **Step 5: Run the script**

Run: `npm run tarot:images`
Expected: 22 lines, each roughly 40–90 KB, all at 600px wide. Any `HTTP 429` means the throttle is too aggressive — raise `THROTTLE_MS` and re-run; cached originals are not re-downloaded.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test -- tests/domain/deck-images.test.ts`
Expected: PASS.

- [ ] **Step 7: Record the attribution**

Add to `README.md`, under a new `## Card artwork` heading:

```markdown
## Card artwork

The 22 Major Arcana are scans of the Rider-Waite-Smith deck (published 1909,
artwork by Pamela Colman Smith, died 1951), obtained from Wikimedia Commons and
in the public domain. `npm run tarot:images` downloads the originals, applies a
single duotone treatment, and writes the committed WebP files under
`public/tarot/`. The script is run by hand; nothing is fetched at runtime.
```

- [ ] **Step 8: Commit**

```bash
git add scripts/prepare-tarot-images.mjs package.json package-lock.json .gitignore README.md public/tarot tests/domain/deck-images.test.ts
git commit -m "feat: bake public-domain tarot artwork into public assets"
```

---

### Task 3: Two-phase draw engine

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/tarot/engine.ts`
- Modify: `src/domain/travel/scoring.ts`
- Modify: `tests/domain/tarot-engine.test.ts`
- Modify: `tests/domain/travel-scoring.test.ts`

**Interfaces:**
- Consumes: `tarotCards`, `TransportMode`, `DrawnTarotCard` from Task 1.
- Produces:
  - `drawDestinationCards(intent: TripIntent): DestinationDraw` where `DestinationDraw = { seed: string; cards: DrawnTarotCard[] }` and `cards` has length 2, positions `"Зов"` then `"Дар"`.
  - `drawPathCard(seed: string, usableModes: TransportMode[], excludeIds: string[]): DrawnTarotCard` with position `"Путь"`.
  - `archetypeWeightsFrom(cards: DrawnTarotCard[]): ArchetypeWeights` where `ArchetypeWeights = Partial<Record<TarotArchetype, number>>`.
  - `selectDestination` now takes `{ ...TripIntent, archetypeWeights: ArchetypeWeights }` instead of `archetypes`.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `tests/domain/tarot-engine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { archetypeWeightsFrom, drawDestinationCards, drawPathCard } from "@/domain/tarot/engine";
import type { TripIntent } from "@/domain/types";

const intent: TripIntent = {
  departureCity: "Москва",
  dateFrom: "2026-09-10",
  dateTo: "2026-09-17",
  travelerCount: 2,
};

describe("drawDestinationCards", () => {
  it("draws two distinct cards in the destination positions", () => {
    const draw = drawDestinationCards(intent);
    expect(draw.cards).toHaveLength(2);
    expect(draw.cards.map((card) => card.position)).toEqual(["Зов", "Дар"]);
    expect(draw.cards[0].id).not.toBe(draw.cards[1].id);
  });

  it("is deterministic for the same intent", () => {
    const first = drawDestinationCards(intent);
    const second = drawDestinationCards(intent);
    expect(second.cards.map((card) => `${card.id}:${card.reversed}`)).toEqual(
      first.cards.map((card) => `${card.id}:${card.reversed}`),
    );
  });

  it("changes with the intent", () => {
    const other = drawDestinationCards({ ...intent, departureCity: "Казань" });
    const base = drawDestinationCards(intent);
    expect(other.cards.map((card) => card.id)).not.toEqual(base.cards.map((card) => card.id));
  });
});

describe("drawPathCard", () => {
  it("only draws a card that serves an available mode", () => {
    const card = drawPathCard("seed-1", ["railway"], []);
    expect(card.position).toBe("Путь");
    expect(card.transport).toContain("railway");
  });

  it("never repeats an already drawn card", () => {
    const excluded = drawPathCard("seed-2", ["avia"], []);
    const card = drawPathCard("seed-2", ["avia"], [excluded.id]);
    expect(card.id).not.toBe(excluded.id);
  });

  it("falls back to the remaining deck when no mode is available", () => {
    const card = drawPathCard("seed-3", [], []);
    expect(card.position).toBe("Путь");
    expect(card.id).toBeTruthy();
  });

  it("is deterministic for the same seed and modes", () => {
    const first = drawPathCard("seed-4", ["bus"], []);
    const second = drawPathCard("seed-4", ["bus"], []);
    expect(`${second.id}:${second.reversed}`).toBe(`${first.id}:${first.reversed}`);
  });
});

describe("archetypeWeightsFrom", () => {
  it("counts an upright card fully and a reversed card at half", () => {
    const upright = { archetypes: ["road"], reversed: false } as never;
    const reversed = { archetypes: ["road", "sun"], reversed: true } as never;
    expect(archetypeWeightsFrom([upright, reversed])).toEqual({ road: 1.5, sun: 0.5 });
  });
});
```

Then update `tests/domain/travel-scoring.test.ts`: every call to `selectDestination` currently passes `archetypes: [...]`. Replace each with `archetypeWeights: { ... }`, giving each previously listed archetype a weight of `1`. For example `archetypes: ["cliffs", "road"]` becomes `archetypeWeights: { cliffs: 1, road: 1 }`. Do not change the expected destinations — the scoring result must be unchanged for upright cards.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- tests/domain/tarot-engine.test.ts tests/domain/travel-scoring.test.ts`
Expected: FAIL — `drawDestinationCards`, `drawPathCard` and `archetypeWeightsFrom` are not exported; `selectDestination` does not accept `archetypeWeights`.

- [ ] **Step 3: Replace the engine**

Replace the whole of `src/domain/tarot/engine.ts`:

```ts
import { tarotCards } from "@/domain/tarot/cards";
import type {
  DrawnTarotCard,
  TarotArchetype,
  TarotPosition,
  TransportMode,
  TripIntent,
} from "@/domain/types";

export type ArchetypeWeights = Partial<Record<TarotArchetype, number>>;

export interface DestinationDraw {
  seed: string;
  cards: DrawnTarotCard[];
}

const DESTINATION_POSITIONS: TarotPosition[] = ["Зов", "Дар"];

export function ritualSeed(intent: TripIntent): string {
  return [
    intent.departureCity.trim().toLocaleLowerCase("ru-RU"),
    intent.dateFrom,
    intent.dateTo,
    String(intent.travelerCount),
  ].join("|");
}

// Deterministic 32-bit hash. Same string always yields the same number, so the
// same intent always yields the same reading.
function hash(input: string): number {
  let value = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function pick<T>(pool: T[], salt: string): T {
  return pool[hash(salt) % pool.length];
}

function isReversed(salt: string): boolean {
  return (hash(`${salt}|orientation`) & 1) === 1;
}

export function drawDestinationCards(intent: TripIntent): DestinationDraw {
  const seed = ritualSeed(intent);
  const cards: DrawnTarotCard[] = [];

  for (const position of DESTINATION_POSITIONS) {
    const salt = `${seed}|${position}`;
    const pool = tarotCards.filter((card) => !cards.some((drawn) => drawn.id === card.id));
    const card = pick(pool, salt);
    cards.push({ ...card, position, reversed: isReversed(salt) });
  }

  return { seed, cards };
}

export function drawPathCard(
  seed: string,
  usableModes: TransportMode[],
  excludeIds: string[],
): DrawnTarotCard {
  const remaining = tarotCards.filter((card) => !excludeIds.includes(card.id));
  const matching = remaining.filter((card) =>
    card.transport.some((mode) => usableModes.includes(mode)),
  );
  // No usable mode, or every matching card is already on the table: a loose
  // card-to-road link beats no card at all.
  const pool = matching.length > 0 ? matching : remaining;
  const salt = `${seed}|Путь`;

  return { ...pick(pool, salt), position: "Путь", reversed: isReversed(salt) };
}

export function archetypeWeightsFrom(cards: DrawnTarotCard[]): ArchetypeWeights {
  const weights: ArchetypeWeights = {};
  for (const card of cards) {
    const weight = card.reversed ? 0.5 : 1;
    for (const archetype of card.archetypes) {
      weights[archetype] = (weights[archetype] ?? 0) + weight;
    }
  }
  return weights;
}
```

Remove the now-unused `TarotSpread` interface from `src/domain/types.ts`.

- [ ] **Step 4: Teach scoring to use weights**

In `src/domain/travel/scoring.ts`, replace the input type and the archetype term:

```ts
import type { ArchetypeWeights } from "@/domain/tarot/engine";
import type { DestinationSelection, TripIntent } from "@/domain/types";
import { travelAtlas } from "./atlas";

export interface DestinationSelectionInput extends TripIntent {
  archetypeWeights: ArchetypeWeights;
}
```

and inside `selectDestination`, replace the `archetypeHits` block with:

```ts
    const archetypeHits = destination.tarotArchetypes.filter(
      (tag) => (input.archetypeWeights[tag] ?? 0) > 0,
    );
    const archetypeScore = archetypeHits.reduce(
      (total, tag) => total + (input.archetypeWeights[tag] ?? 0),
      0,
    );
    const seasonScore = destination.season.includes(season) ? 2 : 0;
    const sourceScore = destination.source === "provereno.tutu" ? 1.5 : destination.source === "geo.tutu" ? 1 : 0;
    const score = archetypeScore * 3 + seasonScore + sourceScore;
```

Leave `reasons`, the sort and the return shape untouched.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- tests/domain/tarot-engine.test.ts tests/domain/travel-scoring.test.ts tests/domain/deck.test.ts`
Expected: PASS.

`npm run test` overall still fails — `runRitual`, the narrator and the components have not been updated. Task 6 closes that.

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/domain/tarot/engine.ts src/domain/travel/scoring.ts tests/domain
git commit -m "feat: split the draw into destination and path phases"
```

---

### Task 4: Multitransport client and normalization

**Files:**
- Modify: `src/server/tutu/normalize.ts`
- Modify: `src/server/tutu/mcpClient.ts`
- Modify: `tests/server/tutu-normalize.test.ts`

**Interfaces:**
- Consumes: `TransportMode` from Task 1.
- Produces:
  - `NormalizedOffer` gains `mode?: TransportMode`.
  - `ModeSummary = { count: number; minPrice: number | null; minDurationMin: number | null }`, `ModesSummary = Partial<Record<TransportMode, ModeSummary>>`, both exported from `src/domain/types.ts`.
  - `readModesSummary(raw: unknown): ModesSummary` from `normalize.ts`.
  - `searchTutuOffers(input): Promise<TutuSearchResult>` where `TutuSearchResult = { transport: NormalizedOffer[]; hotels: NormalizedOffer[]; modesSummary: ModesSummary; warnings: string[] }`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/server/tutu-normalize.test.ts`. The fixtures below are trimmed from real responses measured on 2026-08-09 — keep the field names exactly.

```ts
import { readModesSummary, normalizeTransportOffers } from "@/server/tutu/normalize";

const vladimirResponse = {
  variants: [
    {
      offer_id: "4abc27df",
      transport: "railway",
      price: { amount: 691.77, currency: "RUB" },
      duration_min: 105,
      carriers: ["ФПК"],
      search_results_url: "https://www.tutu.ru/poezda/rasp_d.php?date=10.09.2026",
      checkout_url: "https://www.tutu.ru/poezda/order/?tn=705",
    },
  ],
  meta: {
    modes_summary: {
      railway: { count: 19, min_price: 691.77, min_duration_min: 104 },
      bus: { count: 6, min_price: 3220, min_duration_min: 150 },
    },
    unavailable: [{ mode: "avia", reason: "no_route" }],
  },
};

describe("multitransport normalization", () => {
  it("reads variants and carries the mode from the response", () => {
    const offers = normalizeTransportOffers(vladimirResponse);
    expect(offers).toHaveLength(1);
    expect(offers[0].mode).toBe("railway");
    expect(offers[0].price).toBe("691.77 RUB");
    expect(offers[0].url).toContain("tutu.ru");
  });

  it("reads per-mode availability from meta, not from the variant list", () => {
    const summary = readModesSummary(vladimirResponse);
    expect(summary.railway).toEqual({ count: 19, minPrice: 691.77, minDurationMin: 104 });
    // Only one railway variant was returned on this page, yet six buses exist.
    expect(summary.bus?.count).toBe(6);
    expect(summary.avia).toBeUndefined();
  });
});
```

Add a second block for the tool-error-as-text behaviour:

```ts
describe("tool errors delivered as text", () => {
  it("surfaces the tool message instead of a JSON parse complaint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "x",
          result: {
            content: [{ type: "text", text: "Error executing tool search_multitransport: 1 validation error" }],
          },
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchTutuOffers({ intent, destination });

    expect(result.warnings.join(" ")).toContain("Error executing tool");
    expect(result.warnings.join(" ")).not.toContain("not valid JSON");
    vi.unstubAllGlobals();
  });
});
```

Reuse the existing `intent` and `destination` fixtures already declared in this file, and add `mode` where the file constructs expected offers.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- tests/server/tutu-normalize.test.ts`
Expected: FAIL — `readModesSummary` is not exported, `variants` is not read, `mode` is undefined, and the tool error still surfaces as "result content is not valid JSON".

- [ ] **Step 3: Add the summary types**

Append to `src/domain/types.ts`:

```ts
export interface ModeSummary {
  count: number;
  minPrice: number | null;
  minDurationMin: number | null;
}

export type ModesSummary = Partial<Record<TransportMode, ModeSummary>>;
```

- [ ] **Step 4: Extend normalization**

In `src/server/tutu/normalize.ts`, add `variants` to `readItems`, carry the mode, and add the summary reader:

```ts
import type { ModesSummary, TransportMode } from "@/domain/types";

export interface NormalizedOffer {
  id: string;
  title: string;
  price?: string;
  subtitle?: string;
  url?: string;
  mode?: TransportMode;
}

const MODES: TransportMode[] = ["avia", "railway", "bus"];

function readMode(value: unknown): TransportMode | undefined {
  return MODES.find((mode) => mode === value);
}

export function readModesSummary(raw: unknown): ModesSummary {
  const meta = raw && typeof raw === "object" ? (raw as { meta?: unknown }).meta : undefined;
  const source = meta && typeof meta === "object"
    ? (meta as { modes_summary?: unknown }).modes_summary
    : undefined;
  if (!source || typeof source !== "object") return {};

  const summary: ModesSummary = {};
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const mode = readMode(key);
    if (!mode || !value || typeof value !== "object") continue;

    const record = value as { count?: unknown; min_price?: unknown; min_duration_min?: unknown };
    if (typeof record.count !== "number" || record.count <= 0) continue;

    summary[mode] = {
      count: record.count,
      minPrice: typeof record.min_price === "number" ? record.min_price : null,
      minDurationMin: typeof record.min_duration_min === "number" ? record.min_duration_min : null,
    };
  }
  return summary;
}
```

In `readItems`, add the `variants` branch before the `offers` branch:

```ts
  if (raw && typeof raw === "object" && Array.isArray((raw as { variants?: unknown }).variants)) {
    return (raw as { variants: unknown[] }).variants;
  }
```

In `normalizeTransportOffers`, add `mode: readMode(record.transport)` to the returned object, and extend `transportTitle` so the label follows the mode:

```ts
function transportTitle(record: Record<string, unknown>): string {
  const explicitTitle = readString(record.title);
  if (explicitTitle) return explicitTitle;

  const labels: Record<string, string> = {
    avia: "Авиабилеты",
    railway: "Поезд",
    bus: "Автобус",
  };
  const label = labels[String(record.transport)] ?? "Билеты";
  const carriers = readStringList(record.carriers);
  return carriers.length > 0 ? `${label}: ${carriers.join(", ")}` : label;
}
```

- [ ] **Step 5: Rewrite the client to one multitransport call**

In `src/server/tutu/mcpClient.ts`:

Recognise a tool error delivered as text. In `unwrapMcpResponse`, replace the final `JSON.parse` block with:

```ts
  if (/^Error executing tool/i.test(textBlock.text.trim())) {
    throw new Error(textBlock.text.trim());
  }

  try {
    return JSON.parse(textBlock.text);
  } catch {
    throw new Error(`Tutu MCP ${name} result content is not valid JSON`);
  }
```

Give both calls one shared deadline instead of one timeout each. `callTool` stops owning a timer and takes a signal instead. Replace the whole function:

```ts
async function callTool(
  endpoint: string,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  const requestId = `${name}-${Date.now()}`;
  const response = await fetch(endpoint, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: requestId,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  if (!response.ok) throw new Error(`Tutu MCP ${name} failed with ${response.status}`);

  const contentType = response.headers.get("content-type")?.toLowerCase();
  const raw = contentType?.includes("text/event-stream")
    ? parseSseResponse(await response.text(), name, requestId)
    : await response.json();

  return unwrapMcpResponse(raw, name);
}
```

`requestId` is still computed before the request and still handed to `parseSseResponse` — SSE responses are matched by id, and losing that would let a progress notification be mistaken for the result. Only the timer moves out.

Replace `searchTutuOffers`:

```ts
const SEARCH_BUDGET_MS = 18_000;

export interface TutuSearchResult {
  transport: NormalizedOffer[];
  hotels: NormalizedOffer[];
  modesSummary: ModesSummary;
  warnings: string[];
}

export async function searchTutuOffers(input: TutuSearchInput): Promise<TutuSearchResult> {
  const endpoint = input.endpoint || process.env.TUTU_MCP_URL || DEFAULT_MCP_URL;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), SEARCH_BUDGET_MS);
  const warnings: string[] = [];

  try {
    const [roads, stays] = await Promise.allSettled([
      callTool(endpoint, "search_multitransport", {
        origin: input.intent.departureCity,
        destination: input.destination.nearestTransportHub,
        departure_date: input.intent.dateFrom,
        adults: input.intent.travelerCount,
        modes: ["avia", "railway", "bus"],
        optimize_for: "price",
        page_size: 20,
        view: "compact",
      }, controller.signal),
      callTool(endpoint, "search_hotels", {
        city_name: input.destination.hotelSearchCity,
        check_in: input.intent.dateFrom,
        check_out: input.intent.dateTo,
        adults: input.intent.travelerCount,
        page_size: 5,
        view: "compact",
      }, controller.signal),
    ]);

    let transport: NormalizedOffer[] = [];
    let modesSummary: ModesSummary = {};
    if (roads.status === "fulfilled") {
      transport = normalizeTransportOffers(roads.value);
      modesSummary = readModesSummary(roads.value);
    } else {
      warnings.push(roads.reason instanceof Error ? roads.reason.message : "Tutu transport search failed");
    }

    let hotels: NormalizedOffer[] = [];
    if (stays.status === "fulfilled") {
      hotels = normalizeHotelOffers(stays.value);
    } else {
      warnings.push(stays.reason instanceof Error ? stays.reason.message : "Tutu hotel search failed");
    }

    if (transport.length === 0) transport = [transportFallback(input)];
    if (hotels.length === 0) hotels = [hotelFallback(input)];

    return { transport, hotels, modesSummary, warnings };
  } finally {
    clearTimeout(deadline);
  }
}
```

The literal inside `modes` is `railway`, never `rail`. Passing `rail` fails server-side validation, and the failure arrives as text rather than as a JSON-RPC error.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test -- tests/server/tutu-normalize.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/domain/types.ts src/server/tutu tests/server/tutu-normalize.test.ts
git commit -m "feat: search all transport modes in one mcp call"
```

---

### Task 5: Usable modes and the sanity filter

**Files:**
- Create: `src/domain/travel/roads.ts`
- Test: `tests/domain/roads.test.ts` (create)

**Interfaces:**
- Consumes: `ModesSummary`, `TransportMode`, `TripIntent`.
- Produces: `usableModes(summary: ModesSummary, intent: TripIntent): TransportMode[]`, ordered `avia, railway, bus`.

- [ ] **Step 1: Write the failing test**

Create `tests/domain/roads.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { usableModes } from "@/domain/travel/roads";
import type { TripIntent } from "@/domain/types";

const week: TripIntent = {
  departureCity: "Москва",
  dateFrom: "2026-09-10",
  dateTo: "2026-09-17",
  travelerCount: 2,
};

describe("usableModes", () => {
  it("keeps modes that exist and fit the trip (Владимир: no air)", () => {
    const modes = usableModes(
      {
        railway: { count: 19, minPrice: 691.77, minDurationMin: 104 },
        bus: { count: 6, minPrice: 3220, minDurationMin: 150 },
      },
      week,
    );
    expect(modes).toEqual(["railway", "bus"]);
  });

  it("drops a road that eats the holiday (Владивосток: 9330 min by rail)", () => {
    const modes = usableModes(
      {
        avia: { count: 22, minPrice: 40320, minDurationMin: 495 },
        railway: { count: 2, minPrice: 20629, minDurationMin: 9330 },
      },
      week,
    );
    expect(modes).toEqual(["avia"]);
  });

  it("keeps the fastest mode when the sanity filter would empty the set", () => {
    const modes = usableModes(
      {
        railway: { count: 2, minPrice: 20629, minDurationMin: 9330 },
        bus: { count: 1, minPrice: 9000, minDurationMin: 12000 },
      },
      { ...week, dateTo: "2026-09-11" },
    );
    expect(modes).toEqual(["railway"]);
  });

  it("returns nothing when nothing exists", () => {
    expect(usableModes({}, week)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/domain/roads.test.ts`
Expected: FAIL — cannot resolve `@/domain/travel/roads`.

- [ ] **Step 3: Write the module**

Create `src/domain/travel/roads.ts`:

```ts
import type { ModesSummary, TransportMode, TripIntent } from "@/domain/types";

const MODE_ORDER: TransportMode[] = ["avia", "railway", "bus"];
const MINUTES_PER_DAY = 24 * 60;

// A road may not eat more than a third of the holiday in one direction.
// Moscow to Vladivostok by rail is 9330 minutes — six and a half days each
// way against a seven-day trip. It exists, and it is not a road.
const MAX_SHARE_OF_TRIP = 1 / 3;

function tripMinutes(intent: TripIntent): number {
  const from = Date.parse(`${intent.dateFrom}T00:00:00Z`);
  const to = Date.parse(`${intent.dateTo}T00:00:00Z`);
  const days = Number.isFinite(from) && Number.isFinite(to) ? (to - from) / 86_400_000 : 1;
  return Math.max(1, days) * MINUTES_PER_DAY;
}

export function usableModes(summary: ModesSummary, intent: TripIntent): TransportMode[] {
  const existing = MODE_ORDER.filter((mode) => (summary[mode]?.count ?? 0) > 0);
  if (existing.length === 0) return [];

  const budget = tripMinutes(intent) * MAX_SHARE_OF_TRIP;
  const sane = existing.filter((mode) => {
    const duration = summary[mode]?.minDurationMin;
    return duration === null || duration === undefined || duration <= budget;
  });
  if (sane.length > 0) return sane;

  // Everything is too slow. A long road still beats no road.
  const fastest = [...existing].sort(
    (a, b) => (summary[a]?.minDurationMin ?? Infinity) - (summary[b]?.minDurationMin ?? Infinity),
  )[0];
  return [fastest];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- tests/domain/roads.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/travel/roads.ts tests/domain/roads.test.ts
git commit -m "feat: pick roads that exist and fit the trip"
```

---

### Task 6: Two-phase orchestration

**Files:**
- Create: `src/domain/tarot/roadReason.ts`
- Modify: `src/server/ritual/runRitual.ts`
- Modify: `src/server/oracle/narrator.ts`
- Modify: `src/app/api/ritual/route.ts`
- Modify: `tests/server/run-ritual.test.ts`
- Modify: `tests/server/narrator.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3, 4 and 5.
- Produces: `RitualResult` with `spreadCards: DrawnTarotCard[]` (length 3) and `roadChoice: RoadChoice` where `RoadChoice = { mode: TransportMode | null; reason: string; best: NormalizedOffer | null }`. The `cards` field is gone.

- [ ] **Step 1: Write the failing test**

Replace `tests/server/run-ritual.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { runRitual } from "@/server/ritual/runRitual";
import type { TripIntent } from "@/domain/types";

const intent: TripIntent = {
  departureCity: "Москва",
  dateFrom: "2026-09-10",
  dateTo: "2026-09-17",
  travelerCount: 2,
};

function searchStub(summary: Record<string, unknown>, offers: unknown[] = []) {
  return vi.fn().mockResolvedValue({
    transport: offers,
    hotels: [{ id: "hotel-0", title: "Отель" }],
    modesSummary: summary,
    warnings: [],
  });
}

describe("runRitual", () => {
  it("draws three cards with one job each", async () => {
    const result = await runRitual(intent, {
      searchOffers: searchStub({ railway: { count: 5, minPrice: 700, minDurationMin: 104 } }, [
        { id: "t-0", title: "Поезд: ФПК", mode: "railway", url: "https://www.tutu.ru/poezda/" },
      ]),
    });

    expect(result.spreadCards.map((card) => card.position)).toEqual(["Зов", "Дар", "Путь"]);
    expect(new Set(result.spreadCards.map((card) => card.id)).size).toBe(3);
  });

  it("never names a road that does not exist", async () => {
    const result = await runRitual(intent, {
      searchOffers: searchStub({ railway: { count: 5, minPrice: 700, minDurationMin: 104 } }, [
        { id: "t-0", title: "Поезд: ФПК", mode: "railway", url: "https://www.tutu.ru/poezda/" },
      ]),
    });

    expect(result.roadChoice.mode).toBe("railway");
    expect(result.spreadCards[2].transport).toContain("railway");
    expect(result.roadChoice.best?.mode).toBe("railway");
    expect(result.roadChoice.reason).toContain(result.spreadCards[2].name);
  });

  it("falls back to fog when the search found no road at all", async () => {
    const result = await runRitual(intent, { searchOffers: searchStub({}) });

    expect(result.roadChoice.mode).toBeNull();
    expect(result.roadChoice.reason).toContain("туман");
    expect(result.spreadCards).toHaveLength(3);
  });

  it("is deterministic against the same search response", async () => {
    const summary = { avia: { count: 3, minPrice: 9000, minDurationMin: 300 } };
    const first = await runRitual(intent, { searchOffers: searchStub(summary) });
    const second = await runRitual(intent, { searchOffers: searchStub(summary) });

    expect(second.spreadCards.map((card) => `${card.id}:${card.reversed}`)).toEqual(
      first.spreadCards.map((card) => `${card.id}:${card.reversed}`),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/server/run-ritual.test.ts`
Expected: FAIL — `roadChoice` does not exist and `runRitual` still draws three cards up front.

- [ ] **Step 3: Write the road voice**

Create `src/domain/tarot/roadReason.ts`:

```ts
import type { DrawnTarotCard, TransportMode } from "@/domain/types";

const UPRIGHT: Record<TransportMode, string> = {
  avia: "поднимает над землёй — дорога будет короткой и резкой",
  railway: "сажает к окну — дорога будет долгой и созерцательной",
  bus: "ведёт по земле — дорога будет упрямой и близкой",
};

const REVERSED: Record<TransportMode, string> = {
  avia: "поднимает над землёй, но неохотно — в пути будет тряско",
  railway: "сажает к окну и просит терпения — время растянется",
  bus: "ведёт по земле через сопротивление — дорога вымотает",
};

export const FOG_REASON =
  "Дорога скрыта туманом: карты не увидели ни одного пути, который можно проверить сегодня.";

export function roadReason(card: DrawnTarotCard, mode: TransportMode | null): string {
  if (!mode) return FOG_REASON;
  const phrase = card.reversed ? REVERSED[mode] : UPRIGHT[mode];
  return `«${card.name}» ${phrase}.`;
}
```

- [ ] **Step 4: Rewrite the orchestration**

Replace `src/server/ritual/runRitual.ts`:

```ts
import { archetypeWeightsFrom, drawDestinationCards, drawPathCard } from "@/domain/tarot/engine";
import { FOG_REASON, roadReason } from "@/domain/tarot/roadReason";
import { usableModes } from "@/domain/travel/roads";
import { selectDestination } from "@/domain/travel/scoring";
import type { DrawnTarotCard, TransportMode, TravelAtlasItem, TripIntent } from "@/domain/types";
import { createPrediction, type PredictionText } from "@/server/oracle/narrator";
import { searchTutuOffers } from "@/server/tutu/mcpClient";
import type { NormalizedOffer } from "@/server/tutu/normalize";

export interface RoadChoice {
  mode: TransportMode | null;
  reason: string;
  best: NormalizedOffer | null;
}

export interface RitualResult {
  ritualId: string;
  seed: string;
  spreadCards: DrawnTarotCard[];
  destination: TravelAtlasItem;
  prediction: PredictionText;
  roadChoice: RoadChoice;
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
  // Phase 1: two cards choose where.
  const draw = drawDestinationCards(input);
  const selection = selectDestination({
    ...input,
    archetypeWeights: archetypeWeightsFrom(draw.cards),
  });

  // Phase 2: reality reports which roads exist, then the third card names one.
  const searchOffers = deps.searchOffers || searchTutuOffers;
  const offers = await searchOffers({ intent: input, destination: selection.destination });
  const modes = usableModes(offers.modesSummary, input);
  const pathCard = drawPathCard(draw.seed, modes, draw.cards.map((card) => card.id));

  const mode = pathCard.transport.find((candidate) => modes.includes(candidate)) ?? null;
  const best = mode
    ? offers.transport.find((offer) => offer.mode === mode) ?? null
    : null;
  const roadChoice: RoadChoice = {
    mode,
    reason: mode ? roadReason(pathCard, mode) : FOG_REASON,
    best,
  };

  const spreadCards = [...draw.cards, pathCard];
  const prediction = await createPrediction({
    intent: input,
    spread: { seed: draw.seed, cards: spreadCards },
    selection,
    roadChoice,
    offers: {
      transport: offers.transport.map((offer) => offer.title),
      hotels: offers.hotels.map((offer) => offer.title),
    },
    aiApiKey: deps.aiApiKey ?? process.env.OPENAI_API_KEY,
  });

  const sourceLinks = [
    {
      label: selection.destination.source === "provereno.tutu" ? "Проверенный маршрут Туту" : "Источник маршрута",
      url: selection.destination.sourceUrl,
    },
    ...(selection.destination.geoUrl ? [{ label: "Путеводитель Туту", url: selection.destination.geoUrl }] : []),
  ];

  return {
    ritualId: Buffer.from(draw.seed).toString("base64url").slice(0, 12),
    seed: draw.seed,
    spreadCards,
    destination: selection.destination,
    prediction,
    roadChoice,
    transportOffers: offers.transport,
    hotelOffers: offers.hotels,
    sourceLinks,
    warnings: offers.warnings,
  };
}
```

- [ ] **Step 5: Update the narrator's input type**

In `src/server/oracle/narrator.ts`, the `spread` parameter no longer carries `archetypes`, and a `roadChoice` arrives. Change the input interface so `spread` is `{ seed: string; cards: DrawnTarotCard[] }` and add `roadChoice: RoadChoice`. Append the road sentence to the app-owned summary:

```ts
  const summary = [baseSummary, input.roadChoice.reason].filter(Boolean).join(" ");
```

Do not pass `roadChoice` into the AI prompt as free text and do not let the AI rewrite it. The AI contract is unchanged: it may return a validated flavour key and nothing else. Update `tests/server/narrator.test.ts` fixtures to supply `roadChoice` and the new card fields (`number`, `image`, `transport`, `meaningReversed`, `reversed`).

- [ ] **Step 6: Give the route a duration budget**

Read `node_modules/next/dist/docs/` for the route segment config supported by this Next version, then add the segment export to `src/app/api/ritual/route.ts` alongside the existing handler:

```ts
export const maxDuration = 30;
```

The MCP search budget is 18 s; 30 s leaves room for narration and cold start. Do not raise it past what the deployment plan allows.

- [ ] **Step 7: Run the full suite**

Run: `npm run test`
Expected: PASS, all files. Then `npx tsc --noEmit` and `npm run lint` — both clean. Component tests referencing `result.cards` must be updated to `spreadCards` here; that is part of this task.

- [ ] **Step 8: Commit**

```bash
git add src/domain/tarot/roadReason.ts src/server src/app/api/ritual/route.ts tests/server
git commit -m "feat: let reality pick the road before the card names it"
```

---

### Task 7: Card rendering with real artwork and reversals

**Files:**
- Modify: `src/components/TarotCardView.tsx`
- Modify: `src/components/RitualScene.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/components/tarot-card-view.test.tsx`

**Interfaces:**
- Consumes: `DrawnTarotCard` and the committed images.
- Produces: `TarotCardView` props `{ card: DrawnTarotCard; revealed: boolean; testId?: string }`.

- [ ] **Step 1: Write the failing test**

Replace `tests/components/tarot-card-view.test.tsx`:

```ts
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TarotCardView } from "@/components/TarotCardView";
import type { DrawnTarotCard } from "@/domain/types";

const tower: DrawnTarotCard = {
  id: "tower", number: 16, name: "Башня", image: "/tarot/16-tower.webp",
  archetypes: ["cliffs"], transport: ["avia"],
  meaning: "камень, высота и резкая перемена взгляда",
  meaningReversed: "обвал случился раньше, теперь строят заново",
  position: "Зов", reversed: false,
};

describe("TarotCardView", () => {
  it("shows the artwork and the upright meaning when revealed", () => {
    render(<TarotCardView card={tower} revealed />);
    expect(screen.getByRole("img", { name: /Башня/ })).toHaveAttribute(
      "src", expect.stringContaining("16-tower"),
    );
    expect(screen.getByText(tower.meaning)).toBeInTheDocument();
  });

  it("marks a reversed card and shows its reversed meaning", () => {
    render(<TarotCardView card={{ ...tower, reversed: true }} revealed />);
    expect(screen.getByTestId("tarot-card")).toHaveAttribute("data-reversed", "true");
    expect(screen.getByText(tower.meaningReversed)).toBeInTheDocument();
    expect(screen.queryByText(tower.meaning)).not.toBeInTheDocument();
  });

  it("hides the artwork before the reveal", () => {
    render(<TarotCardView card={tower} revealed={false} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/components/tarot-card-view.test.tsx`
Expected: FAIL — the component takes `name`/`meaning` strings and renders a glyph.

- [ ] **Step 3: Rewrite the component**

Replace `src/components/TarotCardView.tsx`. Read the Next image guide in `node_modules/next/dist/docs/` first and follow whatever that version requires; a plain `<img>` is acceptable if the guide's component demands configuration this project does not have.

```tsx
import type { DrawnTarotCard } from "@/domain/types";

interface TarotCardViewProps {
  card: DrawnTarotCard;
  revealed: boolean;
  testId?: string;
}

export function TarotCardView({ card, revealed, testId }: TarotCardViewProps) {
  const meaning = card.reversed ? card.meaningReversed : card.meaning;

  return (
    <figure
      className="tarot-card"
      data-revealed={revealed}
      data-reversed={card.reversed}
      data-card-id={card.id}
      data-testid={testId ?? "tarot-card"}
    >
      <div className="tarot-card__back" aria-hidden={revealed} />
      {revealed ? (
        <div className="tarot-card__face">
          <small className="tarot-card__position">{card.position}</small>
          <img
            className="tarot-card__art"
            src={card.image}
            alt={`${card.name}${card.reversed ? ", перевёрнутая" : ""}`}
            width={600}
            height={1032}
          />
          <figcaption>
            <strong>{card.name}</strong>
            {card.reversed ? <em className="tarot-card__flag">перевёрнутая</em> : null}
            <p>{meaning}</p>
          </figcaption>
        </div>
      ) : null}
    </figure>
  );
}
```

- [ ] **Step 4: Style the card**

In `src/app/globals.css`, replace the existing `.tarot-card__symbol` rules with artwork rules. The aspect ratio is fixed so nothing shifts during the reveal, and the rotation is the only thing orientation changes:

```css
.tarot-card__art {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 600 / 1032;
  object-fit: cover;
  border-radius: 10px;
}

.tarot-card[data-reversed="true"] .tarot-card__art {
  transform: rotate(180deg);
}

.tarot-card__back {
  border-radius: 10px;
  background-color: #1b1024;
  background-image:
    repeating-linear-gradient(45deg, rgba(232, 200, 135, 0.14) 0 2px, transparent 2px 9px),
    repeating-linear-gradient(-45deg, rgba(232, 200, 135, 0.14) 0 2px, transparent 2px 9px);
}

.tarot-card__flag {
  font-style: normal;
  letter-spacing: 0.04em;
  text-transform: lowercase;
  opacity: 0.75;
}
```

Update `RitualScene.tsx` only where it referenced the removed glyph helper; the dealing scene keeps showing backs, not faces.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- tests/components/tarot-card-view.test.tsx`
Expected: PASS, 3 tests. Then `npm run test` overall, `npm run lint`, `npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add src/components/TarotCardView.tsx src/components/RitualScene.tsx src/app/globals.css tests/components/tarot-card-view.test.tsx
git commit -m "feat: render real tarot artwork with orientation"
```

---

### Task 8: The road block in the result

**Files:**
- Modify: `src/components/TravelResult.tsx`
- Modify: `src/components/OfferList.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/components/travel-result.test.tsx`
- Modify: `tests/e2e/ritual-flow.spec.ts`

**Interfaces:**
- Consumes: `RitualResult` from Task 6 and `TarotCardView` from Task 7.
- Produces: the rendered result. No new exported types.

- [ ] **Step 1: Write the failing test**

Add to `tests/components/travel-result.test.tsx`. Extend the existing fixture into `resultWithRoad` by adding `spreadCards` (three cards with the full Task 1 card shape, the third one `"Отшельник"` with `transport: ["railway"]`) and `roadChoice: { mode: "railway", reason: "«Отшельник» сажает к окну — дорога будет долгой и созерцательной.", best: { id: "t-0", title: "Поезд: ФПК", price: "691.77 RUB", mode: "railway", url: "https://www.tutu.ru/poezda/" } }`. Import `within` from `@testing-library/react` and `FOG_REASON` from `@/domain/tarot/roadReason`.

```ts
  it("leads the roads with the one the card chose", () => {
    render(<TravelResult result={resultWithRoad} />);

    const road = screen.getByRole("region", { name: "Дорога, которую выбрала карта" });
    expect(road).toHaveTextContent("Поезд: ФПК");
    expect(road).toHaveTextContent("«Отшельник»");
    expect(within(road).getByRole("link")).toHaveAttribute(
      "href", expect.stringContaining("tutu.ru"),
    );
  });

  it("shows the fog message and no hero road when nothing was found", () => {
    render(<TravelResult result={{ ...resultWithRoad, roadChoice: { mode: null, reason: FOG_REASON, best: null } }} />);

    const road = screen.getByRole("region", { name: "Дорога, которую выбрала карта" });
    expect(road).toHaveTextContent("туман");
    expect(within(road).queryByRole("link")).toBeNull();
  });

  it("keeps the prediction above the roads", () => {
    const { container } = render(<TravelResult result={resultWithRoad} />);
    const order = Array.from(container.querySelectorAll("[data-block]")).map(
      (node) => node.getAttribute("data-block"),
    );
    expect(order).toEqual(["prediction", "spread", "road", "other-roads", "hotels", "sources"]);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/components/travel-result.test.tsx`
Expected: FAIL — no `road` region exists.

- [ ] **Step 3: Render the road block**

In `src/components/TravelResult.tsx`, tag each section with `data-block` in the order above, render the three cards through `TarotCardView`, and insert between the spread and the remaining offers:

```tsx
      <section className="road" data-block="road" aria-label="Дорога, которую выбрала карта">
        <h3>Дорога, которую выбрала карта</h3>
        <p className="road__reason">{result.roadChoice.reason}</p>
        {result.roadChoice.best ? (
          <a className="road__hero" href={result.roadChoice.best.url} target="_blank" rel="noreferrer">
            <strong>{result.roadChoice.best.title}</strong>
            {result.roadChoice.best.subtitle ? <span>{result.roadChoice.best.subtitle}</span> : null}
            {result.roadChoice.best.price ? <b>{result.roadChoice.best.price}</b> : null}
          </a>
        ) : null}
      </section>
```

In `OfferList.tsx`, group by `mode` with the labels `Самолёт`, `Поезд`, `Автобус`, skip empty groups, and drop the hero offer from the remaining list by `id`. Keep the existing behaviour that an offer without a URL renders as plain content rather than a dead `href="#"` link.

- [ ] **Step 4: Style it**

Add to `globals.css` a `.road` block reusing the existing surface tokens, and give `.road__hero` `display: grid` with `min-width: 0` and `overflow-wrap: anywhere` so long carrier names cannot break the grid at 375px.

- [ ] **Step 5: Extend the e2e flow**

In `tests/e2e/ritual-flow.spec.ts`, extend the mocked `/api/ritual` body with `spreadCards` carrying `image`, `reversed`, `number`, `transport`, `meaningReversed`, and a `roadChoice` whose `best.url` is on `avia.tutu.ru`. Assert that the road region is visible, that its link points at a Tutu domain, and that all three cards are visible on both the desktop and mobile projects.

- [ ] **Step 6: Run everything**

Run: `npm run test -- tests/components/travel-result.test.tsx`, then `npm run test`, then `npm run test:e2e -- tests/e2e/ritual-flow.spec.ts`, then `npm run lint` and `npx tsc --noEmit`.
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/TravelResult.tsx src/components/OfferList.tsx src/app/globals.css tests/components/travel-result.test.tsx tests/e2e/ritual-flow.spec.ts
git commit -m "feat: lead the result with the road the card chose"
```

---

### Task 9: Date range calendar

**Files:**
- Create: `src/components/DateRangeCalendar.tsx`
- Modify: `src/components/TripIntentForm.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/components/trip-intent-form.test.tsx`
- Test: `tests/components/date-range-calendar.test.tsx` (create)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `DateRangeCalendar` with props `{ value: { from: string | null; to: string | null }; onChange(next): void }`, emitting `YYYY-MM-DD` strings built from local date parts.

- [ ] **Step 1: Write the failing test**

Create `tests/components/date-range-calendar.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateRangeCalendar, toDateKey } from "@/components/DateRangeCalendar";

describe("toDateKey", () => {
  it("uses local date parts, not UTC", () => {
    // 1 March 2026, 00:30 local. toISOString() would report 28 February for
    // every timezone east of UTC, which is all of Russia.
    expect(toDateKey(new Date(2026, 2, 1, 0, 30))).toBe("2026-03-01");
  });
});

describe("DateRangeCalendar", () => {
  function open(value = { from: null, to: null }, onChange = vi.fn()) {
    render(<DateRangeCalendar value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Когда поедете/ }));
    return onChange;
  }

  it("sets the start on the first click and the end on the second", () => {
    const onChange = open();
    fireEvent.click(screen.getByRole("button", { name: "10" }));
    expect(onChange).toHaveBeenLastCalledWith({ from: expect.stringMatching(/-10$/), to: null });

    fireEvent.click(screen.getByRole("button", { name: "17" }));
    expect(onChange).toHaveBeenLastCalledWith({
      from: expect.stringMatching(/-10$/),
      to: expect.stringMatching(/-17$/),
    });
  });

  it("restarts the selection when the second click lands before the start", () => {
    const onChange = open();
    fireEvent.click(screen.getByRole("button", { name: "17" }));
    fireEvent.click(screen.getByRole("button", { name: "10" }));
    expect(onChange).toHaveBeenLastCalledWith({ from: expect.stringMatching(/-10$/), to: null });
  });

  it("closes on Escape", () => {
    open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
```

The month rendered by default is the current month, so the tests must run against days that exist in it. Use days `10` and `17`, which exist in every month, and if the current date is past the 10th, the component still renders those days as disabled — in that case advance one month with the "next month" control before clicking. Write the helper that does this inside the test file rather than duplicating it per case.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/components/date-range-calendar.test.tsx`
Expected: FAIL — cannot resolve `@/components/DateRangeCalendar`.

- [ ] **Step 3: Write the component**

Create `src/components/DateRangeCalendar.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface DateRange {
  from: string | null;
  to: string | null;
}

interface DateRangeCalendarProps {
  value: DateRange;
  onChange: (next: DateRange) => void;
}

// Local date parts on purpose. toISOString() converts to UTC and moves the
// date one day back for every user east of UTC, which is all of Russia.
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const MONTH_FORMAT = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" });
const RANGE_FORMAT = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function monthGrid(year: number, month: number): Array<Date | null> {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday-first
  const days = new Date(year, month + 1, 0).getDate();
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, index) => new Date(year, month, index + 1)),
  ];
}

function nightsBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function label(value: DateRange): string {
  if (!value.from) return "Когда поедете";
  const from = RANGE_FORMAT.format(new Date(`${value.from}T00:00:00`));
  if (!value.to) return `${from} — выберите возвращение`;
  const to = RANGE_FORMAT.format(new Date(`${value.to}T00:00:00`));
  const nights = nightsBetween(value.from, value.to);
  return `${from} – ${to}, ${nights} ноч${nights === 1 ? "ь" : nights < 5 ? "и" : "ей"}`;
}

export function DateRangeCalendar({ value, onChange }: DateRangeCalendarProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const today = useMemo(startOfToday, []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const maxKey = toDateKey(new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()));
  const minKey = toDateKey(today);

  function selectDay(key: string) {
    if (!value.from || value.to || key < value.from) {
      onChange({ from: key, to: null });
      return;
    }
    onChange({ from: value.from, to: key });
    setOpen(false);
  }

  const months = [0, 1].map((offset) => new Date(cursor.getFullYear(), cursor.getMonth() + offset, 1));
  const previewEnd = value.from && !value.to ? hovered : value.to;

  return (
    <div className="calendar">
      <button
        type="button"
        ref={triggerRef}
        className="calendar__trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        {label(value)}
      </button>

      {open ? (
        <div className="calendar__panel" role="dialog" aria-label="Выбор дат поездки">
          <div className="calendar__nav">
            <button type="button" aria-label="Предыдущий месяц"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>←</button>
            <button type="button" aria-label="Следующий месяц"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>→</button>
          </div>

          <div className="calendar__months">
            {months.map((month) => (
              <table className="calendar__month" key={toDateKey(month)}>
                <caption>{MONTH_FORMAT.format(month)}</caption>
                <thead>
                  <tr>{WEEKDAYS.map((day) => <th key={day} scope="col">{day}</th>)}</tr>
                </thead>
                <tbody>
                  {chunk(monthGrid(month.getFullYear(), month.getMonth()), 7).map((week, index) => (
                    <tr key={index}>
                      {week.map((day, dayIndex) => {
                        if (!day) return <td key={dayIndex} />;
                        const key = toDateKey(day);
                        const disabled = key < minKey || key > maxKey;
                        const inRange =
                          Boolean(value.from && previewEnd && key > value.from && key < previewEnd);
                        const edge = key === value.from || key === value.to;
                        return (
                          <td key={dayIndex}>
                            <button
                              type="button"
                              disabled={disabled}
                              aria-pressed={edge}
                              data-in-range={inRange}
                              data-edge={edge}
                              onMouseEnter={() => setHovered(key)}
                              onClick={() => selectDay(key)}
                            >
                              {day.getDate()}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}
```

- [ ] **Step 4: Use it in the form**

In `src/components/TripIntentForm.tsx`, remove the two `<input type="date">` fields and their labels, hold `const [range, setRange] = useState<DateRange>({ from: null, to: null })`, render `<DateRangeCalendar value={range} onChange={setRange} />`, and keep submitting `dateFrom: range.from` and `dateTo: range.to` exactly as before. Disable the submit button while either endpoint is null. Update `tests/components/trip-intent-form.test.tsx` to drive the calendar instead of typing into date inputs; the asserted submitted payload must not change.

- [ ] **Step 5: Style it**

Add `.calendar` rules to `globals.css`: the panel absolutely positioned under the trigger, `.calendar__months` a two-column grid collapsing to one below 720px, range days rendered as a continuous band via `[data-in-range="true"]`, endpoints emphasised via `[data-edge="true"]`, and `:disabled` days at reduced opacity with `cursor: default`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test -- tests/components/date-range-calendar.test.tsx tests/components/trip-intent-form.test.tsx`
Expected: PASS. Then `npm run test`, `npm run lint`, `npx tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add src/components/DateRangeCalendar.tsx src/components/TripIntentForm.tsx src/app/globals.css tests/components
git commit -m "feat: pick the trip as one range on a calendar"
```

---

### Task 10: Live verification against real Tutu MCP

**Files:**
- Create: `scripts/smoke-ritual.mjs`
- Modify: `package.json` (script entry)
- Modify: `README.md`

**Interfaces:**
- Consumes: the running dev server and the live MCP endpoint.
- Produces: a repeatable smoke command. No production code.

This task exists because every silent failure in this project's history — the wrong tool name, `items` instead of `offers`, `rail` instead of `railway` — passed the unit suite while returning nothing. Mocked tests cannot catch a contract drift with a live service.

- [ ] **Step 1: Write the smoke script**

Create `scripts/smoke-ritual.mjs`:

```js
const BASE = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

const CASES = [
  { name: "short haul (rail and bus, no air)", departureCity: "Москва", dateFrom: "2026-09-10", dateTo: "2026-09-13", travelerCount: 2 },
  { name: "long haul (air, absurd rail)", departureCity: "Санкт-Петербург", dateFrom: "2026-09-10", dateTo: "2026-09-17", travelerCount: 2 },
];

let failed = false;

for (const testCase of CASES) {
  const { name, ...intent } = testCase;
  const started = Date.now();
  const response = await fetch(`${BASE}/api/ritual`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(intent),
  });
  const elapsed = Date.now() - started;
  const body = await response.json();

  const cards = body.spreadCards ?? [];
  const road = body.roadChoice ?? {};
  const problems = [];

  if (response.status !== 200) problems.push(`HTTP ${response.status}`);
  if (cards.length !== 3) problems.push(`expected 3 cards, got ${cards.length}`);
  if (road.mode && !cards[2]?.transport?.includes(road.mode)) {
    problems.push(`path card ${cards[2]?.id} does not serve ${road.mode}`);
  }
  if (road.best && !String(road.best.url || "").includes("tutu.ru")) {
    problems.push("hero road does not link to tutu.ru");
  }

  console.log(`\n${name}  ${elapsed}ms  ->  ${body.destination?.name ?? "?"}`);
  console.log(`  cards: ${cards.map((card) => `${card.name}${card.reversed ? "↓" : ""}`).join(", ")}`);
  console.log(`  road:  ${road.mode ?? "fog"}  ${road.best?.title ?? ""} ${road.best?.price ?? ""}`);
  if (body.warnings?.length) console.log(`  warnings: ${body.warnings.join(" | ")}`);
  if (problems.length) {
    failed = true;
    console.log(`  FAIL: ${problems.join("; ")}`);
  }
}

process.exit(failed ? 1 : 0);
```

Add to `package.json` scripts:

```json
"smoke": "node scripts/smoke-ritual.mjs"
```

- [ ] **Step 2: Run the full local verification**

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
npm run test:e2e
```

All must pass before continuing.

- [ ] **Step 3: Run the live smoke**

Start the dev server, then:

Run: `npm run smoke`
Expected: exit code 0, two cases, each naming a destination, three cards, and a road whose mode the third card actually serves. Record the observed timings — if either case approaches the 18 s search budget, say so in the report rather than raising the budget silently.

- [ ] **Step 4: Document it**

Add the smoke command to the `## Verification` block in `README.md`, noting that it needs a running dev server and live network access to Tutu MCP, and that it is the only check that would catch a change in the MCP contract.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-ritual.mjs package.json README.md
git commit -m "test: smoke the ritual against live tutu mcp"
```

---

## Plan Self-Review

**Spec coverage.** Every spec section maps to a task: two-phase ritual → 3 and 6; deck and orientation → 1 and 3; images → 2; multitransport and error-as-text → 4; availability and sanity filter → 5; result presentation → 8; calendar → 9; determinism and degenerate cases → tests in 3, 5 and 6; testing section → distributed, plus 10 for the live contract check.

**Type consistency.** `TransportMode` values are `avia | railway | bus` everywhere, including the MCP `modes` argument. `ModesSummary` is defined in Task 4 and consumed unchanged in 5 and 6. `drawPathCard(seed, usableModes, excludeIds)` has the same signature in Tasks 3 and 6. `RoadChoice` is defined in Task 6 and consumed in 8. `spreadCards` replaces `cards` in Task 6 and every later reference uses `spreadCards`.

**Known transient state.** Tasks 1 and 3 knowingly leave `npm run test` red between them, because the type change ripples through the narrator and components before Task 6 repairs them. This is stated in both tasks so an implementer does not "fix" it by weakening the deck.
