import { ritualSeed } from "@/domain/tarot/engine";
import type { SharedReading } from "@/domain/share/code";
import type { DrawnTarotCard, TravelAtlasItem, TripIntent } from "@/domain/types";
import { createPrediction } from "@/server/oracle/narrator";
import { buildRoadChoiceAndSources } from "@/server/ritual/runRitual";
import { searchTutuOffers } from "@/server/tutu/mcpClient";
import { OfferList } from "./OfferList";
import { InterchangePlanSection, RoadSection, SourcesSection, blockIndexStyle } from "./TravelResult";
import { ShareButton } from "./ShareButton";
import { roadUnavailableNote } from "@/domain/travel/roadUnavailable";

interface SharedReadingLiveProps {
  reading: SharedReading;
  destination: TravelAtlasItem;
  spreadCards: DrawnTarotCard[];
  intent: TripIntent;
}

// This component's own stagger sequence, independent of TravelResult's
// BLOCK_INDEX (which numbers blocks that all appear together at the "/"
// ritual's reveal moment, right after the deal animation). Every block here
// streams in together, later, once searchTutuOffers/createPrediction below
// settle -- so counting from 0 keeps the 150ms-per-step delays small and
// tied to *that* arrival moment; reusing TravelResult's higher indices
// would tack a needless extra second of animation-delay onto content that
// already took several seconds to arrive over the network.
const LIVE_BLOCK_INDEX = {
  detail: 0,
  road: 1,
  interchange: 2,
  otherRoads: 3,
  hotels: 4,
  sources: 5,
} as const;

// The streamed half of the shared-reading page (src/app/r/[code]/page.tsx):
// everything that needs the live Tutu search and the oracle's narration,
// which the frozen half rendered synchronously above this component (cards,
// orientation, destination -- see that page's own comment) deliberately
// does not wait for. An async Server Component wrapped in a <Suspense>
// boundary at the call site is what makes this stream -- React flushes the
// static shell immediately and swaps this in once the awaits below settle.
export async function SharedReadingLive({ reading, destination, spreadCards, intent }: SharedReadingLiveProps) {
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

  return (
    <>
      {/* Continues the prediction-panel's own voice (headline/guide strip
          rendered synchronously above) with the two paragraphs that can only
          be written once the road is known -- summary's closing clause
          quotes roadChoice.reason (see summaryFor in narrator.ts). */}
      <div className="prediction-panel" data-block="prediction-detail" style={blockIndexStyle(LIVE_BLOCK_INDEX.detail)}>
        <p>{prediction.opening}</p>
        <p>{prediction.summary}</p>
      </div>
      {prediction.closingLine ? <p className="spread-panel__closing">{prediction.closingLine}</p> : null}
      <RoadSection
        roadChoice={roadChoice}
        transportOutcome={offers.transportOutcome}
        warnings={offers.warnings}
        roadNote={roadUnavailableNote(offers.unavailable)}
        interchangePlan={offers.interchangePlan}
        blockIndex={LIVE_BLOCK_INDEX.road}
      />
      {offers.interchangePlan && roadChoice.best ? (
        <InterchangePlanSection plan={offers.interchangePlan} blockIndex={LIVE_BLOCK_INDEX.interchange} />
      ) : null}
      <div style={blockIndexStyle(LIVE_BLOCK_INDEX.otherRoads)}>
        <OfferList
          title="Билеты по предсказанию"
          offers={offers.transport}
          excludeId={roadChoice.best?.id}
          dataBlock="other-roads"
          outcome={offers.interchangePlan && !roadChoice.best ? undefined : offers.transportOutcome}
        />
      </div>
      <div style={blockIndexStyle(LIVE_BLOCK_INDEX.hotels)}>
        <OfferList title="Где остановиться" offers={offers.hotels} dataBlock="hotels" outcome={offers.hotelsOutcome} />
      </div>
      <SourcesSection sourceLinks={sourceLinks} blockIndex={LIVE_BLOCK_INDEX.sources} />
      <ShareButton reading={reading} destinationName={destination.name} />
    </>
  );
}
