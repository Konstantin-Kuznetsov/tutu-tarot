import { describe, expect, it } from "vitest";
import {
  isOutsideSeasonWindow,
  monthsInTripRange,
  parseSeasonWindow,
  seasonWindowCaption,
} from "@/domain/travel/seasonWindow";

// The exact 19 phrasings currently in the atlas (see the task's own count),
// each mapped to the months this parser should read from it, or to "null"
// for the one phrasing ("круглосуточно" -- an opening-hours string, not a
// season, and the reason hmao-yugra's seasonWindow was dropped in atlas.ts)
// that must come back unparseable rather than a guess.
describe("parseSeasonWindow — every phrasing currently in the atlas", () => {
  it("круглый год is year-round, not a specific month set", () => {
    expect(parseSeasonWindow("круглый год")).toEqual({ kind: "always" });
  });

  const monthCases: Array<[string, number[]]> = [
    ["май-октябрь", [5, 6, 7, 8, 9, 10]],
    ["май–октябрь", [5, 6, 7, 8, 9, 10]],
    ["май—октябрь", [5, 6, 7, 8, 9, 10]],
    ["май – октябрь", [5, 6, 7, 8, 9, 10]],
    ["май—ноябрь", [5, 6, 7, 8, 9, 10, 11]],
    ["апрель–октябрь", [4, 5, 6, 7, 8, 9, 10]],
    ["апрель-ноябрь", [4, 5, 6, 7, 8, 9, 10, 11]],
    ["февраль–апрель", [2, 3, 4]],
    ["июль–сентябрь", [7, 8, 9]],
    ["с июня по сентябрь", [6, 7, 8, 9]],
    ["с апреля по октябрь", [4, 5, 6, 7, 8, 9, 10]],
    ["с середины июня до конца лета", [6, 7, 8]],
    ["с середины июня до третьей декады августа", [6, 7, 8]],
    [
      "с середины июля по середину сентября; с середины февраля по конец марта",
      [2, 3, 7, 8, 9],
    ],
    ["конец апреля, с начала июня до начала сентября", [4, 6, 7, 8, 9]],
    ["август–сентябрь, декабрь, март–апрель", [3, 4, 8, 9, 12]],
    ["летние месяцы", [6, 7, 8]],
  ];

  it.each(monthCases)("%s -> %j", (raw, expectedMonths) => {
    const parsed = parseSeasonWindow(raw);
    expect(parsed.kind).toBe("months");
    if (parsed.kind === "months") {
      expect([...parsed.months].sort((a, b) => a - b)).toEqual(expectedMonths);
    }
  });

  it("круглосуточно is not a season and must be refused, not guessed at", () => {
    expect(parseSeasonWindow("круглосуточно")).toEqual({ kind: "unparseable" });
  });

  it("stays unparseable for a format it has never seen, rather than guessing", () => {
    expect(parseSeasonWindow("когда-нибудь потом")).toEqual({ kind: "unparseable" });
    expect(parseSeasonWindow("")).toEqual({ kind: "unparseable" });
  });
});

describe("seasonWindowCaption", () => {
  it("frames an ordinary window as the guide's own recommendation", () => {
    expect(seasonWindowCaption("летние месяцы")).toBe("лучшее время: летние месяцы");
    expect(seasonWindowCaption("май–октябрь")).toBe("лучшее время: май–октябрь");
  });

  it("leaves круглый год bare -- a 'best time' framing would read oddly for it", () => {
    expect(seasonWindowCaption("круглый год")).toBe("круглый год");
  });
});

describe("monthsInTripRange", () => {
  it("covers just one month for a trip that stays inside it", () => {
    expect(monthsInTripRange("2026-10-05", "2026-10-15")).toEqual(new Set([10]));
  });

  it("covers both months for a trip spanning a month boundary", () => {
    expect(monthsInTripRange("2026-10-28", "2026-11-03")).toEqual(new Set([10, 11]));
  });

  it("wraps across a year boundary", () => {
    expect(monthsInTripRange("2026-12-28", "2027-01-03")).toEqual(new Set([12, 1]));
  });
});

describe("isOutsideSeasonWindow", () => {
  // The reported bug: 5-15 October against a "летние месяцы" guide window.
  it("flags a trip entirely outside the guide's recommended season", () => {
    expect(isOutsideSeasonWindow("летние месяцы", "2026-10-05", "2026-10-15")).toBe(true);
  });

  it("does not flag a trip that falls inside the window", () => {
    expect(isOutsideSeasonWindow("летние месяцы", "2026-07-01", "2026-07-10")).toBe(false);
  });

  it("does not flag a trip spanning the boundary as long as one covered month is in-window", () => {
    // May-October window; trip starts in October (in-window) and ends in
    // November (out): one of the two covered months overlaps, so this must
    // read as in-window, not a mismatch.
    expect(isOutsideSeasonWindow("май–октябрь", "2026-10-28", "2026-11-03")).toBe(false);
  });

  it("flags a trip spanning a boundary where neither covered month overlaps the window", () => {
    // Same May-October window; trip spans November-December, both outside.
    expect(isOutsideSeasonWindow("май–октябрь", "2026-11-28", "2026-12-03")).toBe(true);
  });

  it("a круглый год destination can never mismatch, whatever the dates", () => {
    expect(isOutsideSeasonWindow("круглый год", "2026-01-05", "2026-01-15")).toBe(false);
    expect(isOutsideSeasonWindow("круглый год", "2026-10-05", "2026-10-15")).toBe(false);
  });

  it("says nothing for a window it can't parse with certainty", () => {
    expect(isOutsideSeasonWindow("круглосуточно", "2026-10-05", "2026-10-15")).toBe(false);
  });
});
