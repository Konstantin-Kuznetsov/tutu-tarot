import { z } from "zod";
import { isCalendarDate } from "@/domain/validation/dates";
import { tarotCards } from "@/domain/tarot/cards";
import { travelAtlas } from "@/domain/travel/atlas";
import type { TransportMode } from "@/domain/types";

const TRANSPORT_MODES: [TransportMode, ...TransportMode[]] = ["avia", "railway", "bus"];

export interface SharedReadingCard {
  id: string;
  reversed: boolean;
}

export interface SharedReading {
  // A plain array, not a fixed-length tuple type: real readings always
  // carry exactly three (validated by payloadSchema below, which is a
  // literal 3-card tuple), but the type stays a plain array so callers can
  // build one from `[...cards.slice(1)]`-style spreads without fighting
  // TypeScript's tuple-length inference.
  cards: SharedReadingCard[];
  destinationId: string;
  mode: TransportMode | null;
  departureCity: string;
  dateFrom: string;
  dateTo: string;
  travelerCount: number;
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const REVERSED_FLAG = z.union([z.literal(0), z.literal(1)]);

// A flat tuple, not an object with named keys -- the whole reading has to
// fit in a link a stranger can paste into a messenger, so every byte spent
// on repeating a key name ("destinationId":...) is a byte the link doesn't
// need. Order is fixed and never inspected by key, only by position.
const payloadSchema = z.tuple([
  z.string().min(1), REVERSED_FLAG,
  z.string().min(1), REVERSED_FLAG,
  z.string().min(1), REVERSED_FLAG,
  z.string().min(1),
  z.enum(TRANSPORT_MODES).nullable(),
  z.string().min(1),
  z.string().regex(datePattern),
  z.string().regex(datePattern),
  z.number().int().min(1).max(8),
]);

type Payload = z.infer<typeof payloadSchema>;

function toPayload(reading: SharedReading): Payload {
  return [
    reading.cards[0].id, reading.cards[0].reversed ? 1 : 0,
    reading.cards[1].id, reading.cards[1].reversed ? 1 : 0,
    reading.cards[2].id, reading.cards[2].reversed ? 1 : 0,
    reading.destinationId,
    reading.mode,
    reading.departureCity,
    reading.dateFrom,
    reading.dateTo,
    reading.travelerCount,
  ];
}

function fromPayload(payload: Payload): SharedReading {
  return {
    cards: [
      { id: payload[0], reversed: payload[1] === 1 },
      { id: payload[2], reversed: payload[3] === 1 },
      { id: payload[4], reversed: payload[5] === 1 },
    ],
    destinationId: payload[6],
    mode: payload[7],
    departureCity: payload[8],
    dateFrom: payload[9],
    dateTo: payload[10],
    travelerCount: payload[11],
  };
}

// btoa/atob operate on "binary strings" (one UTF-16 code unit per byte),
// not on UTF-8 text directly -- calling btoa on a raw Cyrillic string
// throws outright. Routing through TextEncoder/TextDecoder first is what
// lets the departure city survive round-tripping in any script.
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

function fromBase64Url(code: string): Uint8Array | null {
  if (!BASE64URL_PATTERN.test(code)) return null;

  const base64 = code.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

export function encodeReading(reading: SharedReading): string {
  const json = JSON.stringify(toPayload(reading));
  return toBase64Url(new TextEncoder().encode(json));
}

// A share code arrives from a stranger's tapped link, never from code this
// app itself just generated -- it must never throw, and it must fail closed
// (null) on anything it cannot fully vouch for, ids included. Every step
// that can fail is guarded so a malformed link renders the product's own
// calm "lay a fresh spread" page instead of a stack trace.
export function decodeReading(code: string): SharedReading | null {
  try {
    const bytes = fromBase64Url(code);
    if (!bytes) return null;

    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed: unknown = JSON.parse(json);
    const result = payloadSchema.safeParse(parsed);
    if (!result.success) return null;

    const reading = fromPayload(result.data);

    // Validate calendar dates
    if (!isCalendarDate(reading.dateFrom) || !isCalendarDate(reading.dateTo)) return null;

    // Validate date range: dateTo must not be before dateFrom
    if (reading.dateTo < reading.dateFrom) return null;

    // Validate card ids are in the deck
    const deckIds = new Set(tarotCards.map((card) => card.id));
    if (!reading.cards.every((card) => deckIds.has(card.id))) return null;

    // Validate card ids are distinct (no duplicates)
    const cardIds = new Set(reading.cards.map((card) => card.id));
    if (cardIds.size !== 3) return null;

    // Validate destination is in the atlas
    const atlasIds = new Set(travelAtlas.map((place) => place.id));
    if (!atlasIds.has(reading.destinationId)) return null;

    return reading;
  } catch {
    return null;
  }
}
