import { expect, test } from "@playwright/test";
import { pickFutureDateRange } from "./helpers";

// Geometry of a face-down card, measured in a real browser.
//
// This spec began as regression coverage for two 2026-08-09 findings: the
// back rendered as a stretched rectangle instead of a card shape, and its
// box was ~8px larger than the face's on every edge (back's `inset:0`
// resolved against .tarot-card's un-padded padding box while face's
// `width:100%; height:100%` resolved against its padded content box), so a
// hairline of crosshatch showed around every revealed card.
//
// The first of those was fixed by pinning the back to 100/172 and centring
// it in the taller card box, and this test asserted that ratio. That fix
// was later reversed deliberately, and the reversal is what this file now
// asserts: a centred 100/172 back leaves a strip of card above and below it,
// and `.back`'s own 1px gold border drew a full rectangle 56px inside the
// card's own gold border -- a frame inside a frame. Invisible while the
// cards were small; the first thing the eye caught once they were enlarged
// (measured: a 188x432 card holding a 186x320 back).
//
// So the back is now the card's own footprint. The containment check below
// is unchanged in spirit and still fails hard on the original 8px bleed --
// it is simply tightened from "inside the face" to "the same box as the
// face", which is the stronger statement the current CSS makes.
//
// Neither is catchable by the existing suite: Vitest's component test
// (tests/components/tarot-card-view.test.tsx) runs in jsdom, which has no
// layout engine, so `getBoundingClientRect()` is always zeros there. The
// existing e2e coverage (ritual-flow.spec.ts) only asserts `toBeVisible()`
// on text nodes, which doesn't measure geometry at all. This spec renders
// the real app in a real browser and measures the actual boxes.
test("a face-down card is exactly the card's own box, and never shows around the face", async ({ page }) => {
  await page.route("**/api/ritual", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ritualId: "demo",
        seed: "москва|2026-09-10|2026-09-17|2",
        spreadCards: [
          {
            id: "tower", name: "Башня", position: "Зов",
            meaning: "камень, высота и резкая перемена взгляда",
            archetypes: ["cliffs"],
          },
          {
            id: "chariot", name: "Колесница", position: "Путь",
            // Deliberately long: this is the content that pushed the outer
            // .tarot-card taller than 100/172 in the first place (see
            // TarotCardView's figcaption). Kept here so this test also
            // exercises the widest realistic case, not just a short label.
            meaning: "путь складывается через движение и смену горизонта, а дорога проверяется заново на каждой остановке",
            archetypes: ["road"],
          },
          {
            id: "hermit", name: "Отшельник", position: "Дар маршрута",
            meaning: "тишина открывает дорогу к самому себе",
            archetypes: ["solitude"],
          },
        ],
        destination: { name: "Усьвинские Столбы", region: "Пермский край" },
        prediction: {
          headline: "Карты указывают на Усьвинские Столбы",
          opening: "Башня зовет к камню.",
          summary: "Дорога подтверждается Туту.",
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
  // measuring. toHaveCount(3) only proves the nodes exist, not that their
  // entrance animation (which includes rotateX/rotateZ -- see @keyframes
  // card-reveal) has finished; a box measured mid-rotation is foreshortened
  // and reads a smaller ratio/width than the settled shape. This test never
  // needed the wait before Task 11 (pure luck in the margin between DOM
  // commit and the boundingBox() calls below), but Task 11's dealing scene
  // (RitualScene) now loads two real tarot card images during the pre
  // -reveal wait, and that extra decode/render load reliably eats the
  // margin this test was quietly depending on.
  //
  // Worst case is the third card ("Путь"): its own turn only starts once
  // two stagger gaps (2 x 800ms) plus its own extra hold (260ms) have
  // elapsed -- see --card-stagger/--card-extra-hold in globals.css -- and
  // its turn itself runs --card-turn-duration (760ms, longer than the
  // other two cards' 640ms -- the third card's own extra weight). 2 * 800
  // + 260 + 760 = 2620ms until that card's own rotateX/rotateZ has fully
  // settled; padded to 3000ms for real-browser paint/layout margin.
  await page.waitForTimeout(3000);

  for (let i = 0; i < 3; i += 1) {
    const card = cards.nth(i);
    const back = card.locator(".tarot-card__back");
    const face = card.locator(".tarot-card__face");

    const backBox = await back.boundingBox();
    const faceBox = await face.boundingBox();
    if (!backBox || !faceBox) {
      throw new Error(`card ${i}: back or face has no layout box`);
    }

    const cardBox = await card.boundingBox();
    if (!cardBox) throw new Error(`card ${i}: card has no layout box`);

    // The back is the card's footprint, nothing smaller. A back that is
    // shorter than its card leaves a strip of card showing above and below
    // it, and `.back`'s own border then draws a second frame inside the
    // card's -- the defect this replaced the old ratio assertion for.
    // Tolerance covers the 1px border and sub-pixel rounding.
    const tolerance = 2.5; // px
    expect(
      Math.abs(backBox.width - cardBox.width),
      `card ${i}: back width ${backBox.width} vs card width ${cardBox.width}`,
    ).toBeLessThanOrEqual(tolerance);
    expect(
      Math.abs(backBox.height - cardBox.height),
      `card ${i}: back height ${backBox.height} vs card height ${cardBox.height}`,
    ).toBeLessThanOrEqual(tolerance);

    // The original 8px-bleed bug: no back pixel may show around a revealed
    // card. Containment rather than equality, because the face is not always
    // the same box as the back -- on a narrow phone a long meaning's
    // min-content width pushes .tarot-card__face wider than its own card
    // (measured 120.5 against a 115px card on Pixel 5) and it is clipped by
    // .tarot-card's `overflow: hidden`. That overflow is pre-existing and
    // invisible; asserting equality here would fail on it while proving
    // nothing about the bleed this test exists for.
    expect(backBox.x, `card ${i}: back.x vs face.x`).toBeGreaterThanOrEqual(faceBox.x - tolerance);
    expect(backBox.y, `card ${i}: back.y vs face.y`).toBeGreaterThanOrEqual(faceBox.y - tolerance);
    expect(backBox.x + backBox.width, `card ${i}: right edges`).toBeLessThanOrEqual(
      faceBox.x + faceBox.width + tolerance,
    );
    expect(backBox.y + backBox.height, `card ${i}: bottom edges`).toBeLessThanOrEqual(
      faceBox.y + faceBox.height + tolerance,
    );
  }
});
