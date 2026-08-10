import type { DrawnTarotCard } from "@/domain/types";

interface TarotCardViewProps {
  card: DrawnTarotCard;
  revealed: boolean;
  testId?: string;
  // The living reading written for this exact card (template or AI --
  // TravelResult already matched it by card.id before handing it down; this
  // component never does its own matching). Undefined in every context that
  // predates this prop -- face-down during the ritual (RitualScene), a
  // still-dealing slot, or whenever no reading exists for this card -- so
  // the component renders byte-identical to before this prop existed.
  readingText?: string;
}

// `.tarot-card` (the <figure> below) has a pinned aspect-ratio and
// `overflow: hidden` (see globals.css) -- it was sized for the deck's own
// short meaning phrases (tens of characters), not for a written reading
// (up to 400 characters, validated in validate.ts). Squeezing a reading
// into that fixed box risks exactly the regression a previous round fixed
// (see .tarot-card__flag's comment: overflowing caption content got
// clipped out of view entirely). So when a reading is supplied, it renders
// as a plain sibling paragraph *after* the card figure -- in the spread
// section around the card, in normal document flow, free to wrap and grow
// without touching the card's own pinned shape -- and the figcaption's own
// meaning line is omitted in favour of it (never both at once).
export function TarotCardView({ card, revealed, testId, readingText }: TarotCardViewProps) {
  const meaning = card.reversed ? card.meaningReversed : card.meaning;

  return (
    <>
      <figure
        className="tarot-card"
        data-revealed={revealed}
        data-reversed={card.reversed}
        data-card-id={card.id}
        data-testid={testId ?? "tarot-card"}
      >
        <div className="back tarot-card__back" aria-hidden={revealed} />
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
              {card.reversed ? (
                <>
                  {" "}
                  <em className="tarot-card__flag">перевёрнутая</em>
                </>
              ) : null}
              {readingText ? null : <p>{meaning}</p>}
            </figcaption>
          </div>
        ) : null}
      </figure>
      {revealed && readingText ? (
        <p className="tarot-card-reading" data-testid={`${testId ?? "tarot-card"}-reading`}>
          {readingText}
        </p>
      ) : null}
    </>
  );
}
