import type { PredictionText } from "@/server/oracle/narrator";
import type { DrawnTarotCard, TransportMode } from "@/domain/types";
import type { NormalizedOffer } from "@/server/tutu/normalize";
import type { CSSProperties } from "react";
import { MODE_LABELS, OfferList } from "./OfferList";
import { TarotCardView } from "./TarotCardView";

export interface RoadChoice {
  mode: TransportMode | null;
  reason: string;
  best: NormalizedOffer | null;
}

export interface RitualResultViewModel {
  prediction: PredictionText;
  destination: { name: string; region: string };
  spreadCards?: DrawnTarotCard[];
  roadChoice: RoadChoice;
  sourceLinks: Array<{ label: string; url: string }>;
  transportOffers: NormalizedOffer[];
  hotelOffers: NormalizedOffer[];
  warnings: string[];
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

function blockIndexStyle(index: number): CSSProperties {
  return { "--block-index": index } as CSSProperties;
}

export function TravelResult({ result }: { result: RitualResultViewModel }) {
  const { roadChoice } = result;
  const modeLabel = roadChoice.mode ? MODE_LABELS[roadChoice.mode] : null;

  return (
    <section className="travel-result">
      <div className="prediction-panel" data-block="prediction" style={blockIndexStyle(BLOCK_INDEX.prediction)}>
        <p className="result-kicker">Предсказанный маршрут</p>
        <h2>{result.prediction.headline}</h2>
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
          <div className="spread-grid">
            {result.spreadCards.map((card, index) => (
              <div className="spread-card-shell" key={`${card.position}-${card.id}`} style={{ "--card-order": index } as CSSProperties}>
                <TarotCardView card={card} revealed testId="spread-card" />
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <section
        className="road"
        data-block="road"
        aria-label="Дорога, которую выбрала карта"
        style={blockIndexStyle(BLOCK_INDEX.road)}
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
      </section>
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
        />
      </div>
      <div style={blockIndexStyle(BLOCK_INDEX.hotels)}>
        <OfferList title="Где остановиться" offers={result.hotelOffers} dataBlock="hotels" />
      </div>
      <div
        className="proof-links"
        data-block="sources"
        aria-label="Подтверждения Туту"
        style={blockIndexStyle(BLOCK_INDEX.sources)}
      >
        {result.sourceLinks.map((link) => (
          <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
            {link.label}
          </a>
        ))}
      </div>
    </section>
  );
}
