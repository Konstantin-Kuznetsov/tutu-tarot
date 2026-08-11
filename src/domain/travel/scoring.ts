import { hash, type ArchetypeWeights } from "@/domain/tarot/engine";
import type { DestinationSelection, TripIntent } from "@/domain/types";
import { travelAtlas } from "./atlas";

export interface DestinationSelectionInput extends TripIntent {
  archetypeWeights: ArchetypeWeights;
  // The ritual seed (see ritualSeed/drawDestinationCards in
  // domain/tarot/engine.ts). Used only to break ties between equally-scored
  // destinations -- never to influence the score itself -- so that a tie
  // rotates across different readings while any single reading, replayed
  // with the same seed, keeps picking the same destination.
  seed: string;
}

// Weight given to the archetype-match term relative to season/source. Kept
// well above 1 so a destination that matches the drawn cards well always
// outranks one that merely happens to be in season or carries a "verified"
// source badge -- those are tie-breaking nudges, not the point of the draw.
const ARCHETYPE_WEIGHT = 2.5;
// A destination currently in season gets a small nudge, not a veto over
// worse-matching but in-season places.
const SEASON_BONUS = 1;
// provereno.tutu and geo.tutu both mean "this route is real and documented",
// just via different Tutu pipelines -- neither should out-rank the other by
// editorial pedigree alone. Two atlas entries (Тюмень vs Казань и Татарстан)
// share an identical archetype set and identical season coverage; giving
// provereno.tutu a bigger bonus than geo.tutu would make the geo.tutu one
// mathematically unreachable forever, independent of any card draw. A single
// small "this is a real route, not the emergency fallback" bonus avoids that
// trap while still discounting the one fallback destination in the atlas.
const SOURCE_BONUS = 0.3;

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
    // Normalise by the destination's own archetype count so a focused place
    // that matches well (e.g. 2 of its 3 archetypes hit) can beat a broad
    // place that matches loosely (e.g. 2 of its 5 hit) -- without this, a
    // destination carrying more archetypes has strictly more chances to
    // overlap and wins on breadth alone, regardless of fit. sqrt is the
    // standard normalisation here: it discounts breadth without fully
    // cancelling it (unlike dividing by the raw count), so a destination
    // that matches on every one of many archetypes still edges out one that
    // matches on every one of few.
    const normalizedArchetypeScore = archetypeScore / Math.sqrt(destination.tarotArchetypes.length);
    const seasonScore = destination.season.includes(season) ? SEASON_BONUS : 0;
    const sourceScore = destination.source === "fallback" ? 0 : SOURCE_BONUS;
    const score = normalizedArchetypeScore * ARCHETYPE_WEIGHT + seasonScore + sourceScore;
    // Pure function of (seed, destination id): stable within one reading
    // (same seed always compares the same way) but different destinations
    // get different, effectively unrelated values from the same seed, and
    // the same destination gets a different value under a different seed.
    // That's what lets ties rotate across readings while staying
    // reproducible within a reading -- unlike alphabetical order, which
    // picks the same winner for a given tie forever.
    const tieBreak = hash(`${input.seed}|${destination.id}`);

    return {
      destination,
      score,
      tieBreak,
      reasons: [
        ...archetypeHits.map((tag) => `matched archetype ${tag}`),
        `season ${season}`,
        `source ${destination.source}`,
      ],
    };
  });

  scored.sort((a, b) => b.score - a.score || b.tieBreak - a.tieBreak);
  return scored[0];
}
