import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DateRangeCalendar, toDateKey, type DateRange } from "@/components/DateRangeCalendar";

describe("toDateKey", () => {
  it("uses local date parts, not UTC", () => {
    // 1 March 2026, 00:30 local. toISOString() would report 28 February for
    // every timezone east of UTC, which is all of Russia.
    expect(toDateKey(new Date(2026, 2, 1, 0, 30))).toBe("2026-03-01");
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

  it("closes on Escape", () => {
    open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
