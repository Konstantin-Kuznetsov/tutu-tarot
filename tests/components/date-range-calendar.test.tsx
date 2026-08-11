import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DateRangeCalendar, nightsWord, toDateKey, type DateRange } from "@/components/DateRangeCalendar";

describe("toDateKey", () => {
  it("uses local date parts, not UTC", () => {
    // 1 March 2026, 00:30 local. toISOString() would report 28 February for
    // every timezone east of UTC, which is all of Russia.
    expect(toDateKey(new Date(2026, 2, 1, 0, 30))).toBe("2026-03-01");
  });
});

describe("nightsWord", () => {
  // Standard Russian mod-10/mod-100 pluralisation, not a magnitude
  // threshold. A threshold (the bug this replaces) happens to agree with
  // the real rule up to 14 and then diverges — 21/22/25/101/111 are the
  // cases that catch it, since this calendar spans twelve months forward
  // and reaches all of them in ordinary use.
  it.each([
    [1, "ночь"],
    [2, "ночи"],
    [4, "ночи"],
    [5, "ночей"],
    [11, "ночей"],
    [12, "ночей"],
    [14, "ночей"],
    [21, "ночь"],
    [22, "ночи"],
    [25, "ночей"],
    [101, "ночь"],
    [111, "ночей"],
  ])("%i nights -> %s", (nights, expected) => {
    expect(nightsWord(nights)).toBe(expected);
  });
});

describe("DateRangeCalendar", () => {
  // DateRangeCalendar is a controlled component: every selection decision
  // reads the `value` prop, not internal state. A test that rendered it
  // once with a static `value` object (as a first draft of this helper did)
  // can never see a first click's effect on a second click — Testing
  // Library does not re-render on prop mutation, and nothing here mutates
  // `value` anyway. This harness closes that loop the way TripIntentForm
  // actually will: it owns the state and re-renders the calendar with the
  // latest value, while still forwarding every call to the `onChange` spy
  // the tests assert on.
  function Harness({ onChange }: { onChange: (next: DateRange) => void }) {
    const [value, setValue] = useState<DateRange>({ from: null, to: null });
    return (
      <DateRangeCalendar
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    );
  }

  function open(onChange = vi.fn()) {
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Когда поедете/ }));
    // Days 10 and 17 exist in every month, but the default panel shows the
    // current month, and the component disables days before today. If
    // today is already past the 10th, both days would render disabled —
    // step into next month first so the click lands on a selectable day.
    if (new Date().getDate() >= 10) {
      fireEvent.click(screen.getByRole("button", { name: "Следующий месяц" }));
    }
    return onChange;
  }

  // The panel always shows two months side by side (current + next), so
  // every day number from 1-28 appears as an accessible "button" name
  // twice at once (one per month) — an unscoped getByRole("button", {name})
  // is ambiguous regardless of the guard above. The first match is always
  // the earlier, currently-focused month, which is the one these tests
  // drive.
  function day(name: string) {
    return screen.getAllByRole("button", { name })[0];
  }

  it("sets the start on the first click and the end on the second", () => {
    const onChange = open();
    fireEvent.click(day("10"));
    expect(onChange).toHaveBeenLastCalledWith({ from: expect.stringMatching(/-10$/), to: null });

    fireEvent.click(day("17"));
    expect(onChange).toHaveBeenLastCalledWith({
      from: expect.stringMatching(/-10$/),
      to: expect.stringMatching(/-17$/),
    });
  });

  it("restarts the selection when the second click lands before the start", () => {
    const onChange = open();
    fireEvent.click(day("17"));
    fireEvent.click(day("10"));
    expect(onChange).toHaveBeenLastCalledWith({ from: expect.stringMatching(/-10$/), to: null });
  });

  it("re-anchors instead of completing a 0-night range when the start day is clicked again", () => {
    const onChange = open();
    fireEvent.click(day("10"));
    onChange.mockClear();

    fireEvent.click(day("10"));

    // Re-anchored at the same day, not "completed" into to === from.
    expect(onChange).toHaveBeenLastCalledWith({ from: expect.stringMatching(/-10$/), to: null });
    // A from/to-equal range would have closed the panel (see the
    // "to"-branch in selectDay); staying open is proof the fix took the
    // re-anchor branch, not the completion branch.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("marks the range endpoints with aria-pressed and a directional data-position", () => {
    open();
    // Capture the trigger by reference: picking the end day closes the
    // panel and rewrites the trigger's own accessible name to the label
    // (e.g. "10 августа – 17 августа, 7 ночей"), so it can no longer be
    // found by its empty-state name afterwards.
    const trigger = screen.getByRole("button", { name: /Когда поедете/ });

    fireEvent.click(day("10"));
    fireEvent.click(day("17"));

    // Re-open to inspect the already-picked range's rendered endpoints —
    // completing the range closes the panel in the same update, so "end"
    // is never observable mid-click, only once the panel is reopened.
    fireEvent.click(trigger);

    const start = day("10");
    const end = day("17");
    // aria-pressed, not aria-selected: a plain <button>'s implicit role is
    // "button", which jsx-a11y/role-supports-aria-props correctly points
    // out doesn't support aria-selected (that's for option/tab/gridcell
    // roles) -- aria-pressed is the ARIA-valid way to expose a button's own
    // toggled/boundary state.
    expect(start).toHaveAttribute("aria-pressed", "true");
    expect(start).toHaveAttribute("data-position", "start");
    expect(end).toHaveAttribute("aria-pressed", "true");
    expect(end).toHaveAttribute("data-position", "end");

    const inRangeDay = day("12");
    expect(inRangeDay).toHaveAttribute("aria-pressed", "false");
    expect(inRangeDay).not.toHaveAttribute("data-position");
  });
});
