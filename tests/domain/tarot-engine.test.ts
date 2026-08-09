import { describe, expect, it } from "vitest";
import { drawTarotSpread } from "@/domain/tarot/engine";

describe("drawTarotSpread", () => {
  it("returns the same cards for the same normalized inputs", () => {
    const input = {
      departureCity: "Москва",
      dateFrom: "2026-09-10",
      dateTo: "2026-09-17",
      travelerCount: 2,
    };

    expect(drawTarotSpread(input)).toEqual(drawTarotSpread(input));
  });

  it("returns three named card positions", () => {
    const spread = drawTarotSpread({
      departureCity: "Пермь",
      dateFrom: "2026-10-01",
      dateTo: "2026-10-05",
      travelerCount: 1,
    });

    expect(spread.cards.map((card) => card.position)).toEqual([
      "Зов",
      "Путь",
      "Дар маршрута",
    ]);
    expect(new Set(spread.cards.map((card) => card.id)).size).toBe(3);
  });
});
