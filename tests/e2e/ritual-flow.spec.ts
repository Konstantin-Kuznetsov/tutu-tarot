import { expect, test } from "@playwright/test";

// Runs under both the "desktop" and "mobile" Playwright projects configured
// in playwright.config.ts, so this single test covers both viewport sizes.
// The ticket form is the most likely thing to push the page sideways at a
// mobile width (375px) — it collapses to a single column there, but a
// missed case in that collapse (or a runaway grid track) would overflow
// silently since nothing else in this suite measures page width.
test("entry screen shows the title and the deck fan with no horizontal overflow", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Таро-турагент" })).toBeVisible();
  await expect(page.getByTestId("deck-fan")).toBeVisible();

  const hasNoHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  expect(hasNoHorizontalOverflow).toBe(true);
});

test("ritual flow reaches Tutu-backed result", async ({ page }) => {
  await page.route("**/api/ritual", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ritualId: "demo",
        seed: "москва|2026-09-10|2026-09-17|2",
        spreadCards: [
          { id: "tower", name: "Башня", position: "Зов", meaning: "камень и высота", archetypes: ["cliffs"] },
          { id: "chariot", name: "Колесница", position: "Путь", meaning: "дорога", archetypes: ["road"] },
          { id: "hermit", name: "Отшельник", position: "Дар маршрута", meaning: "тишина", archetypes: ["solitude"] },
        ],
        destination: { name: "Усьвинские Столбы", region: "Пермский край" },
        prediction: {
          headline: "Карты указывают на Усьвинские Столбы",
          opening: "Башня зовет к камню.",
          summary: "Дорога подтверждается Туту.",
          cardReadings: [],
        },
        roadChoice: { mode: "railway", reason: "«Отшельник» сажает к окну — дорога будет долгой и созерцательной.", best: null },
        transportOffers: [
          {
            id: "transport-0",
            title: "Москва - Пермь",
            price: "4200 RUB",
            url: "https://avia.tutu.ru/f/Moskva/Perm/",
          },
        ],
        hotelOffers: [
          {
            id: "hotel-0",
            title: "Отель в Перми",
            url: "https://hotel.tutu.ru/offers/details/example",
          },
        ],
        sourceLinks: [{ label: "Путеводитель Туту", url: "https://www.tutu.ru/geo/" }],
        warnings: [],
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Город вылета").fill("Москва");
  await page.getByLabel("Дата начала").fill("2026-09-10");
  await page.getByLabel("Дата конца").fill("2026-09-17");
  await page.getByLabel("Путешественники").fill("2");
  await page.getByRole("button", { name: "Начать расклад" }).click();

  await expect(page.getByText("Карты указывают на Усьвинские Столбы")).toBeVisible();
  const spread = page.getByRole("region", { name: "Расклад карт" });
  await expect(spread).toBeVisible();
  await expect(page.getByTestId("spread-card")).toHaveCount(3);
  await expect(page.getByTestId("spread-card").nth(0)).toBeVisible();
  await expect(page.getByTestId("spread-card").nth(1)).toBeVisible();
  await expect(page.getByTestId("spread-card").nth(2)).toBeVisible();
  await expect(spread.getByText("Башня", { exact: true })).toBeVisible();
  await expect(spread.getByText("Зов", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Путеводитель Туту" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Москва - Пермь/ })).toHaveAttribute(
    "href",
    "https://avia.tutu.ru/f/Moskva/Perm/",
  );
  await expect(page.getByRole("link", { name: /Отель в Перми/ })).toHaveAttribute(
    "href",
    "https://hotel.tutu.ru/offers/details/example",
  );
});
