"use client";

import { useState } from "react";
import type { TripIntent } from "@/domain/types";
import { TripIntentForm } from "./TripIntentForm";
import { RitualScene, type RitualVisualStage } from "./RitualScene";
import { TravelResult, type RitualResultViewModel } from "./TravelResult";

type Stage = "idle" | "ritual-started" | "awaiting-result" | "result" | "error";

const MIN_RITUAL_DURATION_MS = 1900;

function waitForRitualFloor() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, MIN_RITUAL_DURATION_MS);
  });
}

async function postRitualIntent(intent: TripIntent): Promise<RitualResultViewModel> {
  const body = JSON.stringify(intent);

  if (typeof window.fetch === "function") {
    const response = await window.fetch("/api/ritual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!response.ok) throw new Error("ritual_failed");
    return (await response.json()) as RitualResultViewModel;
  }

  return new Promise((resolve, reject) => {
    const request = new window.XMLHttpRequest();
    request.open("POST", "/api/ritual");
    request.setRequestHeader("Content-Type", "application/json");
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error("ritual_failed"));
        return;
      }

      try {
        resolve(JSON.parse(request.responseText) as RitualResultViewModel);
      } catch {
        reject(new Error("ritual_failed"));
      }
    };
    request.onerror = () => reject(new Error("ritual_failed"));
    request.send(body);
  });
}

export function RitualStage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<RitualResultViewModel | null>(null);
  const showRitualScene = stage === "ritual-started" || stage === "awaiting-result";
  const visualStage: RitualVisualStage =
    stage === "ritual-started" || stage === "awaiting-result" ? "dealing" : stage === "result" ? "result" : stage;

  async function startRitual(intent: TripIntent) {
    setStage("ritual-started");
    const ritualFloor = waitForRitualFloor();
    try {
      const data = await postRitualIntent(intent);
      await ritualFloor;
      setResult(data);
      setStage("result");
    } catch {
      await ritualFloor;
      setStage("error");
    }
  }

  return (
    <section className="ritual-layout" data-stage={stage}>
      <div className="ritual-copy">
        <h1>Таро-турагент</h1>
        <p>Колода выбирает маршрут по России, а Туту проверяет дорогу и ночлег.</p>
      </div>
      {stage === "idle" ? <TripIntentForm onSubmit={startRitual} /> : null}
      {showRitualScene ? (
        <div className="scene-shell">
          <RitualScene stage={visualStage} />
          <p className="ritual-status">Карты ложатся на стол...</p>
        </div>
      ) : null}
      {stage === "result" && result ? <TravelResult result={result} /> : null}
      {stage === "error" ? <button onClick={() => setStage("idle")}>Попробовать снова</button> : null}
    </section>
  );
}
