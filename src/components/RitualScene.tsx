"use client";

import type { CSSProperties } from "react";

export type RitualVisualStage = "idle" | "ritual-started" | "dealing" | "revealing" | "result" | "error";

const ritualCards = [
  { position: "Зов", title: "куда тянет дорога", tone: "brass" },
  { position: "Путь", title: "как сложится маршрут", tone: "jade" },
  { position: "Дар", title: "что откроется в поездке", tone: "wine" },
];

export function RitualScene({ stage }: { stage: RitualVisualStage }) {
  return (
    <div className="ritual-scene" aria-label="Мистический расклад карт" data-visual-stage={stage}>
      <div className="ritual-scene__veil" aria-hidden="true" />
      <div className="ritual-scene__table" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="ritual-scene__deck" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="ritual-scene__spread">
        {ritualCards.map((card, index) => (
          <article className="ritual-scene__card" data-tone={card.tone} key={card.position} style={{ "--ritual-order": index } as CSSProperties}>
            <span>{card.position}</span>
            <strong>{card.title}</strong>
          </article>
        ))}
      </div>
    </div>
  );
}
