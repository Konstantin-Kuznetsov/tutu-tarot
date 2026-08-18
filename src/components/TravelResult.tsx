import type { PredictionText } from "@/server/oracle/narrator";
import type { DrawnTarotCard, LegOutcome, TravelAtlasItem, TripIntent } from "@/domain/types";
import type { NormalizedOffer } from "@/server/tutu/normalize";
import type { RoadChoice, SourceLink } from "@/server/ritual/runRitual";
import type { CSSProperties } from "react";
import type { SharedReading } from "@/domain/share/code";
import { isOutsideSeasonWindow, seasonWindowCaption } from "@/domain/travel/seasonWindow";
import { LEG_OUTCOME_COPY, MODE_LABELS, OfferList } from "./OfferList";
import { RitualMist } from "./RitualMist";
import { ShareButton } from "./ShareButton";
import { TarotCardView } from "./TarotCardView";

export interface RitualResultViewModel {
  prediction: PredictionText;
  // `id` is optional here, not because a real reading ever lacks one --
  // runRitual always returns the full TravelAtlasItem -- but because
  // several existing fixtures/tests build a viewModel by hand with just
  // `{ name, region }`. It's what sharedReadingFrom below checks for before
  // it will offer a share link. `source`/`sourceUrl`/`routeDays`/`rating`/
  // `seasonWindow` are the same story, one level down: always present on a
  // real reading (see GuideStrip and SeasonMismatchNote below, which are
  // what actually read them), optional here only so fixtures that predate
  // the guide-facts strip don't all need updating for a feature they don't
  // exercise.
  destination: {
    id?: string;
    name: string;
    region: string;
    source?: TravelAtlasItem["source"];
    sourceUrl?: string;
    routeDays?: number;
    rating?: string;
    seasonWindow?: string;
  };
  spreadCards?: DrawnTarotCard[];
  roadChoice: RoadChoice;
  sourceLinks: Array<{ label: string; url: string }>;
  transportOffers: NormalizedOffer[];
  hotelOffers: NormalizedOffer[];
  warnings: string[];
  // Same story as `destination.id`/`intent` below: always present on a real
  // reading (see RitualResult.transportOutcome/hotelsOutcome), optional
  // here only so hand-built test fixtures that predate this feature don't
  // all need updating. When either is absent, the road block and the offer
  // sections fall back to the old, undifferentiated `warnings`-based copy.
  transportOutcome?: LegOutcome;
  hotelsOutcome?: LegOutcome;
  // Same story as `destination.id`: always present on a real reading
  // (see RitualResult.intent), optional here only so hand-built test
  // fixtures don't all need updating for a feature they don't exercise.
  intent?: TripIntent;
}

// The whole reading has to fit in a link -- there is no database -- so
// sharing needs the three drawn cards (with orientation), which destination
// they pointed to, which road the third card named, and the trip itself.
// Every one of those is optional on RitualResultViewModel (see its own
// comments), so this only offers a share link once a real reading actually
// supplied all of them; a hand-built test fixture missing one just doesn't
// render the button, rather than throwing or sharing a broken link.
function sharedReadingFrom(result: RitualResultViewModel): SharedReading | null {
  const { spreadCards, destination, roadChoice, intent } = result;
  if (!spreadCards || spreadCards.length !== 3 || !destination.id || !intent) return null;

  return {
    cards: spreadCards.map((card) => ({ id: card.id, reversed: card.reversed })),
    destinationId: destination.id,
    mode: roadChoice.mode,
    departureCity: intent.departureCity,
    dateFrom: intent.dateFrom,
    dateTo: intent.dateTo,
    travelerCount: intent.travelerCount,
  };
}

// Whole card is the link — same convention OfferList's .offer-card already
// uses — rather than the mockup's separate CTA button, which would mean
// nesting an <a class="btn"> inside a card-level <a>. `best.url` is
// optional on NormalizedOffer, so fall back to plain content instead of a
// dead href="#" (same rule Common Pitfalls holds OfferList to).
function RoadHero({ best }: { best: NormalizedOffer }) {
  const content = (
    <>
      <strong>{best.title}</strong>
      {best.subtitle ? <span>{best.subtitle}</span> : null}
      {best.price ? <b>{best.price}</b> : null}
    </>
  );

  return best.url ? (
    <a className="road__hero" href={best.url} target="_blank" rel="noreferrer">
      {content}
    </a>
  ) : (
    <div className="road__hero">{content}</div>
  );
}

// The fixed part of the guide strip's text (see GuideStrip below): what tier
// of Tutu data this destination's guide actually is. Only "provereno.tutu"
// is Tutu's verified-route tier -- same three-way distinction the oracle's
// own summary already makes (see sourceNoteFor in narrator.ts) -- so the
// label here must never claim more than the source itself does.
function guideSourceLabel(source: TravelAtlasItem["source"]): string {
  switch (source) {
    case "provereno.tutu":
      return "Проверено Туту";
    case "geo.tutu":
      return "Путеводитель Туту";
    case "fallback":
      return "Маршрут из открытых источников";
  }
}

// Russian noun declension for "день" after a count: 1/21/31 -> день,
// 2-4/22-24/32-34 -> дня, everything else (5-20, 25-30, ...) -> дней. Every
// routeDays value the atlas actually carries is small (2-7), but this is
// correct for any count, not just the ones on hand today.
function pluralDays(days: number): string {
  const mod10 = days % 10;
  const mod100 = days % 100;
  if (mod10 === 1 && mod100 !== 11) return `${days} день`;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return `${days} дня`;
  return `${days} дней`;
}

// Composed only from facts this destination actually has -- never an empty
// separator or a dangling "·" for a fact that's absent. Source label is the
// one fixed part; day count, rating and season window are each appended
// only when present. When none of those three exist at all (a regional geo
// guide whose page names no overall season either -- see
// chechnya-kezenoy-am/suzdal in atlas.ts) the destination's own region
// fills in, so the strip is never just a bare, contentless label.
//
// The season window fact goes through seasonWindowCaption first, not the
// raw atlas string: without it, "летние месяцы" next to a headline for an
// October trip reads as a contradiction (a user reported exactly this) --
// the caption makes explicit that this is the guide's own recommended
// season, not a description of the dates the traveller chose. See
// SeasonMismatchNote below for the complementary "your dates don't overlap
// it at all" line.
function guideStripText(destination: RitualResultViewModel["destination"]): string | null {
  if (!destination.source) return null;

  const facts = [
    destination.routeDays ? pluralDays(destination.routeDays) : null,
    destination.rating ?? null,
    destination.seasonWindow ? seasonWindowCaption(destination.seasonWindow) : null,
  ].filter((fact): fact is string => Boolean(fact));

  return [guideSourceLabel(destination.source), ...(facts.length > 0 ? facts : [destination.region])].join(" · ");
}

// The strip itself is the link to the guide page -- not a separate CTA next
// to quiet text -- so it renders as nothing at all (not a dead span) when
// either half is missing: no sourceUrl to link to, or no source to build a
// label from (hand-built fixtures that predate this feature carry neither;
// see RitualResultViewModel.destination's own comment).
//
// Exported: the shared-reading page (src/app/r/[code]/page.tsx) renders
// this synchronously, from data resolveSharedReading already has with no
// network call, before the road/offers half of that page streams in behind
// its own Suspense boundary -- see that file's own comment for why.
export function GuideStrip({ destination }: { destination: RitualResultViewModel["destination"] }) {
  const text = guideStripText(destination);
  if (!destination.sourceUrl || !text) return null;

  return (
    <a className="guide-strip" href={destination.sourceUrl} target="_blank" rel="noreferrer">
      {text}
    </a>
  );
}

// One quiet line under the strip, shown only when we can say with
// confidence that the traveller's own dates don't overlap the guide's
// recommended season at all (isOutsideSeasonWindow returns false for a
// window it can't parse with certainty, exactly like it does for "круглый
// год" -- see that function's own comment). Turns what would otherwise read
// as a contradiction into a stated fact, the same honest move the fog road
// already makes when no route could be checked (see FOG_REASON). Needs both
// a season window and the trip's own dates, so it renders nothing for the
// hand-built fixtures that predate `intent` on RitualResultViewModel.
//
// Exported for the same reason as GuideStrip above -- the shared-reading
// page renders this synchronously too, right next to it.
export function SeasonMismatchNote({
  destination,
  intent,
}: {
  destination: RitualResultViewModel["destination"];
  intent: RitualResultViewModel["intent"];
}) {
  if (!destination.seasonWindow || !intent) return null;
  if (!isOutsideSeasonWindow(destination.seasonWindow, intent.dateFrom, intent.dateTo)) return null;

  return (
    <p className="guide-strip__note">
      Путеводитель Туту рекомендует для этой поездки другое время года, чем вы выбрали.
    </p>
  );
}

// Fixed rather than computed from position-in-array, so a block that
// doesn't render (spread, when the reading carries no cards) leaves a gap
// in the sequence instead of shifting every later block's delay — a
// harmless, purely cosmetic difference from a perfectly gap-free stagger.
const BLOCK_INDEX = {
  prediction: 0,
  spread: 1,
  road: 2,
  otherRoads: 3,
  hotels: 4,
  sources: 5,
} as const;

// Exported so the shared-reading page's own two stagger sequences (the
// frozen half rendered synchronously, and the streamed half inside its
// Suspense boundary -- see src/app/r/[code]/page.tsx and
// SharedReadingLive.tsx) drive the exact same `.result [data-block]`
// animation this file's own blocks use, rather than a second, drifting
// implementation of the same one-line CSS custom property.
export function blockIndexStyle(index: number): CSSProperties {
  return { "--block-index": index } as CSSProperties;
}

// Matches a card to its written reading by the card's own id, never by
// array position: the model (or the template) can list its readings in any
// order, and cardReadings is keyed by id specifically so a reordered reply
// still lands on the right card (see PredictionText.cardReadings' own
// comment). Returns undefined -- not the deck's meaning -- when no reading
// exists for this card; TarotCardView itself falls back to card.meaning in
// that case, so this only ever supplies a replacement, never a default.
function readingTextFor(cardId: string, cardReadings: PredictionText["cardReadings"]): string | undefined {
  return cardReadings.find((reading) => reading.id === cardId)?.text;
}

// The road hero-or-fog block, factored out of TravelResult so the
// shared-reading page's own streamed half (SharedReadingLive.tsx) can render
// the exact same markup once its own search settles, instead of a second
// copy of this JSX drifting from this one. `blockIndex` is a parameter
// rather than reaching for TravelResult's own BLOCK_INDEX constant: callers
// outside this file run their own, independent stagger sequence (see
// SharedReadingLive's own comment on why its indices start back at 0).
export function RoadSection({
  roadChoice,
  transportOutcome,
  warnings,
  blockIndex,
}: {
  roadChoice: RoadChoice;
  transportOutcome?: LegOutcome;
  warnings: string[];
  blockIndex: number;
}) {
  const modeLabel = roadChoice.mode ? MODE_LABELS[roadChoice.mode] : null;

  return (
    <section
      className="road"
      data-block="road"
      aria-label="Дорога, которую выбрала карта"
      style={blockIndexStyle(blockIndex)}
    >
      <h3 className="sec"><span>Дорога, которую выбрала карта</span></h3>
      {roadChoice.best ? (
        <article className="road__card">
          {modeLabel ? <p className="caps">{modeLabel}</p> : null}
          <RoadHero best={roadChoice.best} />
          <p className="road__reason">{roadChoice.reason}</p>
        </article>
      ) : (
        <div className="road__fog">
          <div className="rule" aria-hidden="true">
            <span className="diamond" />
          </div>
          <p className="road__reason road__reason--fog">{roadChoice.reason}</p>
        </div>
      )}
      {/* One quiet, product-voiced line rather than the raw warning
          strings themselves (those are diagnostic English carried in
          RitualResultViewModel.warnings for the network payload, e.g.
          "Tutu MCP search_multitransport failed: ..." -- never fit for a
          reader). No [data-block] of its own: it belongs to the road
          block's own stagger step, not a new one.
          transportOutcome (when the reading carries one -- see its own
          comment) picks between "Tutu refused" and "Tutu found nothing",
          which read as very different facts to someone deciding whether
          to trust the fog above. Falls back to the old undifferentiated
          line, unchanged, for readings that predate transportOutcome. */}
      {transportOutcome && transportOutcome !== "served" ? (
        <p className="road__warning">{LEG_OUTCOME_COPY[transportOutcome]}</p>
      ) : !transportOutcome && warnings.length > 0 ? (
        <p className="road__warning">
          Дороги удалось проверить не полностью — Туту сейчас отвечает не на все запросы.
        </p>
      ) : null}
    </section>
  );
}

// The trust footer, factored out for the same reason as RoadSection above.
export function SourcesSection({ sourceLinks, blockIndex }: { sourceLinks: SourceLink[]; blockIndex: number }) {
  return (
    <div
      className="proof-links"
      data-block="sources"
      aria-label="Подтверждения Туту"
      style={blockIndexStyle(blockIndex)}
    >
      {sourceLinks.map((link) => (
        <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
          {link.label}
        </a>
      ))}
    </div>
  );
}

export function TravelResult({ result }: { result: RitualResultViewModel }) {
  const { roadChoice } = result;
  const reading = sharedReadingFrom(result);

  return (
    <section className="travel-result">
      <div className="prediction-panel" data-block="prediction" style={blockIndexStyle(BLOCK_INDEX.prediction)}>
        <p className="result-kicker">Предсказанный маршрут</p>
        <h2>{result.prediction.headline}</h2>
        <GuideStrip destination={result.destination} />
        <SeasonMismatchNote destination={result.destination} intent={result.intent} />
        <p>{result.prediction.opening}</p>
        <p>{result.prediction.summary}</p>
      </div>
      {result.spreadCards?.length ? (
        <section
          className="spread-panel"
          data-block="spread"
          aria-label="Расклад карт"
          style={blockIndexStyle(BLOCK_INDEX.spread)}
        >
          <div className="spread-panel__header">
            <p className="result-kicker">Расклад карт</p>
            <h3>Три знака дороги</h3>
          </div>
          {/* .spread-stage wraps the mist and the grid together, the same
              way RitualScene's own .ritual-scene__stage does (see that
              component's comment) — position:relative here gives the mist's
              position:absolute/inset:0 a containing block scoped to just
              this row, not the whole .spread-panel (which also carries the
              header and closing line above/below it). This is the moment
              the brief's mist ritual actually finishes: the "disperse"
              variant starts already visible (reading as the same mist from
              RitualScene continuing, not a new one), then fades out once
              the third card lands — see RitualMist's own comment. */}
          <div className="spread-stage">
            <RitualMist variant="disperse" />
            <div className="spread-grid">
              {result.spreadCards.map((card, index) => (
                <div className="spread-card-shell" key={`${card.position}-${card.id}`} style={{ "--card-order": index } as CSSProperties}>
                  <TarotCardView
                    card={card}
                    revealed
                    testId="spread-card"
                    readingText={readingTextFor(card.id, result.prediction.cardReadings)}
                  />
                </div>
              ))}
            </div>
          </div>
          {/* A coda, not a heading -- one quiet line after the spread, only
              ever set when the AI wrote one and it passed validation (see
              PredictionText.closingLine's own comment). */}
          {result.prediction.closingLine ? (
            <p className="spread-panel__closing">{result.prediction.closingLine}</p>
          ) : null}
        </section>
      ) : null}
      <RoadSection
        roadChoice={roadChoice}
        transportOutcome={result.transportOutcome}
        warnings={result.warnings}
        blockIndex={BLOCK_INDEX.road}
      />
      {/* OfferList renders its own [data-block] section; --block-index is set
          on this wrapper and inherited down to it (custom properties
          inherit through the DOM by default), which staggers it without
          OfferList needing to know about the ritual's animation scheme. */}
      <div style={blockIndexStyle(BLOCK_INDEX.otherRoads)}>
        <OfferList
          title="Билеты по предсказанию"
          offers={result.transportOffers}
          excludeId={roadChoice.best?.id}
          dataBlock="other-roads"
          outcome={result.transportOutcome}
        />
      </div>
      <div style={blockIndexStyle(BLOCK_INDEX.hotels)}>
        <OfferList
          title="Где остановиться"
          offers={result.hotelOffers}
          dataBlock="hotels"
          outcome={result.hotelsOutcome}
        />
      </div>
      <SourcesSection sourceLinks={result.sourceLinks} blockIndex={BLOCK_INDEX.sources} />
      {/* No [data-block] here on purpose: the sources block above already
          closes out the animated stagger sequence (BLOCK_INDEX.sources is
          its last step), and this sits right after it, undelayed, rather
          than adding a seventh staggered step. */}
      {reading ? <ShareButton reading={reading} destinationName={result.destination.name} /> : null}
    </section>
  );
}
