import { ritualSeed } from "@/domain/tarot/engine";
import type { SharedReading } from "@/domain/share/code";
import type { DrawnTarotCard, InterchangePlan, LegOutcome, TravelAtlasItem, TripIntent } from "@/domain/types";
import { createPrediction, type PredictionText } from "@/server/oracle/narrator";
import { buildRoadChoiceAndSources, type RoadChoice, type SourceLink } from "@/server/ritual/runRitual";
import { searchTutuOffers } from "@/server/tutu/mcpClient";
import { logRitual } from "@/server/observability/ritualLog";
import { roadUnavailableNote } from "@/domain/travel/roadUnavailable";
import type { NormalizedOffer } from "@/server/tutu/normalize";

// The server-side half of opening a shared link: the same live search and the
// same narration a fresh ritual runs, minus the draw -- the cards were decided
// when the link was minted and are read straight out of it.
//
// This lives here rather than inside SharedReadingLive for a concrete reason:
// that is an async Server Component, and everything in its body is *render*.
// Timing the search means calling Date.now() there, which react-hooks/purity
// correctly rejects -- a render is supposed to be pure and may run more than
// once. Moving the work into a plain async function makes the component what
// it should have been anyway: presentation over a result someone else fetched.
//
// It deliberately mirrors runRitual's shape so the two entry points stay easy
// to compare -- they must keep costing the same and logging the same.

export interface SharedRitualResult {
  roadChoice: RoadChoice;
  sourceLinks: SourceLink[];
  prediction: PredictionText;
  transportOffers: NormalizedOffer[];
  hotelOffers: NormalizedOffer[];
  interchangePlan: InterchangePlan | null;
  roadNote: string | null;
  // Carried through because the sections below render "empty" and "failed"
  // differently -- see LegOutcome's own comment for why the distinction has
  // to survive all the way to the copy.
  transportOutcome: LegOutcome;
  hotelsOutcome: LegOutcome;
  warnings: string[];
}

export async function runSharedRitual(params: {
  reading: SharedReading;
  destination: TravelAtlasItem;
  spreadCards: DrawnTarotCard[];
  intent: TripIntent;
}): Promise<SharedRitualResult> {
  const { reading, destination, spreadCards, intent } = params;
  const startedAt = Date.now();

  const offers = await searchTutuOffers({ intent, destination });
  const pathCard = spreadCards[2];
  const { roadChoice, sourceLinks } = buildRoadChoiceAndSources({
    mode: reading.mode,
    pathCard,
    transportOffers: offers.transport,
    modesSummary: offers.modesSummary,
    destination,
    interchangePlan: offers.interchangePlan,
  });

  const prediction = await createPrediction({
    intent,
    spread: { seed: ritualSeed(intent), cards: spreadCards },
    selection: { destination, score: 0, reasons: [] },
    roadChoice,
    aiApiKey: process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY,
  });

  // Same accounting as a fresh ritual (see runRitual): opening a shared link
  // runs the same Tutu search and costs the same. `via` is what tells the two
  // apart in the log -- a reading someone shared and a stranger opened is
  // traffic the product earned, and worth being able to count separately.
  logRitual({
    startedAt,
    destinationId: destination.id,
    mode: reading.mode,
    transport: offers.transportOutcome,
    hotels: offers.hotelsOutcome,
    // NOT offers.transport.length: when the search finds nothing, mcpClient
    // fills the array with a single placeholder so the page always has
    // something to render (`if (transport.length === 0) transport =
    // [transportFallback(input)]`). Counting that would report offers=1 for
    // every empty and every failed search -- the exact cases this line exists
    // to make visible. "served" is set precisely when real offers came back.
    offerCount: offers.transportOutcome === "served" ? offers.transport.length : 0,
    aiAnswered: Boolean(prediction.closingLine),
    via: "share",
  });

  return {
    roadChoice,
    sourceLinks,
    prediction,
    transportOffers: offers.transport,
    hotelOffers: offers.hotels,
    interchangePlan: offers.interchangePlan ?? null,
    roadNote: roadUnavailableNote(offers.unavailable),
    transportOutcome: offers.transportOutcome,
    hotelsOutcome: offers.hotelsOutcome,
    warnings: offers.warnings,
  };
}
