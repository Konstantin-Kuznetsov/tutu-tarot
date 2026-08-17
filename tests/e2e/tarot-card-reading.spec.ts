import { expect, test } from "@playwright/test";
import { pickFutureDateRange } from "./helpers";

// Regression coverage for the defect this task fixes: PredictionText.
// cardReadings was produced (template and AI alike) and shipped to the
// browser, but TarotCardView never rendered it -- the page always showed
// the deck's own short `card.meaning` string instead. The fix renders the
// reading as a sibling paragraph after the card figure (`.tarot-card-
// reading`), deliberately outside `.tarot-card`'s pinned-aspect-ratio,
// `overflow: hidden` box (see TarotCardView's own comment on why): that box
// was sized for the deck's short meaning phrases, not a written reading up
// to 400 characters long (see MAX_TEXT_LENGTH in validate.ts). Putting a
// reading that long inside the fixed box is exactly the class of bug a
// previous round already had to fix, where overflowing caption content got
// clipped out of view entirely (see tarot-card-reversed.spec.ts).
//
// This spec renders the real app at 375px -- the narrowest width the
// product supports -- with realistic, near-maximum-length Russian readings
// and measures the actual boxes: no reading may push its card wider than
// the card's own shell, and the page itself must not scroll horizontally.
test.use({ viewport: { width: 375, height: 812 } });

const READINGS = {
  tower:
    "Башня рушит старые стены ровно в тот миг, когда путешествие кажется слишком предсказуемым, и это освобождение, а не потеря. Дорога открывается там, где раньше стояла крепкая, но тесная стена привычного маршрута — и Усьвинские Столбы становятся первым знаком.",
  moon:
    "Луна ведёт сквозь туман ночной дороги, где привычные ориентиры смазаны, а тревога — лишь спутник, а не хозяин пути. Довериться этой неясности значит увидеть то, что днём остаётся скрытым за суетой обычных маршрутов и расписаний.",
  hermit:
    "Отшельник зовёт к тишине высокого места, куда редко доходит случайный попутчик. Одиночество здесь не потеря общества, а способ услышать дорогу яснее, чем в шуме людных вокзалов и переполненных вагонов, спешащих совсем в другую сторону.",
} as const;

const CLOSING_LINE =
  "Дорога уже начертана картами — остаётся только выйти из дома и позволить Усьвинским Столбам случиться.";

test("no card's reading escapes its card box, and the page has no horizontal overflow at 375px", async ({ page }) => {
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
            meaning: "камень, высота и резкая перемена взгляда",
            meaningReversed: "обвал случился раньше, теперь строят заново",
          },
          {
            id: "moon", number: 18, name: "Луна", image: "/tarot/18-moon.webp", position: "Дар",
            reversed: true, archetypes: ["north", "water"], transport: ["railway"],
            meaning: "ночная дорога, туман и то, что видно только впотьмах",
            meaningReversed: "туман рассеивается, страх был напрасным",
          },
          {
            id: "hermit", number: 9, name: "Отшельник", image: "/tarot/09-hermit.webp", position: "Путь",
            reversed: false, archetypes: ["solitude"], transport: ["railway"],
            meaning: "дорога к тишине и высокому месту",
            meaningReversed: "одиночество тяготит, нужен попутчик",
          },
        ],
        destination: { name: "Усьвинские Столбы", region: "Пермский край" },
        prediction: {
          headline: "Карты указывают на Усьвинские Столбы",
          opening: "Башня зовет к камню.",
          summary: "Маршрут собран по путеводителю Туту.",
          // Deliberately out of spreadCards order -- proves the render
          // path matches by id, not by array position, same as the
          // component-level test in travel-result.test.tsx.
          cardReadings: [
            { id: "hermit", position: "Путь", cardName: "Отшельник", text: READINGS.hermit },
            { id: "tower", position: "Зов", cardName: "Башня", text: READINGS.tower },
            { id: "moon", position: "Дар", cardName: "Луна", text: READINGS.moon },
          ],
          closingLine: CLOSING_LINE,
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

  // Let .spread-card-shell's own card-reveal animation settle before the
  // geometry checks below -- see tarot-card-geometry.spec.ts for the full
  // --card-stagger/--card-turn-duration math. This test's own geometry
  // check (the reading paragraph's box vs its shell's box) is looser than
  // that one: `.tarot-card-reading` is a sibling of `.tarot-card`, not a
  // descendant, so it never inherits the card's own rotateX/rotateZ turn --
  // its own reveal (see globals.css) is a translateY-only rise, which can't
  // move its horizontal extent. 1500ms comfortably covers every card's
  // meaning-beat fade (the last of the three within-card beats) without
  // needing the third card's own extra-held turn to fully finish.
  await page.waitForTimeout(1500);

  // The readings themselves must actually be on screen -- not the deck's
  // own stock meaning, which the fix replaces them with.
  for (const text of Object.values(READINGS)) {
    await expect(page.getByText(text)).toBeVisible();
  }
  await expect(page.getByText("камень, высота и резкая перемена взгляда")).toHaveCount(0);
  await expect(page.getByText("ночная дорога, туман и то, что видно только впотьмах")).toHaveCount(0);
  await expect(page.getByText("дорога к тишине и высокому месту")).toHaveCount(0);

  // The coda after the spread.
  await expect(page.getByText(CLOSING_LINE)).toBeVisible();

  // No reading may render wider than its own card's shell -- proof that a
  // long reading wraps inside its column instead of escaping it sideways.
  const shells = page.locator(".spread-card-shell");
  await expect(shells).toHaveCount(3);
  for (let i = 0; i < 3; i += 1) {
    const shell = shells.nth(i);
    const shellBox = await shell.boundingBox();
    const readingBox = await shell.locator(".tarot-card-reading").boundingBox();
    if (!shellBox || !readingBox) {
      throw new Error(`card ${i}: shell or reading has no layout box`);
    }

    const tolerance = 1.5; // px, sub-pixel layout rounding
    expect(readingBox.x, `card ${i}: reading.x vs shell.x`).toBeGreaterThanOrEqual(shellBox.x - tolerance);
    expect(
      readingBox.x + readingBox.width,
      `card ${i}: reading right edge vs shell right edge`,
    ).toBeLessThanOrEqual(shellBox.x + shellBox.width + tolerance);
  }

  // And the page itself never scrolls sideways, the same check
  // ritual-flow.spec.ts's own overflow regression test uses.
  const hasNoHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  expect(hasNoHorizontalOverflow).toBe(true);
});
