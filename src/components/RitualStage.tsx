"use client";

import { useState } from "react";
import type { TripIntent } from "@/domain/types";
import { TripIntentForm } from "./TripIntentForm";
import { RitualScene } from "./RitualScene";
import type { RitualVisualStage } from "./RitualScene3D";

type Stage = "idle" | "ritual-started" | "awaiting-result" | "result" | "error";

interface RitualApiResult {
  prediction: { headline: string; opening: string; summary: string };
  destination: { name: string; region: string };
}

export function RitualStage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<RitualApiResult | null>(null);
  const visualStage: RitualVisualStage =
    stage === "ritual-started" || stage === "awaiting-result" ? "dealing" : stage === "result" ? "result" : stage;

  async function startRitual(intent: TripIntent) {
    setStage("ritual-started");
    try {
      const response = await fetch("/api/ritual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intent),
      });
      if (!response.ok) throw new Error("ritual_failed");
      const data = (await response.json()) as RitualApiResult;
      setResult(data);
      setStage("result");
    } catch {
      setStage("error");
    }
  }

  return (
    <section className="ritual-layout" data-stage={stage}>
      <div className="ritual-copy">
        <h1>Таро-турагент</h1>
        <p>Колода выбирает маршрут по России, а Туту проверяет дорогу и ночлег.</p>
      </div>
      <div className="scene-shell">
        <RitualScene stage={visualStage} />
      </div>
      {stage === "idle" ? <TripIntentForm onSubmit={startRitual} /> : null}
      {stage === "ritual-started" || stage === "awaiting-result" ? <p className="ritual-status">Карты ложатся на стол...</p> : null}
      {stage === "result" && result ? (
        <div className="result-shell">
          <p>{result.prediction.headline}</p>
          <h2>{result.destination.name}</h2>
          <p>{result.destination.region}</p>
        </div>
      ) : null}
      {stage === "error" ? <button onClick={() => setStage("idle")}>Попробовать снова</button> : null}
    </section>
  );
}
