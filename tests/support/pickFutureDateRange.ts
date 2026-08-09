import { fireEvent, screen } from "@testing-library/react";
import { toDateKey } from "@/components/DateRangeCalendar";

// Shared by every Vitest component test that drives DateRangeCalendar
// (previously duplicated, with a self-expiring assumption, in
// ritual-stage.test.tsx and trip-intent-form.test.tsx — see the fix-wave
// report for Task 10, finding 5).
//
// Opens the popover and picks days 10 and 17 of the month after next.
// "Month after next" (not "next month") is deliberate: it stays in the
// future regardless of what day of the month "today" happens to be when
// the suite runs, so there is no need for the today.getDate() >= 10 branch
// the old per-file copies carried. Both days exist in every month.
//
// The panel always renders two months side by side, and both share every
// day number, so an unscoped query is ambiguous by construction — clicks
// use the first match, the earlier (currently-focused) month, matching the
// disambiguation already used elsewhere for this component.
//
// Returns the two YYYY-MM-DD keys it actually selected, so callers assert
// against what was actually picked instead of a hardcoded date.
export function pickFutureDateRange(): { from: string; to: string } {
  fireEvent.click(screen.getByRole("button", { name: /Когда поедете/ }));

  for (let step = 0; step < 2; step += 1) {
    fireEvent.click(screen.getByRole("button", { name: "Следующий месяц" }));
  }

  const target = new Date();
  target.setDate(1); // avoid month-length overflow before adding months
  target.setMonth(target.getMonth() + 2);
  const from = toDateKey(new Date(target.getFullYear(), target.getMonth(), 10));
  const to = toDateKey(new Date(target.getFullYear(), target.getMonth(), 17));

  fireEvent.click(screen.getAllByRole("button", { name: "10" })[0]);
  fireEvent.click(screen.getAllByRole("button", { name: "17" })[0]);

  return { from, to };
}
