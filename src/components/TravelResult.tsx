import type { PredictionText } from "@/server/oracle/narrator";
import type { DrawnTarotCard } from "@/domain/types";
import type { NormalizedOffer } from "@/server/tutu/normalize";
import type { CSSProperties } from "react";
import { OfferList } from "./OfferList";
import { TarotCardView } from "./TarotCardView";

export interface RitualResultViewModel {
  prediction: PredictionText;
  destination: { name: string; region: string };
  spreadCards?: DrawnTarotCard[];
  sourceLinks: Array<{ label: string; url: string }>;
  transportOffers: NormalizedOffer[];
  hotelOffers: NormalizedOffer[];
  warnings: string[];
}

export function TravelResult({ result }: { result: RitualResultViewModel }) {
  return (
    <section className="travel-result">
      <div className="prediction-panel">
        <p className="result-kicker">Предсказанный маршрут</p>
        <h2>{result.prediction.headline}</h2>
        <p>{result.prediction.opening}</p>
        <p>{result.prediction.summary}</p>
      </div>
      {result.spreadCards?.length ? (
        <section className="spread-panel" aria-label="Расклад карт">
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
      <div className="proof-links" aria-label="Подтверждения Туту">
        {result.sourceLinks.map((link) => (
          <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
            {link.label}
          </a>
        ))}
      </div>
      <OfferList title="Билеты по предсказанию" offers={result.transportOffers} />
      <OfferList title="Где остановиться" offers={result.hotelOffers} />
    </section>
  );
}
