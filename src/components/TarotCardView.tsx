import type { DrawnTarotCard } from "@/domain/types";

interface TarotCardViewProps {
  card: DrawnTarotCard;
  revealed: boolean;
  testId?: string;
}

export function TarotCardView({ card, revealed, testId }: TarotCardViewProps) {
  const meaning = card.reversed ? card.meaningReversed : card.meaning;

  return (
    <figure
      className="tarot-card"
      data-revealed={revealed}
      data-reversed={card.reversed}
      data-card-id={card.id}
      data-testid={testId ?? "tarot-card"}
    >
      <div className="tarot-card__back" aria-hidden={revealed} />
      {revealed ? (
        <div className="tarot-card__face">
          <small className="tarot-card__position">{card.position}</small>
          <img
            className="tarot-card__art"
            src={card.image}
            alt={`${card.name}${card.reversed ? ", перевёрнутая" : ""}`}
            width={600}
            height={1032}
          />
          <figcaption>
            <strong>{card.name}</strong>
            {card.reversed ? <em className="tarot-card__flag">перевёрнутая</em> : null}
            <p>{meaning}</p>
          </figcaption>
        </div>
      ) : null}
    </figure>
  );
}
