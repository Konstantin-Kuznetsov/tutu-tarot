import { describe, expect, it } from "vitest";
import { validateNarration, type NarrationContext } from "@/server/oracle/validate";

// Fixture mirrors a real draw: three drawn card ids and the destination the
// deterministic scorer already chose (see selectDestination in
// domain/travel/scoring.ts). validateNarration never sees anything beyond
// this -- no other atlas entries, no offer data -- so tests build only what
// the function actually receives.
const CARD_IDS = ["tower", "chariot", "hermit"];
const DESTINATION_NAME = "Усьвинские Столбы";

function context(overrides: Partial<NarrationContext> = {}): NarrationContext {
  return { cardIds: CARD_IDS, destinationName: DESTINATION_NAME, ...overrides };
}

function validPayload(overrides: {
  cardReadings?: Array<{ id: string; text: string }>;
  closingLine?: string;
} = {}) {
  return {
    cardReadings: overrides.cardReadings ?? [
      { id: "tower", text: "Башня рушит старые стены, чтобы освободить дорогу к каменным столбам и тишине." },
      { id: "chariot", text: "Колесница подгоняет решимость, и путь на Урал начинает складываться сам собой." },
      { id: "hermit", text: "Отшельник зовёт к тишине, где скалы Усьвы становятся единственным собеседником." },
    ],
    closingLine: overrides.closingLine ?? "Дорога уже начертана картами — остаётся только выйти из дома.",
  };
}

function raw(payload: unknown): string {
  return JSON.stringify(payload);
}

describe("validateNarration", () => {
  it("accepts a well-formed narration", () => {
    const result = validateNarration(raw(validPayload()), context());

    expect(result).not.toBeNull();
    expect(result?.cardReadings).toHaveLength(3);
    expect(result?.cardReadings.map((r) => r.id).sort()).toEqual(["chariot", "hermit", "tower"]);
    expect(result?.closingLine).toContain("Дорога уже начертана");
  });

  it("returns null when the output is not JSON", () => {
    expect(validateNarration("это не json { совсем", context())).toBeNull();
    expect(validateNarration("", context())).toBeNull();
  });

  it("returns null when the output is JSON but not an object", () => {
    expect(validateNarration(raw(["not", "an", "object"]), context())).toBeNull();
    expect(validateNarration(raw("just a string"), context())).toBeNull();
    expect(validateNarration(raw(42), context())).toBeNull();
    expect(validateNarration(raw(null), context())).toBeNull();
  });

  it("returns null when cardReadings length is not exactly 3", () => {
    const twoReadings = validPayload({
      cardReadings: [
        { id: "tower", text: "Башня рушит старые стены, чтобы освободить дорогу к каменным столбам и тишине." },
        { id: "chariot", text: "Колесница подгоняет решимость, и путь на Урал начинает складываться сам собой." },
      ],
    });
    expect(validateNarration(raw(twoReadings), context())).toBeNull();

    const fourReadings = validPayload({
      cardReadings: [
        ...validPayload().cardReadings,
        { id: "tower", text: "Ещё одна запись сверх положенных трёх карт расклада, лишняя целиком." },
      ],
    });
    expect(validateNarration(raw(fourReadings), context())).toBeNull();
  });

  it("returns null when a reading id is not one of the three ids that were sent, including a valid deck id that was not drawn", () => {
    // "empress" is a real Major Arcana id (src/domain/tarot/cards.ts) but it
    // was not one of the three cards drawn for this reading.
    const withUndrawnCard = validPayload({
      cardReadings: [
        { id: "empress", text: "Императрица говорит о плодородии и щедрости этой земли и её дорог." },
        { id: "chariot", text: "Колесница подгоняет решимость, и путь на Урал начинает складываться сам собой." },
        { id: "hermit", text: "Отшельник зовёт к тишине, где скалы Усьвы становятся единственным собеседником." },
      ],
    });
    expect(validateNarration(raw(withUndrawnCard), context())).toBeNull();
  });

  it("returns null when ids are correct but duplicated", () => {
    const duplicated = validPayload({
      cardReadings: [
        { id: "tower", text: "Башня рушит старые стены, чтобы освободить дорогу к каменным столбам и тишине." },
        { id: "tower", text: "Повтор той же карты вместо второй из трёх, которые были в раскладе." },
        { id: "hermit", text: "Отшельник зовёт к тишине, где скалы Усьвы становятся единственным собеседником." },
      ],
    });
    expect(validateNarration(raw(duplicated), context())).toBeNull();
  });

  it("returns null when a text is empty", () => {
    const empty = validPayload({
      cardReadings: [
        { id: "tower", text: "" },
        { id: "chariot", text: "Колесница подгоняет решимость, и путь на Урал начинает складываться сам собой." },
        { id: "hermit", text: "Отшельник зовёт к тишине, где скалы Усьвы становятся единственным собеседником." },
      ],
    });
    expect(validateNarration(raw(empty), context())).toBeNull();
  });

  it("returns null when a text is shorter than 20 characters", () => {
    const short = validPayload({
      cardReadings: [
        { id: "tower", text: "Слишком коротко." },
        { id: "chariot", text: "Колесница подгоняет решимость, и путь на Урал начинает складываться сам собой." },
        { id: "hermit", text: "Отшельник зовёт к тишине, где скалы Усьвы становятся единственным собеседником." },
      ],
    });
    expect(validateNarration(raw(short), context())).toBeNull();
  });

  it("returns null when a text is longer than 400 characters", () => {
    const long = validPayload({
      cardReadings: [
        { id: "tower", text: "Башня ".repeat(80) },
        { id: "chariot", text: "Колесница подгоняет решимость, и путь на Урал начинает складываться сам собой." },
        { id: "hermit", text: "Отшельник зовёт к тишине, где скалы Усьвы становятся единственным собеседником." },
      ],
    });
    expect(long.cardReadings[0].text.length).toBeGreaterThan(400);
    expect(validateNarration(raw(long), context())).toBeNull();
  });

  it("returns null when a text names a different travelAtlas destination, matched case-insensitively", () => {
    // "Суздаль" is a real travelAtlas entry (src/domain/travel/atlas.ts)
    // distinct from the chosen "Усьвинские Столбы". Written in the
    // nominative form as an appositive ("другое имя — Суздаль —") rather
    // than declined by a governing preposition: "case-insensitively" in the
    // spec means letter case, not Russian grammatical case, and a declined
    // form (e.g. genitive "Суздаля") would not literally contain the
    // nominative substring the checker matches against.
    const namesOtherDestination = validPayload({
      cardReadings: [
        { id: "tower", text: "Башня шепчет другое имя — Суздаль — но дорога снова возвращается сюда, к скалам." },
        { id: "chariot", text: "Колесница подгоняет решимость, и путь на Урал начинает складываться сам собой." },
        { id: "hermit", text: "Отшельник зовёт к тишине, где скалы Усьвы становятся единственным собеседником." },
      ],
    });
    expect(validateNarration(raw(namesOtherDestination), context())).toBeNull();

    const lowercaseVariant = validPayload({
      cardReadings: [
        { id: "tower", text: "Башня шепчет другое имя — суздаль — но дорога снова возвращается сюда, к скалам." },
        { id: "chariot", text: "Колесница подгоняет решимость, и путь на Урал начинает складываться сам собой." },
        { id: "hermit", text: "Отшельник зовёт к тишине, где скалы Усьвы становятся единственным собеседником." },
      ],
    });
    expect(validateNarration(raw(lowercaseVariant), context())).toBeNull();
  });

  it("does not reject the chosen destination's own name appearing in the text", () => {
    const mentionsChosen = validPayload({
      cardReadings: [
        { id: "tower", text: "Башня рушит старые стены, открывая путь к Усьвинским Столбам и тишине скал." },
        { id: "chariot", text: "Колесница подгоняет решимость, и путь на Урал начинает складываться сам собой." },
        { id: "hermit", text: "Отшельник зовёт к тишине, где скалы Усьвы становятся единственным собеседником." },
      ],
    });
    expect(validateNarration(raw(mentionsChosen), context())).not.toBeNull();
  });

  it("returns null when a text contains a URL or an http scheme", () => {
    const withUrl = validPayload({
      cardReadings: [
        { id: "tower", text: "Башня рушит старые стены, подробнее на https://example.com/route уже сейчас." },
        { id: "chariot", text: "Колесница подгоняет решимость, и путь на Урал начинает складываться сам собой." },
        { id: "hermit", text: "Отшельник зовёт к тишине, где скалы Усьвы становятся единственным собеседником." },
      ],
    });
    expect(validateNarration(raw(withUrl), context())).toBeNull();

    const bareHttp = validPayload({
      cardReadings: [
        { id: "tower", text: "Башня рушит старые стены, ссылка http://tutu.ru доступна для проверки маршрута." },
        { id: "chariot", text: "Колесница подгоняет решимость, и путь на Урал начинает складываться сам собой." },
        { id: "hermit", text: "Отшельник зовёт к тишине, где скалы Усьвы становятся единственным собеседником." },
      ],
    });
    expect(validateNarration(raw(bareHttp), context())).toBeNull();
  });

  it("returns null when a text is not predominantly Cyrillic (English answer)", () => {
    const english = validPayload({
      cardReadings: [
        { id: "tower", text: "The Tower breaks old walls and opens the road toward silence and stone." },
        { id: "chariot", text: "Колесница подгоняет решимость, и путь на Урал начинает складываться сам собой." },
        { id: "hermit", text: "Отшельник зовёт к тишине, где скалы Усьвы становятся единственным собеседником." },
      ],
    });
    expect(validateNarration(raw(english), context())).toBeNull();
  });

  it("returns null when a text is not predominantly Cyrillic (markup)", () => {
    const markup = validPayload({
      cardReadings: [
        { id: "tower", text: "<div class=\"card-reading\"><strong>Tower</strong> breaks old city walls today</div>" },
        { id: "chariot", text: "Колесница подгоняет решимость, и путь на Урал начинает складываться сам собой." },
        { id: "hermit", text: "Отшельник зовёт к тишине, где скалы Усьвы становятся единственным собеседником." },
      ],
    });
    expect(validateNarration(raw(markup), context())).toBeNull();
  });

  it("returns null when the closing line itself fails a content check", () => {
    const badClosing = validPayload({ closingLine: "short" });
    expect(validateNarration(raw(badClosing), context())).toBeNull();

    const closingWithUrl = validPayload({
      closingLine: "Дорога уже начертана картами, подробности на https://example.com прямо сейчас.",
    });
    expect(validateNarration(raw(closingWithUrl), context())).toBeNull();

    const closingNamesOther = validPayload({
      closingLine: "Карты почти указали на Суздаль, но дорога всё же ведёт в другое место совсем.",
    });
    expect(validateNarration(raw(closingNamesOther), context())).toBeNull();
  });

  it("never throws on malformed input", () => {
    expect(() => validateNarration("{}", context())).not.toThrow();
    expect(() => validateNarration("null", context())).not.toThrow();
    expect(() => validateNarration(raw({ cardReadings: "not-an-array" }), context())).not.toThrow();
    expect(() => validateNarration(raw({ cardReadings: [1, 2, 3] }), context())).not.toThrow();
    expect(() => validateNarration(raw({ cardReadings: [{ id: 1, text: 2 }, { id: 1, text: 2 }, { id: 1, text: 2 }] }), context())).not.toThrow();
  });
});
