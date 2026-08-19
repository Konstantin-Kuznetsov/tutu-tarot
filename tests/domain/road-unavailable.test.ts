import { describe, expect, it } from "vitest";
import { roadUnavailableNote } from "@/domain/travel/roadUnavailable";

// Every `detail` string below is verbatim from a live search_multitransport
// response measured on 2026-08-18, not invented: the whole point of this
// module is to read prose written by a service we do not control, so tests
// that use prose we wrote ourselves would prove nothing.


describe("roadUnavailableNote", () => {
  it("blames the departure end when it has no airport of its own", () => {
    const note = roadUnavailableNote(
      [{
        mode: "avia",
        reason: "no_route",
        detail: "avia requires avia_id for origin, but the geo lookup did not return one — try passing a more specific city name.",
      }],
    );

    expect(note).toBe("Самолёт эту дорогу не возьмёт: у города отправления нет своего аэропорта.");
  });

  // The same shape from the other end, measured on Санкт-Петербург -> Тверь:
  // Tutu resolves both cities fine, but Тверь has no airport either, so the
  // detail blames `destination` instead. Naming the wrong end of the journey
  // would be a confident lie about someone's trip.
  //
  // Neither sentence interpolates the place name: see the note in
  // roadUnavailable.ts on why an arbitrary Russian toponym cannot be
  // declined reliably ("у Тосно" but "у Твери").
  it("blames the destination end when that is the one without an airport", () => {
    const note = roadUnavailableNote(
      [{
        mode: "avia",
        reason: "no_route",
        detail: "avia requires avia_id for destination, but the geo lookup did not return one — try passing a more specific city name.",
      }],
    );

    expect(note).toBe("Самолёт эту дорогу не возьмёт: у города назначения нет своего аэропорта.");
  });

  it("prefers the airportless reason over a plain missing road", () => {
    const note = roadUnavailableNote(
      [
        { mode: "bus", reason: "no_route" },
        {
          mode: "avia",
          reason: "no_route",
          detail: "avia requires avia_id for origin, but the geo lookup did not return one.",
        },
      ],
    );

    expect(note).toContain("нет своего аэропорта");
  });

  it("states which single mode is missing when there is no richer reason", () => {
    expect(roadUnavailableNote([{ mode: "bus", reason: "no_route" }]))
      .toBe("Автобус сюда не доедет — прямого пути нет.");
    expect(roadUnavailableNote([{ mode: "etrain", reason: "no_route" }]))
      .toBe("Электричка сюда не довезёт — прямого пути нет.");
  });

  it("lists every mode when several came back empty", () => {
    const note = roadUnavailableNote(
      [
        { mode: "avia", reason: "no_route" },
        { mode: "bus", reason: "no_route" },
        { mode: "etrain", reason: "no_route" },
      ],
    );

    expect(note).toBe("Ни самолёт, ни автобус, ни электричка прямой дороги сюда не нашли.");
  });

  // The module's central rule, and the reason it can be trusted at all: an
  // unfamiliar reason produces silence, never a guess. Tutu can add reasons
  // at any time without this inventing a sentence about them.
  it("stays silent on a reason it does not recognise", () => {
    expect(roadUnavailableNote([{ mode: "avia", reason: "rate_limited" }])).toBeNull();
    expect(roadUnavailableNote([{ mode: "avia", reason: "some_future_reason", detail: "who knows" }]))
      .toBeNull();
  });

  it("stays silent when there is nothing to explain", () => {
    expect(roadUnavailableNote([])).toBeNull();
    // Regression: a search stub that omits the field entirely used to take
    // the whole ritual down with `undefined.length`.
    expect(roadUnavailableNote(undefined)).toBeNull();
  });

  // Nothing here may leak the service's own English into a reading.
  it("never shows the raw English detail to a reader", () => {
    const note = roadUnavailableNote(
      [{
        mode: "avia",
        reason: "no_route",
        detail: "avia requires avia_id for origin, but the geo lookup did not return one.",
      }],
    );

    expect(note).not.toMatch(/[A-Za-z]/);
  });
});
