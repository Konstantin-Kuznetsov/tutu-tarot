import { describe, expect, it } from "vitest";
import type { ArchetypeWeights } from "@/domain/tarot/engine";
import type { TarotArchetype } from "@/domain/types";
import { travelAtlas } from "@/domain/travel/atlas";
import { selectDestination } from "@/domain/travel/scoring";

const TAROT_ARCHETYPE_VOCABULARY: TarotArchetype[] = [
  "solitude",
  "road",
  "cliffs",
  "water",
  "north",
  "culture",
  "food",
  "sun",
  "renewal",
  "mystery",
  "star",
];

describe("selectDestination", () => {
  it("uses a broad static atlas curated from Tutu travel guides", () => {
    expect(travelAtlas.length).toBeGreaterThanOrEqual(16);
    expect(travelAtlas.filter((destination) => destination.source === "provereno.tutu").length).toBeGreaterThanOrEqual(8);

    for (const destination of travelAtlas) {
      expect(destination.name).toBeTruthy();
      expect(destination.region).toBeTruthy();
      expect(destination.sourceUrl).toMatch(/^https:\/\//);
      expect(destination.nearestTransportHub).toBeTruthy();
      expect(destination.hotelSearchCity).toBeTruthy();
      expect(destination.oracleHook).toBeTruthy();
      expect(destination.tarotArchetypes.length).toBeGreaterThan(0);
      expect(destination.season.length).toBeGreaterThan(0);
    }
  });

  it("has at least 30 destinations in the atlas", () => {
    expect(travelAtlas.length).toBeGreaterThanOrEqual(30);
  });

  // Regression guard for the guide-facts merge (data/tutu-guides.json):
  // every entry claiming the verified-route tier must actually link to that
  // tier's own domain, and no entry may still carry one of the two known-bad
  // links the merge was supposed to fix -- Wikipedia (usvinskie-stolby's old
  // sourceUrl) and the bare, non-specific geo index (usvinskie-stolby's old
  // geoUrl and karelia-ruskeala's old sourceUrl/geoUrl). Checked on both
  // sourceUrl and geoUrl since either could regress back to one of those.
  it("links every provereno.tutu entry to provereno.tutu.ru, and no entry to Wikipedia or the bare geo index", () => {
    for (const destination of travelAtlas) {
      if (destination.source === "provereno.tutu") {
        expect(destination.sourceUrl, destination.id).toMatch(/^https:\/\/provereno\.tutu\.ru\//);
      }

      expect(destination.sourceUrl, destination.id).not.toMatch(/wikipedia\.org/);
      expect(destination.sourceUrl, destination.id).not.toBe("https://www.tutu.ru/geo/");
      if (destination.geoUrl) {
        expect(destination.geoUrl, destination.id).not.toMatch(/wikipedia\.org/);
        expect(destination.geoUrl, destination.id).not.toBe("https://www.tutu.ru/geo/");
      }
    }
  });

  it("carries every tarot archetype in the vocabulary on at least two destinations", () => {
    for (const archetype of TAROT_ARCHETYPE_VOCABULARY) {
      const count = travelAtlas.filter((destination) => destination.tarotArchetypes.includes(archetype)).length;
      expect(count, `archetype "${archetype}" should appear on at least two destinations`).toBeGreaterThanOrEqual(2);
    }
  });

  it("lists winter for at least 18 destinations", () => {
    const winterCount = travelAtlas.filter((destination) => destination.season.includes("winter")).length;
    expect(winterCount).toBeGreaterThanOrEqual(18);
  });

  it("selects Usvinskie Stolby for cliffs and road archetypes", () => {
    const result = selectDestination({
      archetypeWeights: { cliffs: 1, road: 1, solitude: 1 },
      dateFrom: "2026-09-10",
      dateTo: "2026-09-17",
      departureCity: "Москва",
      travelerCount: 2,
      seed: "москва|2026-09-10|2026-09-17|2",
    });

    expect(result.destination.id).toBe("usvinskie-stolby");
    expect(result.reasons.join(" ")).toContain("cliffs");
  });

  it("returns a Russian destination with Tutu source metadata", () => {
    const result = selectDestination({
      archetypeWeights: { north: 1, water: 1, mystery: 1 },
      dateFrom: "2026-02-10",
      dateTo: "2026-02-14",
      departureCity: "Санкт-Петербург",
      travelerCount: 1,
      seed: "санкт-петербург|2026-02-10|2026-02-14|1",
    });

    expect(result.destination.region.length).toBeGreaterThan(0);
    expect(result.destination.sourceUrl).toMatch(/^https:\/\//);
  });

  it("is deterministic for the same archetypes, dates, and seed", () => {
    const input = {
      archetypeWeights: { north: 1, water: 1, mystery: 1 } satisfies ArchetypeWeights,
      dateFrom: "2026-02-10",
      dateTo: "2026-02-14",
      departureCity: "Санкт-Петербург",
      travelerCount: 1,
      seed: "санкт-петербург|2026-02-10|2026-02-14|1",
    };

    expect(selectDestination(input).destination.id).toBe(selectDestination(input).destination.id);
  });

  it("picks a different destination on a tie when the seed differs, but stays put for a repeat of the same seed", () => {
    // pskov-kremlin and mari-el-fairytale carry the identical archetype set
    // and identical season coverage (see the reachability test below), so
    // any archetype weighting that favours neither breaks the tie purely on
    // seed -- this is the alphabetical-tie-break bug from the bug report,
    // now fixed.
    const input = {
      archetypeWeights: { culture: 1, water: 1, mystery: 1 } satisfies ArchetypeWeights,
      dateFrom: "2026-05-01",
      dateTo: "2026-05-05",
      departureCity: "Москва",
      travelerCount: 1,
    };

    const cities = ["москва", "казань", "омск", "тверь", "уфа"];
    const winners = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const city = cities[i % cities.length];
      const seed = `${city}|2026-0${(i % 9) + 1}-1${i % 9}|2026-0${(i % 9) + 1}-2${i % 9}|${(i % 3) + 1}`;
      const result = selectDestination({ ...input, seed });
      winners.add(result.destination.id);
      // Replaying the exact same seed must reproduce the exact same pick.
      expect(selectDestination({ ...input, seed }).destination.id).toBe(result.destination.id);
    }

    expect(winners).toEqual(new Set(["pskov-kremlin", "mari-el-fairytale"]));
  });
});
