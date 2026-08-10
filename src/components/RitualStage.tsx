"use client";

import { useEffect, useRef, useState } from "react";
import { drawDestinationCards } from "@/domain/tarot/engine";
import type { DrawnTarotCard, TripIntent } from "@/domain/types";
import { TripIntentForm } from "./TripIntentForm";
import { RitualScene, type RitualSceneSlot } from "./RitualScene";
import { TravelResult, type RitualResultViewModel } from "./TravelResult";

type Stage = "idle" | "dealing" | "consulting" | "revealed" | "error";

// --t-deal in globals.css: how long one card takes to land. Two cards land
// on this timer because they only need the seed — drawDestinationCards is a
// pure function of the submitted intent, computed synchronously below, the
// same reading the server independently repeats from the same seed. The
// third card's identity depends on which roads Tutu MCP actually reports,
// so it can only be known once the request itself settles; see startRitual.
const DEAL_STEP_MS = 900;

// How long to let the search run before the copy admits it's taking a
// while. Below this the wait reads as part of the dealing choreography;
// past it, staying silent would read as broken rather than deliberate.
const CONSULT_AFTER_MS = 3_000;

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
  const [localCards, setLocalCards] = useState<[DrawnTarotCard, DrawnTarotCard] | null>(null);
  const [revealCount, setRevealCount] = useState<0 | 1 | 2>(0);
  const timersRef = useRef<number[]>([]);
  const resultRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage>(stage);
  stageRef.current = stage;
  // Whether the user has taken the wheel/keyboard/touch at any point since
  // the ritual left "idle" — tracked for the component's whole lifetime
  // (see the mount-once effect below), not just while the auto-scroll
  // effect happens to be mounted. A scroll that lands during "dealing" or
  // "consulting" (the wait can run several seconds) must still cancel the
  // eventual auto-scroll on "revealed"; scoping the listener to only the
  // post-reveal effect misses exactly that case, since by the time it
  // attaches the user has already scrolled and there is nothing left to
  // "abandon". Reset on every return to idle so a later attempt gets its
  // own fresh chance to follow.
  const userTookControlRef = useRef(false);

  function clearTimers() {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }

  // Clear every timer on unmount, in addition to the clears already inside
  // startRitual's success/error paths.
  useEffect(() => clearTimers, []);

  async function startRitual(intent: TripIntent) {
    // Re-entrancy guard: a new ritual may only start from "idle" (the first
    // attempt) or "error" (a fresh attempt after a failed one). Read from
    // the ref, not the `stage` state variable closed over by this render —
    // a second, rapid activation (the receded form's fields/button stay
    // focusable and keyboard-activatable even though pointer-events: none
    // blocks clicks; see .intent-form's `inert` below for the other half of
    // this fix) can fire before React has flushed the first call's
    // setStage("dealing") and re-rendered, so a check against `stage`
    // itself would still read the pre-submission value for both calls.
    // Without this guard, the second call's clearTimers() strands the first
    // call's still-pending dealtFloor timer (see the comment on that
    // promise below) — corrupting a search that was about to succeed into a
    // false "error".
    if (stageRef.current !== "idle" && stageRef.current !== "error") return;
    // Claim the slot synchronously, before anything else in this function
    // runs, so a second call arriving later in the same tick (before this
    // component has re-rendered and re-run `stageRef.current = stage`
    // below) is rejected by the check above too.
    stageRef.current = "dealing";

    clearTimers();
    setResult(null);
    userTookControlRef.current = false;

    // Phase 1, entirely client-side: same pure draw the server will
    // independently repeat from the same seed, just revealed on a timer
    // instead of the instant it's known, so the deal reads as a ritual
    // rather than a flash of text.
    const draw = drawDestinationCards(intent);
    setLocalCards([draw.cards[0], draw.cards[1]]);
    setRevealCount(0);
    setStage("dealing");

    timersRef.current.push(
      window.setTimeout(() => setRevealCount(1), DEAL_STEP_MS),
      window.setTimeout(() => setRevealCount(2), DEAL_STEP_MS * 2),
      window.setTimeout(() => {
        setStage((current) => (current === "dealing" ? "consulting" : current));
      }, CONSULT_AFTER_MS),
    );

    // The floor keeps the third card from flipping before the second has
    // settled even when the search returns almost instantly — it is not a
    // decorative delay on top of the real wait, it's the minimum the
    // dealing choreography itself needs.
    const dealtFloor = new Promise<void>((resolve) => {
      timersRef.current.push(window.setTimeout(resolve, DEAL_STEP_MS * 2));
    });

    try {
      const [data] = await Promise.all([postRitualIntent(intent), dealtFloor]);
      clearTimers();
      setResult(data);
      setStage("revealed");
    } catch {
      clearTimers();
      setStage("error");
    }
  }

  function retry() {
    clearTimers();
    setResult(null);
    setLocalCards(null);
    setRevealCount(0);
    userTookControlRef.current = false;
    setStage("idle");
  }

  // Mounted once for the component's whole life (not scoped to any one
  // stage) so a scroll/touch/key during the wait is never missed — see
  // userTookControlRef's own comment for why that matters. Interactions
  // while still "idle" (ordinary page browsing before the ticket is even
  // submitted) don't count; stageRef avoids a stale closure without making
  // this effect depend on (and re-attach listeners on) every stage change.
  useEffect(() => {
    const markControl = () => {
      if (stageRef.current !== "idle") userTookControlRef.current = true;
    };
    window.addEventListener("wheel", markControl, { passive: true });
    window.addEventListener("touchstart", markControl, { passive: true });
    window.addEventListener("keydown", markControl);
    return () => {
      window.removeEventListener("wheel", markControl);
      window.removeEventListener("touchstart", markControl);
      window.removeEventListener("keydown", markControl);
    };
  }, []);

  // Follow the result once, the moment it appears, and abandon following
  // if the user has taken control at any point since submitting — never
  // pull them back. No scroll at all under reduced motion, matching the
  // CSS's own blanket reduce block for the block-in stagger.
  // matchMedia/scrollIntoView are guarded because jsdom (the unit-test
  // environment) implements neither, and a real browser missing them
  // should degrade to "no auto-scroll" rather than throw.
  useEffect(() => {
    if (stage !== "revealed") return;
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const timer = window.setTimeout(() => {
      if (!userTookControlRef.current) {
        resultRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      }
    }, 120);

    return () => window.clearTimeout(timer);
  }, [stage]);

  const showScene = stage === "dealing" || stage === "consulting";
  const slots: RitualSceneSlot[] = [
    { position: "Зов", card: localCards?.[0] ?? null, revealed: revealCount >= 1 },
    { position: "Дар", card: localCards?.[1] ?? null, revealed: revealCount >= 2 },
    { position: "Путь", card: null, revealed: false },
  ];

  // One surface, one stage machine: TripIntentForm stays mounted for the
  // whole flow (wrapped in .intent-form, which globals.css shrinks and
  // dims once data-stage leaves "idle") instead of unmounting once the
  // ritual starts. The scene and the result are siblings that appear below
  // it in document order as the stage advances — there is no separate
  // screen to navigate to and nothing here ever renders a link or a nav
  // landmark for "the result".
  return (
    <div className="ritual-layout" data-stage={stage}>
      {/* Recede in globals.css only sets pointer-events: none, which blocks
          clicks but not keyboard focus/activation — a Tab to the submit
          button (or refocusing the still-mounted city input and pressing
          Enter) could still fire onSubmit while a ritual is already
          running. `inert` makes the whole subtree genuinely unreachable
          (unfocusable, not hit-tested, skipped by assistive tech) without
          unmounting or hiding it — the receded ticket stays visible, it's
          just no longer part of the interaction surface. Kept in sync with
          the CSS recede selector's own condition (`:not([data-stage=
          "idle"])`) so "receded" and "inert" always agree. */}
      <div className="intent-form" inert={stage !== "idle"}>
        <TripIntentForm onSubmit={startRitual} />
      </div>
      {showScene ? (
        <RitualScene stage={stage === "consulting" ? "consulting" : "dealing"} slots={slots} />
      ) : null}
      {stage === "revealed" && result ? (
        <div className="result" ref={resultRef}>
          <TravelResult result={result} />
        </div>
      ) : null}
      {stage === "error" ? (
        <div className="ritual-error">
          <p className="ritual-status" role="alert">
            Гадание не задалось — карты рассыпались. Попробуйте ещё раз.
          </p>
          <button type="button" className="btn" onClick={retry}>
            Попробовать снова
          </button>
        </div>
      ) : null}
    </div>
  );
}
