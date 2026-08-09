import { describe, expect, it, vi } from "vitest";
import type { PredictionInput } from "@/server/oracle/narrator";
import { createPrediction } from "@/server/oracle/narrator";

function createInput(overrides: Partial<PredictionInput> = {}): PredictionInput {
  return {
    intent: {
      departureCity: "Москва",
      dateFrom: "2026-09-10",
      dateTo: "2026-09-17",
      travelerCount: 2,
    },
    spread: {
      seed: "москва|2026-09-10|2026-09-17|2",
      cards: [
        {
          id: "tower",
          number: 16,
          name: "Башня",
          image: "/tarot/16-tower.webp",
          archetypes: ["cliffs"],
          transport: ["avia"],
          meaning: "камень и высота",
          meaningReversed: "обвал случился раньше, теперь строят заново",
          position: "Зов",
          reversed: false,
        },
        {
          id: "chariot",
          number: 7,
          name: "Колесница",
          image: "/tarot/07-chariot.webp",
          archetypes: ["road"],
          transport: ["avia"],
          meaning: "дорога",
          meaningReversed: "рывок не выходит, дорога сопротивляется",
          position: "Дар",
          reversed: false,
        },
        {
          id: "hermit",
          number: 9,
          name: "Отшельник",
          image: "/tarot/09-hermit.webp",
          archetypes: ["solitude"],
          transport: ["railway"],
          meaning: "тишина",
          meaningReversed: "одиночество тяготит, нужен попутчик",
          position: "Путь",
          reversed: false,
        },
      ],
    },
    selection: {
      score: 10,
      reasons: ["matched archetype cliffs"],
      destination: {
        id: "usvinskie-stolby",
        name: "Усьвинские Столбы",
        region: "Пермский край",
        routeTitle: "Каменная дорога",
        anchorPlace: "Усьвинские Столбы",
        nearestTransportHub: "Пермь",
        hotelSearchCity: "Пермь",
        tags: ["cliffs"],
        season: ["autumn"],
        mood: ["dramatic"],
        tarotArchetypes: ["cliffs", "road"],
        source: "fallback",
        sourceUrl: "https://ru.wikipedia.org/wiki/Усьвинские_Столбы",
        oracleHook: "Каменные столбы обещают путь к тишине.",
      },
    },
    roadChoice: {
      mode: "railway",
      reason: "«Отшельник» сажает к окну — дорога будет долгой и созерцательной.",
      best: null,
    },
    offers: { transport: [], hotels: [] },
    aiApiKey: undefined,
    ...overrides,
  };
}

function mockAiText(outputText: string) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ output_text: outputText }),
  }));
}

describe("createPrediction", () => {
  it("returns template prediction when no AI key is configured", async () => {
    const result = await createPrediction(createInput());

    expect(result.headline).toBe("Карты указывают: Усьвинские Столбы");
    expect(result.cardReadings).toHaveLength(3);
    expect(result.summary).toContain("Пермский край");
  });

  it("accepts a valid flavor key while app data supplies the route", async () => {
    mockAiText("stone_silence");

    const result = await createPrediction(createInput({ aiApiKey: "test-key" }));

    expect(result.headline).toBe("Карты указывают: Усьвинские Столбы");
    expect(result.opening).toContain("Камень и тишина собирают маршрут в один ясный знак.");
  });

  it("ignores free text with a lowercase alternate destination", async () => {
    mockAiText("сочи зовет сильнее, чем выбранный маршрут");

    const result = await createPrediction(createInput({ aiApiKey: "test-key" }));

    expect(result.headline).toBe("Карты указывают: Усьвинские Столбы");
    expect(result.opening).not.toContain("сочи");
  });

  it("ignores free text with a Latin alternate destination", async () => {
    mockAiText("Sochi is the better destination");

    const result = await createPrediction(createInput({ aiApiKey: "test-key" }));

    expect(result.headline).toBe("Карты указывают: Усьвинские Столбы");
    expect(result.opening).not.toContain("Sochi");
  });

  it("falls back when AI narration names a different known destination", async () => {
    mockAiText("Териберка станет вашим следующим местом силы.");

    const result = await createPrediction(createInput({ aiApiKey: "test-key" }));

    expect(result.opening).toContain("каменная дорога");
    expect(result.opening).not.toContain("Териберка");
  });

  it("falls back when AI narration does not name the selected destination", async () => {
    mockAiText("Вас ждет впечатляющая каменная дорога.");

    const result = await createPrediction(createInput({ aiApiKey: "test-key" }));

    expect(result.opening).toContain("каменная дорога");
  });

  it("never puts a raw URL in the summary", async () => {
    const result = await createPrediction(createInput());

    // The summary must stay source-aware without depending on a URL being
    // present: raw links belong to the dedicated proof-links block
    // (RitualResult.sourceLinks / TravelResult's .proof-links), not the
    // oracle's prose. A bare URL here also caused a 2026-08-09 mobile
    // horizontal-overflow bug (see .prediction-panel's overflow-wrap in
    // globals.css for the CSS-side half of that fix).
    expect(result.summary).not.toContain("http");
    expect(result.summary).not.toContain(createInput().selection.destination.sourceUrl);
  });

  it("does not claim Tutu confirmation for a fallback destination", async () => {
    const result = await createPrediction(createInput());

    // "fallback" sources (e.g. Wikipedia here) are not Tutu data at all —
    // claiming confirmation would regress a distinction earlier work
    // deliberately hardened (see runRitual's sourceLinks label, which only
    // grants "Проверенный маршрут Туту" to provereno.tutu destinations).
    expect(result.summary).toContain("Маршрут собран из открытых источников.");
    expect(result.summary).toContain("Пермский край");
    expect(result.summary).toContain("Пермь");
    expect(result.summary).not.toContain("подтверждён");
    expect(result.summary).not.toContain("Проверенный");
  });

  it("claims Tutu confirmation for a provereno.tutu destination", async () => {
    const baseInput = createInput();
    const result = await createPrediction({
      ...baseInput,
      selection: {
        ...baseInput.selection,
        destination: {
          ...baseInput.selection.destination,
          source: "provereno.tutu",
          sourceUrl: "https://provereno.tutu.ru/example",
        },
      },
    });

    expect(result.summary).toContain("Маршрут подтверждён проверенными маршрутами Туту.");
  });

  it("credits Tutu's own geo guide without claiming the verified tier", async () => {
    const baseInput = createInput();
    const result = await createPrediction({
      ...baseInput,
      selection: {
        ...baseInput.selection,
        destination: {
          ...baseInput.selection.destination,
          source: "geo.tutu",
          sourceUrl: "https://www.tutu.ru/geo/example",
        },
      },
    });

    expect(result.summary).toContain("Маршрут собран по путеводителю Туту.");
    expect(result.summary).not.toContain("подтверждён");
  });

  it("appends the road choice's reason to the summary without exposing it to the AI prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: "stone_silence" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createPrediction(createInput({ aiApiKey: "test-key" }));

    expect(result.summary).toContain("«Отшельник» сажает к окну — дорога будет долгой и созерцательной.");
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const userMessage = JSON.parse(requestBody.input[1].content);
    expect(userMessage).not.toHaveProperty("roadChoice");
  });

  it("falls back to the fog reason when no road exists", async () => {
    const result = await createPrediction(
      createInput({ roadChoice: { mode: null, reason: "Дорога скрыта туманом: карты не увидели ни одного пути.", best: null } }),
    );

    expect(result.summary).toContain("туманом");
  });
});
