import { archetypeWeightsFrom, drawDestinationCards, drawPathCard } from "@/domain/tarot/engine";
import { FOG_REASON, roadReason } from "@/domain/tarot/roadReason";
import { usableModes } from "@/domain/travel/roads";
import { selectDestination } from "@/domain/travel/scoring";
import type { DrawnTarotCard, TransportMode, TravelAtlasItem, TripIntent } from "@/domain/types";
import { createPrediction, type PredictionText } from "@/server/oracle/narrator";
import { searchTutuOffers } from "@/server/tutu/mcpClient";
import type { NormalizedOffer } from "@/server/tutu/normalize";

export interface RoadChoice {
  mode: TransportMode | null;
  reason: string;
  best: NormalizedOffer | null;
}

export interface RitualResult {
  ritualId: string;
  seed: string;
  // Carried alongside the draw (not derivable from `seed`, which is a
  // one-way hash) so a completed reading can be turned into a share code
  // client-side, with no server round-trip and no database: the whole
  // reading -- prophecy and trip alike -- has to fit in the link itself.
  // See src/domain/share/code.ts.
  intent: TripIntent;
  spreadCards: DrawnTarotCard[];
  destination: TravelAtlasItem;
  prediction: PredictionText;
  roadChoice: RoadChoice;
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
  // Phase 1: two cards choose where.
  const draw = drawDestinationCards(input);
  const selection = selectDestination({
    ...input,
    archetypeWeights: archetypeWeightsFrom(draw.cards),
  });

  // Phase 2: reality reports which roads exist, then the third card names one.
  const searchOffers = deps.searchOffers || searchTutuOffers;
  const offers = await searchOffers({ intent: input, destination: selection.destination });
  const modes = usableModes(offers.modesSummary, input);
  const pathCard = drawPathCard(draw.seed, modes, draw.cards.map((card) => card.id));

  const mode = pathCard.transport.find((candidate) => modes.includes(candidate)) ?? null;
  const best = mode
    ? offers.transport.find((offer) => offer.mode === mode) ?? null
    : null;
  const roadChoice: RoadChoice = {
    mode,
    reason: mode ? roadReason(pathCard, mode) : FOG_REASON,
    best,
  };

  const spreadCards = [...draw.cards, pathCard];
  const prediction = await createPrediction({
    intent: input,
    spread: { seed: draw.seed, cards: spreadCards },
    selection,
    roadChoice,
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
    ritualId: Buffer.from(draw.seed).toString("base64url").slice(0, 12),
    seed: draw.seed,
    intent: input,
    spreadCards,
    destination: selection.destination,
    prediction,
    roadChoice,
    transportOffers: offers.transport,
    hotelOffers: offers.hotels,
    sourceLinks,
    warnings: offers.warnings,
  };
}
