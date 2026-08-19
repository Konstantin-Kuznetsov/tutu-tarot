"use client";

import { useEffect, useState } from "react";
import { TripSearchForm } from "@/components/TripSearchForm";
import type { TripIntent } from "@/domain/types";

// Full-screen cinematic hero, built from the supplied spec and then cut back
// to just the logo / heading / subtext / bottom line: the nav (desktop pill,
// hamburger and mobile overlay), the badge above the heading, the email
// capture form and the manual video switcher were all removed on request.
// The video rotation those switcher buttons used to drive is now automatic
// (see ROTATE_MS below).
//
// Two deliberate deviations from the spec's stack, both invisible in the
// rendered result:
//
// 1. No Tailwind. This project has no Tailwind and styles everything through
//    globals.css with custom properties; the spec's own centrepiece
//    (`.liquid-glass`) was already given as plain CSS. Every utility class in
//    the spec is translated 1:1 into the `.lumora*` block in globals.css,
//    including the exact breakpoints Tailwind would have used (sm 640px,
//    md 768px, lg 1024px) and the exact type scale.
// 2. No lucide-react. The only two icons the spec called for (Menu and X)
//    belonged to the navigation, which is gone, so nothing needs them now.
//
// The font is loaded through next/font/google in app/layout.tsx (exposed as
// --font-lumora), NOT through the spec's <link> tags: this app is Next.js and
// already self-hosts Prata/Manrope that way, so a runtime request to
// fonts.googleapis.com would be the odd one out. See layout.tsx's comment.

// `label` is no longer rendered anywhere — the switcher row that displayed it
// is gone. It is kept because it is the only thing that makes the URLs below
// legible at a glance, and it is what DARK_VIDEO_INDEX refers to.
const VIDEOS = [
  {
    label: "Golden Hour",
    src: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260702_081127_0992a171-d3c6-4978-8213-0ec5df8b6d63.mp4",
  },
  {
    label: "Still Water",
    src: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260702_092026_dd05b805-ea0f-40b2-8c52-332b88502592.mp4",
  },
  {
    label: "Deep Woods",
    src: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260702_081042_df7202bf-bd80-4b2b-bbc6-1f09ba2870e9.mp4",
  },
  {
    label: "Quiet Dawn",
    src: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260702_080959_4cac5234-3573-464e-a5b7-76b94b8a7d61.mp4",
  },
] as const;

const OVERLAY_SRC =
  "https://soft-zoom-63098134.figma.site/_assets/v11/0b4a435b2df2747593c43d7a1c9b4578f7d8d90c.png";

// How long each clip holds before the next one fades in. Comfortably longer
// than the 1000ms crossfade in globals.css, so a fade is always finished well
// before the next one starts — no need for the cooldown guard the manual
// switcher required. This is the one number to change to re-pace the reel.
const ROTATE_MS = 7000;

// "Deep Woods" — the one clip bright enough that white copy stops being
// legible over it, so the hero content (but never the logo or the bottom
// line) swaps to the spec's dark ink.
const DARK_VIDEO_INDEX = 2;

export function LumoraHero({ onSubmit }: { onSubmit(intent: TripIntent): void }) {
  const [activeVideo, setActiveVideo] = useState(0);

  // Functional update, so the interval never closes over a stale index and
  // this can stay a mount-once effect rather than tearing down and
  // re-arming the timer on every advance (which would also reset the dwell
  // time of whichever clip had just appeared).
  //
  // Skipped entirely under reduced motion: the blanket rule at the top of
  // globals.css already collapses the crossfade to ~0ms there, which would
  // turn a gentle reel into a hard cut every 7 seconds — worse than the
  // motion it was trying to spare. Staying on the first clip is the honest
  // reduced-motion answer. matchMedia is feature-checked because jsdom (the
  // unit-test environment) does not implement it.
  useEffect(() => {
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const timer = window.setInterval(() => {
      setActiveVideo((current) => (current + 1) % VIDEOS.length);
    }, ROTATE_MS);

    return () => window.clearInterval(timer);
  }, []);

  const dark = activeVideo === DARK_VIDEO_INDEX;

  return (
    <section className="lumora">
      <div className="lumora__videos" aria-hidden="true">
        {VIDEOS.map((video, index) => (
          <video
            key={video.src}
            className="lumora__video"
            data-active={index === activeVideo}
            src={video.src}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
          />
        ))}
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element -- a decorative
          full-bleed overlay from an external host; next/image would add a
          loader round-trip and buy nothing for a purely presentational layer. */}
      <img src={OVERLAY_SRC} alt="" aria-hidden="true" className="lumora__overlay" />

      <div className="lumora__content" data-dark={dark}>
        {/* <header>, not <nav>: once the link pill was removed this row
            holds a wordmark and nothing else, and a <nav> landmark with no
            navigation in it is a lie told to screen readers. */}
        <header className="lumora__nav">
          {/* The company's own wordmark, not the product's: «Таро-турагент»
              is what the heading below says. A raw <img> rather than
              next/image because the file is a 4KB vector that is already
              exactly the shape it renders at -- an optimiser pass would be
              a transform hop for nothing. Width and height carry the SVG's
              own viewBox (208x54) so the row reserves its space before the
              file arrives; CSS pins the height and lets the width follow.
              eslint-disable-next-line @next/next/no-img-element */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="lumora__logo" src="/tutu-logo.svg" alt="Туту" width={208} height={54} />
        </header>

        {/* The document's only <main>. It used to be the tarot entry
            screen's `.enter`; that screen is no longer rendered, so the
            landmark has to live here instead. Wraps the heading block and
            the ticket — the wordmark above and the strapline below are
            deliberately outside it. */}
        <main className="lumora__main">
        <div className="lumora__hero">
          <h1 className="lumora__heading">Куда зовёт дорога?</h1>

          {/* The <br> is the line break from the reference. globals.css
              hides it below the sm breakpoint, where a forced break lands
              in the wrong place and the sentence should just reflow. */}
          <p className="lumora__sub">
            Узнайте маршрут своей судьбы — колода выбирает маршрут по России,
            <br />а Туту проверяет дорогу и ночлег.
          </p>
        </div>

        {/* Sibling of .lumora__hero rather than a child of it, deliberately:
            the hero subtree is what swaps to dark ink over "Deep Woods", and
            this panel has its own fixed light palette that must not follow. */}
        <div className="lumora__search">
          <TripSearchForm onSubmit={onSubmit} />
        </div>
        </main>

        <div className="lumora__spacer" />

        <p className="lumora__tagline">Путешествуйте выгодно с Туту</p>
      </div>
    </section>
  );
}
