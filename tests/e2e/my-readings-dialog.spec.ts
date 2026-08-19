import { expect, test } from "@playwright/test";
import { pickFutureDateRange } from "./helpers";

// Everything this file asserts needs a real layout engine and real wheel
// input, so none of it can live beside the component's own tests: jsdom has
// no layout (every box measures zero) and no scrolling.
//
// It also exists because the first version of this spec did not catch the
// bug it was written for -- it built a synthetic dialog and set scrollTop by
// hand, which succeeds whether or not the real thing works. These assertions
// were each checked against the broken code before being kept.
test("the history dialog scrolls, and leaves the reading behind it exactly where it was", async ({ page }) => {
  await page.route("**/api/ritual", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ritualId: "demo",
        seed: "москва|2026-09-10|2026-09-17|2",
        intent: { departureCity: "Москва", dateFrom: "2026-09-10", dateTo: "2026-09-17", travelerCount: 2 },
        spreadCards: [
          { id: "tower", name: "Башня", position: "Зов", meaning: "камень", archetypes: ["cliffs"], reversed: false },
          { id: "moon", name: "Луна", position: "Дар", meaning: "туман", archetypes: ["mystery"], reversed: false },
          { id: "hermit", name: "Отшельник", position: "Путь", meaning: "тишина", archetypes: ["solitude"], reversed: false },
        ],
        destination: { id: "baikal", name: "Байкал", region: "Иркутская область" },
        prediction: { headline: "h", opening: "o", summary: "s", cardReadings: [] },
        roadChoice: { mode: "railway", reason: "reason", best: null },
        transportOffers: [], hotelOffers: [], sourceLinks: [], warnings: [],
      }),
    });
  });

  // A history long enough that the panel cannot fit the screen.
  await page.goto("/");
  await page.evaluate(() => {
    const now = Date.now();
    window.localStorage.setItem(
      "tutu-tarot/readings/v1",
      JSON.stringify(
        Array.from({ length: 8 }, (_, index) => ({
          code: `code-${index}`,
          destinationName: `Место ${index}`,
          departureCity: "Москва",
          dateFrom: "2026-09-10",
          dateTo: "2026-09-17",
          travelerCount: 2,
          savedAt: now - index,
        })),
      ),
    );
  });

  await page.goto("/");
  await page.getByLabel("Откуда").fill("Москва");
  await pickFutureDateRange(page);
  await page.getByRole("button", { name: "Начать расклад" }).click();

  const openButton = page.getByRole("button", { name: "Мои расклады" });
  await openButton.waitFor({ timeout: 30_000 });
  await openButton.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);

  await openButton.click();
  await expect(page.locator("dialog.mydialog")).toBeVisible();

  // The reading behind is pinned where it was. `top` carries the position it
  // was frozen at, which is what closing restores.
  await expect
    .poll(async () => page.evaluate(() => document.body.style.top))
    .toBe(`${-scrollBefore}px`);

  // A wheel over the backdrop must not move the reading. This is what "the
  // dialog does not scroll" actually looked like: you scrolled, and the page
  // underneath moved instead.
  await page.mouse.move(30, 300);
  await page.mouse.wheel(0, 600);
  await expect
    .poll(async () => page.evaluate(() => document.body.style.top))
    .toBe(`${-scrollBefore}px`);

  // A wheel over the panel scrolls the panel.
  const box = await page.locator(".mydialog__panel").boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(0, 500);
  await expect
    .poll(async () => page.evaluate(() => document.querySelector(".mydialog__panel")!.scrollTop))
    .toBeGreaterThan(0);

  // Escape closes it, and the reading is exactly where it was left. The
  // unpin used to be skipped on this path -- the browser had already closed
  // the dialog, so the "if it is open, close it" branch never ran and the
  // page stayed frozen with nothing on screen to explain it.
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog.mydialog")).toBeHidden();
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  await expect.poll(async () => page.evaluate(() => document.body.style.position)).toBe("");
});
