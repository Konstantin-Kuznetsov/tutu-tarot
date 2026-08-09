import { describe, expect, it } from "vitest";
import { runRitual } from "@/server/ritual/runRitual";

describe("runRitual", () => {
  it("returns cards, destination, prediction, source links, and offer arrays", async () => {
    const result = await runRitual(
      {
        departureCity: "Москва",
        dateFrom: "2026-09-10",
        dateTo: "2026-09-17",
        travelerCount: 2,
      },
      {
        searchOffers: async () => ({
          transport: [{ id: "transport-0", title: "Москва - Пермь", price: "4200 RUB" }],
          hotels: [{ id: "hotel-0", title: "Отель в Перми" }],
          warnings: [],
        }),
        aiApiKey: undefined,
      },
    );

    expect(result.cards).toHaveLength(3);
    expect(result.spreadCards).toHaveLength(3);
    expect(result.spreadCards[0]).toMatchObject({
      name: expect.any(String),
      position: expect.any(String),
      meaning: expect.any(String),
    });
    expect(result.destination.name.length).toBeGreaterThan(0);
    expect(result.destination.oracleHook.length).toBeGreaterThan(0);
    expect(result.prediction.headline.length).toBeGreaterThan(0);
    expect(result.transportOffers).toHaveLength(1);
    expect(result.hotelOffers).toHaveLength(1);
    expect(result.sourceLinks[0].url).toMatch(/^https:\/\//);
  });
});
