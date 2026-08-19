import { afterEach, describe, expect, it, vi } from "vitest";
import { callToolWithRetry, searchTutuOffers } from "@/server/tutu/mcpClient";
import { formatPrice, normalizeHotelOffers, normalizeTransportOffers, readInterchangePlan, readModesSummary, readUnavailable, stationCity } from "@/server/tutu/normalize";
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

// Reads which MCP tool a fetch call was for straight from the JSON-RPC
// request body -- used by the retry tests below to route/count per leg
// instead of relying on call order, which retries make unpredictable.
function toolNameOf(init?: RequestInit): string {
  const body = JSON.parse(String(init?.body)) as { params?: { name?: unknown } };
  return typeof body.params?.name === "string" ? body.params.name : "";
}

function statusResponse(status: number): Response {
  return new Response(JSON.stringify({ error: `http ${status}` }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function toolTextErrorResponse(name: string, message: string): Response {
  return jsonResponse({
    jsonrpc: "2.0",
    id: "x",
    result: { content: [{ type: "text", text: `Error executing tool ${name}: ${message}` }] },
  });
}

// A fetch stub that routes each call by the JSON-RPC request body's tool
// name into its own queue, popped in order -- unlike a plain
// mockResolvedValueOnce chain, this stays correct once retries mean the two
// legs no longer make a predictable, interleaved number of total calls.
function routedFetchMock(responses: {
  search_multitransport?: Array<() => Response | Promise<Response>>;
  search_hotels?: Array<() => Response | Promise<Response>>;
}): ReturnType<typeof vi.fn> {
  const queues: Record<string, Array<() => Response | Promise<Response>>> = {
    search_multitransport: [...(responses.search_multitransport ?? [])],
    search_hotels: [...(responses.search_hotels ?? [])],
  };
  return vi.fn((_url: string, init?: RequestInit) => {
    const name = toolNameOf(init);
    const next = queues[name]?.shift();
    return Promise.resolve().then(() => {
      if (!next) throw new Error(`routedFetchMock: no more mocked responses queued for ${name}`);
      return next();
    });
  });
}

function transportCallsOf(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter((call) => toolNameOf(call[1] as RequestInit) === "search_multitransport");
}

function hotelCallsOf(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter((call) => toolNameOf(call[1] as RequestInit) === "search_hotels");
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
      price: `4\u00A0200\u00A0₽`,
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
      price: `46\u00A0624\u00A0₽`,
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
      price: `27\u00A0280\u00A0₽`,
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
        // etrain joined the request when suburban trains became a real
        // road the deck can name (see TransportMode). search_multitransport
        // runs all four modes in parallel, so asking for the fourth costs
        // nothing in latency.
        modes: ["avia", "railway", "bus", "etrain"],
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

  // A network-level failure (fetch() itself rejecting -- see TutuNetworkError
  // in mcpClient.ts) is transient and now retried up to 3 attempts, unlike
  // before this task. The mock routes on the request body's tool name
  // (rather than call order/count) precisely because retries change how
  // many times each leg's fetch actually fires: transport fails on every
  // attempt (exhausting all 3), hotels succeeds on its first and only one.
  it("keeps hotel offers when the transport leg's network fails on every attempt", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (toolNameOf(init) === "search_multitransport") return Promise.reject(new Error("network unavailable"));
      return Promise.resolve(contentResponse({ items: [{ name: "Отель Пермь" }] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = searchTutuOffers({ intent, destination, endpoint: "https://mcp.example/mcp" });
    // Clears both jittered backoff waits (300ms and 900ms bases) with room
    // to spare, well short of the 18s shared deadline.
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await resultPromise;

    expect(result.transport).toEqual([
      {
        id: "transport-fallback",
        title: "Открыть поиск билетов на Туту",
        subtitle: "Москва - Пермь",
        url: "https://avia.tutu.ru/",
      },
    ]);
    expect(result.transportOutcome).toBe("failed");
    expect(result.hotels[0].title).toBe("Отель Пермь");
    expect(result.hotelsOutcome).toBe("served");
    // Same final message as before this task -- TutuNetworkError preserves
    // the original error's text verbatim, and every attempt fails the same
    // way, so the last (and only) warning pushed is unchanged.
    expect(result.warnings).toEqual(["network unavailable"]);

    const transportCalls = fetchMock.mock.calls.filter((call) => toolNameOf(call[1] as RequestInit) === "search_multitransport");
    const hotelCalls = fetchMock.mock.calls.filter((call) => toolNameOf(call[1] as RequestInit) === "search_hotels");
    expect(transportCalls).toHaveLength(3);
    expect(hotelCalls).toHaveLength(1);
  });

  it("aborts a stalled Tutu transport request after the shared 18 second deadline", async () => {
    vi.useFakeTimers();
    let transportSignal: AbortSignal | undefined;
    const fetchMock = vi.fn()
      .mockImplementationOnce((_url: string, init?: RequestInit) => {
        transportSignal = init?.signal ?? undefined;
        const signal = transportSignal;
        if (!signal) return Promise.reject(new Error("missing abort signal"));
        // Create a Promise that rejects when the signal aborts
        return new Promise<Response>((_resolve, reject) => {
          // Handle abort event - reject with the error message a real fetch produces
          // In Node.js fetch, an aborted request rejects with a message "This operation was aborted"
          const abortHandler = () => {
            reject(new Error("This operation was aborted"));
          };
          signal.addEventListener("abort", abortHandler, { once: true });
          // Also check if already aborted (race condition)
          if (signal.aborted) {
            reject(new Error("This operation was aborted"));
          }
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
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.join(" ")).toMatch(/abort/i);
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
    // Rounded to whole roubles by formatPrice: kopecks on a fare are noise.
    expect(offers[0].price).toBe(`692\u00A0₽`);
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

// Task: retry transient MCP failures per leg, inside the existing shared
// 18s budget. Every test here uses routedFetchMock (see its own comment)
// because retries make the plain "call N is for tool X" assumption the rest
// of this file relies on unsafe -- a leg that retries makes more than one
// call, and the two legs no longer interleave predictably.
describe("retry policy", () => {
  it("retries a single transient 503 and returns the successful result with no warning surfaced", async () => {
    vi.useFakeTimers();
    const fetchMock = routedFetchMock({
      search_multitransport: [
        () => statusResponse(503),
        () => contentResponse({ items: [{ title: "Москва - Пермь" }] }),
      ],
      search_hotels: [() => contentResponse({ items: [{ name: "Отель Пермь" }] })],
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = searchTutuOffers({ intent, destination, endpoint: "https://mcp.example/mcp" });
    // Clears the single ~300ms-based backoff with room to spare.
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await resultPromise;

    expect(result.transport[0].title).toBe("Москва - Пермь");
    expect(result.transportOutcome).toBe("served");
    expect(result.warnings).toEqual([]);
    expect(transportCallsOf(fetchMock)).toHaveLength(2);
  });

  it("gives up after three consecutive 503s and reports failure, with exactly three attempts", async () => {
    vi.useFakeTimers();
    const fetchMock = routedFetchMock({
      search_multitransport: [() => statusResponse(503), () => statusResponse(503), () => statusResponse(503)],
      search_hotels: [() => contentResponse({ items: [{ name: "Отель Пермь" }] })],
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = searchTutuOffers({ intent, destination, endpoint: "https://mcp.example/mcp" });
    // Clears both jittered backoffs (300ms and 900ms bases) with room to
    // spare, well short of the 18s shared deadline.
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await resultPromise;

    expect(result.transportOutcome).toBe("failed");
    expect(result.warnings).toEqual(["Tutu MCP search_multitransport failed with 503"]);
    expect(transportCallsOf(fetchMock)).toHaveLength(3);
  });

  it("does not retry a 400 — exactly one attempt, since a malformed request fails identically twice", async () => {
    const fetchMock = routedFetchMock({
      search_multitransport: [() => statusResponse(400)],
      search_hotels: [() => contentResponse({ items: [{ name: "Отель Пермь" }] })],
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchTutuOffers({ intent, destination, endpoint: "https://mcp.example/mcp" });

    expect(result.transportOutcome).toBe("failed");
    expect(result.warnings).toEqual(["Tutu MCP search_multitransport failed with 400"]);
    expect(transportCallsOf(fetchMock)).toHaveLength(1);
  });

  it("does not retry a tool-level error delivered as text — exactly one attempt", async () => {
    const fetchMock = routedFetchMock({
      search_multitransport: [() => toolTextErrorResponse("search_multitransport", "1 validation error")],
      search_hotels: [() => contentResponse({ items: [{ name: "Отель Пермь" }] })],
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchTutuOffers({ intent, destination, endpoint: "https://mcp.example/mcp" });

    expect(result.transportOutcome).toBe("failed");
    expect(result.warnings.join(" ")).toContain("Error executing tool");
    expect(transportCallsOf(fetchMock)).toHaveLength(1);
  });

  it("retries the two legs independently — the transport leg exhausting its retries does not touch the hotel leg's own attempt count", async () => {
    vi.useFakeTimers();
    const fetchMock = routedFetchMock({
      search_multitransport: [() => statusResponse(503), () => statusResponse(503), () => statusResponse(503)],
      // The hotel leg needs one retry of its own to succeed -- proves each
      // leg keeps its own attempt count rather than sharing one budget.
      search_hotels: [() => statusResponse(503), () => contentResponse({ items: [{ name: "Отель Пермь" }] })],
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = searchTutuOffers({ intent, destination, endpoint: "https://mcp.example/mcp" });
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await resultPromise;

    expect(result.transportOutcome).toBe("failed");
    expect(result.hotelsOutcome).toBe("served");
    expect(result.hotels[0].title).toBe("Отель Пермь");
    expect(transportCallsOf(fetchMock)).toHaveLength(3);
    expect(hotelCallsOf(fetchMock)).toHaveLength(2);
  });

  // Direct, deterministic coverage of callToolWithRetry's own deadline
  // handling -- going through the full 18s searchTutuOffers budget to force
  // this interleaving would mean racing a real backoff timer against the
  // real deadline timer, which is exactly the kind of flaky timing this
  // test should not depend on.
  it("stops immediately once the shared deadline aborts mid-backoff, without starting another attempt", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(statusResponse(503));
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    const deadlineAt = Date.now() + 10_000; // plenty of nominal budget left
    const promise = callToolWithRetry(
      "https://mcp.example/mcp",
      "search_multitransport",
      {},
      controller.signal,
      deadlineAt,
    );

    // Let the first attempt's fetch settle (503), landing inside the
    // backoff sleep, one step before a second attempt would start.
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();

    await expect(promise).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not start an attempt that cannot finish before the shared deadline", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(statusResponse(503));
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    // Less than one backoff step plus a plausible attempt -- the retry
    // policy must give up rather than start an attempt it cannot finish.
    const deadlineAt = Date.now() + 100;
    const promise = callToolWithRetry(
      "https://mcp.example/mcp",
      "search_multitransport",
      {},
      controller.signal,
      deadlineAt,
    );

    await expect(promise).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("leg outcome", () => {
  it("marks a leg as empty when Tutu answers with nothing usable for these dates", async () => {
    const fetchMock = routedFetchMock({
      search_multitransport: [() => contentResponse({ offers: [] })],
      search_hotels: [() => contentResponse({ hotels: [] })],
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchTutuOffers({ intent, destination, endpoint: "https://mcp.example/mcp" });

    expect(result.transportOutcome).toBe("empty");
    expect(result.hotelsOutcome).toBe("empty");
  });

  it("marks a leg as served when real offers come back", async () => {
    const fetchMock = routedFetchMock({
      search_multitransport: [() => contentResponse({ items: [{ title: "Москва - Пермь" }] })],
      search_hotels: [() => contentResponse({ items: [{ name: "Отель Пермь" }] })],
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchTutuOffers({ intent, destination, endpoint: "https://mcp.example/mcp" });

    expect(result.transportOutcome).toBe("served");
    expect(result.hotelsOutcome).toBe("served");
  });

  it("marks a leg as failed once every retry is exhausted, distinct from empty", async () => {
    vi.useFakeTimers();
    const fetchMock = routedFetchMock({
      search_multitransport: [() => statusResponse(503), () => statusResponse(503), () => statusResponse(503)],
      search_hotels: [() => contentResponse({ items: [{ name: "Отель Пермь" }] })],
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = searchTutuOffers({ intent, destination, endpoint: "https://mcp.example/mcp" });
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await resultPromise;

    expect(result.transportOutcome).toBe("failed");
    expect(result.transportOutcome).not.toBe("empty");
  });
});

// A real search_multitransport variant, copied verbatim from a live
// Тосно -> Тверь response on 2026-08-18. The interesting part is where the
// facts live: the train's name and number are not on the variant at all,
// they are two levels down in legs[].segments[], which is why they used to
// be discarded and the road hero said "Поезд: ФПК" -- the operating company
// -- instead of naming the АВРОРА.
const tosnoTverResponse = {
  variants: [
    {
      transport: "railway",
      price: { amount: 1984.47, currency: "RUB" },
      duration_min: 206,
      carriers: ["ФПК"],
      legs: [
        {
          label: "outbound",
          from: "Тосно, 2004148",
          to: "Тверь, 2004600",
          duration_min: 206,
          segments: [
            {
              from: "Тосно, 2004148",
              to: "Тверь, 2004600",
              duration_min: 206,
              carrier: "ФПК",
              voyage_no: "739У",
              vehicle_meta: { name: "АВРОРА", is_premium: true, is_double_decker: true },
            },
          ],
        },
      ],
    },
  ],
  meta: {
    modes_summary: { railway: { count: 1, min_price: 1984.47, min_duration_min: 206 } },
    unavailable: [
      {
        mode: "avia",
        reason: "no_route",
        detail: "avia requires avia_id for origin, but the geo lookup did not return one — try passing a more specific city name.",
      },
    ],
  },
};

describe("segment facts", () => {
  it("names the train rather than the operating company", () => {
    const [offer] = normalizeTransportOffers(tosnoTverResponse);
    expect(offer.title).toBe("Поезд «АВРОРА» №739У");
  });

  it("falls back to the carrier when a segment carries no vehicle name", () => {
    const noName = {
      variants: [{
        transport: "bus",
        carriers: ["Питеравто"],
        legs: [{ label: "outbound", segments: [{ from: "a", to: "b" }] }],
      }],
    };
    expect(normalizeTransportOffers(noName)[0].title).toBe("Автобус: Питеравто");
  });

  it("stays on the old shape for a variant with no legs at all", () => {
    const legless = { variants: [{ transport: "avia", carriers: ["Победа"] }] };
    expect(normalizeTransportOffers(legless)[0].title).toBe("Авиабилеты: Победа");
  });

  // Transfers live inside a leg, not across legs: `legs` is labelled
  // outbound/return, so counting legs measures the wrong axis entirely (an
  // earlier probe did exactly that and reported a 20-variant response as
  // having no composite routes).
  it("counts transfers from segments within the outbound leg", () => {
    const withChange = {
      variants: [{
        transport: "railway",
        duration_min: 600,
        legs: [{
          label: "outbound",
          segments: [
            { from: "Тосно", to: "Москва", voyage_no: "1" },
            { from: "Москва", to: "Казань", voyage_no: "2" },
          ],
        }],
      }],
    };
    expect(normalizeTransportOffers(withChange)[0].subtitle).toBe("В пути 10 ч · 1 пересадка");
  });

  it("says nothing about transfers on a direct road", () => {
    expect(normalizeTransportOffers(tosnoTverResponse)[0].subtitle).toBe("В пути 3 ч 26 мин");
  });
});

describe("readUnavailable", () => {
  it("reads Tutu's own reason for a mode that found nothing", () => {
    expect(readUnavailable(tosnoTverResponse)).toEqual([
      {
        mode: "avia",
        reason: "no_route",
        detail: "avia requires avia_id for origin, but the geo lookup did not return one — try passing a more specific city name.",
      },
    ]);
  });

  it("skips entries that are not a known mode with a reason", () => {
    const messy = { meta: { unavailable: [
      { mode: "teleport", reason: "no_route" },
      { mode: "bus" },
      null,
      { mode: "etrain", reason: "no_route" },
    ] } };
    expect(readUnavailable(messy)).toEqual([{ mode: "etrain", reason: "no_route", detail: undefined }]);
  });

  it("is empty when the response carries no meta at all", () => {
    expect(readUnavailable({ variants: [] })).toEqual([]);
    expect(readUnavailable(null)).toEqual([]);
  });
});

// Verbatim from a live Псков → Абакан response on 2026-08-19, trimmed to the
// fields under test. The shape that matters: railway reports `count: 0` --
// there is no direct train -- and the plan hangs off that same zero-count
// entry. readModesSummary drops zero-count modes by design, which is exactly
// why readInterchangePlan reads the raw meta itself.
const pskovAbakanResponse = {
  variants: [],
  meta: {
    modes_summary: {
      avia: { count: 2, min_price: 50542, min_duration_min: 360 },
      railway: {
        count: 0,
        min_price: null,
        min_duration_min: null,
        interchange_routes: [
          {
            via: ["Москва"],
            transfer_count: 1,
            departure_at: "2026-10-14T19:23:00+03:00",
            arrival_at: "2026-10-19T06:30:00+07:00",
            duration_min: 6187,
            price_from: { amount: 13320.16, currency: "RUB" },
            price_basis: "sum_of_cheapest_fare_per_leg",
            legs: [
              {
                train_number: "010У",
                from: "Псков — Псков-Пасс. (2004500)",
                to: "Москва — Ленинградский вокзал (2006004)",
                departure_at: "2026-10-14T19:23:00+03:00",
                arrival_at: "2026-10-15T06:47:00+03:00",
                duration_min: 684,
                price_from: { amount: 2501.26, currency: "RUB" },
                seats_left: 52,
                seat_categories: {
                  COMPARTMENT: { price_from: { amount: 7088.7, currency: "RUB" }, seats_left: 2 },
                  RESERVED_SEAT: { price_from: { amount: 2767.42, currency: "RUB" }, seats_left: 13 },
                  SEDENTARY: { price_from: { amount: 2501.26, currency: "RUB" }, seats_left: 52 },
                  SOFT: { price_from: { amount: 28028.76, currency: "RUB" }, seats_left: 5 },
                },
                checkout_url: "https://mtp-deeplink.tutu.ru/api/v1/deeplink/explicit/train?source=mcp",
              },
              {
                train_number: "068Ы",
                from: "Москва — Ярославский вокзал (2000002)",
                to: "Абакан, 2038230",
                departure_at: "2026-10-15T23:20:00+03:00",
                arrival_at: "2026-10-19T06:30:00+07:00",
              },
            ],
          },
        ],
      },
    },
    unavailable: [],
  },
};

describe("readInterchangePlan", () => {
  it("finds the plan on a railway entry whose count is zero", () => {
    // The regression this exists for: readModesSummary skips count<=0, so a
    // plan read through it would never be seen at all.
    expect(readModesSummary(pskovAbakanResponse).railway).toBeUndefined();

    const plan = readInterchangePlan(pskovAbakanResponse);
    expect(plan).not.toBeNull();
    expect(plan?.via).toEqual(["Москва"]);
    expect(plan?.transferCount).toBe(1);
    expect(plan?.durationMin).toBe(6187);
    expect(plan?.priceFrom).toBe(13320.16);
    expect(plan?.legs).toHaveLength(2);
  });

  it("carries each leg's own train, times and bookable link", () => {
    const [first, second] = readInterchangePlan(pskovAbakanResponse)!.legs;

    expect(first.trainNumber).toBe("010У");
    expect(first.priceFrom).toBe(2501.26);
    expect(first.url).toContain("mtp-deeplink.tutu.ru");
    // A plan has no single ticket, but every leg does -- that is what makes
    // it showable at all.
    expect(second.trainNumber).toBe("068Ы");
    expect(second.url).toBeUndefined();
  });

  it("reads the fare ladder cheapest-first with seats left", () => {
    const [first] = readInterchangePlan(pskovAbakanResponse)!.legs;

    expect(first.seatCategories.map((c) => c.label)).toEqual(["сидячий", "плацкарт", "купе", "СВ"]);
    expect(first.seatCategories.map((c) => Math.round(c.priceFrom))).toEqual([2501, 2767, 7089, 28029]);
    expect(first.seatCategories[2]).toMatchObject({ code: "COMPARTMENT", seatsLeft: 2 });
  });

  it("returns null when there is no plan, rather than an empty shell", () => {
    expect(readInterchangePlan({ meta: { modes_summary: { railway: { count: 5 } } } })).toBeNull();
    expect(readInterchangePlan({ variants: [] })).toBeNull();
    expect(readInterchangePlan(null)).toBeNull();
    // A plan with no legs is nothing to show and nothing to link to.
    expect(readInterchangePlan({
      meta: { modes_summary: { railway: { interchange_routes: [{ via: ["Москва"], legs: [] }] } } },
    })).toBeNull();
  });
});

describe("stationCity", () => {
  it("keeps the city and drops the platform, terminal and geo id", () => {
    expect(stationCity("Псков — Псков-Пасс. (2004500)")).toBe("Псков");
    expect(stationCity("Москва — Шереметьево (SVO), терм. B")).toBe("Москва");
    expect(stationCity("Абакан, 2038230")).toBe("Абакан");
    expect(stationCity("Тверь")).toBe("Тверь");
  });
});

describe("formatPrice", () => {
  it("groups thousands with a non-breaking space", () => {
    // The exact bytes matter: a regular space would let a price wrap across
    // two lines mid-number.
    expect(formatPrice(13320)).toBe("13 320 ₽");
    expect(formatPrice(1000)).toBe("1 000 ₽");
    expect(formatPrice(1234567)).toBe("1 234 567 ₽");
  });

  it("leaves small amounts ungrouped", () => {
    expect(formatPrice(100)).toBe("100 ₽");
    expect(formatPrice(999)).toBe("999 ₽");
  });

  it("rounds kopecks away", () => {
    expect(formatPrice(691.77)).toBe("692 ₽");
    expect(formatPrice(2501.26)).toBe("2 501 ₽");
    expect(formatPrice(28028.76)).toBe("28 029 ₽");
  });

  // The app has only ever been quoted in roubles. Stamping ₽ on something
  // else would be a confident wrong detail, so an unfamiliar currency keeps
  // its own code.
  it("keeps a foreign currency's own code instead of inventing a symbol", () => {
    expect(formatPrice(4200, "EUR")).toBe("4 200 EUR");
    expect(formatPrice(50, "USD")).toBe("50 USD");
  });

  // Guards against a runtime whose Intl data would have grouped differently:
  // this formatter does the grouping itself precisely so the same string is
  // produced on every machine, in tests and in production alike.
  it("never produces a comma or a plain space as a separator", () => {
    const formatted = formatPrice(13320);
    expect(formatted).not.toContain(",");
    expect(formatted).not.toMatch(/\d \d/);
  });
});

// Verbatim from a live Москва → Пермь response on 2026-08-19. This is the
// shape that used to yield nothing: on an ordinary rail variant the ladder
// lives on `fares.seat_categories`, and `price_from` there is a bare number,
// while the same field on an interchange leg is `{ amount, currency }`.
// Reading only the object form left every real train with an empty ladder.
const permRailResponse = {
  variants: [
    {
      transport: "railway",
      price: { amount: 3997.31, currency: "RUB" },
      duration_min: 1300,
      carriers: ["ФПК"],
      legs: [{ label: "outbound", segments: [{ from: "Москва", to: "Пермь", voyage_no: "145А" }] }],
      fares: {
        count: 31,
        price_from: 3997.31,
        price_to: 16292.88,
        currency: "RUB",
        refundable_count: 27,
        changeable_count: 0,
        seat_categories: {
          RESERVED_SEAT: { count: 16, price_from: 3997.31 },
          COMPARTMENT: { count: 14, price_from: 4141.08 },
          LUX: { count: 1, price_from: 16292.88 },
        },
      },
    },
  ],
};

describe("the fare ladder on an ordinary train", () => {
  it("reads a bare-number price_from, not just the object form", () => {
    const [offer] = normalizeTransportOffers(permRailResponse);

    expect(offer.seatCategories?.map((c) => c.label)).toEqual(["плацкарт", "купе", "люкс"]);
    expect(offer.seatCategories?.map((c) => Math.round(c.priceFrom))).toEqual([3997, 4141, 16293]);
  });

  // `count` here is how many fare rows are on sale in that category, not how
  // many seats remain. Showing «16 мест» would invent a fact.
  it("never mistakes the fare count for seats left", () => {
    const [offer] = normalizeTransportOffers(permRailResponse);
    for (const category of offer.seatCategories ?? []) {
      expect(category.seatsLeft).toBeUndefined();
    }
  });

  it("still reads the object form used by an interchange leg", () => {
    const [first] = readInterchangePlan(pskovAbakanResponse)!.legs;
    expect(first.seatCategories.map((c) => Math.round(c.priceFrom))).toEqual([2501, 2767, 7089, 28029]);
    expect(first.seatCategories[2].seatsLeft).toBe(2);
  });
});

describe("the ladder admits when it is not the whole list", () => {
  const withCategories = (seatCategories: Record<string, unknown>, uncategorized?: unknown) => ({
    variants: [{
      transport: "railway",
      legs: [{ label: "outbound", segments: [{ from: "a", to: "b" }] }],
      fares: { seat_categories: seatCategories, ...(uncategorized === undefined ? {} : { uncategorized_fares: uncategorized }) },
    }],
  });

  it("says nothing when every category was understood", () => {
    const [offer] = normalizeTransportOffers(withCategories({
      RESERVED_SEAT: { price_from: 3997 },
      COMPARTMENT: { price_from: 4141 },
    }));
    expect(offer.seatCategories).toHaveLength(2);
    expect(offer.seatLadderPartial).toBeUndefined();
  });

  // Tutu's own signal. The playbook is explicit: a category missing from the
  // list means "not on sale" -- unless this says some rows could not be
  // classified, in which case the absence proves nothing.
  it("flags Tutu's own uncategorized fares", () => {
    const [offer] = normalizeTransportOffers(
      withCategories({ RESERVED_SEAT: { price_from: 3997 } }, 4),
    );
    expect(offer.seatLadderPartial).toBe(true);
  });

  // The hole from the other side, and not hypothetical: LUX appears in live
  // responses and is absent from the playbook's own list of four categories.
  // Dropping a code we cannot label is right; dropping it silently would
  // leave a shortened ladder looking complete.
  it("flags a category code it has no label for", () => {
    const [offer] = normalizeTransportOffers(withCategories({
      RESERVED_SEAT: { price_from: 3997 },
      SOMETHING_NEW: { price_from: 9000 },
    }));
    expect(offer.seatCategories?.map((c) => c.code)).toEqual(["RESERVED_SEAT"]);
    expect(offer.seatLadderPartial).toBe(true);
  });

  it("does not flag an empty or absent uncategorized field", () => {
    expect(normalizeTransportOffers(withCategories({ COMPARTMENT: { price_from: 1 } }, 0))[0].seatLadderPartial)
      .toBeUndefined();
    expect(normalizeTransportOffers(withCategories({ COMPARTMENT: { price_from: 1 } }, []))[0].seatLadderPartial)
      .toBeUndefined();
  });

  it("carries no flag at all when there is no ladder to qualify", () => {
    const [offer] = normalizeTransportOffers(withCategories({ UNKNOWN_ONLY: { price_from: 5 } }));
    expect(offer.seatCategories).toBeUndefined();
    expect(offer.seatLadderPartial).toBeUndefined();
  });
});
