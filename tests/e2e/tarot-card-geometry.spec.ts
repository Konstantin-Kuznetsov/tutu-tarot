import { expect, test } from "@playwright/test";

// Regression coverage for a 2026-08-09 review finding: `.tarot-card__back`'s
// `aspect-ratio: 100/172` was dead CSS (both dimensions were already forced
// definite by `width:100%; height:100%; inset:0`), so a face-down card
// rendered as a stretched rectangle (measured ~150x345, ratio 2.3) instead
// of the design's card shape (100/172 ≈ 1.72). A second, related bug: the
// back's box was ~8px larger than the face's box on every edge (back's
// `inset:0` resolved against .tarot-card's un-padded padding box, while
// face's `width:100%; height:100%` resolved against its padded content
// box), so a dark-purple hairline of the crosshatch pattern showed around
// every revealed card.
//
// Neither is catchable by the existing suite: Vitest's component test
// (tests/components/tarot-card-view.test.tsx) runs in jsdom, which has no
// layout engine, so `getBoundingClientRect()` is always zeros there. The
// existing e2e coverage (ritual-flow.spec.ts) only asserts `toBeVisible()`
// on text nodes, which doesn't measure geometry at all. This spec renders
// the real app in a real browser and measures the actual boxes.
test("a face-down card renders at 100/172, and the revealed face fully covers the back", async ({ page }) => {
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
  await page.getByLabel("Дата начала").fill("2026-09-10");
  await page.getByLabel("Дата конца").fill("2026-09-17");
  await page.getByLabel("Путешественники").fill("2");
  await page.getByRole("button", { name: "Начать расклад" }).click();

  const cards = page.getByTestId("spread-card");
  await expect(cards).toHaveCount(3);

  for (let i = 0; i < 3; i += 1) {
    const card = cards.nth(i);
    const back = card.locator(".tarot-card__back");
    const face = card.locator(".tarot-card__face");

    const backBox = await back.boundingBox();
    const faceBox = await face.boundingBox();
    if (!backBox || !faceBox) {
      throw new Error(`card ${i}: back or face has no layout box`);
    }

    // Critical bug: the back must actually render at the design's card
    // ratio (100/172 ≈ 1.72), not inherit .tarot-card's own taller,
    // caption-driven ratio (~2.3). Tolerance of 0.05 comfortably covers
    // real sub-pixel/border rounding (observed up to ~0.03 off in manual
    // measurement) while decisively failing the old ~2.3 ratio.
    const backRatio = backBox.height / backBox.width;
    expect(backRatio, `card ${i}: back ratio (${backRatio})`).toBeCloseTo(172 / 100, 1);

    // Important bug: no back pixels may be visible around a revealed card
    // — the back's box must not extend past the face's box on any edge.
    // (The fixed implementation centers a shorter, correctly-ratioed back
    // inside the taller face box that the caption needs, so this is a
    // containment check rather than exact equality — but it still fails
    // hard on the original bug, where back was ~8px *larger* than face on
    // every side.)
    const tolerance = 1.5; // px, sub-pixel layout rounding
    expect(backBox.x, `card ${i}: back.x vs face.x`).toBeGreaterThanOrEqual(faceBox.x - tolerance);
    expect(backBox.y, `card ${i}: back.y vs face.y`).toBeGreaterThanOrEqual(faceBox.y - tolerance);
    expect(backBox.x + backBox.width, `card ${i}: back right edge vs face right edge`).toBeLessThanOrEqual(
      faceBox.x + faceBox.width + tolerance,
    );
    expect(backBox.y + backBox.height, `card ${i}: back bottom edge vs face bottom edge`).toBeLessThanOrEqual(
      faceBox.y + faceBox.height + tolerance,
    );
  }
});
