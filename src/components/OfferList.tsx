import type { NormalizedOffer } from "@/server/tutu/normalize";

export function OfferList({ title, offers }: { title: string; offers: NormalizedOffer[] }) {
  if (offers.length === 0) {
    return (
      <section className="offer-section">
        <h3>{title}</h3>
        <p>Карты оставили эту часть маршрута в тумане. Попробуйте другие даты.</p>
      </section>
    );
  }

  return (
    <section className="offer-section">
      <h3>{title}</h3>
      <div className="offer-grid">
        {offers.map((offer) => {
          const content = (
            <>
              <span>{offer.title}</span>
              {offer.subtitle ? <small>{offer.subtitle}</small> : null}
              {offer.price ? <strong>{offer.price}</strong> : null}
            </>
          );

          return offer.url ? (
            <a key={offer.id} className="offer-card" href={offer.url} target="_blank" rel="noreferrer">
              {content}
            </a>
          ) : (
            <div key={offer.id} className="offer-card">
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}
