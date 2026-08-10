import { describe, expect, it } from "vitest";
import type { ArchetypeWeights } from "@/domain/tarot/engine";
import { travelAtlas } from "@/domain/travel/atlas";
import { selectDestination } from "@/domain/travel/scoring";

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

  it("selects Usvinskie Stolby for cliffs and road archetypes", () => {
    const result = selectDestination({
      archetypeWeights: { cliffs: 1, road: 1, solitude: 1 },
      dateFrom: "2026-09-10",
      dateTo: "2026-09-17",
      departureCity: "Москва",
      travelerCount: 2,
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
    });

    expect(result.destination.region.length).toBeGreaterThan(0);
    expect(result.destination.sourceUrl).toMatch(/^https:\/\//);
  });

  it("is deterministic for the same archetypes and dates", () => {
    const input = {
      archetypeWeights: { north: 1, water: 1, mystery: 1 } satisfies ArchetypeWeights,
      dateFrom: "2026-02-10",
      dateTo: "2026-02-14",
      departureCity: "Санкт-Петербург",
      travelerCount: 1,
    };

    expect(selectDestination(input).destination.id).toBe(selectDestination(input).destination.id);
  });
});
