import { expect, test } from "@playwright/test";
import { pickFutureDateRange } from "./helpers";

// Regression coverage for a 2026-08-09 review finding: a reversed card's
// name and figcaption were invisible even though `figcaption.textContent`
// confirmed the text was in the DOM. Root cause (see the comment on
// .tarot-card__flag in globals.css): TarotCardView used to render the name
// and the "перевёрнутая" flag as adjacent inline siblings with no space or
// break opportunity between them, and neither had `overflow-wrap`. That
// glued "ИмяКартыперевёрнутая" run became one unbreakable "word" whose
// max-content width forced .tarot-card__face's single implicit grid column
// — shared with .tarot-card__art via the art's own `width: 100%` — to grow
// well past the card's own fixed width (measured ~235px art in a 220px
// card). .tarot-card's `overflow: hidden` then clipped the label and
// caption rows out of the visible box. The rotate(180deg) transform was
// coincidental (only reversed cards render the flag), not causal.
//
// Not catchable by the existing suite: Vitest's component test
// (tests/components/tarot-card-view.test.tsx) runs in jsdom, which has no
// layout engine, so getBoundingClientRect() is always zeros there. The
// existing e2e geometry coverage (tarot-card-geometry.spec.ts) never draws
// a reversed card. This spec renders the real app in a real browser with a
// reversed card in the spread and measures the actual boxes.
//
// Viewport is pinned rather than left to the desktop/mobile Playwright
// projects: at narrow widths, .tarot-card__face p (the meaning paragraph)
// is deliberately display:none on both upright and reversed cards (a
// pre-existing, unrelated mobile simplification — see the max-width:760px
// block in globals.css), so a "meaning is visible" assertion would fail
// there for reasons that have nothing to do with this bug. 1280px is where
// every element this bug hid is expected to be visible.
test.use({ viewport: { width: 1280, height: 900 } });

test("a reversed card shows its name, its separated flag, and its meaning, with art the same size as an upright card", async ({ page }) => {
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
            id: "star", number: 17, name: "Звезда", image: "/tarot/17-star.webp", position: "Дар",
            reversed: true, archetypes: ["mystery"], transport: ["railway"],
            meaning: "свет и ориентир", meaningReversed: "свет тусклый, ориентир придётся искать самому",
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
          summary: "Маршрут собран по путеводителю Туту.",
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
  await pickFutureDateRange(page);
  await page.getByLabel("Путешественники").fill("2");
  await page.getByRole("button", { name: "Начать расклад" }).click();

  const cards = page.getByTestId("spread-card");
  await expect(cards).toHaveCount(3);

  // Let .spread-card-shell's own card-reveal animation settle before
  // measuring boxes below -- see the identical comment in
  // tarot-card-geometry.spec.ts for why this is needed since Task 11.
  await page.waitForTimeout(1000);

  const uprightCard = cards.nth(0); // "Башня"
  const reversedCard = cards.nth(1); // "Звезда", reversed

  await expect(reversedCard).toHaveAttribute("data-reversed", "true");

  // Critical bug: the name, the flag, and the reversed meaning must all
  // actually be painted, not just present in the DOM.
  await expect(reversedCard.getByText("Звезда", { exact: true })).toBeVisible();
  await expect(reversedCard.getByText("перевёрнутая", { exact: true })).toBeVisible();
  await expect(reversedCard.getByText("свет тусклый, ориентир придётся искать самому")).toBeVisible();

  // The flag must read as separated from the name, not glued to it — the
  // original bug's DOM had no space between them at all.
  const nameText = await reversedCard.locator(".tarot-card__face strong").textContent();
  const flagText = await reversedCard.locator(".tarot-card__flag").textContent();
  expect(nameText?.trim()).toBe("Звезда");
  expect(flagText?.trim()).toBe("перевёрнутая");

  // Critical bug, geometrically: the art must not be materially larger than
  // its own card, and must match the upright card's art size — before the
  // fix, a reversed card's art rendered ~1.3x wider than its card box.
  const uprightCardBox = await uprightCard.boundingBox();
  const uprightArtBox = await uprightCard.locator(".tarot-card__art").boundingBox();
  const reversedCardBox = await reversedCard.boundingBox();
  const reversedArtBox = await reversedCard.locator(".tarot-card__art").boundingBox();
  if (!uprightCardBox || !uprightArtBox || !reversedCardBox || !reversedArtBox) {
    throw new Error("card or art has no layout box");
  }

  // Cards must be the same size regardless of orientation. Tolerance of 2px
  // covers sub-pixel layout rounding while decisively failing any real
  // size drift.
  const pxTolerance = 2;
  expect(
    Math.abs(reversedCardBox.width - uprightCardBox.width),
    `reversed card width (${reversedCardBox.width}) vs upright card width (${uprightCardBox.width})`,
  ).toBeLessThanOrEqual(pxTolerance);
  expect(
    Math.abs(reversedCardBox.height - uprightCardBox.height),
    `reversed card height (${reversedCardBox.height}) vs upright card height (${uprightCardBox.height})`,
  ).toBeLessThanOrEqual(pxTolerance);

  // The art itself must never exceed its own card's bounds.
  expect(
    reversedArtBox.width,
    `reversed art width (${reversedArtBox.width}) vs its own card width (${reversedCardBox.width})`,
  ).toBeLessThanOrEqual(reversedCardBox.width);

  // And it must match the upright card's art size — the actual regression
  // signature. Before the fix this was off by ~29% (235px art in a 220px
  // card whose upright sibling's art was 182px); 2px comfortably covers
  // rounding while decisively failing that.
  expect(
    Math.abs(reversedArtBox.width - uprightArtBox.width),
    `reversed art width (${reversedArtBox.width}) vs upright art width (${uprightArtBox.width})`,
  ).toBeLessThanOrEqual(pxTolerance);
  expect(
    Math.abs(reversedArtBox.height - uprightArtBox.height),
    `reversed art height (${reversedArtBox.height}) vs upright art height (${uprightArtBox.height})`,
  ).toBeLessThanOrEqual(pxTolerance);
});
