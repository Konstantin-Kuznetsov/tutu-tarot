import type { NormalizedOffer } from "@/server/tutu/normalize";
import type { TransportMode } from "@/domain/types";

export const MODE_LABELS: Record<TransportMode, string> = {
  avia: "Самолёт",
  railway: "Поезд",
  bus: "Автобус",
};

const MODE_ORDER: TransportMode[] = ["avia", "railway", "bus"];

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
}: {
  title: string;
  offers: NormalizedOffer[];
  /** The road hero's offer id — dropped from this list so it isn't shown twice. */
  excludeId?: string;
  dataBlock?: string;
}) {
  const visible = excludeId ? offers.filter((offer) => offer.id !== excludeId) : offers;

  if (visible.length === 0) {
    return (
      <section className="offer-section" data-block={dataBlock}>
        <h3 className="sec"><span>{title}</span></h3>
        <p>Карты оставили эту часть маршрута в тумане. Попробуйте другие даты.</p>
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
        <div className="offer-grid">
          {visible.map((offer) => <OfferCard key={offer.id} offer={offer} />)}
        </div>
      </section>
    );
  }

  return (
    <section className="offer-section" data-block={dataBlock}>
      <h3 className="sec"><span>{title}</span></h3>
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
