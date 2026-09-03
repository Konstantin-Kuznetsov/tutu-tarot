import type { SharedReading } from "@/domain/share/code";
import type { DrawnTarotCard, TravelAtlasItem, TripIntent } from "@/domain/types";
import { runSharedRitual } from "@/server/ritual/runSharedRitual";
import { OfferList } from "./OfferList";
import { InterchangePlanSection, RoadSection, SourcesSection, blockIndexStyle } from "./TravelResult";
import { ShareButton } from "./ShareButton";

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
  // All the server work -- the live Tutu search, the road, the narration and
  // the log line -- lives in runSharedRitual. This component only renders it:
  // an async Server Component's body is render, and render must stay pure.
  const {
    roadChoice, sourceLinks, prediction, transportOffers, hotelOffers,
    interchangePlan, roadNote, transportOutcome, hotelsOutcome, warnings,
  } = await runSharedRitual({ reading, destination, spreadCards, intent });

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
        transportOutcome={transportOutcome}
        warnings={warnings}
        roadNote={roadNote}
        interchangePlan={interchangePlan}
        blockIndex={LIVE_BLOCK_INDEX.road}
      />
      {interchangePlan && roadChoice.best ? (
        <InterchangePlanSection plan={interchangePlan} blockIndex={LIVE_BLOCK_INDEX.interchange} />
      ) : null}
      <div style={blockIndexStyle(LIVE_BLOCK_INDEX.otherRoads)}>
        <OfferList
          title="Билеты по предсказанию"
          offers={transportOffers}
          excludeId={roadChoice.best?.id}
          dataBlock="other-roads"
          outcome={interchangePlan && !roadChoice.best ? undefined : transportOutcome}
        />
      </div>
      <div style={blockIndexStyle(LIVE_BLOCK_INDEX.hotels)}>
        <OfferList title="Где остановиться" offers={hotelOffers} dataBlock="hotels" outcome={hotelsOutcome} />
      </div>
      <SourcesSection sourceLinks={sourceLinks} blockIndex={LIVE_BLOCK_INDEX.sources} />
      <ShareButton reading={reading} destinationName={destination.name} />
    </>
  );
}
