import { describe, expect, it } from "vitest";
import { createPrediction } from "@/server/oracle/narrator";

describe("createPrediction", () => {
  it("returns template prediction when no AI key is configured", async () => {
    const result = await createPrediction({
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
    });

    expect(result.headline).toContain("Усьвинские Столбы");
    expect(result.cardReadings).toHaveLength(3);
    expect(result.summary).toContain("Пермский край");
  });
});
