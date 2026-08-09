export function TarotCardView({ name, revealed }: { name: string; revealed: boolean }) {
  return (
    <div className="tarot-card" data-revealed={revealed}>
      <div className="tarot-card__back" aria-hidden={revealed}>
        <span />
      </div>
      {revealed ? (
        <div className="tarot-card__face">
          <span>{name}</span>
        </div>
      ) : null}
    </div>
  );
}
