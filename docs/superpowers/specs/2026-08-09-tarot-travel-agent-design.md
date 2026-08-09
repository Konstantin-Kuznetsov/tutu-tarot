# Tarot Travel Agent Design

Date: 2026-08-09
Project: Tutu AI Hackathon 2026 prototype

## Goal

Build a Next.js demo page for a tarot-themed travel agent. The page asks for a departure city, vacation dates, and number of travelers, then performs a cinematic 3D tarot ritual. The ritual chooses a Russian travel destination, explains the choice as a tarot prediction, and confirms the route with real Tutu MCP transport and hotel results.

The demo should maximize audience impact while staying reliable enough for a Vercel-hosted hackathon presentation.

## Product Experience

The first screen is the actual product experience, not a marketing landing page. The user sees a fortune-teller table with a compact input form:

- Departure city.
- Available vacation date range.
- Number of travelers.

After submission, the interface becomes a 3D séance:

1. The camera settles over a dark table.
2. A tarot deck shuffles in 3D.
3. Three cards are dealt into named positions:
   - `Зов` - the destination energy.
   - `Путь` - the travel mode and route mood.
   - `Дар маршрута` - the emotional promise of the trip.
4. Cards flip one by one.
5. The prediction text appears after the cards, not before them.
6. Tutu proof links and practical booking options appear only after the ritual lands.

This order protects the wow effect: first magic, then validation.

## Chosen Visual Direction

The selected direction is `3D-сеанс`.

The 3D scene should include a table surface, a deck, three tarot cards, camera movement, lighting, and a light atmospheric layer. The implementation should keep the scene bounded: only the objects needed for the ritual should be rendered. Extra decorative complexity is out of scope unless it directly improves the card ritual.

The scene must support reduced motion. On devices where 3D performance is weak, the app may fall back to a CSS/card animation ritual while preserving the same product flow.

## Technology

Use a Vercel-friendly Next.js stack:

- Next.js App Router.
- TypeScript.
- React Three Fiber for the 3D ritual scene.
- Motion for React for non-3D UI transitions.
- Server route handlers for AI narration and Tutu MCP calls.
- Environment variables for AI provider credentials.
- Local JSON/TypeScript data for the curated Russian travel atlas.

The browser must not call Tutu MCP directly. MCP access belongs on the server side to avoid exposing transport details and to keep deployment behavior predictable.

## Data Sources

The app chooses destinations only in Russia.

Primary source:

- `https://provereno.tutu.ru/` - verified regional routes from Tutu, including ratings, route ideas, gastronomic routes, and journalist/blogger validation.

Secondary source:

- `https://www.tutu.ru/geo/` - Tutu guide pages for regions, cities, landmarks, transport, hotels, and travel context.

Fallback inspiration sources:

- `https://discoverrussia.travel/`
- `https://www.culture.ru/visit`
- Wikipedia/Wikimedia for specific natural landmarks when Tutu sources do not cover a concrete attraction.

The runtime should not scrape these sites on every user request. Instead, the app should include a small curated `TravelAtlas` dataset prepared from these sources.

Each travel atlas item should contain:

- `id`
- `name`
- `region`
- `routeTitle`
- `anchorPlace`
- `nearestTransportHub`
- `hotelSearchCity`
- `tags`
- `season`
- `mood`
- `tarotArchetypes`
- `source`
- `sourceUrl`
- `geoUrl`, when available
- `image`, when available and legally usable

Example direction:

- `name`: `Усьвинские Столбы`
- `region`: `Пермский край`
- `nearestTransportHub`: `Пермь`, with possible local leg context
- `hotelSearchCity`: `Пермь` or a closer supported city if Tutu hotels search supports it
- `tags`: cliffs, railway, nature, silence, dramatic route
- `tarotArchetypes`: Hermit, Chariot, Tower, Star

## Destination Selection

Destination selection should be deterministic and explainable.

Inputs:

- Departure city.
- Date range.
- Number of travelers.
- Drawn tarot cards.

Process:

1. Draw three cards using a deterministic seed derived from normalized user inputs. A repeated ritual with the same inputs should return the same destination unless the user explicitly starts a new draw.
2. Convert cards into archetypes and mood tags.
3. Score atlas destinations by archetype overlap, season fit, travel feasibility, and narrative strength.
4. Pick the highest scoring destination.
5. Use AI only to narrate the chosen match, not to invent arbitrary destinations.

This keeps the demo controllable. AI can make the story feel alive, while deterministic scoring keeps results stable and debuggable.

## Tarot Deck

Use public-domain or permissively usable tarot imagery where possible. The already researched Swiss Tarot assets from `cote/claude-agent-skill-draw-cards` are acceptable for MVP even if the available set is incomplete. A three-card ritual does not require a full 78-card deck.

If a chosen card lacks artwork, the UI may use a styled card back or generated/locally designed card face. The visual priority is a convincing ritual, not strict tarot completeness.

## AI Narration

An AI model is needed for the strongest prediction text.

The model should receive:

- User inputs.
- Drawn cards and card positions.
- Selected atlas destination.
- Source URLs and concise source notes.
- Transport/hotel highlights from Tutu MCP when available.

The model should produce:

- A short mystical prediction.
- Three card interpretations tied to the route.
- A practical summary that explains why this trip fits.
- Copy for the final result screen.

The AI must not claim guaranteed outcomes, medical/legal/safety certainty, or supernatural fact. The tone should feel like theatrical fortune telling for travel planning.

Fallback: if no AI key is configured or the AI request fails, use template-based Russian text assembled from card meanings and destination metadata.

## Tutu MCP Usage

Tutu MCP is mandatory for practical results.

Use server-side calls for:

- Transport search to the selected destination's nearest transport hub.
- Hotel search in the selected `hotelSearchCity`.
- Checkout link creation when supported by the MCP result flow.

The app should prefer a useful multimodal result over a single transport mode. If one mode fails, the result screen can still show the available modes and hotel options.

Expected MCP boundaries:

- MCP can search transport and hotels.
- MCP can provide offers, details, instructions, and checkout links.
- MCP does not book, pay, or manage user accounts.

## Tutu Links In The UI

Tutu editorial links should appear after the ritual result, not inside the initial card reveal.

Use them as proof objects:

- `Проверенный маршрут Туту` links to `provereno.tutu.ru` when the atlas item came from Проверено Туту.
- `Путеводитель Туту` links to `tutu.ru/geo` when a matching guide exists.
- `Смотреть билеты` links to MCP-backed checkout/search results.
- `Выбрать отель` links to MCP-backed hotel results.

The links should be visually quiet and integrated into the result. They should reinforce trust without making the experience feel like a list of external links.

## Application Components

Proposed boundaries:

- `TravelRitualPage`: top-level flow, state machine, and layout.
- `TripIntentForm`: validates city, dates, and traveler count.
- `RitualScene3D`: renders table, deck, card dealing, flipping, and camera movement.
- `TarotCard`: card face/back component used by the 3D scene and fallback UI.
- `TarotEngine`: draws cards, assigns positions, maps cards to archetypes.
- `TravelAtlas`: local curated data and destination scoring.
- `OracleNarrator`: server-side AI narration wrapper with template fallback.
- `TutuMcpClient`: server-side MCP client.
- `TravelOffers`: result section with transport, hotels, source links, and fallback states.
- `RitualTimeline`: coordinates visual steps with server result readiness.

Each module should have a narrow contract. The 3D scene should not know how MCP works. The MCP client should not know how cards are animated.

## Server API

Primary route:

- `POST /api/ritual`

Request:

- `departureCity`
- `dateFrom`
- `dateTo`
- `travelerCount`

Response:

- `ritualId`
- `seed`
- `cards`
- `destination`
- `prediction`
- `transportOffers`
- `hotelOffers`
- `sourceLinks`
- `warnings`

The route should return a complete result object even when AI or one MCP category fails. Partial success is better than a failed ritual.

## State Flow

Client states:

- `idle`: form visible.
- `validating`: form values being checked.
- `ritual-started`: 3D scene takes focus.
- `dealing`: deck shuffles and deals cards.
- `revealing`: cards flip and labels appear.
- `awaiting-result`: ritual is ready but server result is still loading.
- `result`: prediction and Tutu-backed options shown.
- `partial-result`: destination shown with missing AI, transport, or hotel data.
- `error`: recoverable failure with retry.

The visual timeline should not expose loading mechanics too early. If the server is fast, the app still plays enough ritual to feel deliberate. If the server is slow, the scene can hold on the final card with atmospheric motion.

## Error Handling

Validation errors:

- Missing departure city.
- Invalid date range.
- Traveler count less than 1 or above a reasonable demo limit.

AI failure:

- Use template narration.
- Show no technical error to the user.

MCP transport failure:

- Keep destination and prediction.
- Show source links and hotel options if available.
- Add atmospheric copy meaning that the route should be retried with other dates.

MCP hotel failure:

- Keep transport offers.
- Show route source links.
- Avoid blocking the main CTA.

No matching atlas destination:

- Fall back to a small list of high-confidence Russian routes.
- This should be rare if the atlas has broad tags.

3D failure:

- Fall back to a CSS-based card ritual.
- Keep the same input, prediction, and MCP result flow.

## Vercel Deployment Considerations

The app should be deployable to Vercel without custom servers.

Use:

- Next.js route handlers for server work.
- Environment variables for AI credentials and optional MCP configuration.
- Static assets for tarot cards and local atlas data.
- No runtime filesystem writes.
- No long-running background processes.

The Tutu MCP server endpoint is remote and read-only from the app perspective. Network calls happen inside route handlers.

If MCP latency is high, the route can return partial data or the UI can retry specific offer categories later. For the hackathon MVP, one complete route call is enough if it is reliable in local tests.

## Accessibility And UX Constraints

- Form controls must be keyboard usable.
- Result links and buttons must have clear labels.
- Motion should respect `prefers-reduced-motion`.
- Text must fit on mobile.
- The main page must work on mobile and desktop.
- The interface should avoid in-app explanatory text about how the feature works.
- The theme should feel theatrical but not collapse into a one-color purple or dark-blue palette.

## Testing Plan

Unit-level checks:

- Form validation.
- Tarot draw determinism.
- Destination scoring.
- AI fallback templates.
- MCP response normalization.

Integration checks:

- `POST /api/ritual` returns a complete response for a valid request.
- AI failure still returns a prediction.
- MCP transport failure still returns destination and source links.
- MCP hotel failure still returns transport options.

Browser checks:

- Page loads on desktop and mobile widths.
- 3D scene is nonblank and cards are visible.
- Ritual can complete end to end.
- Result shows prediction, source links, transport, and hotels when available.
- No console errors during the main flow.

## Out Of Scope For MVP

- User accounts.
- Payments or booking inside the app.
- Full 78-card tarot deck completeness.
- Multi-step trip planning after the first result.
- User-edited destination preferences beyond the initial form.
- Runtime scraping of Tutu editorial pages.

## Open Decisions Resolved

- The ritual is automatic, not manual card dragging.
- Departure city is required.
- Destination scope is Russia only.
- `provereno.tutu.ru` is the primary editorial source.
- `tutu.ru/geo` is the secondary Tutu source.
- AI is used for narration, not arbitrary destination invention.
- Tutu MCP is used for real transport and hotel options.
- Tutu source links appear after the card reveal to preserve the wow effect.
