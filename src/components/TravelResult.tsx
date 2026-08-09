import type { PredictionText } from "@/server/oracle/narrator";
import type { NormalizedOffer } from "@/server/tutu/normalize";
import { OfferList } from "./OfferList";

export interface RitualResultViewModel {
  prediction: PredictionText;
  destination: { name: string; region: string };
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
