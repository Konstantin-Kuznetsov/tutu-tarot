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
