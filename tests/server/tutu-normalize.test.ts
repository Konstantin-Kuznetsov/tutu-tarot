import { describe, expect, it } from "vitest";
import { normalizeHotelOffers, normalizeTransportOffers } from "@/server/tutu/normalize";

describe("Tutu offer normalization", () => {
  it("normalizes transport offers with price and checkout URL", () => {
    const offers = normalizeTransportOffers({
      items: [
        {
          title: "Москва - Пермь",
          price: { amount: 4200, currency: "RUB" },
          checkout_url: "https://www.tutu.ru/checkout/example",
          departure: "10:00",
          arrival: "18:30",
        },
      ],
    });

    expect(offers[0]).toEqual({
      id: "transport-0",
      title: "Москва - Пермь",
      price: "4200 RUB",
      subtitle: "10:00 - 18:30",
      url: "https://www.tutu.ru/checkout/example",
    });
  });

  it("returns an empty list for unknown hotel payloads", () => {
    expect(normalizeHotelOffers({ unexpected: true })).toEqual([]);
  });
});
