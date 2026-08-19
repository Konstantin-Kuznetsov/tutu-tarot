import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InterchangePlanSection } from "@/components/TravelResult";
import type { InterchangePlan } from "@/domain/types";

// The real Псков → Абакан plan, same numbers as the normalizer's fixture.
const plan: InterchangePlan = {
  via: ["Москва"],
  transferCount: 1,
  departureAt: "2026-10-14T19:23:00+03:00",
  arrivalAt: "2026-10-19T06:30:00+07:00",
  durationMin: 6187,
  priceFrom: 13320.16,
  legs: [
    {
      trainNumber: "010У",
      from: "Псков — Псков-Пасс. (2004500)",
      to: "Москва — Ленинградский вокзал (2006004)",
      departureAt: "2026-10-14T19:23:00+03:00",
      arrivalAt: "2026-10-15T06:47:00+03:00",
      durationMin: 684,
      priceFrom: 2501.26,
      url: "https://mtp-deeplink.tutu.ru/example",
      seatCategories: [
        { code: "SEDENTARY", label: "сидячий", priceFrom: 2501.26, seatsLeft: 52 },
        { code: "COMPARTMENT", label: "купе", priceFrom: 7088.7, seatsLeft: 2 },
      ],
    },
    {
      trainNumber: "068Ы",
      from: "Москва — Ярославский вокзал (2000002)",
      to: "Абакан, 2038230",
      departureAt: "2026-10-15T23:20:00+03:00",
      arrivalAt: "2026-10-19T06:30:00+07:00",
      seatCategories: [],
    },
  ],
};

describe("InterchangePlanSection", () => {
  it("names the change, the route and every train", () => {
    render(<InterchangePlanSection plan={plan} blockIndex={3} />);
    const section = screen.getByRole("region", { name: "Путь с пересадкой" });

    expect(section).toHaveTextContent("Пересадка: Москва");
    expect(section).toHaveTextContent("010У");
    expect(section).toHaveTextContent("068Ы");
    expect(section).toHaveTextContent("Псков → Москва");
    expect(section).toHaveTextContent("Москва → Абакан");
  });

  // The whole reason this block looks different from a bookable card: it is
  // two purchases, and the price is assembled rather than quoted. Saying so
  // is not optional -- an app that shows a total it cannot sell has invented
  // a fact.
  it("says plainly that this is a plan and not a ticket", () => {
    render(<InterchangePlanSection plan={plan} blockIndex={3} />);
    const section = screen.getByRole("region", { name: "Путь с пересадкой" });

    expect(section).toHaveTextContent("Это план, а не билет");
    expect(section).toHaveTextContent("покупать нужно два раза");
    expect(section).toHaveTextContent("сумма самых дешёвых тарифов");
  });

  it("links each leg separately, because each leg is separately bookable", () => {
    render(<InterchangePlanSection plan={plan} blockIndex={3} />);
    const links = screen.getAllByRole("link");

    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://mtp-deeplink.tutu.ru/example");
  });

  // Times are printed from the string's own wall clock. A departure stamped
  // +03:00 leaves at 19:23 by the station's clock no matter where the reader
  // is sitting; going through Date would rewrite it into the reader's
  // timezone. This test runs under a non-UTC TZ (see vitest setup) for the
  // same reason the calendar's own test does.
  it("prints station time, not the reader's time", () => {
    render(<InterchangePlanSection plan={plan} blockIndex={3} />);
    const section = screen.getByRole("region", { name: "Путь с пересадкой" });

    expect(section).toHaveTextContent("14 окт 19:23");
    expect(section).toHaveTextContent("15 окт 06:47");
  });

  it("shows the fare ladder cheapest-first, and flags only a scarce class", () => {
    render(<InterchangePlanSection plan={plan} blockIndex={3} />);
    const ladder = screen.getAllByRole("list", { name: "Классы вагонов" })[0];

    expect(ladder).toHaveTextContent("сидячий");
    // A plain space, not the non-breaking one formatPrice actually emits:
    // toHaveTextContent normalizes whitespace before matching, and \s in the
    // regex it uses covers U+00A0 -- so the element's text arrives here with
    // ordinary spaces. The exact bytes are asserted where it matters, on
    // formatPrice's own output in tutu-normalize.test.ts.
    expect(ladder).toHaveTextContent("от 2 501 ₽");
    expect(ladder).toHaveTextContent("купе · 2 места");
    // 52 seats left is not news; 2 is. Only the scarce one carries a count.
    expect(ladder).not.toHaveTextContent("сидячий · 52");
  });

  it("renders no ladder for a leg that has none", () => {
    render(<InterchangePlanSection plan={plan} blockIndex={3} />);
    expect(screen.getAllByRole("list", { name: "Классы вагонов" })).toHaveLength(1);
  });
});

// Every count in this feature goes through a declension function now,
// because three of them shipped wrong: «Через Москва», «Ни самолёт,
// автобус, ни электричка», and «купе · 2 мест». Screenshots caught two of
// the three; a test is cheaper than a screenshot.
describe("seat counts decline", () => {
  const withSeats = (seatsLeft: number): InterchangePlan => ({
    ...plan,
    legs: [{ ...plan.legs[0], seatCategories: [{ code: "COMPARTMENT", label: "купе", priceFrom: 100, seatsLeft }] }],
  });

  it.each([
    [1, "купе · 1 место"],
    [2, "купе · 2 места"],
    [4, "купе · 4 места"],
    [5, "купе · 5 мест"],
  ])("renders %i as %s", (seatsLeft, expected) => {
    render(<InterchangePlanSection plan={withSeats(seatsLeft)} blockIndex={3} />);
    expect(screen.getByRole("list", { name: "Классы вагонов" })).toHaveTextContent(expected);
  });
});
