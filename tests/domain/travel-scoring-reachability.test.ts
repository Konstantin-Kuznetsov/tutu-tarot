import { describe, expect, it } from "vitest";
import { tarotCards } from "@/domain/tarot/cards";
import { travelAtlas } from "@/domain/travel/atlas";
import { selectDestination } from "@/domain/travel/scoring";
import type { TarotArchetype } from "@/domain/types";

// This is the permanent regression guard for the "the oracle only knows five
// places" bug: selectDestination scored breadth (more archetypes = more
// chances to overlap) over fit, and broke ties alphabetically, so the same
// handful of destinations won almost every draw and nine of the atlas's 31
// destinations -- five of them from the atlas expansion -- could never be
// chosen at all, for any card draw, in any season.
//
// This test simulates every ordered pair of distinct tarot cards (both
// upright) as a stand-in for "every possible two-card draw" -- 22 cards *
// 21 = 462 pairs -- across all four seasons, matching the methodology used
// to originally measure the bug (1848 draws). It also spreads each draw
// across a handful of distinct ritual seeds: card-pair and season variety
// alone produce plenty of outright wins, but a few atlas destinations only
// ever *tie* for the top score with a sibling (see the pskov/mari-el and
// tatarstan/tyumen pairs -- same tarotArchetypes, same season coverage), so
// seed variety is what actually lets a tied destination surface instead of
// the same one winning that tie forever (the alphabetical tie-break bug).
//
// At the expanded 91-destination size the draw still needs to spread across
// the whole curated atlas. Several routes are intentionally near-siblings from
// the same source catalog, so exact score ordering would let broader neighbors
// shadow them forever; the seed should rotate among close-enough candidates
// instead. The invariant that matters is breadth: every destination should be
// reachable in a broad deterministic sample, and no one place should dominate
// the draw the way Краснодарский край did before the scoring fix.
//
// The simulated traveller departs from Тосно on purpose: this test is about
// scoring reachability, not about home-city exclusion. Москва used to be a
// neutral origin, but the expanded atlas now deliberately includes Москва
// routes, and those must remain testable here rather than filtered out before
// scoring.
//
// See tests/domain/travel-scoring.test.ts for the pskov-kremlin /
// mari-el-fairytale tie-rotation test.

const SEASON_SAMPLE_DATES: Record<string, string> = {
  winter: "2026-01-15",
  spring: "2026-04-15",
  summer: "2026-07-15",
  autumn: "2026-10-15",
};

// A small spread of distinct ritual seeds standing in for "many different
// real readings". Fixed and hard-coded (not random) so the test itself
// stays deterministic.
const SAMPLE_SEEDS = Array.from({ length: 16 }, (_, index) => {
  const cities = ["москва", "санкт-петербург", "новосибирск", "казань"];
  const city = cities[index % cities.length];
  const month = String((index % 12) + 1).padStart(2, "0");
  const day = (index % 9) + 1;
  return `${city}|2026-${month}-1${day}|2026-${month}-2${day}|${(index % 4) + 1}`;
});

// No single destination should dominate the readings. Uniform distribution
// across 91 destinations would be ~1.1%, but card/season fit is still supposed
// to matter; 4% leaves room for meaningful fit while catching a destination
// that crowds out the rest of the atlas.
const MAX_SHARE = 0.04;

function archetypeWeightsFromPair(a: string, b: string): Partial<Record<TarotArchetype, number>> {
  const weights: Partial<Record<TarotArchetype, number>> = {};
  for (const id of [a, b]) {
    const card = tarotCards.find((candidate) => candidate.id === id);
    if (!card) throw new Error(`unknown tarot card id: ${id}`);
    for (const archetype of card.archetypes) {
      weights[archetype] = (weights[archetype] ?? 0) + 1;
    }
  }
  return weights;
}

describe("selectDestination reachability", () => {
  it("reaches every atlas destination, and keeps every destination under a broad share cap", () => {
    const counts = new Map<string, number>();
    for (const destination of travelAtlas) counts.set(destination.id, 0);
    let total = 0;

    for (const dateFrom of Object.values(SEASON_SAMPLE_DATES)) {
      for (const cardA of tarotCards) {
        for (const cardB of tarotCards) {
          if (cardA.id === cardB.id) continue;
          const archetypeWeights = archetypeWeightsFromPair(cardA.id, cardB.id);

          for (const seed of SAMPLE_SEEDS) {
            const result = selectDestination({
              archetypeWeights,
              dateFrom,
              dateTo: dateFrom,
              departureCity: "Тосно",
              travelerCount: 2,
              seed,
            });
            counts.set(result.destination.id, (counts.get(result.destination.id) ?? 0) + 1);
            total += 1;
          }
        }
      }
    }

    expect(total).toBe(tarotCards.length * (tarotCards.length - 1) * 4 * SAMPLE_SEEDS.length);
    expect(counts.size).toBe(travelAtlas.length);

    const unreachable = [...counts.entries()]
      .filter(([, count]) => count === 0)
      .map(([id]) => id);
    expect(unreachable).toEqual([]);

    const [dominantId, dominantCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const maxShare = dominantCount / total;
    expect(maxShare, `${dominantId} took ${(maxShare * 100).toFixed(1)}% of all draws`).toBeLessThanOrEqual(
      MAX_SHARE,
    );
  });
});
