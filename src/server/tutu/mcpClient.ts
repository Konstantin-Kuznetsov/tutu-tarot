import { TRANSPORT_MODES, type InterchangePlan, type TransportMode } from "@/domain/types";
import type { ModeUnavailable } from "@/domain/travel/roadUnavailable";
import type { LegOutcome, ModesSummary, TravelAtlasItem, TripIntent } from "@/domain/types";
import { normalizeHotelOffers, normalizeTransportOffers, readInterchangePlan, readModesSummary, readUnavailable, type NormalizedOffer } from "./normalize";

const DEFAULT_MCP_URL = "https://mcp.tutu.ru/mcp";
const AVIA_SUGGEST_URL = "https://suggester-avia.tutu.ru/api/location_suggest/v2";
const RAIL_SUGGEST_URL = "https://www.tutu.ru/suggest/railway_simple/";
const BUS_SUGGEST_URL = "https://bus.tutu.ru/api/v1/geo/suggest";
const ETRAIN_SUGGEST_URL = "https://www.tutu.ru/station/suggest.php";
const HOTELS_SUGGEST_URL = "https://hotels-geo-suggest.tutu.ru/api/v1/suggest";

// Thrown for a non-2xx HTTP response, carrying the status code so the retry
// policy (see isTransientError below) can tell a fast refusal (503/502/504,
// or 429 rate limiting) from a malformed request (any other 4xx) without
// parsing the message string back apart. Message format is unchanged from
// before retries existed -- it is the exact text production logs now show
// ("Tutu MCP search_rail failed with 503", for example).
class TutuHttpError extends Error {
  readonly status: number;

  constructor(status: number, name: string) {
    super(`Tutu MCP ${name} failed with ${status}`);
    this.name = "TutuHttpError";
    this.status = status;
  }
}

// Thrown when fetch() itself never produced a response -- DNS failure,
// connection refused, TLS error, and so on. Distinct from TutuHttpError
// (which means Tutu answered, just not with success) and from every other
// error this module throws once a response body is in hand (JSON-RPC
// envelope errors, tool-content text errors, malformed JSON): those mean
// the server was reached and is not going to like a retry any better, so
// only this class and TutuHttpError's transient statuses are retried.
class TutuNetworkError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "Tutu MCP network error");
    this.name = "TutuNetworkError";
  }
}

const TRANSIENT_HTTP_STATUSES = new Set([429, 502, 503, 504]);

function isTransientError(error: unknown): boolean {
  if (error instanceof TutuHttpError) return TRANSIENT_HTTP_STATUSES.has(error.status);
  if (error instanceof TutuNetworkError) return true;
  return false;
}

export interface TutuSearchInput {
  intent: TripIntent;
  destination: TravelAtlasItem;
  endpoint?: string;
}

function transportFallback(input: TutuSearchInput): NormalizedOffer {
  return {
    id: "transport-fallback",
    title: "Открыть поиск билетов на Туту",
    subtitle: `${input.intent.departureCity} - ${input.destination.nearestTransportHub}`,
    url: "https://avia.tutu.ru/",
  };
}

function hotelFallback(input: TutuSearchInput): NormalizedOffer {
  return {
    id: "hotel-fallback",
    title: "Открыть поиск отелей на Туту",
    subtitle: `${input.destination.hotelSearchCity}, ${input.intent.dateFrom} - ${input.intent.dateTo}`,
    url: "https://hotel.tutu.ru/",
  };
}

async function callTool(
  endpoint: string,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  const requestId = `${name}-${Date.now()}`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
  } catch (error) {
    // An abort (the shared search deadline firing) is not a network
    // failure to retry -- rethrow it as-is so isTransientError rejects it
    // and the retry loop's own signal.aborted check takes over.
    if (signal.aborted) throw error;
    throw new TutuNetworkError(error);
  }
  if (!response.ok) throw new TutuHttpError(response.status, name);

  const contentType = response.headers.get("content-type")?.toLowerCase();
  const raw = contentType?.includes("text/event-stream")
    ? parseSseResponse(await response.text(), name, requestId)
    : await response.json();

  return unwrapMcpResponse(raw, name);
}

// Up to two retries (three attempts total) per tool, only for transient
// signals (see isTransientError) -- 503/502/504/429 and a fetch() that
// never reached the server. A malformed request (any other 4xx) or a
// tool-level rejection delivered as text inside result.content[] fails
// identically on a second try, so those are never retried; see this
// module's own comment on TutuNetworkError for why response-in-hand errors
// generally aren't either.
const MAX_ATTEMPTS = 3;
// Base backoff before attempt 2 and attempt 3, in ms -- jittered below so
// several tools (or two concurrent users) retrying on the same schedule
// don't resynchronise. A production 503 refusal comes back in 0.5-1.5s, so
// both steps fit comfortably inside the 18s search budget.
const BASE_BACKOFF_MS = [300, 900];
// The minimum time a retry attempt plausibly needs to have a chance of
// finishing -- the upper end of the observed refusal latency (see
// BASE_BACKOFF_MS's own comment). If less than backoff + this remains in
// the shared budget, starting another attempt could not complete in time,
// so we give up instead.
const PLAUSIBLE_ATTEMPT_MS = 1_500;

function jitter(baseMs: number): number {
  // +/-30% spread.
  return Math.round(baseMs * (0.7 + Math.random() * 0.6));
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    // `onTimeout` and `onAbort` reference each other, so neither can be
    // declared strictly before the other -- resolved by having `onTimeout`
    // close over `onAbort` (only read once actually invoked, well after
    // both are initialized) rather than needing a mutable `let` for `timer`.
    const onTimeout = () => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    const timer = setTimeout(onTimeout, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

// Exported so the retry/backoff/deadline policy can be tested directly
// against a stubbed fetch and a controlled deadline, without racing the
// real ~18s search budget end-to-end (see tests/server/tutu-normalize.test.ts).
export async function callToolWithRetry(
  endpoint: string,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
  deadlineAt: number,
): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (signal.aborted) throw lastError ?? new Error(`Tutu MCP ${name} deadline already passed`);

    try {
      const result = await callTool(endpoint, name, args, signal);
      if (attempt > 1) {
        // One concise line, no request body or user input -- just the tool
        // name and how many attempts it took, so Vercel logs show how often
        // retrying is saving a reading.
        console.log(`[tutu] retry succeeded tool=${name} attempt=${attempt}/${MAX_ATTEMPTS}`);
      }
      return result;
    } catch (error) {
      lastError = error;
      if (signal.aborted || attempt === MAX_ATTEMPTS || !isTransientError(error)) throw error;

      const delay = jitter(BASE_BACKOFF_MS[attempt - 1]);
      const remaining = deadlineAt - Date.now();
      // Never start an attempt that cannot finish: if the backoff plus a
      // plausible attempt no longer fits, report the failure now instead.
      if (remaining < delay + PLAUSIBLE_ATTEMPT_MS) throw error;

      await sleep(delay, signal);
      if (signal.aborted) throw error;
    }
  }

  throw lastError;
}

function parseSseResponse(body: string, name: string, requestId: string): unknown {
  for (const event of body.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).replace(/^ /, ""))
      .join("\n");
    if (!data) continue;

    try {
      const response = JSON.parse(data) as unknown;
      if (isMatchingJsonRpcResponse(response, requestId)) return response;
    } catch {
      throw new Error(`Tutu MCP ${name} SSE data is not valid JSON`);
    }
  }

  throw new Error(`Tutu MCP ${name} SSE response has no data payload`);
}

function isMatchingJsonRpcResponse(value: unknown, requestId: string): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const response = value as Record<string, unknown>;
  return (
    response.jsonrpc === "2.0" &&
    response.id === requestId &&
    (Object.hasOwn(response, "result") || Object.hasOwn(response, "error"))
  );
}

function unwrapMcpResponse(raw: unknown, name: string): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Tutu MCP ${name} returned an invalid JSON-RPC response`);
  }

  const envelope = raw as { error?: unknown; result?: unknown };
  if (envelope.error !== undefined && envelope.error !== null) {
    const error = envelope.error;
    const message =
      error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : JSON.stringify(error);
    throw new Error(`Tutu MCP ${name} failed: ${message}`);
  }

  const result = envelope.result;
  if (Array.isArray(result)) return result;
  if (!result || typeof result !== "object") {
    throw new Error(`Tutu MCP ${name} response is missing a result`);
  }

  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return result;

  const textBlock = content.find(
    (item): item is { text: string } =>
      Boolean(item) && typeof item === "object" && typeof (item as { text?: unknown }).text === "string",
  );
  if (!textBlock) {
    throw new Error(`Tutu MCP ${name} result content has no text block`);
  }

  if (/^Error executing tool/i.test(textBlock.text.trim())) {
    throw new Error(textBlock.text.trim());
  }

  try {
    return JSON.parse(textBlock.text);
  } catch {
    throw new Error(`Tutu MCP ${name} result content is not valid JSON`);
  }
}

const SEARCH_BUDGET_MS = 18_000;

const MODE_TOOL: Record<TransportMode, string> = {
  avia: "search_avia",
  railway: "search_rail",
  bus: "search_bus",
  etrain: "search_etrain",
};

interface ProductSearchPlaces {
  origins: Record<TransportMode, string>;
  destinations: Record<TransportMode, string>;
  fallbackOrigin: string | null;
  hotelCity: string;
}

function textField(record: unknown, key: string): string | null {
  if (!record || typeof record !== "object") return null;
  const value = (record as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function childRecord(record: unknown, key: string): Record<string, unknown> | null {
  if (!record || typeof record !== "object") return null;
  const value = (record as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stripStationSuffix(value: string): string {
  return value.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

async function fetchSuggest(url: URL, signal: AbortSignal): Promise<unknown | null> {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function aviaCityFromSuggest(payload: unknown, fallback: string): string {
  const suggestions = payload && typeof payload === "object" ? (payload as { suggestions?: unknown }).suggestions : null;
  if (!Array.isArray(suggestions)) return fallback;

  for (const item of suggestions) {
    const country = childRecord(item, "country");
    const city = childRecord(item, "city");
    if (textField(country, "name") !== "Россия") continue;
    const name = textField(city, "name");
    if (name) return name;
  }

  return fallback;
}

function railPlaceFromSuggest(payload: unknown, fallback: string): string {
  if (!Array.isArray(payload)) return fallback;
  return textField(payload[0], "value") ?? fallback;
}

function busPlaceFromSuggest(payload: unknown, fallback: string): string {
  const data = childRecord(payload, "data");
  const geopoints = data?.geopoints;
  if (!Array.isArray(geopoints)) return fallback;
  return textField(geopoints[0], "name") ?? fallback;
}

function etrainPlaceFromSuggest(payload: unknown, fallback: string): string {
  if (!Array.isArray(payload)) return fallback;
  const label = textField(payload[0], "label");
  if (label) return stripStationSuffix(label) || fallback;
  return textField(payload[0], "value") ?? fallback;
}

function hotelCityFromSuggest(payload: unknown, fallback: string): string {
  const items = payload && typeof payload === "object" ? (payload as { items?: unknown }).items : null;
  if (!Array.isArray(items)) return fallback;
  const locality = items.find((item) => textField(item, "geoType") === "locality");
  return textField(locality ?? items[0], "name") ?? fallback;
}

function suggestUrlFor(mode: TransportMode, query: string): URL {
  if (mode === "avia") {
    const url = new URL(AVIA_SUGGEST_URL);
    url.searchParams.set("name", query);
    url.searchParams.set("direction", "from");
    return url;
  }
  if (mode === "railway") {
    const url = new URL(RAIL_SUGGEST_URL);
    url.searchParams.set("name", query);
    return url;
  }
  if (mode === "bus") {
    const url = new URL(BUS_SUGGEST_URL);
    url.searchParams.set("name", query);
    return url;
  }

  const url = new URL(ETRAIN_SUGGEST_URL);
  url.searchParams.set("name", query);
  return url;
}

function resolvedPlaceFor(mode: TransportMode, payload: unknown, fallback: string): string {
  if (mode === "avia") return aviaCityFromSuggest(payload, fallback);
  if (mode === "railway") return railPlaceFromSuggest(payload, fallback);
  if (mode === "bus") return busPlaceFromSuggest(payload, fallback);
  return etrainPlaceFromSuggest(payload, fallback);
}

async function resolveTransportPlace(mode: TransportMode, query: string, signal: AbortSignal): Promise<string> {
  const payload = await fetchSuggest(suggestUrlFor(mode, query), signal);
  return resolvedPlaceFor(mode, payload, query);
}

async function resolveHotelCity(query: string, signal: AbortSignal): Promise<string> {
  const url = new URL(HOTELS_SUGGEST_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", "8");
  const payload = await fetchSuggest(url, signal);
  return hotelCityFromSuggest(payload, query);
}

async function resolveProductSearchPlaces(input: TutuSearchInput, signal: AbortSignal): Promise<ProductSearchPlaces> {
  const [aviaOrigin, railOrigin, busOrigin, etrainOrigin, aviaDestination, railDestination, busDestination, etrainDestination, hotelCity] =
    await Promise.all([
      resolveTransportPlace("avia", input.intent.departureCity, signal),
      resolveTransportPlace("railway", input.intent.departureCity, signal),
      resolveTransportPlace("bus", input.intent.departureCity, signal),
      resolveTransportPlace("etrain", input.intent.departureCity, signal),
      resolveTransportPlace("avia", input.destination.nearestTransportHub, signal),
      resolveTransportPlace("railway", input.destination.nearestTransportHub, signal),
      resolveTransportPlace("bus", input.destination.nearestTransportHub, signal),
      resolveTransportPlace("etrain", input.destination.nearestTransportHub, signal),
      resolveHotelCity(input.destination.hotelSearchCity, signal),
    ]);

  return {
    origins: {
      avia: aviaOrigin,
      railway: railOrigin,
      bus: busOrigin,
      etrain: etrainOrigin,
    },
    destinations: {
      avia: aviaDestination,
      railway: railDestination,
      bus: busDestination,
      etrain: etrainDestination,
    },
    fallbackOrigin: aviaOrigin !== input.intent.departureCity ? aviaOrigin : null,
    hotelCity,
  };
}

function transportArgsFor(
  mode: TransportMode,
  input: TutuSearchInput,
  places: ProductSearchPlaces,
  origin = places.origins[mode],
): Record<string, unknown> {
  const common = {
    origin,
    destination: places.destinations[mode],
    departure_date: input.intent.dateFrom,
    page_size: 5,
    view: "compact",
  };

  if (mode === "railway") {
    return { ...common, passengers: input.intent.travelerCount, sort: "price_asc" };
  }

  if (mode === "bus") {
    return { ...common, adults: input.intent.travelerCount, children: 0, sort: "price_asc" };
  }

  if (mode === "avia") {
    return { ...common, adults: input.intent.travelerCount, children: 0, infants: 0, sort: "price_asc" };
  }

  return { ...common, sort: "price_asc" };
}

function summaryForMode(mode: TransportMode, offers: NormalizedOffer[]): ModesSummary {
  if (offers.length === 0) return {};
  return {
    [mode]: {
      count: offers.length,
      minPrice: null,
      minDurationMin: null,
    },
  };
}

function interleaveModeOffers(offersByMode: Map<TransportMode, NormalizedOffer[]>): NormalizedOffer[] {
  const firstPerMode = TRANSPORT_MODES.flatMap((mode) => offersByMode.get(mode)?.slice(0, 1) ?? []);
  const extras = TRANSPORT_MODES.flatMap((mode) => offersByMode.get(mode)?.slice(1) ?? []);
  return [...firstPerMode, ...extras].slice(0, 5);
}

async function searchTransportMode(
  endpoint: string,
  mode: TransportMode,
  input: TutuSearchInput,
  places: ProductSearchPlaces,
  signal: AbortSignal,
  deadlineAt: number,
): Promise<{ mode: TransportMode; raw: unknown }> {
  const raw = await callToolWithRetry(endpoint, MODE_TOOL[mode], transportArgsFor(mode, input, places), signal, deadlineAt);
  const offers = normalizeTransportOffers(raw, mode);
  if (
    offers.length === 0 &&
    places.fallbackOrigin &&
    places.fallbackOrigin !== places.origins[mode] &&
    (mode === "railway" || mode === "bus")
  ) {
    const fallbackRaw = await callToolWithRetry(
      endpoint,
      MODE_TOOL[mode],
      transportArgsFor(mode, input, places, places.fallbackOrigin),
      signal,
      deadlineAt,
    );
    if (normalizeTransportOffers(fallbackRaw, mode).length > 0) return { mode, raw: fallbackRaw };
  }

  return { mode, raw };
}

export interface TutuSearchResult {
  transport: NormalizedOffer[];
  hotels: NormalizedOffer[];
  modesSummary: ModesSummary;
  // Tutu's own explanation of every mode that came back with nothing --
  // see roadUnavailable.ts. Carried out of the client rather than logged
  // and dropped, because it is the difference between "no airport here"
  // and "no route today", which the traveller deserves to be told apart.
  unavailable: ModeUnavailable[];
  // Two-train plan for a route with no direct train, when Tutu offers one.
  // Read separately from modesSummary on purpose -- see readInterchangePlan.
  interchangePlan: InterchangePlan | null;
  warnings: string[];
  // What actually happened on each leg, independent of the other -- see
  // LegOutcome's own comment for why "empty" and "failed" have to render
  // different copy rather than sharing one vague fallback message.
  transportOutcome: LegOutcome;
  hotelsOutcome: LegOutcome;
}

export async function searchTutuOffers(input: TutuSearchInput): Promise<TutuSearchResult> {
  const endpoint = input.endpoint || process.env.TUTU_MCP_URL || DEFAULT_MCP_URL;
  const controller = new AbortController();
  const deadlineAt = Date.now() + SEARCH_BUDGET_MS;
  const deadline = setTimeout(() => controller.abort(), SEARCH_BUDGET_MS);
  const warnings: string[] = [];

  try {
    const places = await resolveProductSearchPlaces(input, controller.signal);
    // Each tool retries independently (see callToolWithRetry), with its own
    // attempt budget inside the one shared deadline/signal.
    const [roads, stays] = await Promise.allSettled([
      Promise.allSettled(
        TRANSPORT_MODES.map((mode) => searchTransportMode(endpoint, mode, input, places, controller.signal, deadlineAt)),
      ),
      callToolWithRetry(endpoint, "search_hotels", {
        city_name: places.hotelCity,
        check_in: input.intent.dateFrom,
        check_out: input.intent.dateTo,
        adults: input.intent.travelerCount,
        page_size: 5,
        view: "compact",
      }, controller.signal, deadlineAt),
    ]);

    let transport: NormalizedOffer[] = [];
    const offersByMode = new Map<TransportMode, NormalizedOffer[]>();
    let modesSummary: ModesSummary = {};
    let unavailable: ModeUnavailable[] = [];
    let interchangePlan: InterchangePlan | null = null;
    let transportOutcome: LegOutcome;
    if (roads.status === "fulfilled") {
      const failedModes: ModeUnavailable[] = [];
      let answeredModes = 0;
      for (const result of roads.value) {
        if (result.status === "rejected") {
          warnings.push(result.reason instanceof Error ? result.reason.message : "Tutu transport search failed");
          continue;
        }

        answeredModes += 1;
        const offers = normalizeTransportOffers(result.value.raw, result.value.mode);
        offersByMode.set(result.value.mode, offers);
        modesSummary = { ...modesSummary, ...readModesSummary(result.value.raw), ...summaryForMode(result.value.mode, offers) };
        unavailable.push(...readUnavailable(result.value.raw));
        if (offers.length === 0) failedModes.push({ mode: result.value.mode, reason: "no_route" });
        if (!interchangePlan && result.value.mode === "railway") {
          interchangePlan = readInterchangePlan(result.value.raw);
        }
      }
      if (unavailable.length === 0) unavailable = failedModes;
      transport = interleaveModeOffers(offersByMode);
      transportOutcome = transport.length > 0 ? "served" : answeredModes > 0 ? "empty" : "failed";
    } else {
      warnings.push(roads.reason instanceof Error ? roads.reason.message : "Tutu transport search failed");
      transportOutcome = "failed";
    }

    let hotels: NormalizedOffer[] = [];
    let hotelsOutcome: LegOutcome;
    if (stays.status === "fulfilled") {
      hotels = normalizeHotelOffers(stays.value);
      hotelsOutcome = hotels.length > 0 ? "served" : "empty";
    } else {
      warnings.push(stays.reason instanceof Error ? stays.reason.message : "Tutu hotel search failed");
      hotelsOutcome = "failed";
    }

    if (transport.length === 0) transport = [transportFallback(input)];
    if (hotels.length === 0) hotels = [hotelFallback(input)];

    return { transport, hotels, modesSummary, unavailable, interchangePlan, warnings, transportOutcome, hotelsOutcome };
  } finally {
    clearTimeout(deadline);
  }
}
