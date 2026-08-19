import { archetypeWeightsFrom, drawDestinationCards, drawPathCard } from "@/domain/tarot/engine";
import { FOG_REASON, roadReason } from "@/domain/tarot/roadReason";
import { usableModes } from "@/domain/travel/roads";
import { roadUnavailableNote } from "@/domain/travel/roadUnavailable";
import { selectDestination } from "@/domain/travel/scoring";
import type { DrawnTarotCard, InterchangePlan, LegOutcome, ModesSummary, TransportMode, TravelAtlasItem, TripIntent } from "@/domain/types";
import { createPrediction, type PredictionText } from "@/server/oracle/narrator";
import { searchTutuOffers } from "@/server/tutu/mcpClient";
import { formatDuration, formatPrice, type NormalizedOffer } from "@/server/tutu/normalize";

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
  etrain: "Электричка",
};

// Generic Tutu search entry points, one per mode -- not a checkout URL for
// any specific ticket, because offerFromSummary below is never describing a
// specific ticket (see its own comment).
const MODE_SEARCH_URL: Record<TransportMode, string> = {
  avia: "https://avia.tutu.ru/",
  railway: "https://www.tutu.ru/poezda/",
  bus: "https://bus.tutu.ru/",
  etrain: "https://www.tutu.ru/prigorod/",
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
    price: entry.minPrice !== null ? `от ${formatPrice(entry.minPrice)}` : undefined,
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
  // Optional: only a caller that found one passes it, and only to let the
  // card's own sentence describe a road whose shape lives on the plan
  // rather than on an offer.
  interchangePlan?: InterchangePlan | null;
}): { roadChoice: RoadChoice; sourceLinks: SourceLink[] } {
  const { mode, pathCard, transportOffers, modesSummary, destination, interchangePlan } = params;

  // The shape of the road, not just its mode: the third card's own reading
  // speaks about the change when there is one (roadReason). Computed here,
  // in the tail both a fresh ritual and the shared-link page share, so a
  // reopened link gets the same sentence as the reading that minted it.
  const best = bestOfferFor(mode, transportOffers, modesSummary);
  // When the road is a two-train plan there is no single offer to read the
  // shape from -- the plan itself carries it. Falling back to it here is
  // what lets the card speak about the change on a road that has no ticket.
  const shape = best?.transfers
    ? { transfers: best.transfers, via: best.via }
    : interchangePlan
      ? { transfers: interchangePlan.transferCount, via: interchangePlan.via }
      : undefined;
  const roadChoice: RoadChoice = {
    mode,
    reason: mode ? roadReason(pathCard, mode, shape) : FOG_REASON,
    best,
  };

  // geoUrl is genuinely a second, distinct link for most atlas entries
  // (provereno.tutu's own verified route vs. Tutu's regional geo guide),
  // but for the ten geo.tutu entries the guide *is* the geo page -- their
  // sourceUrl and geoUrl point at the exact same URL (see atlas.ts's
  // per-entry comments on why the merge from data/tutu-guides.json still
  // populates geoUrl there: it is real provenance data, just not a second
  // page). Rendering both would show two identically-labelled-differently
  // links to one page, which a 2026-08-11 live check of this exact strip
  // caught. Comparing the URLs (not the source tier) is what keeps this
  // correct even if a future atlas entry has some other reason for the two
  // fields to coincide.
  const sourceLinks: SourceLink[] = [
    {
      // Same wording the guide strip uses for the same URL. They used to
      // disagree -- the strip said "Путеводитель Туту" while this said the
      // generic "Источник маршрута" -- so one destination showed its single
      // Tutu page under two different names.
      label:
        destination.source === "provereno.tutu"
          ? "Проверенный маршрут Туту"
          : destination.source === "geo.tutu"
            ? "Путеводитель Туту"
            : "Источник маршрута",
      url: destination.sourceUrl,
    },
    ...(destination.geoUrl && destination.geoUrl !== destination.sourceUrl
      ? [{ label: "Путеводитель Туту", url: destination.geoUrl }]
      : []),
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
  // Shown whenever Tutu offers one, not only when the road is fog: a
  // two-train plan is useful next to a found flight as well as instead of
  // nothing.
  interchangePlan: InterchangePlan | null;
  // Tutu's own reason for an empty transport leg, rendered in the oracle's
  // voice (roadUnavailable.ts), or null when the response said nothing
  // worth repeating. Never a substitute for the fog line -- it sits under
  // it and makes it specific.
  roadNote: string | null;
  warnings: string[];
  transportOutcome: LegOutcome;
  hotelsOutcome: LegOutcome;
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
    seed: draw.seed,
  });

  // Phase 2: reality reports which roads exist, then the third card names one.
  const searchOffers = deps.searchOffers || searchTutuOffers;
  const offers = await searchOffers({ intent: input, destination: selection.destination });
  // A two-train plan is a road the deck can name, even though modes_summary
  // reports the railway mode as `count: 0` -- there is no *direct* train, so
  // Tutu counts none, but there is a way through by rail. Without this the
  // third card would be drawn from the whole deck (the no-usable-mode
  // fallback) and could easily be an avia-only card, and then telling the
  // traveller that «Шут» «сажает к окну» would be a lie about the card, not
  // just about the road. Adding railway here means the card is drawn from
  // the cards that can actually name a train.
  //
  // Note what this deliberately bypasses: usableModes' own sanity filter,
  // which drops any mode whose one-way minimum eats more than a third of the
  // trip. A plan has no duration in modes_summary to filter on, and it is
  // never presented as a single bookable ticket -- its length is stated
  // plainly on the block itself and it carries its own "this is a plan, not
  // a ticket" line. See docs/technical.md's known limitations.
  const directModes = usableModes(offers.modesSummary, input);
  const modes = offers.interchangePlan && !directModes.includes("railway")
    ? [...directModes, "railway" as const]
    : directModes;
  const pathCard = drawPathCard(draw.seed, modes, draw.cards.map((card) => card.id));
  const mode = pathCard.transport.find((candidate) => modes.includes(candidate)) ?? null;

  const { roadChoice, sourceLinks } = buildRoadChoiceAndSources({
    mode,
    pathCard,
    transportOffers: offers.transport,
    modesSummary: offers.modesSummary,
    destination: selection.destination,
    interchangePlan: offers.interchangePlan,
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
    interchangePlan: offers.interchangePlan ?? null,
    roadNote: roadUnavailableNote(offers.unavailable),
    warnings: offers.warnings,
    transportOutcome: offers.transportOutcome,
    hotelsOutcome: offers.hotelsOutcome,
  };
}
