import type { Page } from "@playwright/test";

// Task 10 replaced the ticket's two native <input type="date"> fields with
// a single DateRangeCalendar popover. Every e2e spec that submits
// TripIntentForm used to fill "Дата начала"/"Дата конца" directly; this
// drives the popover instead.
//
// Picks days 10 and 17 of the month after next — always in the future and
// always exist, regardless of what day "today" happens to be when the
// suite runs. This replaced an earlier version that computed a delta to a
// hardcoded target month (September 2026): once "today" moved inside that
// month past the 10th the target day rendered disabled, and once "today"
// moved past the month entirely the delta went negative and the loop
// silently picked the wrong month instead. Being relative to "today" (via
// "month after next" rather than a fixed calendar month) closes both
// failure modes at once.
//
// The panel always shows two months side by side (current + next), so
// every day number appears as an accessible button name twice at once —
// day clicks use .first(), the earlier (currently-focused) month, after
// stepping forward twice with "next month" to reach the month after next.
//
// Returns the two YYYY-MM-DD keys actually selected, so callers can assert
// against what was actually picked instead of a hardcoded date.
export async function pickFutureDateRange(page: Page): Promise<{ from: string; to: string }> {
  await page.getByRole("button", { name: /Когда поедете/ }).click();

  for (let step = 0; step < 2; step += 1) {
    await page.getByRole("button", { name: "Следующий месяц" }).click();
  }

  const target = new Date();
  target.setDate(1); // avoid month-length overflow before adding months
  target.setMonth(target.getMonth() + 2);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const from = `${year}-${month}-10`;
  const to = `${year}-${month}-17`;

  await page.getByRole("button", { name: "10", exact: true }).first().click();
  await page.getByRole("button", { name: "17", exact: true }).first().click();

  return { from, to };
}
