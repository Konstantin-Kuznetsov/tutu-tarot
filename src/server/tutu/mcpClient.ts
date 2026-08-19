import type { ModeUnavailable } from "@/domain/travel/roadUnavailable";
import type { LegOutcome, ModesSummary, TravelAtlasItem, TripIntent } from "@/domain/types";
import { normalizeHotelOffers, normalizeTransportOffers, readModesSummary, readUnavailable, type NormalizedOffer } from "./normalize";

const DEFAULT_MCP_URL = "https://mcp.tutu.ru/mcp";

// Thrown for a non-2xx HTTP response, carrying the status code so the retry
// policy (see isTransientError below) can tell a fast refusal (503/502/504,
// or 429 rate limiting) from a malformed request (any other 4xx) without
// parsing the message string back apart. Message format is unchanged from
// before retries existed -- it is the exact text production logs already
// show ("Tutu MCP search_multitransport failed with 503").
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

// Up to two retries (three attempts total) per leg, only for transient
// signals (see isTransientError) -- 503/502/504/429 and a fetch() that
// never reached the server. A malformed request (any other 4xx) or a
// tool-level rejection delivered as text inside result.content[] fails
// identically on a second try, so those are never retried; see this
// module's own comment on TutuNetworkError for why response-in-hand errors
// generally aren't either.
const MAX_ATTEMPTS = 3;
// Base backoff before attempt 2 and attempt 3, in ms -- jittered below so
// two legs (or two concurrent users) retrying on the same schedule don't
// resynchronise. A production 503 refusal comes back in 0.5-1.5s, so both
// steps fit comfortably inside the 18s search budget.
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

export interface TutuSearchResult {
  transport: NormalizedOffer[];
  hotels: NormalizedOffer[];
  modesSummary: ModesSummary;
  // Tutu's own explanation of every mode that came back with nothing --
  // see roadUnavailable.ts. Carried out of the client rather than logged
  // and dropped, because it is the difference between "no airport here"
  // and "no route today", which the traveller deserves to be told apart.
  unavailable: ModeUnavailable[];
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
    // Each leg retries independently (see callToolWithRetry) -- they
    // already fail independently today, this just gives each its own
    // attempt budget within the one shared deadline/signal.
    const [roads, stays] = await Promise.allSettled([
      callToolWithRetry(endpoint, "search_multitransport", {
        origin: input.intent.departureCity,
        destination: input.destination.nearestTransportHub,
        departure_date: input.intent.dateFrom,
        adults: input.intent.travelerCount,
        // etrain (пригородные электрички) is requested alongside the other
        // three because search_multitransport runs all four in parallel for
        // the same price in latency, and because it is the only road that
        // exists for some short hops. Every layer that consumes a mode knows
        // it -- see TransportMode's own comment for why adding it cannot
        // change an existing draw.
        modes: ["avia", "railway", "bus", "etrain"],
        optimize_for: "price",
        page_size: 20,
        view: "compact",
      }, controller.signal, deadlineAt),
      callToolWithRetry(endpoint, "search_hotels", {
        city_name: input.destination.hotelSearchCity,
        check_in: input.intent.dateFrom,
        check_out: input.intent.dateTo,
        adults: input.intent.travelerCount,
        page_size: 5,
        view: "compact",
      }, controller.signal, deadlineAt),
    ]);

    let transport: NormalizedOffer[] = [];
    let modesSummary: ModesSummary = {};
    let unavailable: ModeUnavailable[] = [];
    let transportOutcome: LegOutcome;
    if (roads.status === "fulfilled") {
      transport = normalizeTransportOffers(roads.value);
      modesSummary = readModesSummary(roads.value);
      unavailable = readUnavailable(roads.value);
      transportOutcome = transport.length > 0 ? "served" : "empty";
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

    return { transport, hotels, modesSummary, unavailable, warnings, transportOutcome, hotelsOutcome };
  } finally {
    clearTimeout(deadline);
  }
}
