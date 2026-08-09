import { RitualStage } from "@/components/RitualStage";

// RitualStage renders the whole flow on one surface (ticket, dealing scene,
// result) and owns the single <main> in the document — TripIntentForm's own
// `.table > main.enter`, stays mounted the entire time. Wrapping it in
// another <main> here would nest <main> elements for no reason.
export default function HomePage() {
  return <RitualStage />;
}
