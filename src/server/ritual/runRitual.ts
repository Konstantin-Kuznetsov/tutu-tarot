import type { DrawnTarotCard, TravelAtlasItem, TripIntent } from "@/domain/types";
import { drawTarotSpread } from "@/domain/tarot/engine";
import { selectDestination } from "@/domain/travel/scoring";
import { createPrediction, type PredictionText } from "@/server/oracle/narrator";
import { searchTutuOffers } from "@/server/tutu/mcpClient";
import type { NormalizedOffer } from "@/server/tutu/normalize";

export interface RitualResult {
  ritualId: string;
  seed: string;
  cards: DrawnTarotCard[];
  destination: TravelAtlasItem;
  prediction: PredictionText;
  transportOffers: NormalizedOffer[];
  hotelOffers: NormalizedOffer[];
  sourceLinks: Array<{ label: string; url: string }>;
  warnings: string[];
}

export interface RitualDeps {
  searchOffers?: typeof searchTutuOffers;
  aiApiKey?: string;
}

export async function runRitual(input: TripIntent, deps: RitualDeps = {}): Promise<RitualResult> {
  const spread = drawTarotSpread(input);
  const selection = selectDestination({ ...input, archetypes: spread.archetypes });
  const searchOffers = deps.searchOffers || searchTutuOffers;
  const offers = await searchOffers({ intent: input, destination: selection.destination });
  const prediction = await createPrediction({
    intent: input,
    spread,
    selection,
    offers: {
      transport: offers.transport.map((offer) => offer.title),
      hotels: offers.hotels.map((offer) => offer.title),
    },
    aiApiKey: deps.aiApiKey ?? process.env.OPENAI_API_KEY,
  });

  const sourceLinks = [
    {
      label: selection.destination.source === "provereno.tutu" ? "Проверенный маршрут Туту" : "Источник маршрута",
      url: selection.destination.sourceUrl,
    },
    ...(selection.destination.geoUrl ? [{ label: "Путеводитель Туту", url: selection.destination.geoUrl }] : []),
  ];

  return {
    ritualId: Buffer.from(spread.seed).toString("base64url").slice(0, 12),
    seed: spread.seed,
    cards: spread.cards,
    destination: selection.destination,
    prediction,
    transportOffers: offers.transport,
    hotelOffers: offers.hotels,
    sourceLinks,
    warnings: offers.warnings,
  };
}
