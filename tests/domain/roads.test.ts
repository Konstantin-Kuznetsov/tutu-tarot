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
});
