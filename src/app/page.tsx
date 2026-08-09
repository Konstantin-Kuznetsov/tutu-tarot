import { RitualStage } from "@/components/RitualStage";

// RitualStage now owns its own top-level markup per stage — the entry
// screen (idle) is a self-contained `.table > main.enter` a la the mockup,
// while every later stage keeps its own `.app-shell` wrapper. Wrapping it
// in another <main> here would both nest <main> elements and fight the
// entry screen's own min-height:100vh centering.
export default function HomePage() {
  return <RitualStage />;
}
