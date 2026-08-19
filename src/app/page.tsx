import { RitualStage } from "@/components/RitualStage";

// RitualStage renders the whole flow on one surface (the Lumora hero with
// the search ticket on it, the dealing scene, the result) and owns the
// single <main> in the document, so there is nothing to wrap it in here.
export default function HomePage() {
  return <RitualStage />;
}
