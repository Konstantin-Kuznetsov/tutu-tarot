"use client";

import { useEffect, useState } from "react";
import { RitualScene3D, type RitualVisualStage } from "./RitualScene3D";
import { RitualSceneFallback } from "./RitualSceneFallback";

export function RitualScene({ stage }: { stage: RitualVisualStage }) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  if (prefersReducedMotion === null) return null;

  return prefersReducedMotion ? <RitualSceneFallback stage={stage} /> : <RitualScene3D stage={stage} />;
}
