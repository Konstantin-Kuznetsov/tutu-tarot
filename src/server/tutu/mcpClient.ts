import type { TravelAtlasItem, TripIntent } from "@/domain/types";
import { normalizeHotelOffers, normalizeTransportOffers, type NormalizedOffer } from "./normalize";

const DEFAULT_MCP_URL = "https://mcp.tutu.ru/mcp";

export interface TutuSearchInput {
  intent: TripIntent;
  destination: TravelAtlasItem;
  endpoint?: string;
}

export interface TutuSearchResult {
  transport: NormalizedOffer[];
  hotels: NormalizedOffer[];
  warnings: string[];
}

async function callTool(endpoint: string, name: string, args: Record<string, unknown>): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  const requestId = `${name}-${Date.now()}`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
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
    if (!response.ok) throw new Error(`Tutu MCP ${name} failed with ${response.status}`);
    const contentType = response.headers.get("content-type")?.toLowerCase();
    const raw = contentType?.includes("text/event-stream")
      ? parseSseResponse(await response.text(), name, requestId)
      : await response.json();
    return unwrapMcpResponse(raw, name);
  } finally {
    clearTimeout(timeout);
  }
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

  try {
    return JSON.parse(textBlock.text);
  } catch {
    throw new Error(`Tutu MCP ${name} result content is not valid JSON`);
  }
}

export async function searchTutuOffers(input: TutuSearchInput): Promise<TutuSearchResult> {
  const endpoint = input.endpoint || process.env.TUTU_MCP_URL || DEFAULT_MCP_URL;
  const warnings: string[] = [];
  let transport: NormalizedOffer[] = [];
  let hotels: NormalizedOffer[] = [];

  try {
    const rawTransport = await callTool(endpoint, "search_multitransport", {
      from: input.intent.departureCity,
      to: input.destination.nearestTransportHub,
      date: input.intent.dateFrom,
      passengers: input.intent.travelerCount,
      page_size: 5,
    });
    transport = normalizeTransportOffers(rawTransport);
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Tutu transport search failed");
  }

  try {
    const rawHotels = await callTool(endpoint, "search_hotels", {
      city: input.destination.hotelSearchCity,
      date_from: input.intent.dateFrom,
      date_to: input.intent.dateTo,
      guests: input.intent.travelerCount,
      page_size: 5,
    });
    hotels = normalizeHotelOffers(rawHotels);
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Tutu hotel search failed");
  }

  return { transport, hotels, warnings };
}
