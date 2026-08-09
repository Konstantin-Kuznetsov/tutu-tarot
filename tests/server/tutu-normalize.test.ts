import { afterEach, describe, expect, it, vi } from "vitest";
import { searchTutuOffers } from "@/server/tutu/mcpClient";
import { normalizeHotelOffers, normalizeTransportOffers, readModesSummary } from "@/server/tutu/normalize";
import type { TravelAtlasItem, TripIntent } from "@/domain/types";

const intent: TripIntent = {
  departureCity: "Москва",
  dateFrom: "2026-09-10",
  dateTo: "2026-09-14",
  travelerCount: 2,
};

const destination: TravelAtlasItem = {
  id: "test-destination",
  name: "Тест",
  region: "Тестовый регион",
  routeTitle: "Тестовый маршрут",
  anchorPlace: "Тест",
  nearestTransportHub: "Пермь",
  hotelSearchCity: "Пермь",
  tags: [],
  season: [],
  mood: [],
  tarotArchetypes: [],
  source: "fallback",
  sourceUrl: "https://example.com",
  oracleHook: "Тестовый знак маршрута.",
};

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function contentResponse(payload: unknown): Response {
  return jsonResponse({
    jsonrpc: "2.0",
    result: { content: [{ type: "text", text: JSON.stringify(payload) }] },
  });
}

function sseResponse(events: unknown[], contentType = "text/event-stream"): Response {
  return new Response(
    events.map((event) => `event: message\ndata: ${JSON.stringify(event)}\n\n`).join(""),
    {
      status: 200,
      headers: { "Content-Type": contentType },
    },
  );
}

function sseContentResponse(payload: unknown, id?: string, contentType?: string): Response {
  return sseResponse(
    [{ jsonrpc: "2.0", ...(id ? { id } : {}), result: { content: [{ type: "text", text: JSON.stringify(payload) }] } }],
    contentType,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Tutu offer normalization", () => {
  it("normalizes transport offers with price and checkout URL", () => {
    const offers = normalizeTransportOffers({
      items: [
        {
          title: "Москва - Пермь",
          price: { amount: 4200, currency: "RUB" },
          checkout_url: "https://www.tutu.ru/checkout/example",
          departure: "10:00",
          arrival: "18:30",
        },
      ],
    });

    expect(offers[0]).toEqual({
      id: "transport-0",
      title: "Москва - Пермь",
      price: "4200 RUB",
      subtitle: "10:00 - 18:30",
      url: "https://www.tutu.ru/checkout/example",
    });
  });

  it("normalizes real Tutu avia offers with search result links", () => {
    const offers = normalizeTransportOffers({
      offers: [
        {
          transport: "avia",
          price: { amount: 46624, currency: "RUB" },
          carriers: ["Аэрофлот"],
          duration_min: 590,
          departure_at: "2026-09-10T06:00:00+03:00",
          arrival_at: "2026-09-11T06:55:00+10:00",
          search_results_url: "https://avia.tutu.ru/f/Sankt-peterburg/Vladivostok/?start=2026-09-10",
        },
      ],
    });

    expect(offers[0]).toEqual({
      id: "transport-0",
      title: "Авиабилеты: Аэрофлот",
      price: "46624 RUB",
      subtitle: "В пути 9 ч 50 мин",
      url: "https://avia.tutu.ru/f/Sankt-peterburg/Vladivostok/?start=2026-09-10",
      mode: "avia",
    });
  });

  it("normalizes real Tutu hotel offers with checkout links", () => {
    const offers = normalizeHotelOffers({
      hotels: [
        {
          name: "Deep Hotel (Владивосток)",
          address: "4.3 км от центра",
          rating: 9.2,
          checkout_url: "https://hotel.tutu.ru/offers/details/fallback",
          best_offer: {
            price: { amount: 27279.98, currency: "RUB" },
            checkout_url: "https://hotel.tutu.ru/offers/details/best",
          },
        },
      ],
    });

    expect(offers[0]).toEqual({
      id: "hotel-0",
      title: "Deep Hotel (Владивосток)",
      price: "27279.98 RUB",
      subtitle: "4.3 км от центра",
      url: "https://hotel.tutu.ru/offers/details/best",
    });
  });

  it("returns an empty list for unknown hotel payloads", () => {
    expect(normalizeHotelOffers({ unexpected: true })).toEqual([]);
  });

  it("unwraps JSON-RPC result content for transport and hotels", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(contentResponse({
        items: [{ title: "Москва - Пермь", price: { amount: 4200, currency: "RUB" } }],
      }))
      .mockResolvedValueOnce(contentResponse({
        items: [{ name: "Отель Пермь", price: { amount: 6000, currency: "RUB" } }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchTutuOffers({ intent, destination, endpoint: "https://mcp.example/mcp" });

    expect(result.transport[0].title).toBe("Москва - Пермь");
    expect(result.hotels[0].title).toBe("Отель Пермь");
    expect(result.warnings).toEqual([]);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { Accept: "application/json, text/event-stream" },
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).params).toEqual({
      name: "search_multitransport",
      arguments: {
        origin: "Москва",
        destination: "Пермь",
        departure_date: "2026-09-10",
        adults: 2,
        modes: ["avia", "railway", "bus"],
        optimize_for: "price",
        page_size: 20,
        view: "compact",
      },
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string).params).toEqual({
      name: "search_hotels",
      arguments: {
        city_name: "Пермь",
        check_in: "2026-09-10",
        check_out: "2026-09-14",
        adults: 2,
        page_size: 5,
        view: "compact",
      },
    });
  });

  it("unwraps SSE JSON-RPC result content for transport and hotels", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T12:00:00Z"));
    const requestTime = Date.now();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sseContentResponse({
        items: [{ title: "Москва - Пермь", price: { amount: 4200, currency: "RUB" } }],
      }, `search_multitransport-${requestTime}`))
      .mockResolvedValueOnce(sseContentResponse({
        items: [{ name: "Отель Пермь", price: { amount: 6000, currency: "RUB" } }],
      }, `search_hotels-${requestTime}`));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchTutuOffers({ intent, destination, endpoint: "https://mcp.example/mcp" });

    expect(result.transport[0].title).toBe("Москва - Пермь");
    expect(result.hotels[0].title).toBe("Отель Пермь");
    expect(result.warnings).toEqual([]);
  });

  it("skips SSE notifications and unrelated response ids before the matching tool result", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T12:00:00Z"));
    const requestTime = Date.now();
    const transportId = `search_multitransport-${requestTime}`;
    const hotelId = `search_hotels-${requestTime}`;
    const progress = { jsonrpc: "2.0", method: "notifications/progress", params: { progress: 50 } };
    const unexpectedResult = {
      jsonrpc: "2.0",
      id: "another-request",
      result: { content: [{ type: "text", text: JSON.stringify({ items: [] }) }] },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sseResponse([
        progress,
        unexpectedResult,
        {
          jsonrpc: "2.0",
          id: transportId,
          result: { content: [{ type: "text", text: JSON.stringify({ items: [{ title: "Москва - Пермь" }] }) }] },
        },
      ]))
      .mockResolvedValueOnce(sseResponse([
        progress,
        {
          jsonrpc: "2.0",
          id: hotelId,
          result: { content: [{ type: "text", text: JSON.stringify({ items: [{ name: "Отель Пермь" }] }) }] },
        },
      ]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchTutuOffers({ intent, destination, endpoint: "https://mcp.example/mcp" });

    expect(result.transport[0].title).toBe("Москва - Пермь");
    expect(result.hotels[0].title).toBe("Отель Пермь");
    expect(result.warnings).toEqual([]);
  });

  it("recognizes mixed-case SSE content types", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T12:00:00Z"));
    const requestTime = Date.now();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sseContentResponse(
        { items: [{ title: "Москва - Пермь" }] },
        `search_multitransport-${requestTime}`,
        "Text/Event-Stream; charset=utf-8",
      ))
      .mockResolvedValueOnce(sseContentResponse(
        { items: [{ name: "Отель Пермь" }] },
        `search_hotels-${requestTime}`,
        "Text/Event-Stream; charset=utf-8",
      ));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchTutuOffers({ intent, destination, endpoint: "https://mcp.example/mcp" });

    expect(result.transport[0].title).toBe("Москва - Пермь");
    expect(result.hotels[0].title).toBe("Отель Пермь");
    expect(result.warnings).toEqual([]);
  });

  it("turns a JSON-RPC error into a warning and keeps successful hotels", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Transport unavailable" },
      }))
      .mockResolvedValueOnce(contentResponse({
        items: [{ name: "Отель Пермь" }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchTutuOffers({ intent, destination, endpoint: "https://mcp.example/mcp" });

    expect(result.transport).toEqual([
      {
        id: "transport-fallback",
        title: "Открыть поиск билетов на Туту",
        subtitle: "Москва - Пермь",
        url: "https://avia.tutu.ru/",
      },
    ]);
    expect(result.hotels[0].title).toBe("Отель Пермь");
    expect(result.warnings).toEqual(["Tutu MCP search_multitransport failed: Transport unavailable"]);
  });

  it("keeps hotel offers when transport fetch fails", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(contentResponse({
        items: [{ name: "Отель Пермь" }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchTutuOffers({ intent, destination, endpoint: "https://mcp.example/mcp" });

    expect(result.transport).toEqual([
      {
        id: "transport-fallback",
        title: "Открыть поиск билетов на Туту",
        subtitle: "Москва - Пермь",
        url: "https://avia.tutu.ru/",
      },
    ]);
    expect(result.hotels[0].title).toBe("Отель Пермь");
    expect(result.warnings).toEqual(["network unavailable"]);
  });

  it("aborts a stalled Tutu transport request after the shared 18 second deadline", async () => {
    vi.useFakeTimers();
    let transportSignal: AbortSignal | undefined;
    const fetchMock = vi.fn()
      .mockImplementationOnce((_url: string, init?: RequestInit) => {
        transportSignal = init?.signal ?? undefined;
        if (!transportSignal) return Promise.reject(new Error("missing abort signal"));
        return new Promise<Response>((_resolve, reject) => {
          transportSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
      })
      .mockResolvedValueOnce(contentResponse({ items: [{ name: "Отель Пермь" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = searchTutuOffers({ intent, destination, endpoint: "https://mcp.example/mcp" });
    await vi.advanceTimersByTimeAsync(17_999);
    expect(transportSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await resultPromise;

    expect(transportSignal?.aborted).toBe(true);
    expect(result.hotels[0].title).toBe("Отель Пермь");
  });

  it("returns Tutu search entry points when both MCP tools produce no offers", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(contentResponse({ offers: [] }))
      .mockResolvedValueOnce(contentResponse({ hotels: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchTutuOffers({ intent, destination, endpoint: "https://mcp.example/mcp" });

    expect(result.transport).toEqual([
      {
        id: "transport-fallback",
        title: "Открыть поиск билетов на Туту",
        subtitle: "Москва - Пермь",
        url: "https://avia.tutu.ru/",
      },
    ]);
    expect(result.hotels).toEqual([
      {
        id: "hotel-fallback",
        title: "Открыть поиск отелей на Туту",
        subtitle: "Пермь, 2026-09-10 - 2026-09-14",
        url: "https://hotel.tutu.ru/",
      },
    ]);
  });
});

const vladimirResponse = {
  variants: [
    {
      offer_id: "4abc27df",
      transport: "railway",
      price: { amount: 691.77, currency: "RUB" },
      duration_min: 105,
      carriers: ["ФПК"],
      search_results_url: "https://www.tutu.ru/poezda/rasp_d.php?date=10.09.2026",
      checkout_url: "https://www.tutu.ru/poezda/order/?tn=705",
    },
  ],
  meta: {
    modes_summary: {
      railway: { count: 19, min_price: 691.77, min_duration_min: 104 },
      bus: { count: 6, min_price: 3220, min_duration_min: 150 },
    },
    unavailable: [{ mode: "avia", reason: "no_route" }],
  },
};

describe("multitransport normalization", () => {
  it("reads variants and carries the mode from the response", () => {
    const offers = normalizeTransportOffers(vladimirResponse);
    expect(offers).toHaveLength(1);
    expect(offers[0].mode).toBe("railway");
    expect(offers[0].price).toBe("691.77 RUB");
    expect(offers[0].url).toContain("tutu.ru");
  });

  it("reads per-mode availability from meta, not from the variant list", () => {
    const summary = readModesSummary(vladimirResponse);
    expect(summary.railway).toEqual({ count: 19, minPrice: 691.77, minDurationMin: 104 });
    // Only one railway variant was returned on this page, yet six buses exist.
    expect(summary.bus?.count).toBe(6);
    expect(summary.avia).toBeUndefined();
  });
});

describe("tool errors delivered as text", () => {
  it("surfaces the tool message instead of a JSON parse complaint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "x",
          result: {
            content: [{ type: "text", text: "Error executing tool search_multitransport: 1 validation error" }],
          },
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchTutuOffers({ intent, destination });

    expect(result.warnings.join(" ")).toContain("Error executing tool");
    expect(result.warnings.join(" ")).not.toContain("not valid JSON");
    vi.unstubAllGlobals();
  });
});
