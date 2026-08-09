"use client";

import type { RitualVisualStage } from "./RitualScene3D";
import { TarotCardView } from "./TarotCardView";

export function RitualSceneFallback({ stage }: { stage: RitualVisualStage }) {
  const revealed = stage === "revealing" || stage === "result";
  return (
    <div className="ritual-fallback" aria-label="Tarot ritual scene">
      {["Зов", "Путь", "Дар маршрута"].map((position) => (
        <TarotCardView key={position} name={position} revealed={revealed} />
      ))}
    </div>
  );
}
