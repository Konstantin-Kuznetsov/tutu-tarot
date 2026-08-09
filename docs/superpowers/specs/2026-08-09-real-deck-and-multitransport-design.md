# Real Tarot Deck And Tutu Multitransport Design

Date: 2026-08-09
Project: Tutu AI Hackathon 2026 prototype

## Goal

Make the ritual look like a real tarot reading and make Tutu MCP drive the result rather than decorate it.

Two changes are designed together because they meet in the same place — the third card:

1. The deck becomes a real deck: 22 Major Arcana with genuine Rider-Waite-Smith imagery, upright and reversed.
2. The road becomes real: the app searches air, rail and bus through Tutu MCP, and the card in the `Путь` position names the road — but only among roads that actually exist.

A third, smaller change rides along because it touches the same form and would be wasteful to schedule separately: the two date inputs become one range calendar.

## Relationship To The Previous Spec

This supersedes parts of `2026-08-09-tarot-travel-agent-design.md`:

- The `3D-сеанс` direction described there no longer exists. The Three.js scene was removed on `cde80e4`; the ritual is a CSS scene. That section is historical.
- The spread positions change from `Зов | Путь | Дар маршрута` to `Зов | Дар | Путь`, in that reveal order.
- Destination selection now uses two cards instead of three.

Everything else in that spec still holds: browser never calls MCP, AI narrates but never chooses, no runtime scraping, Vercel-deployable without a custom server.

## Verified Facts About Tutu MCP

Checked live against `https://mcp.tutu.ru/mcp` on 2026-08-09. These are measurements, not assumptions — the previous iteration lost a review cycle to a guessed tool name and a guessed response field, so the evidence is recorded here.

**Tool inventory (16):** `search_hotels`, `search_avia`, `search_rail`, `search_bus`, `search_etrain`, `search_multitransport`, `get_offer_details`, `get_rail_seatmap`, six `get_*_instructions` playbooks, `create_checkout_link`, `fetch_resource`.

**`search_multitransport` exists.** An earlier session concluded it did not and removed it. That conclusion was wrong.

**Argument names differ per tool.** Passenger count is `adults` in `search_avia` and `search_bus`, but `passengers` in `search_rail`. Copying one tool's arguments to another yields a silently empty list.

**Mode literals are `avia | railway | bus | etrain`.** Passing `rail` fails validation.

**Tool-level errors arrive as plain text inside `result.content[].text`, not as a JSON-RPC `error` member.** The current `unwrapMcpResponse` turns these into the useless message `result content is not valid JSON`.

**`search_multitransport` returns `{ variants, meta }`.** Each variant carries `transport`, `price {amount,currency}`, `duration_min`, `carriers`, `search_results_url`, `checkout_url`, `departure_at`, `arrival_at`, `legs`, `checkout_ref`.

**`meta.modes_summary` reports per-mode availability** — `count`, `min_price`, `min_duration_min` for each requested mode. `meta.unavailable` lists missing modes with a reason.

Two measured routes, both taken as test fixtures because each exercises a different degenerate path:

| Route | Timing | `modes_summary` |
|---|---|---|
| Москва → Владимир, 2026-09-10, 2 pax | 2.1 s | railway 19 (from 691 ₽, 104 min), bus 6 (from 3220 ₽, 150 min), **avia unavailable — `no_route`** |
| Москва → Владивосток, 2026-09-10, 2 pax | 4.1 s | avia 22 (from 40320 ₽, 495 min), railway 2 (from 20629 ₽, **9330 min**), **bus 0** |

For comparison, a single `search_avia` call measured ~9 s. One multitransport call covering all three modes is faster than the one-mode call it replaces.

## Ritual Flow

The ritual runs in two phases. The split exists because of a real circular dependency: the card that names the road cannot be drawn before we know which roads exist, and we cannot search for roads before we know the destination.

**Phase 1 — the destination.**

1. Draw two cards deterministically from the seed `city|dateFrom|dateTo|travellers`: `Зов` (where you are pulled) and `Дар` (what the trip gives you).
2. `selectDestination` scores the atlas against the archetypes of those two cards. The function itself does not change; it simply receives two contributions instead of three.

**Phase 2 — the road.**

3. Call `search_multitransport` and `search_hotels` in parallel under one shared deadline.
4. Compute the set of usable transport modes (see *Availability*).
5. Draw the third card, `Путь`, from the deck filtered to cards whose transport affinity intersects the usable modes, excluding the two already drawn.
6. Narrate. The narrator now knows the card, the chosen mode, and the best concrete option.

Each position now has exactly one job — `Зов` is where, `Дар` is what you get, `Путь` is how you get there. Previously all three fed everything.

**No new latency appears on screen.** The third card is revealed last regardless, and the search finishes inside the existing reveal choreography.

## Availability

A mode is usable when both conditions hold.

**It exists.** `meta.modes_summary[mode].count > 0`. Availability is read from `modes_summary`, never inferred by counting returned variants — `variants` is a merged, price-sorted, paginated list, so a mode can exist and still be absent from page 1.

**It is sane for the trip length.** A mode is dropped when its `min_duration_min` in one direction exceeds one third of the whole trip. Moscow → Vladivostok by rail is 9330 minutes — six and a half days each way against a seven-day holiday. It is technically available and it is not a road; an oracle that names it looks foolish.

```
tripMinutes = max(1, days(dateTo - dateFrom)) * 24 * 60
usable      = count > 0 && min_duration_min <= tripMinutes / 3
```

**If the sanity filter empties the set, keep the single fastest mode.** A long road beats no road.

Known limitation, accepted: the Vladimir case reports `avia … no_route` with the detail "try passing a more specific city name". We treat the mode as unavailable and do not retry with alternate spellings. Retry logic is out of scope; the atlas hub names can be corrected by hand if a specific destination misbehaves.

## Tarot Deck

**22 Major Arcana.** All eight existing cards are already Major Arcana — Отшельник (9), Колесница (7), Башня (16), Звезда (17), Солнце (19), Влюблённые (6), Колесо Фортуны (10), Суд (20). The deck grows to 22; the existing ids are preserved, so current tests keep passing. Fourteen are added: Шут, Маг, Жрица, Императрица, Император, Иерофант, Сила, Справедливость, Повешенный, Смерть, Умеренность, Дьявол, Луна, Мир.

```ts
type TransportMode = "avia" | "railway" | "bus";

interface TarotCardDefinition {
  id: string;                 // "tower" — unchanged
  number: number;             // 0..21
  name: string;               // "Башня"
  image: string;              // "/tarot/16-tower.webp"
  archetypes: TarotArchetype[];
  transport: TransportMode[];
  meaning: string;            // upright
  meaningReversed: string;
}
```

**Archetypes use the existing eleven-value vocabulary only** — `solitude`, `road`, `cliffs`, `water`, `north`, `culture`, `food`, `sun`, `renewal`, `mystery`, `star`. A new archetype that no atlas destination carries is dead weight: the card would influence nothing and the cause would be invisible.

**Every transport mode must be carried by at least six cards.** Long-haul destinations usually offer air only; with three "air" cards the same arcanum would surface on the second run of the demo. A card may carry two modes.

Both constraints are enforced by tests, not by care.

## Card Orientation

A card lands upright or reversed, decided by one deterministic bit derived from the seed and the card's draw index.

- **Rendering:** the image rotates 180°.
- **Text:** the reversed meaning is used, and the narration tone shifts to resistance rather than encouragement.
- **Destination scoring:** a reversed card contributes its archetypes at half weight.
- **Transport:** orientation has no effect. The `Путь` pool is already constrained by real availability, and mixing the two mechanisms would make the road choice hard to explain.

## Card Images

A one-off preparation script, `scripts/prepare-tarot-images.mjs`, run by hand and never at runtime:

1. Download 22 scans from Wikimedia Commons via `Special:FilePath/RWS_Tarot_NN_Name.jpg`. Verified: the naming pattern resolves for all sampled arcana; originals are ~1.1 MB each.
2. Cache originals in a gitignored directory so re-runs do not hammer Commons.
3. Resize to ~600 px wide, apply one shared treatment (warm duotone matching the page palette, light vignette, border), encode WebP.
4. Write `public/tarot/NN-id.webp`.

**The processed images are committed.** No outbound request at runtime, so the page works on Vercel and inside a third-party iframe. Expected weight ~60 KB per card, ~1.4 MB for the deck.

`sharp` moves into `devDependencies` explicitly. It is currently present only transitively through Next and could vanish on any upgrade.

**Rendering:** `TarotCardView` stops drawing glyphs (`△ ◈ ✦`) and renders the image at a fixed aspect ratio (RWS scans are roughly 1:1.72) so nothing shifts during the reveal. The card back is a CSS pattern — no canonical back exists in the public domain and none needs inventing. The Next 16 image API is to be read from `node_modules/next/dist/docs/` before implementation, per `AGENTS.md`.

**Attribution:** the Rider-Waite-Smith deck was published in 1909 and Pamela Colman Smith died in 1951, so the artwork is in the public domain in both Russia and the United States. Credit is not legally required; a short line is shown anyway because the question will be asked.

## Result Presentation

Order on screen, unchanged in principle — magic first, proof second:

1. Prediction headline and text.
2. The three cards, with position, name, orientation and meaning.
3. **«Дорога, которую выбрала карта»** — one prominent option in the chosen mode, with price, duration, carrier and a Tutu link, plus one line explaining why this mode, sourced from the `Путь` card.
4. The remaining usable modes, grouped and collapsed.
5. Hotels.
6. Tutu editorial links (`Проверено`, guide).

## Date Range Calendar

The two `<input type="date">` fields become one range calendar. A holiday is one interval; the form currently makes the user state it twice and never shows the interval itself.

**Built in-house** as `src/components/DateRangeCalendar.tsx`, with no new dependency. `Intl.DateTimeFormat("ru-RU")` supplies month and weekday names, the week starts on Monday, and the page's visual language is hand-written dark CSS that a library calendar would visibly clash with — on the one screen that is supposed to look like a fortune-teller's table.

Behaviour:

- First click sets the start, pointer movement previews the range, second click sets the end.
- A click before the current start restarts the selection from that day rather than producing an inverted range.
- Past days are disabled. The calendar opens on the current month and spans twelve months forward.
- Two months side by side on desktop, one on narrow screens.
- The selected range renders as a continuous band with distinct endpoints — the trip should read as a shape, not as two numbers.
- The choice is echoed in words ("10 – 17 сентября, 7 ночей") so it can be confirmed without re-reading the grid.

**Dates are assembled from local year/month/day, never through `toISOString()`.** That call converts to UTC and silently moves the date one day back for every user east of UTC — which is all of Russia. This is the single most likely bug in this component and it is called out so a test can guard it.

Accessibility, scoped honestly: days are focusable, `Enter` and `Space` select, `Esc` closes, the grid is a table with `aria-selected` on days. Arrow-key roving focus across the grid is **not** in scope for the hackathon build. That is a real gap, written down rather than implied.

**The API contract does not change.** The form still submits `dateFrom` and `dateTo` as `YYYY-MM-DD`, and the server-side validation in the ritual route stays exactly as it is — the endpoint is public, and a UI constraint is not validation.

## Code Changes By Location

- `src/domain/types.ts` — `TransportMode`; `TarotPosition` becomes `"Зов" | "Дар" | "Путь"`; card definition gains `number`, `image`, `transport`, `meaningReversed`; drawn card gains `reversed: boolean`.
- `src/domain/tarot/cards.ts` — grows to 22 entries.
- `src/domain/tarot/engine.ts` — split into `drawDestinationCards(seed)` and `drawPathCard(seed, usableModes, excludeIds)`; orientation bit; pool fallback when filtering empties the pool.
- `src/domain/travel/scoring.ts` — half weight for reversed archetypes. Otherwise unchanged.
- `src/server/tutu/mcpClient.ts` — `search_multitransport` + `search_hotels` in parallel under one shared deadline; tool-error-as-text recognised and surfaced as a real warning.
- `src/server/tutu/normalize.ts` — `readItems` learns the `variants` key; `NormalizedOffer` gains `mode`, read from the variant's own `transport` field.
- `src/server/ritual/runRitual.ts` — two-phase orchestration; result gains `roadChoice { mode, reason, best }`; the duplicated `cards` field is dropped in favour of `spreadCards`.
- `src/app/api/ritual/route.ts` — `maxDuration` for the segment, syntax confirmed against the Next 16 docs.
- `src/components/TarotCardView.tsx`, `RitualScene.tsx`, `TravelResult.tsx`, `OfferList.tsx` — imagery, orientation, road block.
- `src/components/DateRangeCalendar.tsx` — new range calendar.
- `src/components/TripIntentForm.tsx` — the two date inputs are replaced by the calendar; the submitted payload is unchanged.
- `src/app/globals.css` — card imagery, road block, calendar.

## Determinism

The same input with the same MCP response produces the same reading. Reality may change between runs — a train that existed last week may not exist today — and the spread changes with it. That is honest, not a defect, and it is the price of never promising a road that does not exist.

## Degenerate Cases

| Case | Behaviour |
|---|---|
| MCP returns nothing for any mode | `Путь` is drawn from the full remaining deck; the road block shows the Tutu search entry link; the text speaks of fog on the road. The demo never breaks. |
| Filtered pool is empty (only air available, both air cards already drawn) | Widen to the whole remaining deck. A loose card-to-road link beats no card. |
| Sanity filter removes every mode | Keep the single fastest mode. |
| Exactly one usable mode | Normal for long-haul. The six-cards-per-mode rule keeps the card from repeating. |
| Hotels fail but transport succeeds | Independent; each falls back on its own, as today. |

## Testing

Fixtures are captured from the real responses measured above, not invented.

- Availability derived from `modes_summary`, including a mode present in `modes_summary` but absent from page 1 of `variants`.
- Vladimir fixture: air unavailable, `Путь` never names air.
- Vladivostok fixture: bus absent, rail dropped by the sanity filter, air chosen.
- Sanity filter keeps the fastest mode when it would otherwise empty the set.
- Deck invariants: 22 cards, unique ids, every mode carried by ≥ 6 cards, every archetype in the existing vocabulary, every card has both meanings and an image file that exists on disk.
- Orientation is deterministic from the seed; a reversed card contributes half weight.
- Two identical runs against one mocked MCP response produce identical spreads.
- Tool error arriving as text becomes a readable warning.
- Component test: reversed card renders rotated and shows the reversed meaning.
- Calendar: two clicks produce an ordered range; a click before the start restarts the selection instead of inverting it; past days are not selectable.
- Calendar emits local-time `YYYY-MM-DD`. The test runs under a non-UTC timezone and asserts the selected day is not shifted back by one.
- E2E with a mocked `/api/ritual`: cards visible on desktop and mobile, road block links to a Tutu domain.

## Out Of Scope

- `search_etrain`. Suburban trains against inter-regional destinations would be a checkbox, not a feature.
- `create_checkout_link` and `get_offer_details`. The variants already carry `checkout_url`.
- Minor Arcana. 22 is a complete, recognised deck for a three-card reading.
- Retrying failed geo lookups with alternate city spellings.
- Any change to how AI narration is constrained.
