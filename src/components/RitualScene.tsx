"use client";

import type { CSSProperties } from "react";
import type { DrawnTarotCard, TarotPosition } from "@/domain/types";
import { RitualMist } from "./RitualMist";
import { TarotCardView } from "./TarotCardView";

// "idle" is kept only so a standalone render (see ritual-scene.test.tsx,
// which predates this task's card mechanics) still has a valid stage to
// pass; RitualStage itself only ever mounts this component for "dealing",
// "consulting" and "reading" — it unmounts once the reading is fully
// "revealed" and TravelResult's own spread-panel takes over as the
// permanent home for the three cards, so nothing here needs to render
// twice.
export type RitualVisualStage = "idle" | "dealing" | "consulting" | "reading";

export interface RitualSceneSlot {
  position: TarotPosition;
  // null before the card's identity is known. For "Зов"/"Дар" that's only
  // ever true for an instant (drawDestinationCards is pure and synchronous
  // once the intent is submitted); for "Путь" it stays null right up until
  // the request resolves, because that card's identity depends on which
  // roads Tutu MCP actually reports. At "reading" RitualStage swaps in the
  // server's own three cards, so by then no slot is null.
  card: DrawnTarotCard | null;
  // Independent of `card`: even once a card's identity is known, RitualStage
  // holds `revealed` false until its deal timer elapses, so the two seed
  // -only cards still land on the table one at a time instead of both
  // appearing the instant the intent is submitted.
  revealed: boolean;
}

export interface RitualSceneProps {
  stage: RitualVisualStage;
  slots?: RitualSceneSlot[];
}

const DEFAULT_POSITIONS: TarotPosition[] = ["Зов", "Дар", "Путь"];

const DEFAULT_SLOTS: RitualSceneSlot[] = DEFAULT_POSITIONS.map((position) => ({
  position,
  card: null,
  revealed: false,
}));

// A card whose identity isn't known yet (or is known but not due to reveal
// yet — see RitualSceneSlot.card's own comment). Reuses the shared `.back`
// primitive directly rather than TarotCardView, since TarotCardView always
// requires a real card; this keeps the same DOM shape (figure[data-testid=
// "tarot-card"][data-revealed="false"] > .back) without a second
// implementation of the back.
function FaceDownSlot() {
  return (
    <figure className="tarot-card" data-revealed="false" data-testid="tarot-card">
      <div className="back tarot-card__back" aria-hidden="true" />
    </figure>
  );
}

export function RitualScene({ stage, slots = DEFAULT_SLOTS }: RitualSceneProps) {
  return (
    <div className="ritual-scene" aria-label="Мистический расклад карт" data-visual-stage={stage}>
      <div className="ritual-scene__deck" aria-hidden="true">
        <div className="back" />
        <div className="back" />
        <div className="back" />
      </div>
      {/* .ritual-scene__stage wraps the mist and the spread together so the
          mist can be positioned (position:absolute; inset:0) against this
          wrapper specifically, rather than against .ritual-scene itself
          (which also contains the deck fan and the status line — an inset
          there would size the mist to the whole scene, not just the row of
          cards it needs to gather behind). See RitualMist's own comment for
          what "gather" means here: this is where "mist gathers and begins
          to turn" (req 1) actually starts, timed to finish its own fade-in
          (900ms, globals.css) right as the first card's reveal timer
          (DEAL_STEP_MS, RitualStage.tsx) fires. */}
      <div className="ritual-scene__stage">
        <RitualMist variant="gather" />
        <div className="ritual-scene__spread">
          {slots.map((slot, index) => (
            <div
              className="ritual-scene__slot"
              key={slot.position}
              style={{ "--ritual-order": index } as CSSProperties}
            >
              {slot.card ? (
                <TarotCardView card={slot.card} revealed={slot.revealed} testId="tarot-card" />
              ) : (
                <FaceDownSlot />
              )}
              <span className="ritual-scene__pos">{slot.position}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="ritual-status" role="status">
        {stage === "reading" ? (
          "Оракул читает расклад…"
        ) : stage === "consulting" ? (
          "Оракул сверяется с дорогами…"
        ) : (
          <>
            Карты ложатся на стол
            <span className="ritual-scene__dot" aria-hidden="true">.</span>
            <span className="ritual-scene__dot" aria-hidden="true">.</span>
            <span className="ritual-scene__dot" aria-hidden="true">.</span>
          </>
        )}
      </p>
    </div>
  );
}
