import type { DestinationSelection, DrawnTarotCard, TravelAtlasItem, TripIntent } from "@/domain/types";
import type { RoadChoice } from "@/server/ritual/runRitual";

export interface OfferHighlights {
  transport: string[];
  hotels: string[];
}

export interface CardSpread {
  seed: string;
  cards: DrawnTarotCard[];
}

export interface PredictionInput {
  intent: TripIntent;
  spread: CardSpread;
  selection: DestinationSelection;
  roadChoice: RoadChoice;
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

type FlavorKey = "stone_silence" | "north_light" | "warm_road" | "old_city";

const flavorCopy: Record<FlavorKey, string> = {
  stone_silence: "Камень и тишина собирают маршрут в один ясный знак.",
  north_light: "Северный свет оставляет в дороге ощущение простора.",
  warm_road: "Теплая дорога раскрывается постепенно, шаг за шагом.",
  old_city: "Старый ритм города помогает услышать историю места.",
};

function flavorFor(text: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(flavorCopy, text) ? flavorCopy[text as FlavorKey] : undefined;
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

// The MCP search this route runs first already spends up to 18s (see
// SEARCH_BUDGET_MS in mcpClient.ts) inside a 30s route ceiling (see
// maxDuration on /api/ritual and /r/[code]/page.tsx). This fetch previously
// had no timeout of its own, so a slow provider could eat all the remaining
// headroom and take the whole request down with it. 8s leaves comfortable
// room for narration/response overhead after a worst-case MCP search; any
// failure here -- timeout included -- falls back to the template below, so
// a slow or unreachable provider degrades the copy, never the request.
const AI_TIMEOUT_MS = 8_000;

// A raw `POST /v1/responses` body nests its text at
// output[0].content[0].text -- `output_text` is a convenience field the
// OpenAI SDK computes client-side after parsing the response, not a field
// this hand-rolled fetch ever receives on the wire. Reading only
// `output_text` meant every AI call silently produced `undefined` and fell
// back to the template regardless of what the model returned. Read the real
// wire shape; keep `output_text` as a defensive fallback in case some
// provider or future SDK path does supply it directly.
function extractOutputText(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;

  const record = data as { output_text?: unknown; output?: unknown };
  if (typeof record.output_text === "string") return record.output_text;

  if (!Array.isArray(record.output)) return undefined;
  for (const item of record.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block && typeof block === "object" && typeof (block as { text?: unknown }).text === "string") {
        return (block as { text: string }).text;
      }
    }
  }
  return undefined;
}

export async function createPrediction(input: PredictionInput): Promise<PredictionText> {
  if (!input.aiApiKey) {
    return templatePrediction(input);
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.aiApiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: "Return exactly one flavor key from this allowlist and nothing else: stone_silence, north_light, warm_road, old_city. Do not return prose, destinations, URLs, or claims of supernatural certainty.",
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
    const data = (await response.json()) as unknown;
    // Only a validated flavor key from the app-owned allowlist (flavorCopy)
    // ever leaves this function -- the model's own text, real-shaped or
    // not, is never passed to a render path. See flavorFor.
    const flavor = flavorFor(extractOutputText(data)?.trim() ?? "");
    if (!flavor) return templatePrediction(input);

    return {
      headline: `Карты указывают: ${input.selection.destination.name}`,
      opening: `${appOpening(input)} ${flavor}`,
      cardReadings: input.spread.cards.map((card) => ({
        position: card.position,
        cardName: card.name,
        text: `${card.name}: ${card.meaning}`,
      })),
      summary: summaryFor(input),
    };
  } catch {
    return templatePrediction(input);
  }
}
