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

function summaryFor(input: PredictionInput): string {
  const { destination } = input.selection;
  const baseSummary = `Маршрут указывает путь: ${destination.region}. ${sourceNoteFor(destination.source)} Практическая часть маршрута: основное направление — ${destination.nearestTransportHub}, остановка в городе ${destination.hotelSearchCity}.`;
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
    const data = (await response.json()) as { output_text?: string };
    const flavor = flavorFor(data.output_text?.trim() ?? "");
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
