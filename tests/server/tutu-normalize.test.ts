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

function sseContentResponse(payload: unknown): Response {
  return new Response(
    `event: message\ndata: ${JSON.stringify({
      jsonrpc: "2.0",
      result: { content: [{ type: "text", text: JSON.stringify(payload) }] },
    })}\n\n`,
    {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    },
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
  });

  it("unwraps SSE JSON-RPC result content for transport and hotels", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sseContentResponse({
        items: [{ title: "Москва - Пермь", price: { amount: 4200, currency: "RUB" } }],
      }))
      .mockResolvedValueOnce(sseContentResponse({
        items: [{ name: "Отель Пермь", price: { amount: 6000, currency: "RUB" } }],
      }));
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

    expect(result.transport).toEqual([]);
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

    expect(result.transport).toEqual([]);
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
});
