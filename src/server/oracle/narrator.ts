import type { DestinationSelection, DrawnTarotCard, TravelAtlasItem, TripIntent } from "@/domain/types";
import type { RoadChoice } from "@/server/ritual/runRitual";
import { DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL, requestNarration, type AiClientConfig } from "@/server/oracle/aiClient";

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

function templatePrediction(input: PredictionInput): PredictionText {
  const { destination } = input.selection;
  return {
    headline: `Карты указывают: ${destination.name}`,
    opening: appOpening(input),
    cardReadings: input.spread.cards.map((card) => ({
      position: card.position,
      cardName: card.name,
      text: `${card.name} в позиции «${card.position}» говорит: ${card.meaning}. Поэтому ${destination.anchorPlace} становится главным знаком расклада.`,
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

// The model writes free text for exactly two things: one reading per drawn
// card and a closing line (see AiNarration in validate.ts). Everything else
// on screen -- headline, opening, destination, region, road, price, links,
// source attribution -- is app data from RitualResult and is built the same
// way whether or not the AI call succeeds; nothing the model returns can
// reach those fields.
export async function createPrediction(input: PredictionInput): Promise<PredictionText> {
  if (!input.aiApiKey) {
    return templatePrediction(input);
  }

  const config = resolveAiClientConfig(input.aiApiKey);
  const narration = await requestNarration(
    {
      cards: input.spread.cards.map((card) => ({
        id: card.id,
        name: card.name,
        position: card.position,
        reversed: card.reversed,
      })),
      destinationName: input.selection.destination.name,
      destinationRegion: input.selection.destination.region,
    },
    config,
  );

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
      position: card.position,
      cardName: card.name,
      text: textById.get(card.id) ?? card.meaning,
    })),
    summary: summaryFor(input),
    closingLine: narration.closingLine,
  };
}
