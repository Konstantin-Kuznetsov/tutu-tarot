"use client";

import { useEffect, useRef, useState } from "react";
import { drawDestinationCards } from "@/domain/tarot/engine";
import type { DrawnTarotCard, TripIntent } from "@/domain/types";
import { TripIntentForm } from "./TripIntentForm";
import { RitualFog } from "./RitualFog";
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
  const sceneRef = useRef<HTMLDivElement>(null);
  // Mirrors `stage`, but updated at each setStage call site below instead of
  // once per render (react-hooks/refs flags a bare `stageRef.current = stage`
  // in the render body -- a render can be started and discarded without
  // committing, so mutating a ref as a side effect of rendering is unsafe in
  // general). Every place `stage` actually changes is an explicit setStage
  // call inside an event handler, timer callback or promise continuation --
  // never during render -- so setting the ref right alongside each one keeps
  // it exactly as current as the old per-render assignment did, without ever
  // touching it while this component function is being evaluated.
  const stageRef = useRef<Stage>(stage);
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
  // startRitual's success/error paths. `clearTimers` is deliberately left
  // out of the dependency array: it's a plain function redeclared on every
  // render, but its body only ever reads/writes `timersRef.current` (a
  // ref) -- never `stage`, props, or any other reactive value -- so every
  // render's copy behaves identically. Depending on it (or wrapping it in
  // useCallback just to satisfy the array) would add ceremony without
  // changing what actually runs at unmount.
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
    // runs (including the `await` below), so a second call arriving later
    // in the same tick -- before React has even started processing this
    // call's setStage("dealing") -- is rejected by the check above too.
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
        setStage((current) => {
          if (current !== "dealing") return current;
          stageRef.current = "consulting";
          return "consulting";
        });
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
      stageRef.current = "revealed";
      setStage("revealed");
    } catch {
      clearTimers();
      stageRef.current = "error";
      setStage("error");
    }
  }

  function retry() {
    clearTimers();
    setResult(null);
    setLocalCards(null);
    setRevealCount(0);
    userTookControlRef.current = false;
    stageRef.current = "idle";
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

  // Same follow, same restraint, for the dealing scene: the collapsed
  // ticket strip above it (globals.css) already gives the mist/cards most
  // of the viewport on its own, but this is the difference between
  // "mostly on screen" and the scene actually opening flush with the top
  // edge the traveler is already looking at, on every screen size rather
  // than relying on the strip's height alone. Deliberately the same
  // mechanism as the "revealed" effect above, not a second one: fires once
  // per attempt on entering "dealing" (the scene mounts once and stays
  // through "consulting" without remounting, so this never re-fires for
  // the same attempt), abandons for good the instant the user has taken
  // control since submitting, and never runs under reduced motion.
  useEffect(() => {
    if (stage !== "dealing") return;
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const timer = window.setTimeout(() => {
      if (!userTookControlRef.current) {
        sceneRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
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
      {/* The full-screen swirl the whole ritual happens inside. A sibling
          of everything else and position:fixed in CSS, so it spans the
          viewport rather than this column, and mounted at every stage --
          `data-stage` on this same element is what decides when it is
          visible (see RitualFog's own comment on why it is not mounted
          conditionally). */}
      <RitualFog />
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
        <div ref={sceneRef}>
          <RitualScene stage={stage === "consulting" ? "consulting" : "dealing"} slots={slots} />
        </div>
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
