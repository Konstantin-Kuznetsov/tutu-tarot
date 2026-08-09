import { describe, expect, it } from "vitest";
import { selectDestination } from "@/domain/travel/scoring";

describe("selectDestination", () => {
  it("selects Usvinskie Stolby for cliffs and road archetypes", () => {
    const result = selectDestination({
      archetypes: ["cliffs", "road", "solitude"],
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
      archetypes: ["north", "water", "mystery"],
      dateFrom: "2026-02-10",
      dateTo: "2026-02-14",
      departureCity: "Санкт-Петербург",
      travelerCount: 1,
    });

    expect(result.destination.region.length).toBeGreaterThan(0);
    expect(result.destination.sourceUrl).toMatch(/^https:\/\//);
  });
});
