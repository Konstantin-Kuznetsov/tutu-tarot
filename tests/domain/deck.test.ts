import { describe, expect, it } from "vitest";
import { tarotCards } from "@/domain/tarot/cards";
import { TRANSPORT_MODES } from "@/domain/types";
import type { TarotArchetype } from "@/domain/types";

const VOCABULARY: TarotArchetype[] = [
  "solitude", "road", "cliffs", "water", "north", "culture",
  "food", "sun", "renewal", "mystery", "star",
];

describe("tarot deck", () => {
  it("holds all 22 Major Arcana with unique ids and numbers", () => {
    expect(tarotCards).toHaveLength(22);
    expect(new Set(tarotCards.map((card) => card.id)).size).toBe(22);
    expect(tarotCards.map((card) => card.number).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 22 }, (_, index) => index),
    );
  });

  it("keeps every archetype inside the existing vocabulary", () => {
    for (const card of tarotCards) {
      expect(card.archetypes.length).toBeGreaterThan(0);
      for (const archetype of card.archetypes) {
        expect(VOCABULARY).toContain(archetype);
      }
    }
  });

  it("carries every transport mode on at least six cards", () => {
    // Every mode, derived from the type's own list -- see TRANSPORT_MODES.
    // A hardcoded array here is what let "etrain" slip in unchecked.
    for (const mode of TRANSPORT_MODES) {
      const carriers = tarotCards.filter((card) => card.transport.includes(mode));
      expect(carriers.length, `mode ${mode}`).toBeGreaterThanOrEqual(6);
    }
  });

  it("gives every card both meanings and an image path", () => {
    for (const card of tarotCards) {
      expect(card.meaning.length).toBeGreaterThan(10);
      expect(card.meaningReversed.length).toBeGreaterThan(10);
      expect(card.image).toMatch(/^\/tarot\/\d{2}-[a-z_]+\.webp$/);
    }
  });
});
