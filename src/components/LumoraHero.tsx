"use client";

import { useEffect, useRef, useState } from "react";
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
    src: "/hero/videos/golden-hour.mp4",
    poster: "/hero/posters/golden-hour.jpg",
  },
  {
    label: "Still Water",
    src: "/hero/videos/still-water.mp4",
    poster: "/hero/posters/still-water.jpg",
  },
  {
    label: "Deep Woods",
    src: "/hero/videos/deep-woods.mp4",
    poster: "/hero/posters/deep-woods.jpg",
  },
  {
    label: "Quiet Dawn",
    src: "/hero/videos/quiet-dawn.mp4",
    poster: "/hero/posters/quiet-dawn.jpg",
  },
] as const;

const OVERLAY_SRC = "/hero/train-window-overlay.png";

// How long each clip holds before the next one fades in. Comfortably longer
// than the 1000ms crossfade in globals.css, so a fade is always finished well
// before the next one starts — no need for the cooldown guard the manual
// switcher required. This is the one number to change to re-pace the reel.
const ROTATE_MS = 7000;

// Must match the opacity transition on `.lumora__video` in globals.css. Used
// to decide when the outgoing clip may be paused: pausing it the instant it
// stops being active would freeze it on one frame while it is still half
// visible, which reads worse than the drift it is meant to fix.
const CROSSFADE_MS = 1000;

// "Deep Woods" — the one clip bright enough that white copy stops being
// legible over it, so the hero content (but never the logo or the bottom
// line) swaps to the spec's dark ink.
const DARK_VIDEO_INDEX = 2;

export function LumoraHero({ onSubmit }: { onSubmit(intent: TripIntent): void }) {
  const [activeVideo, setActiveVideo] = useState(0);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  // Only the clip on screen plays, and it always plays from its first frame.
  //
  // Every clip used to carry `autoPlay`, so all four ran the whole time
  // behind the ones on top of them -- measured, all four reporting the same
  // currentTime with three of them at opacity 0. That is invisible for the
  // first 28 seconds and then becomes the whole problem: a clip is 10.04s and
  // its turn comes round every 4 x 7s, so it reappeared at 28 % 10.04 = 7.9s,
  // played its last two seconds, wrapped through `loop`, and started again in
  // full view. It read exactly as viewers described it -- the same short
  // fragment playing twice.
  //
  // Resetting to 0 also means the loop point is never reached during a turn
  // (7s of a 10.04s clip), so every appearance is the same deliberate opening
  // rather than whatever frame the clock happened to land on.
  useEffect(() => {
    const active = videoRefs.current[activeVideo];
    if (active) {
      active.currentTime = 0;
      // Muted playback is allowed to start programmatically, but a rejected
      // promise here (a browser that blocks it anyway, an element torn down
      // mid-flight) must not surface as an unhandled rejection over a
      // decorative background.
      //
      // The return value is checked rather than chained blind: `play()` only
      // returns a promise in browsers that implement the modern signature, and
      // returns undefined elsewhere -- jsdom among them, which is how a bare
      // `.catch()` here turned every test that renders this hero into a
      // TypeError.
      const started = active.play();
      if (started) void started.catch(() => {});
    }

    // The outgoing clip keeps playing until the crossfade is over, then stops.
    // Both halves of the fade are on screen for that second, and a frozen
    // frame fading out is more noticeable than a moving one.
    const timer = window.setTimeout(() => {
      for (const [index, video] of videoRefs.current.entries()) {
        if (video && index !== activeVideo) video.pause();
      }
    }, CROSSFADE_MS);

    return () => window.clearTimeout(timer);
  }, [activeVideo]);

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
  const nextVideo = (activeVideo + 1) % VIDEOS.length;

  return (
    <section className="lumora">
      <div className="lumora__videos" aria-hidden="true">
        {VIDEOS.map((video, index) => (
          <video
            key={video.src}
            ref={(element) => {
              videoRefs.current[index] = element;
            }}
            className="lumora__video"
            data-active={index === activeVideo}
            src={video.src}
            poster={video.poster}
            muted
            // Kept even though a clip never reaches its own end during a 7s
            // turn: under reduced motion the reel does not advance at all, and
            // the first clip has to keep going on its own.
            loop
            playsInline
            // No `autoPlay`. Playback is driven entirely by the effect above,
            // so there is one place that decides what is running -- with the
            // attribute here as well, all four would start themselves again
            // and the effect would be racing them.
            //
            // Only the clip on screen and the one after it are worth
            // buffering eagerly. With `preload="auto"` on all four the browser
            // pulled all of them at once -- measured at 24 requests for ~80MB
            // competing for the connection while the first frame was still
            // what the visitor was waiting for. The next clip still gets a
            // full 7 seconds of head start before its turn.
            preload={index === activeVideo || index === nextVideo ? "auto" : "metadata"}
          />
        ))}
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element -- a decorative
          full-bleed overlay served from public/; next/image would add a
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
