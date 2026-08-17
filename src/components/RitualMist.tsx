// Decorative haze layer for the card-reveal ritual — see globals.css's
// `.ritual-mist` rules for the actual visuals and timing. Purely
// presentational (aria-hidden: none of this carries information the cards
// or the status line don't already state accessibly), so it is a single
// tiny component rather than something with its own tests.
//
// Two variants share the same swirling-ring markup, matching the brief's
// four-beat staging ("mist gathers and begins to turn" / cards materialise
// / "mist disperses as it spins" / cards settle):
//  - "gather": mounted in RitualScene for the whole dealing/consulting
//    wait. Fades in once and then holds at a steady opacity, while the
//    rings keep turning underneath it for as long as the scene is mounted.
//  - "disperse": mounted the instant TravelResult's spread-panel takes
//    over (the "revealed" stage). It starts at the *same* steady opacity
//    from its very first frame — no second gather-in — so it reads as the
//    one mist continuing rather than a new one starting from nothing, then
//    fades out on a timer keyed to when the third card lands, while the
//    rings keep turning the whole time (see globals.css's own comment on
//    the exact delay/duration numbers and why they're hand-kept in sync
//    with the card-reveal timing rather than derived from it).
//
// Not a canvas/WebGL/particle effect and not an animation library — two
// plain divs, each blurred once via a static `filter` and animated only on
// `transform`/`opacity` (see the brief's performance constraints, and the
// comment on `.ritual-mist__ring` in globals.css for why that combination
// stays cheap).
export function RitualMist({ variant }: { variant: "gather" | "disperse" }) {
  return (
    <div className={`ritual-mist ritual-mist--${variant}`} aria-hidden="true">
      <div className="ritual-mist__ring ritual-mist__ring--a" />
      <div className="ritual-mist__ring ritual-mist__ring--b" />
    </div>
  );
}
