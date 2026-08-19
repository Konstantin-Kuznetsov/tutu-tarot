import { expect, test } from "@playwright/test";
import { pickFutureDateRange } from "./helpers";
import { encodeReading, type SharedReading } from "@/domain/share/code";

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
  await page.getByLabel("Откуда").fill("Москва");
  await pickFutureDateRange(page);
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
  await page.getByLabel("Откуда").fill("Москва");
  await pickFutureDateRange(page);
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

// Task 11: the wait for Tutu MCP IS the third card. RitualStage reveals the
// two seed cards on their own timers (DEAL_STEP_MS = 900ms and 900ms*2 =
// 1800ms -- see its own comments) entirely independent of the network, so
// the checkpoint below sits at 2000ms: past both seed-card reveals, still
// well short of the mocked response. The mock is delayed 2800ms -- past
// CONSULT_AFTER_MS (3000ms) is deliberately avoided here so this test stays
// about the reveal-gating specifically; the "Оракул сверяется..." copy has
// its own coverage in tests/components/ritual-flow.test.tsx. Runs on both
// configured projects (desktop, mobile) since this file's tests always do.
test("holds the third card until Tutu MCP answers, on one page throughout", async ({ page }) => {
  await page.route("**/api/ritual", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2800));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ritualId: "demo",
        seed: "москва|2026-10-10|2026-10-17|2",
        spreadCards: [
          {
            id: "tower", number: 16, name: "Башня", image: "/tarot/16-tower.webp", position: "Зов",
            reversed: false, archetypes: ["cliffs"], transport: ["avia"],
            meaning: "камень и высота", meaningReversed: "обвал случился раньше, теперь строят заново",
          },
          {
            id: "star", number: 17, name: "Звезда", image: "/tarot/17-star.webp", position: "Дар",
            reversed: false, archetypes: ["north", "water"], transport: ["railway"],
            meaning: "северный свет и надежда", meaningReversed: "свет тусклый",
          },
          {
            id: "hermit", number: 9, name: "Отшельник", image: "/tarot/09-hermit.webp", position: "Путь",
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
            id: "t-0", title: "Поезд: ФПК «Карелия»", price: "3481 RUB", mode: "railway",
            url: "https://www.tutu.ru/poezda/",
          },
        },
        transportOffers: [],
        hotelOffers: [],
        sourceLinks: [],
        warnings: [],
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Откуда").fill("Москва");
  await pickFutureDateRange(page);
  await page.getByLabel("Путешественники").fill("2");
  await page.getByRole("button", { name: "Начать расклад" }).click();

  // No separate screen at any point in the flow -- checked immediately
  // after submit and again once the reading is fully revealed, below.
  await expect(page.getByRole("navigation", { name: /экраны/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /результат/i })).toHaveCount(0);

  // 2000ms: both seed cards' reveal timers (900ms, 1800ms) have fired, but
  // the mocked response (2800ms) hasn't landed yet -- the third card must
  // still be face-down.
  await page.waitForTimeout(2000);
  await expect(page.locator('[data-testid="tarot-card"][data-revealed="true"]')).toHaveCount(2);
  await expect(page.locator('[data-testid="tarot-card"][data-revealed="false"]')).toHaveCount(1);

  // After the response: the dealing scene is gone and TravelResult's own
  // spread-panel shows all three cards revealed.
  await expect(page.getByText("Карты указывают на Усьвинские Столбы")).toBeVisible();
  await expect(page.getByTestId("spread-card")).toHaveCount(3);
  await expect(page.locator('[data-testid="tarot-card"]')).toHaveCount(0);

  await expect(page.getByRole("navigation", { name: /экраны/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /результат/i })).toHaveCount(0);
});

// Task 13: proves the share code round-trips through a real click, a real
// clipboard, and a real page load -- not just the codec's own unit tests.
// The /api/ritual mock below is deliberately close to the shape runRitual
// actually returns (real destination id, real card ids, an `intent` block)
// because ShareButton reads straight off that response; anything short of
// the real shape (e.g. the older fixtures elsewhere in this file, which
// predate Task 13 and omit `destination.id`/`intent` on purpose) would just
// hide the button instead of exercising it. The opened link's own search is
// never mocked -- it hits the real (down, in this environment) Tutu MCP
// endpoint and takes the documented fog fallback, proving the "prices
// fresh" half of the feature along the way.
test("a shared reading link reproduces the same cards, orientations and destination in a fresh tab", async ({ page, context }) => {
  // Playwright's Chromium implements the async Clipboard API behind an
  // explicit permission grant; without it, ShareButton's fallback path
  // would hit the same "failed to copy" branch a real browser shows when
  // permission is refused -- see tests/components/share-button.test.tsx for
  // that branch's own coverage; this test wants the success path.
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.route("**/api/ritual", async (route) => {
    const submitted = JSON.parse(route.request().postData() ?? "{}") as {
      departureCity: string;
      dateFrom: string;
      dateTo: string;
      travelerCount: number;
    };

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ritualId: "demo",
        seed: "seed",
        intent: submitted,
        spreadCards: [
          {
            id: "star", number: 17, name: "Звезда", image: "/tarot/17-star.webp", position: "Зов",
            reversed: false, archetypes: ["north"], transport: ["avia"],
            meaning: "северный свет и надежда", meaningReversed: "свет тусклый",
          },
          {
            id: "moon", number: 18, name: "Луна", image: "/tarot/18-moon.webp", position: "Дар",
            reversed: true, archetypes: ["north"], transport: ["railway"],
            meaning: "ночная дорога и туман", meaningReversed: "туман рассеивается, страх был напрасным",
          },
          {
            id: "hermit", number: 9, name: "Отшельник", image: "/tarot/09-hermit.webp", position: "Путь",
            reversed: false, archetypes: ["solitude"], transport: ["railway"],
            meaning: "дорога к тишине и высокому месту", meaningReversed: "одиночество тяготит, нужен попутчик",
          },
        ],
        // A real atlas id -- resolveSharedReading (used by both the shared
        // page and its opengraph-image sibling) rejects anything else.
        destination: { id: "altai-chuysky", name: "Горный Алтай", region: "Республика Алтай" },
        prediction: {
          headline: "Карты указывают: Горный Алтай",
          opening: "Карты раскрывают путь.",
          summary: "Маршрут подтверждён.",
          cardReadings: [],
        },
        roadChoice: {
          mode: "railway",
          reason: "«Отшельник» сажает к окну — дорога будет долгой и созерцательной.",
          best: { id: "t-0", title: "Поезд: ФПК", price: "3481 RUB", mode: "railway", url: "https://www.tutu.ru/poezda/" },
        },
        transportOffers: [],
        hotelOffers: [],
        sourceLinks: [],
        warnings: [],
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Откуда").fill("Москва");
  await pickFutureDateRange(page);
  await page.getByLabel("Путешественники").fill("2");
  await page.getByRole("button", { name: "Начать расклад" }).click();

  await expect(page.getByText("Карты указывают: Горный Алтай")).toBeVisible();

  await page.getByRole("button", { name: "Поделиться раскладом" }).click();
  // ShareButton's clipboard.write() is asynchronous (its own promise, not
  // awaited by the click handler -- see its comment on why the write call
  // itself has to fire synchronously but the copy can't): reading the
  // clipboard before that promise settles is a real race, not a hypothetical
  // one -- it lost on this exact assertion under the "desktop" project
  // while "mobile" happened to win. The visible confirmation text only
  // renders once the write has actually resolved, so waiting for it first
  // makes the read deterministic.
  await expect(page.getByText("Ссылка скопирована")).toBeVisible();
  const shareUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(shareUrl).toMatch(/\/r\/[A-Za-z0-9_-]+$/);

  // "Open it in a fresh page": a new page in the same browser context, not
  // a client-side navigation on the page that already has the reading in
  // memory -- this is the tab a friend who was sent the link would open.
  const freshPage = await context.newPage();
  await freshPage.goto(shareUrl);

  await expect(freshPage.getByText("Карты указывают: Горный Алтай")).toBeVisible();
  const spread = freshPage.getByTestId("spread-card");
  await expect(spread).toHaveCount(3);
  await expect(spread.nth(0)).toHaveAttribute("data-card-id", "star");
  await expect(spread.nth(0)).toHaveAttribute("data-reversed", "false");
  await expect(spread.nth(1)).toHaveAttribute("data-card-id", "moon");
  await expect(spread.nth(1)).toHaveAttribute("data-reversed", "true");
  await expect(spread.nth(2)).toHaveAttribute("data-card-id", "hermit");
  await expect(spread.nth(2)).toHaveAttribute("data-reversed", "false");

  await freshPage.setViewportSize({ width: 375, height: 812 });
  const hasNoHorizontalOverflow = await freshPage.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  expect(hasNoHorizontalOverflow).toBe(true);

  await freshPage.close();
});

// Task 13, fix round 2: closes the hole that let the /r/[code] SSR crash
// ship. Every existing check of that route (including the test right above
// this one) reaches it through `page.goto()`/a real browser and then reads
// the DOM with `getByText`/locators -- which is exactly what let the bug
// through. React hydrates on the client from the RSC payload regardless of
// whether the *server* render failed, so even while ShareButton's `window is
// not defined` crash was making the server return HTTP 500 for every shared
// reading, a browser-driven test that only checked for visible text still
// passed: the client-side render papered right over the broken response.
// (Confirmed directly against this repo's dev server while writing this
// test -- `curl` on a real share code returned status 500 with that exact
// ReferenceError, while a Playwright browser test against the same URL and
// code still went green.)
//
// So this test checks the one thing a hydration-masked assertion cannot
// fake: the actual HTTP status of the top-level navigation response,
// captured from `page.goto()` itself, before any client-side JS has run.
// `page.goto()` does not throw on a non-2xx response -- it resolves
// normally with the real status -- so this fails with a clear "500 !== 200"
// rather than a locator timeout if the SSR crash ever comes back. The card
// assertions after it are the same shape as the test above, kept here so a
// regression that leaves the status code fine but breaks what actually
// renders still has coverage.
//
// The code below is minted directly with the real codec (not clicked
// through the UI), because this test's whole point is the server's
// handling of a fresh, cold request to /r/[code] -- nothing about how the
// link was produced matters here. `mode` is null on purpose, not "railway"
// like the test above's: roadChoice.mode on the shared page is read
// straight off the decoded reading (see loadSharedResult in
// src/app/r/[code]/page.tsx), so this is the documented fog reading
// (mcp.tutu.ru is unreachable in this environment -- see the Task 13
// brief) -- proof that a fog reading stays shareable and server-renders
// cleanly, not just a mode-carrying one.
test("a fresh server-side navigation to /r/[code] responds 200 and renders the shared cards", async ({ page }) => {
  const reading: SharedReading = {
    cards: [
      { id: "star", reversed: false },
      { id: "moon", reversed: true },
      { id: "hermit", reversed: false },
    ],
    // A real atlas id -- resolveSharedReading rejects anything else, same
    // as the test above.
    destinationId: "altai-chuysky",
    mode: null,
    departureCity: "Москва",
    dateFrom: "2026-09-10",
    dateTo: "2026-09-17",
    travelerCount: 2,
  };
  const code = encodeReading(reading);

  // A brand-new page navigating straight to the URL: always a real top-level
  // HTTP request for the document, never a Next.js client-side transition
  // (there is nothing loaded yet to transition from) -- exactly the request
  // a stranger's freshly tapped share link makes.
  const response = await page.goto(`/r/${code}`);
  expect(response?.status()).toBe(200);

  const spread = page.getByTestId("spread-card");
  await expect(spread).toHaveCount(3);
  await expect(spread.nth(0)).toHaveAttribute("data-card-id", "star");
  await expect(spread.nth(0)).toHaveAttribute("data-reversed", "false");
  await expect(spread.nth(1)).toHaveAttribute("data-card-id", "moon");
  await expect(spread.nth(1)).toHaveAttribute("data-reversed", "true");
  await expect(spread.nth(2)).toHaveAttribute("data-card-id", "hermit");
  await expect(spread.nth(2)).toHaveAttribute("data-reversed", "false");
});
