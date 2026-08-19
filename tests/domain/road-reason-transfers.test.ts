import { describe, expect, it } from "vitest";
import { roadReason } from "@/domain/tarot/roadReason";
import type { DrawnTarotCard } from "@/domain/types";

const hermit: DrawnTarotCard = {
  id: "hermit", number: 9, name: "Отшельник", image: "/tarot/09-hermit.webp",
  archetypes: ["solitude"], transport: ["railway", "etrain"],
  meaning: "тишина", meaningReversed: "одиночество тяготит",
  position: "Путь", reversed: false,
};
const hermitReversed: DrawnTarotCard = { ...hermit, reversed: true };

describe("roadReason speaks about the change on the road", () => {
  // The point of the whole feature: a transfer is not a ticketing accident
  // to be reported, it is part of what the card said. The card cannot cause
  // the transfer -- reality reports the roads and the card names one -- but
  // the card that named this road is the one that reads its shape.
  it("says nothing about transfers on a direct road", () => {
    const direct = roadReason(hermit, "railway", { transfers: 0, via: [] });
    expect(direct).toBe("«Отшельник» сажает к окну — дорога будет долгой и созерцательной.");
    expect(direct).not.toContain("пересад");
  });

  it("is byte-identical to the old sentence when the shape is unknown", () => {
    // Every call site that predates this -- fixtures, older readings -- must
    // keep producing exactly what it produced before.
    expect(roadReason(hermit, "railway")).toBe(roadReason(hermit, "railway", { transfers: 0 }));
  });

  it("reads one change as intent, and names where it happens", () => {
    const reason = roadReason(hermit, "avia", { transfers: 1, via: ["Москва"] });
    expect(reason).toContain("Путь ляжет с 1 пересадкой");
    expect(reason).toContain("часть знака, а не помеха");
    expect(reason).toContain("Место излома: Москва.");
  });

  it("turns the same change into a warning when the card is reversed", () => {
    const reason = roadReason(hermitReversed, "avia", { transfers: 1, via: ["Москва"] });
    expect(reason).toContain("перевёрнутая карта делает стык хрупким");
    expect(reason).not.toContain("часть знака");
  });

  // After «с» Russian takes the instrumental, where every plural is the same
  // word -- so unlike the nominative there is no 2-4 / 5+ split, only the
  // singular differs.
  it("declines the count correctly", () => {
    expect(roadReason(hermit, "avia", { transfers: 1 })).toContain("с 1 пересадкой");
    expect(roadReason(hermit, "avia", { transfers: 2 })).toContain("с 2 пересадками");
    expect(roadReason(hermit, "avia", { transfers: 5 })).toContain("с 5 пересадками");
    expect(roadReason(hermit, "avia", { transfers: 11 })).toContain("с 11 пересадками");
  });

  it("stays silent about the place when the road did not name one", () => {
    expect(roadReason(hermit, "avia", { transfers: 1, via: [] })).not.toContain("Место излома");
  });

  it("still yields fog when there is no mode at all", () => {
    expect(roadReason(hermit, null, { transfers: 2, via: ["Москва"] })).toContain("туман");
  });

  // Place names are never declined by this codebase: "через Москву" needs the
  // accusative, and Russian toponyms decline inconsistently enough that
  // interpolating a raw name breaks grammar for a large share of them. After
  // a colon the nominative is correct for every name.
  it("leaves place names in the nominative", () => {
    expect(roadReason(hermit, "avia", { transfers: 1, via: ["Тверь"] })).toContain("Место излома: Тверь.");
  });
});
