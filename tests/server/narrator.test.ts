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
      archetypes: ["cliffs", "road"],
      cards: [
        { id: "tower", name: "Башня", position: "Зов", archetypes: ["cliffs"], meaning: "камень и высота" },
        { id: "chariot", name: "Колесница", position: "Путь", archetypes: ["road"], meaning: "дорога" },
        { id: "hermit", name: "Отшельник", position: "Дар маршрута", archetypes: ["solitude"], meaning: "тишина" },
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
      },
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

    expect(result.headline).toContain("Усьвинские Столбы");
    expect(result.cardReadings).toHaveLength(3);
    expect(result.summary).toContain("Пермский край");
  });

  it("accepts AI narration that names the selected destination", async () => {
    mockAiText("Усьвинские Столбы зовут в каменную дорогу над Пермским краем.");

    const result = await createPrediction(createInput({ aiApiKey: "test-key" }));

    expect(result.opening).toContain("Усьвинские Столбы");
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

  it("uses the actual source for fallback destinations in the summary", async () => {
    const result = await createPrediction(createInput());

    expect(result.summary).toContain("https://ru.wikipedia.org/wiki/Усьвинские_Столбы");
    expect(result.summary).not.toContain("подтверждается источниками Туту");
  });
});
