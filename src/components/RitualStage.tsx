"use client";

import { useEffect, useRef, useState } from "react";
import { drawDestinationCards } from "@/domain/tarot/engine";
import type { DrawnTarotCard, TripIntent } from "@/domain/types";
import { LumoraHero } from "./LumoraHero";
import { RitualFog } from "./RitualFog";
import { RitualScene, type RitualSceneSlot } from "./RitualScene";
import { TravelResult, type RitualResultViewModel } from "./TravelResult";
import { encodeReading } from "@/domain/share/code";
import { remember } from "./myReadings";

// "reading" is the intermediate screen's own final beat: the search has
// answered, so all three cards — including "Путь", whose identity was
// unknowable until then — are face-up together, and the traveller gets to
// see the spread as a spread before the result page replaces it.
type Stage = "idle" | "dealing" | "consulting" | "reading" | "revealed" | "error";

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

// How long the full spread holds on the intermediate screen once the search
// has answered, before the result takes over. It has to outlast the third
// card's own flip (--t-deal, 900ms in globals.css) by enough to actually
// look at it — a hold that ends while the card is still turning would make
// the whole beat pointless. This is the one number to change to re-pace it.
const READING_HOLD_MS = 2_200;

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
      // Land on the intermediate screen's "reading" beat first, not straight
      // on the result. The data is already in hand — this is deliberately a
      // held moment, not a load: it is the only point in the flow where all
      // three cards are face-up together on the table before the reading
      // itself takes the screen. Pushed after clearTimers() above, or it
      // would be cleared the instant it was set.
      stageRef.current = "reading";
      setStage("reading");
      timersRef.current.push(
        window.setTimeout(() => {
          stageRef.current = "revealed";
          setStage("revealed");
        }, READING_HOLD_MS),
      );
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

  // Remembered the moment the reading is complete, not when it is shared:
  // otherwise «Мои расклады» would be a list of what you sent to someone,
  // not of what the cards actually gave you.
  //
  // This lives here rather than in TravelResult because TravelResult renders
  // on both surfaces -- a fresh ritual and someone else's shared link -- and
  // opening a link a friend sent you should not file their reading under
  // yours. RitualStage only ever runs for a reading this browser drew.
  useEffect(() => {
    if (stage !== "revealed" || !result) return;

    // Every one of these is optional on RitualResultViewModel -- see that
    // type's own comments on why (hand-built fixtures predate them) -- so
    // this checks rather than asserts. A reading missing any of them cannot
    // produce a share code either, and one that cannot be linked to is not
    // worth remembering: the tile would have nowhere to go.
    const { spreadCards, destination, intent } = result;
    if (!spreadCards || spreadCards.length !== 3 || !destination.id || !intent) return;

    remember({
      code: encodeReading({
        cards: spreadCards.map((card) => ({ id: card.id, reversed: card.reversed })),
        destinationId: destination.id,
        mode: result.roadChoice.mode,
        departureCity: intent.departureCity,
        dateFrom: intent.dateFrom,
        dateTo: intent.dateTo,
        travelerCount: intent.travelerCount,
      }),
      destinationName: destination.name,
      departureCity: intent.departureCity,
      dateFrom: intent.dateFrom,
      dateTo: intent.dateTo,
      travelerCount: intent.travelerCount,
    });
  }, [stage, result]);

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

  const showScene = stage === "dealing" || stage === "consulting" || stage === "reading";

  // Up to "reading" only the two seed-drawn cards can be shown at all, and
  // each waits for its own deal timer; at "reading" the server's own three
  // cards are known, so the scene switches to those and turns them all
  // face-up. Same three positions either way — this is the same table, not a
  // different one.
  //
  // Guarded on exactly three, not merely on `result` being present:
  // spreadCards is optional on the view model, and the same length check is
  // what TravelResult's own share button makes. A response that arrives
  // without them (or a hand-built fixture) falls back to the dealing slots
  // and simply holds with "Путь" still face-down, rather than rendering a
  // short table or crashing on a missing array.
  const readingCards = stage === "reading" ? result?.spreadCards : undefined;

  const slots: RitualSceneSlot[] =
    readingCards && readingCards.length === 3
      ? readingCards.map((card) => ({ position: card.position, card, revealed: true }))
      : [
          { position: "Зов", card: localCards?.[0] ?? null, revealed: revealCount >= 1 },
          { position: "Дар", card: localCards?.[1] ?? null, revealed: revealCount >= 2 },
          { position: "Путь", card: null, revealed: false },
        ];

  const visualStage =
    stage === "consulting" ? "consulting" : stage === "reading" ? "reading" : "dealing";

  // One surface, one stage machine: the entry screen stays mounted for the
  // whole flow (wrapped in .hero-slot, which globals.css collapses to a
  // band once data-stage leaves "idle") instead of unmounting once the
  // ritual starts. The scene and the result are siblings that appear below
  // it in document order as the stage advances — there is no separate
  // screen to navigate to and nothing here ever renders a link or a nav
  // landmark for "the result".
  //
  // That entry screen is now LumoraHero, not TripIntentForm. It hosts the
  // very same TripSearchForm and hands back the very same TripIntent, so
  // startRitual below is unchanged; only the surface around the ticket is
  // different. TripIntentForm still exists but nothing renders it — see its
  // own note.
  return (
    <div className="ritual-layout" data-stage={stage}>
      {/* The full-screen swirl the whole ritual happens inside. A sibling
          of everything else and position:fixed in CSS, so it spans the
          viewport rather than this column, and mounted at every stage --
          `data-stage` on this same element is what decides when it is
          visible (see RitualFog's own comment on why it is not mounted
          conditionally). */}
      <RitualFog />
      {/* `inert` makes the whole subtree genuinely unreachable (unfocusable,
          not hit-tested, skipped by assistive tech) while a ritual runs, so
          a Tab to the submit button — or refocusing the city input and
          pressing Enter — cannot fire a second onSubmit mid-deal. The CSS
          recede does hide the ticket outright now, which covers the same
          ground, but this stays as the belt to that pair of braces and, more
          importantly, as the thing that does not depend on a stylesheet
          having loaded. Kept in sync with the CSS recede selector's own
          condition (`:not([data-stage="idle"])`) so the two always agree.
          Note that neither is the real re-entrancy defence: jsdom does not
          enforce `inert` at all, so startRitual's own guard is what actually
          rejects a second call (see its comment, and the test named for it). */}
      <div className="hero-slot" inert={stage !== "idle"}>
        <LumoraHero onSubmit={startRitual} />
      </div>
      {showScene ? (
        <div className="ritual-screen" ref={sceneRef}>
          <RitualScene stage={visualStage} slots={slots} />
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
