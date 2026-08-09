import { afterEach, describe, expect, it, vi } from "vitest";
import { searchTutuOffers } from "@/server/tutu/mcpClient";
import { normalizeHotelOffers, normalizeTransportOffers } from "@/server/tutu/normalize";
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
      name: "search_avia",
      arguments: {
        origin: "Москва",
        destination: "Пермь",
        departure_date: "2026-09-10",
        adults: 2,
        page_size: 5,
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
      }, `search_avia-${requestTime}`))
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
    const transportId = `search_avia-${requestTime}`;
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
        `search_avia-${requestTime}`,
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
    expect(result.warnings).toEqual(["Tutu MCP search_avia failed: Transport unavailable"]);
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

  it("aborts a stalled Tutu transport request after 12 seconds", async () => {
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
    await vi.advanceTimersByTimeAsync(12_000);
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
