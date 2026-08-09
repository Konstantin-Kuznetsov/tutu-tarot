# Tarot Visuals And Tutu Atlas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a richer Tutu-backed Russian destination atlas and make the selected tarot spread visible with illustrated cards and a stronger reveal animation.

**Architecture:** Keep destination choice deterministic in `src/domain/travel`, using curated data extracted from Tutu Проверено and Tutu Geo pages at build time by committing a static atlas. Return the drawn spread through `/api/ritual`, then render the spread as animated illustrated cards in the result UI while the 3D scene remains the ritual prelude.

**Tech Stack:** Next.js App Router, TypeScript, React, CSS animations, React Three Fiber, Vitest, Testing Library, Playwright.

## Global Constraints

- The app chooses destinations only in Russia.
- `https://provereno.tutu.ru/` is the primary editorial source.
- `https://www.tutu.ru/geo/` is the secondary Tutu source.
- The runtime should not scrape these sites on every user request.
- Destination selection should be deterministic and explainable.
- Use AI only to narrate the chosen match, not to invent arbitrary destinations.
- Tutu MCP remains mandatory for practical transport and hotel results.
- The browser must not call Tutu MCP directly.
- The first screen must stay the actual product experience.
- The page must work on mobile and desktop.
- Motion must respect `prefers-reduced-motion`.
- The app must remain deployable to Vercel without custom servers or runtime filesystem writes.

---

## File Structure

- `src/domain/types.ts`: extend `TravelAtlasItem` with compact editorial fields and expose spread cards in the API view model.
- `src/domain/travel/atlas.ts`: replace the 5-item MVP atlas with a 16-20 item static atlas sourced from Tutu Проверено and Tutu Geo.
- `src/domain/travel/scoring.ts`: keep the existing deterministic scoring contract while ensuring the expanded atlas can diversify by source, season, and archetype.
- `src/server/ritual/runRitual.ts`: include drawn tarot cards and destination editorial notes in the ritual response.
- `src/components/TarotCardView.tsx`: render illustrated card faces instead of text-only faces.
- `src/components/TravelResult.tsx`: show the visible three-card spread above or beside the prediction text.
- `src/components/RitualScene3D.tsx`: make the 3D card movement feel like dealing/revealing without depending on external assets.
- `src/app/globals.css`: add responsive layout and card reveal animations.
- `tests/domain/travel-scoring.test.ts`: cover expanded atlas size and source requirements.
- `tests/server/run-ritual.test.ts`: cover spread cards in the API result.
- `tests/e2e/ritual-flow.spec.ts`: assert visible card names and result spread.

---

### Task 10: Expand Tutu Destination Atlas

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/travel/atlas.ts`
- Modify: `src/domain/travel/scoring.ts`
- Modify: `src/server/ritual/runRitual.ts`
- Test: `tests/domain/travel-scoring.test.ts`
- Test: `tests/server/run-ritual.test.ts`

**Interfaces:**
- Consumes: existing `TravelAtlasItem`, `selectDestination(spread, intent)`, and `runRitual(input)`.
- Produces: at least 16 Russian `TravelAtlasItem` entries; each entry has `sourceUrl`, `nearestTransportHub`, `hotelSearchCity`, `tarotArchetypes`, `season`, and a short app-authored `oracleHook`.
- Produces: ritual API result includes `spreadCards: Array<{ id: string; name: string; position: TarotPosition; meaning: string; archetypes: TarotArchetype[] }>`.

- [ ] **Step 1: Write failing atlas tests**

Add tests that assert:
- `travelAtlas.length >= 16`.
- At least 8 entries have `source === "provereno.tutu"`.
- Every entry has a non-empty `sourceUrl`, `nearestTransportHub`, `hotelSearchCity`, and `oracleHook`.
- `selectDestination` still returns a deterministic destination for the same input.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm run test -- tests/domain/travel-scoring.test.ts`
Expected: FAIL because the atlas has only 5 entries and no `oracleHook`.

- [ ] **Step 3: Extend types and atlas**

Add `oracleHook: string` and optional `routeDays?: number` / `rating?: string` to `TravelAtlasItem`.

Curate static entries from Tutu sources, using paraphrased hooks:
- Калининградская область — `https://provereno.tutu.ru/kaliningradskaya-2025`
- Краснодарский край — `https://provereno.tutu.ru/krasnodarskiy-2025`
- ХМАО — Югра — `https://provereno.tutu.ru/hmao`
- Мурманская область / Хибины — `https://provereno.tutu.ru/murmanskaya-2025`
- Архангельская область — `https://provereno.tutu.ru/`
- Приморский край — `https://provereno.tutu.ru/`
- Республика Алтай — `https://www.tutu.ru/geo/rossiya/kurort/altai_republic/`
- Байкал — `https://www.tutu.ru/geo/rossiya/kurort/baikal/`
- Республика Коми / Маньпупунёр — `https://www.tutu.ru/geo/rossiya/kurort/komi_republic/`
- Республика Тыва — `https://www.tutu.ru/geo/rossiya/kurort/tuva/`
- Республика Хакасия — `https://www.tutu.ru/geo/rossiya/kurort/respublika_hakasiya/`
- Республика Ингушетия — `https://www.tutu.ru/geo/rossiya/kurort/ingushetia/`
- Чеченская Республика — `https://www.tutu.ru/geo/rossiya/kurort/chechnya/`
- Тюмень — `https://www.tutu.ru/geo/rossiya/kurort/tyumen/`
- Суздаль — `https://www.tutu.ru/geo/rossiya/kurort/suzdal/`
- Рускеала / Карелия — `https://www.tutu.ru/geo/`
- Усьвинские Столбы — keep as a fallback-style item until a stable Tutu page is found, with `geoUrl: "https://www.tutu.ru/geo/"`.

- [ ] **Step 4: Return spread cards from ritual**

Update the ritual result to include `spreadCards` from `spread.cards` without exposing server-only internals.

- [ ] **Step 5: Verify GREEN**

Run:
- `npm run test -- tests/domain/travel-scoring.test.ts tests/server/run-ritual.test.ts`
- `npm run test`
- `npx tsc --noEmit`

- [ ] **Step 6: Commit**

Commit message: `feat: expand tutu travel atlas`

---

### Task 11: Illustrated Tarot Spread And Reveal

**Files:**
- Modify: `src/components/TarotCardView.tsx`
- Modify: `src/components/TravelResult.tsx`
- Modify: `src/components/RitualScene3D.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/e2e/ritual-flow.spec.ts`
- Test: component or server tests as needed for the result view model.

**Interfaces:**
- Consumes: `spreadCards` returned by Task 10.
- Produces: a visible three-card spread in the result UI with illustrated card faces, card names, positions, and short meanings.

- [ ] **Step 1: Write failing result visibility test**

Update the E2E ritual flow mock to include `spreadCards`, then assert that the result shows:
- a region heading,
- three visible tarot card elements,
- at least one card name and one card position.

- [ ] **Step 2: Run E2E to verify RED**

Run: `npm run test:e2e -- tests/e2e/ritual-flow.spec.ts`
Expected: FAIL because result UI does not render `spreadCards`.

- [ ] **Step 3: Make cards illustrated**

Update `TarotCardView` to render a symbolic illustrated face per card id/name using CSS classes and small inline decorative elements. Avoid external runtime assets for cards.

- [ ] **Step 4: Render spread in result**

Update `TravelResult` to place a three-card spread near the prediction panel. Cards should animate in order, wrap on mobile, and keep text readable.

- [ ] **Step 5: Improve 3D dealing**

Update `RitualScene3D` positions/rotations/materials so the dealing stage visibly separates three cards from the deck and the result stage leaves them face-up.

- [ ] **Step 6: Add reduced-motion CSS**

Ensure reveal animations collapse to non-animated visible state under `prefers-reduced-motion`.

- [ ] **Step 7: Verify GREEN**

Run:
- `npm run test:e2e -- tests/e2e/ritual-flow.spec.ts`
- `npm run test`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

- [ ] **Step 8: Commit**

Commit message: `feat: reveal illustrated tarot spread`

---

## Self-Review Notes

- The plan keeps scraping out of runtime and commits a static curated atlas.
- The plan avoids long copied guide text; `oracleHook` text is app-authored and source links credit Tutu pages.
- Task 10 and Task 11 are sequential because the visual result consumes `spreadCards`.
