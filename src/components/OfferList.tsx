import type { NormalizedOffer } from "@/server/tutu/normalize";
import { TRANSPORT_MODES } from "@/domain/types";
import type { LegOutcome, TransportMode } from "@/domain/types";

export const MODE_LABELS: Record<TransportMode, string> = {
  avia: "Самолёт",
  railway: "Поезд",
  bus: "Автобус",
  etrain: "Электричка",
};

// Display order, derived from the same list for the same reason as
// roads.ts: a new mode must not be able to go unrendered.
const MODE_ORDER = TRANSPORT_MODES;

// Shared with TravelResult's road block (the transport leg's hero/fog
// section), so "Tutu refused" and "Tutu answered with nothing" read the
// same way everywhere they appear, not just in whichever section happened
// to get written first. "failed" says plainly that Tutu didn't answer --
// the reading could not be checked -- rather than reaching for the deck's
// own fog metaphor, because this is a real outage, not an ordinary empty
// result. "empty" says the opposite on purpose: a real answer, not a
// problem. Neither string blocks the fallback offer card underneath it
// (the link into Tutu's own search), which renders exactly as before.
export const LEG_OUTCOME_COPY: Record<Exclude<LegOutcome, "served">, string> = {
  failed: "Туту сейчас не отвечает — этот раздел проверить не удалось.",
  empty: "Туту ответил: на эти даты здесь ничего не нашлось. Это не сбой, а честный ответ.",
};

function OutcomeNote({ outcome }: { outcome?: LegOutcome }) {
  if (!outcome || outcome === "served") return null;
  return <p className="offer-section__note">{LEG_OUTCOME_COPY[outcome]}</p>;
}

function OfferCard({ offer }: { offer: NormalizedOffer }) {
  const content = (
    <>
      <span>{offer.title}</span>
      {offer.subtitle ? <small>{offer.subtitle}</small> : null}
      {offer.price ? <strong>{offer.price}</strong> : null}
    </>
  );

  return offer.url ? (
    <a className="offer-card" href={offer.url} target="_blank" rel="noreferrer">
      {content}
    </a>
  ) : (
    <div className="offer-card">{content}</div>
  );
}

export function OfferList({
  title,
  offers,
  excludeId,
  dataBlock,
  outcome,
}: {
  title: string;
  offers: NormalizedOffer[];
  /** The road hero's offer id — dropped from this list so it isn't shown twice. */
  excludeId?: string;
  dataBlock?: string;
  /**
   * What actually happened on this leg's search (see LegOutcome). Optional
   * so hand-built test fixtures that predate this feature don't all need
   * updating — omitted or "served" renders exactly as before. When it's
   * "empty" or "failed" this shows LEG_OUTCOME_COPY above the grid (which
   * still renders below, carrying the fallback offer's link into Tutu's
   * own search either way — see mcpClient's transportFallback/hotelFallback).
   */
  outcome?: LegOutcome;
}) {
  const visible = excludeId ? offers.filter((offer) => offer.id !== excludeId) : offers;

  if (visible.length === 0) {
    return (
      <section className="offer-section" data-block={dataBlock}>
        <h3 className="sec"><span>{title}</span></h3>
        {outcome && outcome !== "served" ? (
          <p className="offer-section__note">{LEG_OUTCOME_COPY[outcome]}</p>
        ) : (
          <p>Карты оставили эту часть маршрута в тумане. Попробуйте другие даты.</p>
        )}
      </section>
    );
  }

  // Hotels (and anything else without a `mode`) fall straight through as a
  // flat grid, unchanged from before this task. Transport offers, which
  // always carry a mode, get grouped into collapsed Самолёт/Поезд/Автобус
  // sections so the alternatives read as a supporting cast, not a second
  // list competing with the hero road above.
  const groups = MODE_ORDER
    .map((mode) => ({ mode, label: MODE_LABELS[mode], offers: visible.filter((offer) => offer.mode === mode) }))
    .filter((group) => group.offers.length > 0);
  const ungrouped = visible.filter((offer) => !offer.mode);

  if (groups.length === 0) {
    return (
      <section className="offer-section" data-block={dataBlock}>
        <h3 className="sec"><span>{title}</span></h3>
        <OutcomeNote outcome={outcome} />
        <div className="offer-grid">
          {visible.map((offer) => <OfferCard key={offer.id} offer={offer} />)}
        </div>
      </section>
    );
  }

  return (
    <section className="offer-section" data-block={dataBlock}>
      <h3 className="sec"><span>{title}</span></h3>
      <OutcomeNote outcome={outcome} />
      <div className="offer-groups">
        {groups.map((group) => (
          <details className="offer-group" key={group.mode}>
            <summary>
              <span className="offer-group__chevron" aria-hidden="true">›</span>
              <span className="offer-group__label">{group.label}</span>
              <span className="offer-group__count">{group.offers.length}</span>
            </summary>
            <div className="offer-grid">
              {group.offers.map((offer) => <OfferCard key={offer.id} offer={offer} />)}
            </div>
          </details>
        ))}
      </div>
      {ungrouped.length > 0 ? (
        <div className="offer-grid">
          {ungrouped.map((offer) => <OfferCard key={offer.id} offer={offer} />)}
        </div>
      ) : null}
    </section>
  );
}
