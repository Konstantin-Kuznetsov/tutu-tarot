interface TarotCardViewProps {
  name: string;
  revealed: boolean;
  id?: string;
  position?: string;
  meaning?: string;
  testId?: string;
}

function symbolFor(id: string | undefined, name: string): string {
  const key = id || name.toLocaleLowerCase("ru-RU");
  if (key.includes("tower") || key.includes("баш")) return "△";
  if (key.includes("chariot") || key.includes("колес")) return "◈";
  if (key.includes("hermit") || key.includes("отш")) return "✦";
  if (key.includes("star") || key.includes("звезд")) return "✶";
  if (key.includes("sun") || key.includes("солн")) return "☉";
  if (key.includes("lover") || key.includes("влюб")) return "◇";
  if (key.includes("judgement") || key.includes("суд")) return "✧";
  return "✺";
}

export function TarotCardView({ name, revealed, id, position, meaning, testId }: TarotCardViewProps) {
  return (
    <div className="tarot-card" data-revealed={revealed} data-card-id={id || name} data-testid={testId}>
      <div className="tarot-card__back" aria-hidden={revealed}>
        <span />
      </div>
      {revealed ? (
        <div className="tarot-card__face">
          {position ? <small>{position}</small> : null}
          <span className="tarot-card__symbol" aria-hidden="true">{symbolFor(id, name)}</span>
          <strong>{name}</strong>
          {meaning ? <p>{meaning}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
