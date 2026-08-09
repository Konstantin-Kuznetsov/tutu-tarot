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

function summaryFor(input: PredictionInput): string {
  const { destination } = input.selection;
  return `Предсказание ведет в ${destination.region}. Источник маршрута (${destination.source}): ${destination.sourceUrl}. Практическая часть маршрута: дорога до ${destination.nearestTransportHub}, отели в городе ${destination.hotelSearchCity}.`;
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
  return `Маршрут из города ${input.intent.departureCity} тянется к ${destination.name}, где ${destination.routeTitle.toLocaleLowerCase("ru-RU")}. ${destination.oracleHook}`;
}

function templatePrediction(input: PredictionInput): PredictionText {
  const { destination } = input.selection;
  return {
    headline: `Карты указывают на ${destination.name}`,
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
      headline: `Карты указывают на ${input.selection.destination.name}`,
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
