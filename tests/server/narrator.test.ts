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
    aiApiKey: undefined,
    ...overrides,
  };
}

const VALID_NARRATION = {
  cardReadings: [
    { id: "tower", text: "Башня рушит старые стены, чтобы освободить дорогу к каменным столбам и тишине." },
    { id: "chariot", text: "Колесница подгоняет решимость, и путь на Урал начинает складываться сам собой." },
    { id: "hermit", text: "Отшельник зовёт к тишине, где скалы Усьвы становятся единственным собеседником." },
  ],
  closingLine: "Дорога уже начертана картами — остаётся только выйти из дома.",
};

// The real chat-completions wire shape (`choices[0].message.content`) --
// the default envelope aiClient.ts speaks, since most corporate gateways
// expose an OpenAI-compatible chat-completions endpoint.
function mockChatCompletion(content: string) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      id: "chatcmpl_123",
      object: "chat.completion",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// The `/v1/responses`-style envelope (`output[0].content[0].text`) some
// gateways speak instead -- aiClient.ts's extractMessageText must handle
// both shapes without knowing in advance which one AI_BASE_URL points at.
function mockResponsesEnvelope(text: string) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      id: "resp_123",
      object: "response",
      output: [
        {
          type: "message",
          id: "msg_123",
          status: "completed",
          role: "assistant",
          content: [{ type: "output_text", text, annotations: [] }],
        },
      ],
    }),
  }));
}

describe("createPrediction", () => {
  it("returns template prediction when no AI key is configured", async () => {
    const result = await createPrediction(createInput());

    expect(result.headline).toBe("Карты указывают: Усьвинские Столбы");
    expect(result.cardReadings).toHaveLength(3);
    expect(result.summary).toContain("Пермский край");
  });

  // The product's safety net: whatever createPrediction returns with no AI
  // configured today must never change shape or content out from under a
  // demo. Full deep equality (not just a few field checks) so any
  // accidental new field, renamed key, or altered copy fails loudly here.
  it("is byte-identical to the template prediction with no AI configured", async () => {
    const result = await createPrediction(createInput());

    expect(result).toEqual({
      headline: "Карты указывают: Усьвинские Столбы",
      opening:
        "Карты раскрывают путь из города Москва: Усьвинские Столбы, где каменная дорога. Каменные столбы обещают путь к тишине.",
      cardReadings: [
        {
          position: "Зов",
          cardName: "Башня",
          text: "Башня в позиции «Зов» говорит: камень и высота. Поэтому Усьвинские Столбы становится главным знаком расклада.",
        },
        {
          position: "Дар",
          cardName: "Колесница",
          text: "Колесница в позиции «Дар» говорит: дорога. Поэтому Усьвинские Столбы становится главным знаком расклада.",
        },
        {
          position: "Путь",
          cardName: "Отшельник",
          text: "Отшельник в позиции «Путь» говорит: тишина. Поэтому Усьвинские Столбы становится главным знаком расклада.",
        },
      ],
      summary:
        "Маршрут указывает путь: Пермский край. Маршрут собран из открытых источников. Практическая часть маршрута: центр — Пермь. «Отшельник» сажает к окну — дорога будет долгой и созерцательной.",
    });
    // No closingLine key at all on the template path -- not even undefined
    // -- which is what keeps this object identical to the pre-AI shape.
    expect(Object.hasOwn(result, "closingLine")).toBe(false);
  });

  it("renders the AI's card readings and closing line while keeping the app-authored headline, opening and summary", async () => {
    mockChatCompletion(JSON.stringify(VALID_NARRATION));

    const result = await createPrediction(createInput({ aiApiKey: "test-key" }));

    expect(result.headline).toBe("Карты указывают: Усьвинские Столбы");
    expect(result.opening).toBe(
      "Карты раскрывают путь из города Москва: Усьвинские Столбы, где каменная дорога. Каменные столбы обещают путь к тишине.",
    );
    expect(result.summary).toContain("Пермский край");
    expect(result.closingLine).toBe(VALID_NARRATION.closingLine);
    expect(result.cardReadings).toEqual([
      { position: "Зов", cardName: "Башня", text: VALID_NARRATION.cardReadings[0].text },
      { position: "Дар", cardName: "Колесница", text: VALID_NARRATION.cardReadings[1].text },
      { position: "Путь", cardName: "Отшельник", text: VALID_NARRATION.cardReadings[2].text },
    ]);
  });

  it("reads the narration from the /v1/responses-style wire shape (output[0].content[0].text) too", async () => {
    mockResponsesEnvelope(JSON.stringify(VALID_NARRATION));

    const result = await createPrediction(createInput({ aiApiKey: "test-key" }));

    expect(result.closingLine).toBe(VALID_NARRATION.closingLine);
    expect(result.cardReadings[0].text).toBe(VALID_NARRATION.cardReadings[0].text);
  });

  it("falls back to the template when the gateway response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

    const result = await createPrediction(createInput({ aiApiKey: "test-key" }));

    expect(result.headline).toBe("Карты указывают: Усьвинские Столбы");
    expect(result.closingLine).toBeUndefined();
    expect(result.cardReadings[0].text).toContain("камень и высота");
  });

  it("falls back to the template when the network call throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await createPrediction(createInput({ aiApiKey: "test-key" }));

    expect(result.headline).toBe("Карты указывают: Усьвинские Столбы");
    expect(result.closingLine).toBeUndefined();
  });

  it("falls back to the template when the model's JSON fails validateNarration (e.g. naming another destination)", async () => {
    mockChatCompletion(
      JSON.stringify({
        cardReadings: [
          { id: "tower", text: "Карты почти указали на Суздаль, но что-то пошло другим путём совсем." },
          ...VALID_NARRATION.cardReadings.slice(1),
        ],
        closingLine: VALID_NARRATION.closingLine,
      }),
    );

    const result = await createPrediction(createInput({ aiApiKey: "test-key" }));

    expect(result.headline).toBe("Карты указывают: Усьвинские Столбы");
    expect(result.opening).not.toContain("Суздаль");
    expect(result.summary).not.toContain("Суздаль");
    expect(result.closingLine).toBeUndefined();
  });

  it("falls back to the template when the model returns free text instead of JSON", async () => {
    mockChatCompletion("Башня говорит о переменах. Колесница ведёт вперёд. Отшельник хранит тишину.");

    const result = await createPrediction(createInput({ aiApiKey: "test-key" }));

    expect(result.headline).toBe("Карты указывают: Усьвинские Столбы");
    expect(result.closingLine).toBeUndefined();
  });

  it("gives the AI request its own abort signal so a slow provider cannot exhaust the route's time budget", async () => {
    const fetchMock = mockChatCompletion(JSON.stringify(VALID_NARRATION));

    await createPrediction(createInput({ aiApiKey: "test-key" }));

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends the model only the three cards with orientations and the destination name and region -- nothing else", async () => {
    const fetchMock = mockChatCompletion(JSON.stringify(VALID_NARRATION));

    await createPrediction(createInput({ aiApiKey: "test-key" }));

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const userMessage = JSON.parse(requestBody.messages[1].content);

    expect(userMessage).toEqual({
      cards: [
        { id: "tower", name: "Башня", position: "Зов", reversed: false },
        { id: "chariot", name: "Колесница", position: "Дар", reversed: false },
        { id: "hermit", name: "Отшельник", position: "Путь", reversed: false },
      ],
      destination: { name: "Усьвинские Столбы", region: "Пермский край" },
    });
    // No offers, no traveler count, no other atlas entries, no road choice.
    expect(userMessage).not.toHaveProperty("offers");
    expect(userMessage).not.toHaveProperty("roadChoice");
    expect(userMessage).not.toHaveProperty("travelerCount");
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

  // Regression: 13 of 21 atlas entries have nearestTransportHub ===
  // hotelSearchCity (this fixture's "Пермь"/"Пермь" among them), which used
  // to produce "основное направление — Пермь, остановка в городе Пермь" —
  // the same city named twice in the first paragraph a jury reads, for most
  // destinations, not an edge case.
  it("names the city once, not twice, when the transport hub and hotel city are the same place", async () => {
    const result = await createPrediction(createInput());

    const mentions = result.summary.split("Пермь").length - 1;
    expect(mentions).toBe(1);
    expect(result.summary).not.toContain("остановка в городе");
  });

  it("still names both cities when the transport hub differs from the hotel city", async () => {
    const baseInput = createInput();
    const result = await createPrediction({
      ...baseInput,
      selection: {
        ...baseInput.selection,
        destination: {
          ...baseInput.selection.destination,
          nearestTransportHub: "Владимир",
          hotelSearchCity: "Суздаль",
        },
      },
    });

    expect(result.summary).toContain("Владимир");
    expect(result.summary).toContain("Суздаль");
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
    const fetchMock = mockChatCompletion(JSON.stringify(VALID_NARRATION));

    const result = await createPrediction(createInput({ aiApiKey: "test-key" }));

    expect(result.summary).toContain("«Отшельник» сажает к окну — дорога будет долгой и созерцательной.");
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const userMessage = JSON.parse(requestBody.messages[1].content);
    expect(userMessage).not.toHaveProperty("roadChoice");
  });

  it("falls back to the fog reason when no road exists", async () => {
    const result = await createPrediction(
      createInput({ roadChoice: { mode: null, reason: "Дорога скрыта туманом: карты не увидели ни одного пути.", best: null } }),
    );

    expect(result.summary).toContain("туманом");
  });
});
