import { describe, expect, it } from "vitest";
import { encodeReading, type SharedReading } from "@/domain/share/code";
import { decodeReading } from "@/domain/share/decode";

const reading: SharedReading = {
  cards: [
    { id: "tower", reversed: false },
    { id: "hermit", reversed: true },
    { id: "chariot", reversed: false },
  ],
  destinationId: "altai-chuysky",
  mode: "railway",
  departureCity: "Москва",
  dateFrom: "2026-09-10",
  dateTo: "2026-09-17",
  travelerCount: 2,
};

describe("share code", () => {
  it("round-trips a reading", () => {
    expect(decodeReading(encodeReading(reading))).toEqual(reading);
  });

  it("produces a URL-safe code with no padding", () => {
    expect(encodeReading(reading)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("survives a Cyrillic departure city", () => {
    const decoded = decodeReading(encodeReading({ ...reading, departureCity: "Нижний Новгород" }));
    expect(decoded?.departureCity).toBe("Нижний Новгород");
  });

  it("returns null for anything it cannot trust", () => {
    for (const bad of ["", "!!!!", "YWJj", btoa("{}"), encodeReading(reading).slice(0, 8)]) {
      expect(decodeReading(bad)).toBeNull();
    }
  });

  it("rejects a card id that is not in the deck and a destination that is not in the atlas", () => {
    const wrongCard = encodeReading({ ...reading, cards: [{ id: "nope", reversed: false }, ...reading.cards.slice(1)] });
    expect(decodeReading(wrongCard)).toBeNull();
    const wrongPlace = encodeReading({ ...reading, destinationId: "atlantis" });
    expect(decodeReading(wrongPlace)).toBeNull();
  });

  it("rejects invalid calendar dates", () => {
    // February 30 does not exist
    const invalidDay = encodeReading({ ...reading, dateFrom: "2026-02-30" });
    expect(decodeReading(invalidDay)).toBeNull();
    // Month 13 does not exist
    const invalidMonth = encodeReading({ ...reading, dateFrom: "2026-13-01" });
    expect(decodeReading(invalidMonth)).toBeNull();
  });

  it("rejects a reversed date range", () => {
    const reversed = encodeReading({ ...reading, dateFrom: "2026-09-17", dateTo: "2026-09-10" });
    expect(decodeReading(reversed)).toBeNull();
  });

  it("accepts an equal date range", () => {
    const equal = encodeReading({ ...reading, dateFrom: "2026-09-10", dateTo: "2026-09-10" });
    expect(decodeReading(equal)).toEqual({ ...reading, dateFrom: "2026-09-10", dateTo: "2026-09-10" });
  });

  it("rejects duplicate card ids", () => {
    const duplicateFirst = encodeReading({
      ...reading,
      cards: [
        { id: "tower", reversed: false },
        { id: "tower", reversed: true },
        { id: "chariot", reversed: false },
      ],
    });
    expect(decodeReading(duplicateFirst)).toBeNull();

    const duplicateSecond = encodeReading({
      ...reading,
      cards: [
        { id: "tower", reversed: false },
        { id: "hermit", reversed: true },
        { id: "hermit", reversed: false },
      ],
    });
    expect(decodeReading(duplicateSecond)).toBeNull();

    const allSame = encodeReading({
      ...reading,
      cards: [
        { id: "tower", reversed: false },
        { id: "tower", reversed: true },
        { id: "tower", reversed: false },
      ],
    });
    expect(decodeReading(allSame)).toBeNull();
  });
});
