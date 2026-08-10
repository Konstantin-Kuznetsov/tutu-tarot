import { describe, expect, it } from "vitest";
import { usableModes } from "@/domain/travel/roads";
import type { TripIntent } from "@/domain/types";

const week: TripIntent = {
  departureCity: "Москва",
  dateFrom: "2026-09-10",
  dateTo: "2026-09-17",
  travelerCount: 2,
};

describe("usableModes", () => {
  it("keeps modes that exist and fit the trip (Владимир: no air)", () => {
    const modes = usableModes(
      {
        railway: { count: 19, minPrice: 691.77, minDurationMin: 104 },
        bus: { count: 6, minPrice: 3220, minDurationMin: 150 },
      },
      week,
    );
    expect(modes).toEqual(["railway", "bus"]);
  });

  it("drops a road that eats the holiday (Владивосток: 9330 min by rail)", () => {
    const modes = usableModes(
      {
        avia: { count: 22, minPrice: 40320, minDurationMin: 495 },
        railway: { count: 2, minPrice: 20629, minDurationMin: 9330 },
      },
      week,
    );
    expect(modes).toEqual(["avia"]);
  });

  it("keeps the fastest mode when the sanity filter would empty the set", () => {
    const modes = usableModes(
      {
        railway: { count: 2, minPrice: 20629, minDurationMin: 9330 },
        bus: { count: 1, minPrice: 9000, minDurationMin: 12000 },
      },
      { ...week, dateTo: "2026-09-11" },
    );
    expect(modes).toEqual(["railway"]);
  });

  it("returns nothing when nothing exists", () => {
    expect(usableModes({}, week)).toEqual([]);
  });

  describe("1/3 threshold boundary", () => {
    it("keeps a mode that is exactly at the 1/3 budget", () => {
      // week is 7 days = 10080 minutes; budget = 3360 minutes (1/3).
      // minDurationMin: 3360 should be kept (rule is <=).
      const modes = usableModes(
        {
          railway: { count: 5, minPrice: 1000, minDurationMin: 3360 },
          bus: { count: 3, minPrice: 500, minDurationMin: 100 }, // sibling that qualifies
        },
        week,
      );
      expect(modes).toEqual(["railway", "bus"]);
    });

    it("drops a mode that exceeds the 1/3 budget by one minute", () => {
      // minDurationMin: 3361 should be dropped (exceeds budget).
      const modes = usableModes(
        {
          railway: { count: 5, minPrice: 1000, minDurationMin: 3361 },
          bus: { count: 3, minPrice: 500, minDurationMin: 100 }, // sibling that qualifies
        },
        week,
      );
      expect(modes).toEqual(["bus"]);
    });
  });

  describe("null minDurationMin (unknown duration)", () => {
    it("keeps a mode with unknown duration and drops a mode with known bad duration", () => {
      // When one mode has minDurationMin: null (unknown) and another has a known
      // too-long duration, the known-bad is dropped while the unknown is kept.
      // This is "fail open" behavior for missing data.
      const modes = usableModes(
        {
          railway: { count: 2, minPrice: 20629, minDurationMin: 9330 }, // known bad (too long)
          avia: { count: 10, minPrice: 5000, minDurationMin: null }, // unknown, kept
        },
        week,
      );
      expect(modes).toEqual(["avia"]);
    });
  });
});
