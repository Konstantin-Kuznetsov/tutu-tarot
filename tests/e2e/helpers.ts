import type { Page } from "@playwright/test";

// Task 10 replaced the ticket's two native <input type="date"> fields with
// a single DateRangeCalendar popover. Every e2e spec that submits
// TripIntentForm used to fill "Дата начала"/"Дата конца" directly; this
// drives the popover instead and picks 10-17 September 2026, which is what
// every spec's `seed`/mocked request body fixture is already written
// against.
//
// The panel always shows two months side by side (current + next), so
// every day number appears as an accessible button name twice at once —
// day clicks use .first(), the earlier (currently-focused) month, after
// stepping forward with "next month" as needed to reach September 2026.
export async function pickSeptember10to17(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Когда поедете/ }).click();

  const today = new Date();
  const monthsToSeptember2026 = (2026 - today.getFullYear()) * 12 + (8 - today.getMonth());
  for (let step = 0; step < monthsToSeptember2026; step += 1) {
    await page.getByRole("button", { name: "Следующий месяц" }).click();
  }

  await page.getByRole("button", { name: "10", exact: true }).first().click();
  await page.getByRole("button", { name: "17", exact: true }).first().click();
}
