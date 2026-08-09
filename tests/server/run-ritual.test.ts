import { describe, expect, it, vi } from "vitest";
import { runRitual } from "@/server/ritual/runRitual";
import type { TripIntent } from "@/domain/types";

const intent: TripIntent = {
  departureCity: "Москва",
  dateFrom: "2026-09-10",
  dateTo: "2026-09-17",
  travelerCount: 2,
};

function searchStub(summary: Record<string, unknown>, offers: unknown[] = []) {
  return vi.fn().mockResolvedValue({
    transport: offers,
    hotels: [{ id: "hotel-0", title: "Отель" }],
    modesSummary: summary,
    warnings: [],
  });
}

describe("runRitual", () => {
  it("draws three cards with one job each", async () => {
    const result = await runRitual(intent, {
      searchOffers: searchStub({ railway: { count: 5, minPrice: 700, minDurationMin: 104 } }, [
        { id: "t-0", title: "Поезд: ФПК", mode: "railway", url: "https://www.tutu.ru/poezda/" },
      ]),
    });

    expect(result.spreadCards.map((card) => card.position)).toEqual(["Зов", "Дар", "Путь"]);
    expect(new Set(result.spreadCards.map((card) => card.id)).size).toBe(3);
  });

  it("never names a road that does not exist", async () => {
    const result = await runRitual(intent, {
      searchOffers: searchStub({ railway: { count: 5, minPrice: 700, minDurationMin: 104 } }, [
        { id: "t-0", title: "Поезд: ФПК", mode: "railway", url: "https://www.tutu.ru/poezda/" },
      ]),
    });

    expect(result.roadChoice.mode).toBe("railway");
    expect(result.spreadCards[2].transport).toContain("railway");
    expect(result.roadChoice.best?.mode).toBe("railway");
    expect(result.roadChoice.reason).toContain(result.spreadCards[2].name);
  });

  it("falls back to fog when the search found no road at all", async () => {
    const result = await runRitual(intent, { searchOffers: searchStub({}) });

    expect(result.roadChoice.mode).toBeNull();
    expect(result.roadChoice.reason).toContain("туман");
    expect(result.spreadCards).toHaveLength(3);
  });

  it("is deterministic against the same search response", async () => {
    const summary = { avia: { count: 3, minPrice: 9000, minDurationMin: 300 } };
    const first = await runRitual(intent, { searchOffers: searchStub(summary) });
    const second = await runRitual(intent, { searchOffers: searchStub(summary) });

    expect(second.spreadCards.map((card) => `${card.id}:${card.reversed}`)).toEqual(
      first.spreadCards.map((card) => `${card.id}:${card.reversed}`),
    );
  });
});
