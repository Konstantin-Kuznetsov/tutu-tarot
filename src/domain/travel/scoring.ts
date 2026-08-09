import type { ArchetypeWeights } from "@/domain/tarot/engine";
import type { DestinationSelection, TripIntent } from "@/domain/types";
import { travelAtlas } from "./atlas";

export interface DestinationSelectionInput extends TripIntent {
  archetypeWeights: ArchetypeWeights;
}

function monthToSeason(month: number): string {
  if ([12, 1, 2].includes(month)) return "winter";
  if ([3, 4, 5].includes(month)) return "spring";
  if ([6, 7, 8].includes(month)) return "summer";
  return "autumn";
}

export function selectDestination(input: DestinationSelectionInput): DestinationSelection {
  const month = Number(input.dateFrom.slice(5, 7));
  const season = monthToSeason(month);
  const scored = travelAtlas.map((destination) => {
    const archetypeHits = destination.tarotArchetypes.filter(
      (tag) => (input.archetypeWeights[tag] ?? 0) > 0,
    );
    const archetypeScore = archetypeHits.reduce(
      (total, tag) => total + (input.archetypeWeights[tag] ?? 0),
      0,
    );
    const seasonScore = destination.season.includes(season) ? 2 : 0;
    const sourceScore = destination.source === "provereno.tutu" ? 1.5 : destination.source === "geo.tutu" ? 1 : 0;
    const score = archetypeScore * 3 + seasonScore + sourceScore;

    return {
      destination,
      score,
      reasons: [
        ...archetypeHits.map((tag) => `matched archetype ${tag}`),
        `season ${season}`,
        `source ${destination.source}`,
      ],
    };
  });

  scored.sort((a, b) => b.score - a.score || a.destination.name.localeCompare(b.destination.name, "ru"));
  return scored[0];
}
