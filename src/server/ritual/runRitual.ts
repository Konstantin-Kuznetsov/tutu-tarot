import { archetypeWeightsFrom, drawDestinationCards, drawPathCard } from "@/domain/tarot/engine";
import { FOG_REASON, roadReason } from "@/domain/tarot/roadReason";
import { usableModes } from "@/domain/travel/roads";
import { selectDestination } from "@/domain/travel/scoring";
import type { DrawnTarotCard, ModesSummary, TransportMode, TravelAtlasItem, TripIntent } from "@/domain/types";
import { createPrediction, type PredictionText } from "@/server/oracle/narrator";
import { searchTutuOffers } from "@/server/tutu/mcpClient";
import { formatDuration, type NormalizedOffer } from "@/server/tutu/normalize";

export interface RoadChoice {
  mode: TransportMode | null;
  reason: string;
  best: NormalizedOffer | null;
}

export interface SourceLink {
  label: string;
  url: string;
}

const MODE_NAMES: Record<TransportMode, string> = {
  avia: "Самолёт",
  railway: "Поезд",
  bus: "Автобус",
};

// Generic Tutu search entry points, one per mode -- not a checkout URL for
// any specific ticket, because offerFromSummary below is never describing a
// specific ticket (see its own comment).
const MODE_SEARCH_URL: Record<TransportMode, string> = {
  avia: "https://avia.tutu.ru/",
  railway: "https://www.tutu.ru/poezda/",
  bus: "https://bus.tutu.ru/",
};

// `offers.transport` (normalizeTransportOffers) is only the first page of
// the merged, price-sorted `variants` list -- at most 5 offers after it's
// sliced. `modes_summary` is a separate, authoritative count of everything
// the search actually found per mode. The two can disagree: a mode can be
// real and bookable (modes_summary says so) while having zero representatives
// on that first page. Moscow -> Vladimir is exactly this case in the fixtures
// (tests/server/tutu-normalize.test.ts): one railway variant on page 1, but
// modes_summary reports railway 19 *and* bus 6 -- so a bus draw would
// previously find nothing in `offers.transport` and the road hero rendered
// empty (the fog treatment) even though a bus genuinely exists.
//
// When the chosen mode has no offer on the fetched page, build the hero from
// modes_summary's own minimum price/duration instead of leaving it null.
// This is honestly a "from" figure, not a specific ticket -- it carries no
// checkout URL, only a link to that mode's general Tutu search.
function offerFromSummary(mode: TransportMode, summary: ModesSummary): NormalizedOffer | null {
  const entry = summary[mode];
  if (!entry) return null;

  const duration = formatDuration(entry.minDurationMin);
  return {
    id: `summary-${mode}`,
    title: `${MODE_NAMES[mode]}: билеты на Туту`,
    subtitle: duration ? `В пути от ${duration}` : undefined,
    price: entry.minPrice !== null ? `от ${Math.round(entry.minPrice)} ₽` : undefined,
    url: MODE_SEARCH_URL[mode],
    mode,
  };
}

function bestOfferFor(
  mode: TransportMode | null,
  transportOffers: NormalizedOffer[],
  modesSummary: ModesSummary,
): NormalizedOffer | null {
  if (!mode) return null;
  return transportOffers.find((offer) => offer.mode === mode) ?? offerFromSummary(mode, modesSummary);
}

// The shared tail of both runRitual (a fresh reading) and the shared-link
// page (src/app/r/[code]/page.tsx, re-searching prices for an already-drawn
// reading): given a mode the third card already settled on, build the road
// hero (or the fog reason, when there is no mode) and the proof-link labels.
// Both call sites differ only in how `mode` itself gets decided -- a fresh
// draw computes it from the card and the usable modes, the shared page reads
// it back out of the share code -- so `mode` is a parameter, not recomputed
// here.
export function buildRoadChoiceAndSources(params: {
  mode: TransportMode | null;
  pathCard: DrawnTarotCard;
  transportOffers: NormalizedOffer[];
  modesSummary: ModesSummary;
  destination: TravelAtlasItem;
}): { roadChoice: RoadChoice; sourceLinks: SourceLink[] } {
  const { mode, pathCard, transportOffers, modesSummary, destination } = params;

  const roadChoice: RoadChoice = {
    mode,
    reason: mode ? roadReason(pathCard, mode) : FOG_REASON,
    best: bestOfferFor(mode, transportOffers, modesSummary),
  };

  const sourceLinks: SourceLink[] = [
    {
      label: destination.source === "provereno.tutu" ? "Проверенный маршрут Туту" : "Источник маршрута",
      url: destination.sourceUrl,
    },
    ...(destination.geoUrl ? [{ label: "Путеводитель Туту", url: destination.geoUrl }] : []),
  ];

  return { roadChoice, sourceLinks };
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
  sourceLinks: SourceLink[];
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

  const { roadChoice, sourceLinks } = buildRoadChoiceAndSources({
    mode,
    pathCard,
    transportOffers: offers.transport,
    modesSummary: offers.modesSummary,
    destination: selection.destination,
  });

  const spreadCards = [...draw.cards, pathCard];
  const prediction = await createPrediction({
    intent: input,
    spread: { seed: draw.seed, cards: spreadCards },
    selection,
    roadChoice,
    aiApiKey: deps.aiApiKey ?? process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY,
  });

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
