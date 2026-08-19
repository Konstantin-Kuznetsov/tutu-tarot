"use client";

import { TripSearchForm } from "@/components/TripSearchForm";
import type { TripIntent } from "@/domain/types";

// The tarot entry screen: the logo, the h1, the promise, the ticket and the
// fine print. RitualStage mounts this alone at the idle stage (see its own
// comment) so there is exactly one <h1> in the document.
//
// The ticket itself now lives in TripSearchForm — see that file for why. This
// component is the screen *around* it, and is what `.table`'s light-palette
// override in globals.css is anchored on.
//
// NOTE: nothing renders this any more. RitualStage's idle stage is now
// LumoraHero, which hosts the same TripSearchForm on its own white panel, so
// this screen is superseded rather than merely unrouted — and the CSS that
// used to collapse it mid-ritual (the old `.intent-form .table/.enter` rules)
// has been retargeted at the hero and no longer applies here.
//
// Kept on disk, not deleted, only because it is the one remaining record of
// the original tarot entry screen. If that stops being worth its weight,
// this file and its now-dead CSS (`.enter`, `.fan`, `.caps`, `.rule`,
// `.fine`, `.hero-logo`, and `.table`'s layout rule) can all go together.
export function TripIntentForm({ onSubmit }: { onSubmit(intent: TripIntent): void }) {
  return (
    <div className="table">
      <main className="enter">
        {/* eslint-disable-next-line @next/next/no-img-element -- small,
            fixed-size brand mark; not worth next/image's overhead here. */}
        <img src="/hero/tutu-logo.svg" alt="Туту" className="hero-logo" />
        <h1>Куда зовёт дорога?</h1>
        <p className="sub">
          Узнайте маршрут своей судьбы — колода выбирает маршрут по России, а Туту проверяет дорогу
          и ночлег.
        </p>
        <TripSearchForm onSubmit={onSubmit} />
        <div className="rule" aria-hidden="true">
          <span className="diamond" />
        </div>
        <p className="fine">Предсказание — на удачу. Билеты, поезда и отели — настоящие.</p>
      </main>
    </div>
  );
}
