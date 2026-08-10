import { unstable_cache } from "next/cache";
import type {
  DestinationSelection,
  DrawnTarotCard,
  TarotPosition,
  TravelAtlasItem,
  TripIntent,
} from "@/domain/types";
import type { RoadChoice } from "@/server/ritual/runRitual";
import {
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  requestNarration,
  type AiClientConfig,
  type NarrationRequestInput,
} from "@/server/oracle/aiClient";

export interface CardSpread {
  seed: string;
  cards: DrawnTarotCard[];
}

// Offer titles/prices used to be sent to the AI prompt in the old flavor-key
// design; they no longer are (see requestNarration's NarrationRequestInput
// in aiClient.ts -- cards and destination name/region only), so
// PredictionInput carries nothing offer-shaped anymore. Nothing constructs
// or reads it, which is exactly the point: fewer things in scope here are
// fewer things that could leak into a prompt later by accident.
export interface PredictionInput {
  intent: TripIntent;
  spread: CardSpread;
  selection: DestinationSelection;
  roadChoice: RoadChoice;
  aiApiKey?: string;
}

export interface PredictionText {
  headline: string;
  opening: string;
  cardReadings: Array<{
    // The drawn card's own id (DrawnTarotCard.id) -- carried through so the
    // reading can be matched back to its card by identity in
    // TravelResult/TarotCardView, never by array position (see
    // createPrediction's own comment on why id, not index, is the key).
    id: string;
    position: string;
    cardName: string;
    text: string;
  }>;
  summary: string;
  // Only ever present when the AI actually wrote one and it passed
  // validateNarration -- the template path never sets it, which is exactly
  // what keeps the no-AI output identical to before this field existed
  // (see createPrediction's "byte-identical" test in narrator.test.ts).
  closingLine?: string;
}

// Source-sensitive, but deliberately carries no URL: raw links belong to the
// dedicated proof-links block (see TravelResult's .proof-links, built from
// RitualResult.sourceLinks), not to the oracle's prose. A long unbroken URL
// inside .prediction-panel is also what caused a 2026-08-09 mobile overflow
// (see .prediction-panel's overflow-wrap comment in globals.css).
//
// The three-way split matters, not just cosmetically: only "provereno.tutu"
// is Tutu's own verified-route tier, so only that branch may claim
// confirmation. "geo.tutu" is still Tutu's data (its own geo guide) but not
// the verified tier, and "fallback" isn't Tutu data at all (e.g. Wikipedia)
// — claiming Tutu confirmation there would regress a distinction earlier
// work deliberately hardened (see runRitual's sourceLinks label, which only
// grants "Проверенный маршрут Туту" to provereno.tutu).
function sourceNoteFor(source: TravelAtlasItem["source"]): string {
  switch (source) {
    case "provereno.tutu":
      return "Маршрут подтверждён проверенными маршрутами Туту.";
    case "geo.tutu":
      return "Маршрут собран по путеводителю Туту.";
    case "fallback":
      return "Маршрут собран из открытых источников.";
  }
}

// Most atlas entries name the same city twice over -- nearestTransportHub
// (where MCP is asked to search transport) and hotelSearchCity (where it's
// asked to search hotels) are literally equal for 13 of 21 entries (e.g.
// Пермь/Пермь, Владивосток/Владивосток) -- so the un-collapsed sentence read
// "основное направление — Пермь, остановка в городе Пермь" for most
// destinations, not just an edge case. Collapsed to one clause when they
// match; both branches stay in the nominative (city names are never bent by
// a preposition here, matching the rest of this file).
function practicalNote(destination: TravelAtlasItem): string {
  if (destination.nearestTransportHub === destination.hotelSearchCity) {
    return `Практическая часть маршрута: центр — ${destination.hotelSearchCity}.`;
  }
  return `Практическая часть маршрута: основное направление — ${destination.nearestTransportHub}, остановка в городе ${destination.hotelSearchCity}.`;
}

function summaryFor(input: PredictionInput): string {
  const { destination } = input.selection;
  const baseSummary = `Маршрут указывает путь: ${destination.region}. ${sourceNoteFor(destination.source)} ${practicalNote(destination)}`;
  return [baseSummary, input.roadChoice.reason].filter(Boolean).join(" ");
}

function appOpening(input: PredictionInput): string {
  const { destination } = input.selection;
  return `Карты раскрывают путь из города ${input.intent.departureCity}: ${destination.name}, где ${destination.routeTitle.toLocaleLowerCase("ru-RU")}. ${destination.oracleHook}`;
}

// TarotCardView rotates a reversed card's artwork 180° and swaps its own
// caption to meaningReversed (see TarotCardView.tsx's `card.reversed ?
// card.meaningReversed : card.meaning`) -- but that caption line is omitted
// whenever a reading is supplied (readingText replaces it, never both at
// once), so the reading text below is the *only* meaning a reversed card
// shows on screen. Reading card.meaning there made the page contradict
// itself: the flag says "перевёрнутая" while the prose reads the upright
// fortune. A reversed card is resistance, not a neutral variant -- the
// sentence says so ("сопротивляется") instead of silently swapping strings.
//
// "в перевёрнутом положении" (an established Russian tarot phrase for
// "in a reversed position") is a fixed prepositional phrase that doesn't
// agree with card.name's gender or number, so it stays correct across
// every card without a declension table.
function cardMeaningSentence(card: DrawnTarotCard): string {
  if (card.reversed) {
    return `${card.name} в позиции «${card.position}» выпадает в перевёрнутом положении и сопротивляется: ${card.meaningReversed}.`;
  }
  return `${card.name} в позиции «${card.position}» говорит: ${card.meaning}.`;
}

// One clause per position instead of one clause reused three times: the old
// "Поэтому ${anchorPlace} становится главным знаком расклада" repeated
// verbatim under all three cards, which read as a template stutter rather
// than three readings. Only the "Путь" clause names anchorPlace -- the
// destination is already in the headline and appOpening, so restating it
// under every card added nothing but repetition.
//
// anchorPlace is named after an em dash with no verb governing it, on
// purpose. atlas.ts stores it as either a single place ("Суздаль",
// "Тюмень") or a list ("Магас, Эгикал и Вовнушки", "Иркутск и Ольхон"), so
// any verb here ("становится"/"становятся") would have to agree in number
// with a shape that varies per destination -- exactly the trap that
// produced "Магас, Эгикал и Вовнушки становится". A verbless appositive
// after "—" is grammatically correct for both a single place and a list,
// for every entry in atlas.ts, without inspecting the string's shape.
function connectiveFor(position: TarotPosition, destination: TravelAtlasItem): string {
  switch (position) {
    case "Зов":
      return "Зов задаёт вопрос, с которого начинается расклад.";
    case "Дар":
      return "Дар отвечает на зов и добавляет к нему свой смысл.";
    case "Путь":
      return `Путь ведёт дальше и приводит расклад к цели — ${destination.anchorPlace}.`;
  }
}

function templatePrediction(input: PredictionInput): PredictionText {
  const { destination } = input.selection;
  return {
    headline: `Карты указывают: ${destination.name}`,
    opening: appOpening(input),
    cardReadings: input.spread.cards.map((card) => ({
      id: card.id,
      position: card.position,
      cardName: card.name,
      text: `${cardMeaningSentence(card)} ${connectiveFor(card.position, destination)}`,
    })),
    summary: summaryFor(input),
  };
}

// The credential itself is resolved by the caller (runRitual.ts and the
// shared-reading page both try AI_API_KEY before falling back to
// OPENAI_API_KEY, so nothing already deployed on the old variable name
// breaks) and arrives here as input.aiApiKey -- see createPrediction below.
// This only resolves the rest of the gateway shape from the environment,
// fresh on every call (not module-load, so tests can stub process.env per
// case): host, model, auth header name and value prefix. Every one of those
// defaults to the OpenAI-compatible chat-completions shape most corporate
// gateways expose, and every one is overridden purely through environment
// variables, so pointing this at a different gateway is a config change,
// never a code change.
function resolveAiClientConfig(apiKey: string): AiClientConfig {
  return {
    baseUrl: process.env.AI_BASE_URL || DEFAULT_AI_BASE_URL,
    apiKey,
    model: process.env.AI_MODEL || DEFAULT_AI_MODEL,
    authHeader: process.env.AI_AUTH_HEADER || "Authorization",
    authPrefix: process.env.AI_AUTH_PREFIX ?? "Bearer ",
  };
}

// A reading is immutable: the same three cards, in the same Зов/Дар/Путь
// order, with the same orientations, pointing at the same destination will
// always get the same narration request (see buildUserPayload in
// aiClient.ts -- cards + destination name/region is the model's entire
// input, nothing trip-specific ever reaches it). A shared link
// (src/app/r/[code]/page.tsx) decodes exactly this identity back out of the
// code on every open and re-requests narration for it, which is what turns
// a viral link into one paid model call per view. Keying purely on this
// identity -- never on trip dates, traveler count, road choice or the API
// key itself -- is what lets every open of the same link, and every fresh
// draw that happens to land on the same three cards and destination, share
// one cached narration.
interface NarrationIdentity {
  cards: Array<{ id: string; reversed: boolean }>;
  destinationId: string;
}

function narrationCacheKeyParts(identity: NarrationIdentity): string[] {
  return [
    "oracle-narration",
    ...identity.cards.flatMap((card) => [card.id, String(card.reversed)]),
    identity.destinationId,
  ];
}

// The model writes free text for exactly two things: one reading per drawn
// card and a closing line (see AiNarration in validate.ts). Everything else
// on screen -- headline, opening, destination, region, road, price, links,
// source attribution -- is app data from RitualResult and is built the same
// way whether or not the AI call succeeds; nothing the model returns can
// reach those fields. Only the AI call itself (requestNarration) is cached
// below -- headline/opening/summary are still computed fresh on every call
// from live input (departure city, road choice from the just-run price
// search), exactly as before caching existed.
export async function createPrediction(input: PredictionInput): Promise<PredictionText> {
  if (!input.aiApiKey) {
    return templatePrediction(input);
  }

  const config = resolveAiClientConfig(input.aiApiKey);
  const narrationRequest: NarrationRequestInput = {
    cards: input.spread.cards.map((card) => ({
      id: card.id,
      name: card.name,
      position: card.position,
      reversed: card.reversed,
    })),
    destinationName: input.selection.destination.name,
    destinationRegion: input.selection.destination.region,
  };

  // unstable_cache is called fresh on every createPrediction invocation
  // (not hoisted to module scope) so the closure below always captures this
  // call's narrationRequest/config -- cheap to construct, and it keeps the
  // credential and gateway config out of the cache key entirely (they are
  // only ever read from the closure on a cache miss, never passed as an
  // argument to the cached function, so they cannot become part of the
  // key). The cache key comes solely from narrationCacheKeyParts, and
  // revalidate: false caches indefinitely -- there is no staleness to
  // recover from, since the same identity can never legitimately produce a
  // different reading.
  //
  // requestNarration itself never throws -- it resolves to null on every
  // failure (no key, network error, timeout, bad JSON, failed validation),
  // by design, so callers can fall back to the template unconditionally.
  // Caching that null verbatim would defeat the fallback's own purpose: a
  // single transient failure (a network blip on the first person to open a
  // link) would freeze that reading's cache entry on "no narration"
  // indefinitely, stranding every later viewer on the template even after
  // the gateway recovers. Throwing on null instead means unstable_cache
  // never persists a failed attempt (a rejected callback skips its
  // cacheNewResult write), so only an actual narration is ever cached --
  // failures simply retry the API on the next call, same as before caching
  // existed.
  const fetchNarration = unstable_cache(
    async () => {
      const narration = await requestNarration(narrationRequest, config);
      if (!narration) throw new Error("no narration to cache");
      return narration;
    },
    narrationCacheKeyParts({
      cards: input.spread.cards.map((card) => ({ id: card.id, reversed: card.reversed })),
      destinationId: input.selection.destination.id,
    }),
    { revalidate: false },
  );

  const narration = await fetchNarration().catch(() => null);

  if (!narration) return templatePrediction(input);

  // Re-key the model's readings by the card id it referenced them with --
  // validateNarration already guarantees exactly the three sent ids appear
  // once each, so this lookup cannot miss. Position and card name still
  // come from input.spread.cards (app data), never from the model, exactly
  // like templatePrediction above.
  const textById = new Map(narration.cardReadings.map((reading) => [reading.id, reading.text]));

  return {
    headline: `Карты указывают: ${input.selection.destination.name}`,
    opening: appOpening(input),
    cardReadings: input.spread.cards.map((card) => ({
      id: card.id,
      position: card.position,
      cardName: card.name,
      text: textById.get(card.id) ?? card.meaning,
    })),
    summary: summaryFor(input),
    closingLine: narration.closingLine,
  };
}
