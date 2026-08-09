import type { DestinationSelection, TarotSpread, TripIntent } from "@/domain/types";
import { travelAtlas } from "@/domain/travel/atlas";

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

function containsDestination(text: string, destinationName: string): boolean {
  return text.toLocaleLowerCase("ru-RU").includes(destinationName.toLocaleLowerCase("ru-RU"));
}

function isAcceptedNarration(text: string, input: PredictionInput): boolean {
  const selectedDestination = input.selection.destination.name;
  if (!containsDestination(text, selectedDestination)) return false;

  return travelAtlas.every(
    (destination) => destination.name === selectedDestination || !containsDestination(text, destination.name),
  );
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
    if (!text || !isAcceptedNarration(text, input)) return templatePrediction(input);

    return {
      headline: `Карты указывают на ${input.selection.destination.name}`,
      opening: text,
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
