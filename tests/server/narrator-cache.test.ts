import { describe, expect, it, vi } from "vitest";
import type { PredictionInput } from "@/server/oracle/narrator";
import { createPrediction } from "@/server/oracle/narrator";

// A reading's identity is exactly its three cards (id + orientation, in the
// fixed Зов/Дар/Путь order) and the destination they point to -- see
// narrationCacheKeyParts in src/server/oracle/narrator.ts. This is the same
// identity a share code round-trips (src/domain/share/code.ts), and the
// whole point of caching: a shared link re-requests narration for this
// exact identity on every open (src/app/r/[code]/page.tsx re-runs the price
// search live, but decodes the same three cards and destination back out of
// the code every time), which is what turns a viral link into one paid
// model call per view without a cache.
const VALID_NARRATION = {
  cardReadings: [
    { id: "tower", text: "Башня рушит старые стены, чтобы освободить дорогу к каменным столбам и тишине." },
    { id: "chariot", text: "Колесница подгоняет решимость, и путь на Урал начинает складываться сам собой." },
    { id: "hermit", text: "Отшельник зовёт к тишине, где скалы Усьвы становятся единственным собеседником." },
  ],
  closingLine: "Дорога уже начертана картами — остаётся только выйти из дома.",
};

function mockChatCompletion(content: string, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    json: async () => ({
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function createInput(overrides: Partial<PredictionInput> = {}): PredictionInput {
  return {
    intent: { departureCity: "Москва", dateFrom: "2026-09-10", dateTo: "2026-09-17", travelerCount: 2 },
    spread: {
      seed: "москва|2026-09-10|2026-09-17|2",
      cards: [
        {
          id: "tower", number: 16, name: "Башня", image: "/tarot/16-tower.webp",
          archetypes: ["cliffs"], transport: ["avia"],
          meaning: "камень и высота", meaningReversed: "обвал случился раньше, теперь строят заново",
          position: "Зов", reversed: false,
        },
        {
          id: "chariot", number: 7, name: "Колесница", image: "/tarot/07-chariot.webp",
          archetypes: ["road"], transport: ["avia"],
          meaning: "дорога", meaningReversed: "рывок не выходит, дорога сопротивляется",
          position: "Дар", reversed: false,
        },
        {
          id: "hermit", number: 9, name: "Отшельник", image: "/tarot/09-hermit.webp",
          archetypes: ["solitude"], transport: ["railway"],
          meaning: "тишина", meaningReversed: "одиночество тяготит, нужен попутчик",
          position: "Путь", reversed: false,
        },
      ],
    },
    selection: {
      score: 10,
      reasons: [],
      destination: {
        id: "usvinskie-stolby",
        name: "Усьвинские Столбы",
        region: "Пермский край",
        routeTitle: "Каменная дорога",
        anchorPlace: "Усьвинские Столбы",
        nearestTransportHub: "Пермь",
        hotelSearchCity: "Пермь",
        tags: [],
        season: [],
        mood: [],
        tarotArchetypes: [],
        source: "fallback",
        sourceUrl: "https://ru.wikipedia.org/wiki/Усьвинские_Столбы",
        oracleHook: "Каменные столбы обещают путь к тишине.",
      },
    },
    roadChoice: { mode: "railway", reason: "«Отшельник» сажает к окну.", best: null },
    aiApiKey: "test-key",
    ...overrides,
  };
}

describe("createPrediction narration caching", () => {
  it("does not issue a second HTTP request to the model for a second call with the same reading identity", async () => {
    const fetchMock = mockChatCompletion(JSON.stringify(VALID_NARRATION));

    const first = await createPrediction(createInput());
    // Trip details differ (city, dates, travelers, road reason) -- only the
    // three cards and the destination stay the same -- proving the cache
    // keys on reading identity, not on the whole request.
    const second = await createPrediction(
      createInput({
        intent: { departureCity: "Казань", dateFrom: "2026-10-01", dateTo: "2026-10-05", travelerCount: 4 },
        roadChoice: { mode: "avia", reason: "другая причина, другой рейс.", best: null },
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.closingLine).toBe(first.closingLine);
    expect(second.cardReadings.map((reading) => reading.text)).toEqual(
      first.cardReadings.map((reading) => reading.text),
    );
    // Headline/opening/summary still reflect this call's own live input
    // (departure city, road reason) -- caching narration must not freeze
    // those app-authored fields too.
    expect(second.opening).toContain("Казань");
    expect(second.opening).not.toBe(first.opening);
  });

  it("issues a new HTTP request to the model for a different reading identity", async () => {
    const fetchMock = mockChatCompletion(JSON.stringify(VALID_NARRATION));

    await createPrediction(createInput());
    // A different destination id -- everything else about the request is
    // unchanged.
    await createPrediction(
      createInput({
        selection: {
          score: 10,
          reasons: [],
          destination: {
            id: "different-destination",
            name: "Суздаль",
            region: "Владимирская область",
            routeTitle: "Медовая дорога",
            anchorPlace: "Суздаль",
            nearestTransportHub: "Владимир",
            hotelSearchCity: "Суздаль",
            tags: [],
            season: [],
            mood: [],
            tarotArchetypes: [],
            source: "fallback",
            sourceUrl: "https://example.com/suzdal",
            oracleHook: "Медовые ряды зовут в дорогу.",
          },
        },
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("also issues a new HTTP request when only a card's orientation differs, same ids and destination", async () => {
    const fetchMock = mockChatCompletion(JSON.stringify(VALID_NARRATION));
    const baseInput = createInput();

    await createPrediction(baseInput);
    await createPrediction({
      ...baseInput,
      spread: {
        ...baseInput.spread,
        cards: baseInput.spread.cards.map((card) => (card.id === "hermit" ? { ...card, reversed: true } : card)),
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed narration, so the next call for the same identity retries the model", async () => {
    const fetchMock = mockChatCompletion("not json at all", true);

    const first = await createPrediction(createInput());
    const second = await createPrediction(createInput());

    // Both calls fell back to the template (invalid JSON never validates)...
    expect(first.closingLine).toBeUndefined();
    expect(second.closingLine).toBeUndefined();
    // ...but the failure itself was never cached, so the model was asked
    // again rather than the app being permanently stuck on the template for
    // this reading.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
