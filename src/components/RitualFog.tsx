// The full-screen swirl the ritual happens inside -- distinct from
// RitualMist, which is the close-in haze around the row of cards. One
// turning layer (both hues are composited inside the SVG itself -- see
// public/fog/swirl.svg for why a second layer was too expensive), no
// state, no props: everything about when it rolls in, how thick
// it gets and when it clears is driven in CSS off `.ritual-layout`'s own
// `data-stage` attribute (see `.ritual-fog` in globals.css), so this
// component neither knows nor needs to know which stage the ritual is at.
//
// Mounted unconditionally rather than only while the ritual runs. That is
// deliberate: the background SVG is fetched on first paint instead of
// at the moment the traveler presses the button, so the fog is already
// decoded and ready when it is asked to appear. Mounting it late made the
// first ritual of a session start with a beat of no fog at all -- and the
// first ritual is the only one most people will ever see.
//
// aria-hidden throughout: it carries nothing the cards and the status line
// don't already say, and it is behind `pointer-events: none`, so it can
// never take a click.
export function RitualFog() {
  return (
    <div className="ritual-fog" aria-hidden="true">
      <div className="ritual-fog__layer" />
    </div>
  );
}
