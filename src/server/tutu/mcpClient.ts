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
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${name}-${Date.now()}`,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  if (!response.ok) throw new Error(`Tutu MCP ${name} failed with ${response.status}`);
  return response.json();
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
