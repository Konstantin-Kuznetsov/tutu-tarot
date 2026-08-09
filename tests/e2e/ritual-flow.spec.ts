import { expect, test } from "@playwright/test";
import { pickSeptember10to17 } from "./helpers";

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

// Regression coverage for a 2026-08-09 review finding: at 375px,
// document.documentElement.scrollWidth measured 431px on the result screen.
// Root cause was two-fold (see the fix in src/server/oracle/narrator.ts and
// the .prediction-panel rule in globals.css): summaryFor() used to
// concatenate a raw destination.sourceUrl into the prediction prose, and
// .prediction-panel had no overflow-wrap, unlike .road__hero, .road__reason
// and .offer-card, which all do. The narrator fix stops the URL from
// reaching the prose at all; this test also proves the CSS half holds on
// its own by mocking a prediction summary that contains a long unbroken
// token another way (not a URL) — an assertion that would fail if
// .prediction-panel's overflow-wrap were ever removed, even though nothing
// in the real narrator emits a URL anymore.
test("result screen has no horizontal overflow at 375px even with a long unbroken token in the prediction", async ({ page }) => {
  // page.setViewportSize (not test.use, which can't be called inside a test
  // body) pins the exact 375px width from the bug report regardless of
  // which Playwright project (desktop/mobile) runs this file.
  await page.setViewportSize({ width: 375, height: 812 });

  await page.route("**/api/ritual", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ritualId: "demo",
        seed: "москва|2026-09-10|2026-09-17|2",
        spreadCards: [
          {
            id: "tower", number: 16, name: "Башня", image: "/tarot/16-tower.webp", position: "Зов",
            reversed: false, archetypes: ["cliffs"], transport: ["avia"],
            meaning: "камень и высота", meaningReversed: "обвал случился раньше, теперь строят заново",
          },
        ],
        destination: { name: "Усьвинские Столбы", region: "Пермский край" },
        prediction: {
          headline: "Карты указывают на Усьвинские Столбы",
          opening: "Башня зовет к камню.",
          // Deliberately unbroken and much wider than a 375px viewport —
          // stands in for whatever future regression might again put a
          // long unbroken token in the prose (a URL or otherwise).
          summary:
            "Маршрут собран из открытых источников. Токенбезпробеловикоторыйничемнеразрывается" +
            "иоченьдлинныйчтобыоднозначнопревыситьширинуэкранавтелефоневпортретнойориентации.",
          cardReadings: [],
        },
        roadChoice: { mode: "railway", reason: "reason", best: null },
        transportOffers: [],
        hotelOffers: [],
        sourceLinks: [],
        warnings: [],
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Город вылета").fill("Москва");
  await pickSeptember10to17(page);
  await page.getByLabel("Путешественники").fill("2");
  await page.getByRole("button", { name: "Начать расклад" }).click();

  await expect(page.getByText("Карты указывают на Усьвинские Столбы")).toBeVisible();

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
          {
            id: "tower", number: 16, name: "Башня", image: "/tarot/16-tower.webp", position: "Зов",
            reversed: false, archetypes: ["cliffs"], transport: ["avia"],
            meaning: "камень и высота", meaningReversed: "обвал случился раньше, теперь строят заново",
          },
          {
            id: "chariot", number: 7, name: "Колесница", image: "/tarot/07-chariot.webp", position: "Путь",
            reversed: false, archetypes: ["road"], transport: ["avia"],
            meaning: "дорога", meaningReversed: "рывок не выходит, дорога сопротивляется",
          },
          {
            id: "hermit", number: 9, name: "Отшельник", image: "/tarot/09-hermit.webp", position: "Дар маршрута",
            reversed: false, archetypes: ["solitude"], transport: ["railway"],
            meaning: "тишина", meaningReversed: "одиночество тяготит, нужен попутчик",
          },
        ],
        destination: { name: "Усьвинские Столбы", region: "Пермский край" },
        prediction: {
          headline: "Карты указывают на Усьвинские Столбы",
          opening: "Башня зовет к камню.",
          summary: "Дорога подтверждается Туту.",
          cardReadings: [],
        },
        roadChoice: {
          mode: "railway",
          reason: "«Отшельник» сажает к окну — дорога будет долгой и созерцательной.",
          best: {
            id: "t-0",
            title: "Поезд: ФПК «Карелия»",
            price: "3481 RUB",
            mode: "railway",
            url: "https://avia.tutu.ru/f/Moskva/Petrozavodsk/",
          },
        },
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
  await pickSeptember10to17(page);
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

  const road = page.getByRole("region", { name: "Дорога, которую выбрала карта" });
  await expect(road).toBeVisible();
  await expect(road.getByRole("link")).toHaveAttribute("href", /tutu\.ru/);

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
