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
// `layer` picks which side of the cards this copy paints on. Both are the
// same markup and the same two turning rings; only the stacking and the
// weight differ (see `.ritual-mist--veil` in globals.css):
//  - "behind" (the default): the glow the cards sit in front of. This is
//    the original, and on its own it is almost entirely hidden -- measured
//    directly, the ring pair is 420/320px centred in a stage box that is
//    exactly the row of cards (620x455 at a 1280 viewport), so the only
//    mist a viewer ever actually saw was the slivers between the three
//    cards, which reads as a warm edge glow rather than as haze.
//  - "veil": the same haze in *front* of the cards, thin enough to see
//    through. This is what makes the brief's staging legible -- cards
//    materialising *in the centre of the mist* means the mist is between
//    the viewer and the card as it arrives, and then thins away.
// Mounting both is what makes a card look like it is inside the cloud
// rather than lit from behind it.
export function RitualMist({
  variant,
  layer = "behind",
}: {
  variant: "gather" | "disperse";
  layer?: "behind" | "veil";
}) {
  return (
    <div
      className={`ritual-mist ritual-mist--${variant}${layer === "veil" ? " ritual-mist--veil" : ""}`}
      aria-hidden="true"
    >
      <div className="ritual-mist__ring ritual-mist__ring--a" />
      <div className="ritual-mist__ring ritual-mist__ring--b" />
    </div>
  );
}
