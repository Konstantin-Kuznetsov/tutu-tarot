import { describe, expect, it } from "vitest";
import { archetypeWeightsFrom, drawDestinationCards, drawPathCard } from "@/domain/tarot/engine";
import type { TripIntent } from "@/domain/types";

const intent: TripIntent = {
  departureCity: "Москва",
  dateFrom: "2026-09-10",
  dateTo: "2026-09-17",
  travelerCount: 2,
};

describe("drawDestinationCards", () => {
  it("draws two distinct cards in the destination positions", () => {
    const draw = drawDestinationCards(intent);
    expect(draw.cards).toHaveLength(2);
    expect(draw.cards.map((card) => card.position)).toEqual(["Зов", "Дар"]);
    expect(draw.cards[0].id).not.toBe(draw.cards[1].id);
  });

  it("is deterministic for the same intent", () => {
    const first = drawDestinationCards(intent);
    const second = drawDestinationCards(intent);
    expect(second.cards.map((card) => `${card.id}:${card.reversed}`)).toEqual(
      first.cards.map((card) => `${card.id}:${card.reversed}`),
    );
  });

  it("changes with the intent", () => {
    const other = drawDestinationCards({ ...intent, departureCity: "Казань" });
    const base = drawDestinationCards(intent);
    expect(other.cards.map((card) => card.id)).not.toEqual(base.cards.map((card) => card.id));
  });
});

describe("drawPathCard", () => {
  it("only draws a card that serves an available mode", () => {
    const card = drawPathCard("seed-1", ["railway"], []);
    expect(card.position).toBe("Путь");
    expect(card.transport).toContain("railway");
  });

  it("never repeats an already drawn card", () => {
    const excluded = drawPathCard("seed-2", ["avia"], []);
    const card = drawPathCard("seed-2", ["avia"], [excluded.id]);
    expect(card.id).not.toBe(excluded.id);
  });

  it("falls back to the remaining deck when no mode is available", () => {
    const card = drawPathCard("seed-3", [], []);
    expect(card.position).toBe("Путь");
    expect(card.id).toBeTruthy();
  });

  it("is deterministic for the same seed and modes", () => {
    const first = drawPathCard("seed-4", ["bus"], []);
    const second = drawPathCard("seed-4", ["bus"], []);
    expect(`${second.id}:${second.reversed}`).toBe(`${first.id}:${first.reversed}`);
  });
});

describe("archetypeWeightsFrom", () => {
  it("counts an upright card fully and a reversed card at half", () => {
    const upright = { archetypes: ["road"], reversed: false } as never;
    const reversed = { archetypes: ["road", "sun"], reversed: true } as never;
    expect(archetypeWeightsFrom([upright, reversed])).toEqual({ road: 1.5, sun: 0.5 });
  });
});
