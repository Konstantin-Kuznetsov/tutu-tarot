import type { TransportMode } from "@/domain/types";

// Encode-only module, deliberately free of zod (or anything else that isn't
// needed to build a share link): ShareButton.tsx imports encodeReading
// straight into the client bundle, and a module-scope call expression like
// `z.tuple([...])` is not tree-shaken even when nothing in the module that
// uses it (decodeReading) ever runs client-side -- see decode.ts, which is
// the only place that schema now lives, and which nothing in this file (or
// anything the client imports) ever reaches. Measured before this split:
// the chunk carrying that one schema constant was 65KB gzipped, ~27% of all
// JS on the home page, for a validation path the browser never executes.
export interface SharedReadingCard {
  id: string;
  reversed: boolean;
}

export interface SharedReading {
  // A plain array, not a fixed-length tuple type: real readings always
  // carry exactly three (validated by decode.ts's payloadSchema, which is a
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

// The wire shape encodeReading/decodeReading actually send over the link: a
// flat 12-element tuple (three [id, reversedFlag] pairs, then
// destinationId, mode, departureCity, dateFrom, dateTo, travelerCount) --
// see SharedReading's own comment on why a tuple, not an object with named
// keys. Hand-written here rather than derived from decode.ts's zod schema
// (`z.infer<typeof payloadSchema>`, which is what this used to be): that
// derivation would make this encode-only module depend on decode.ts, and
// therefore on zod, exactly the dependency this split exists to cut.
// decode.ts's schema infers this same shape independently -- TypeScript's
// structural typing is what keeps the two from silently diverging, no
// shared runtime value required.
export type Payload = [
  string, 0 | 1,
  string, 0 | 1,
  string, 0 | 1,
  string,
  TransportMode | null,
  string,
  string,
  string,
  number,
];

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

export function encodeReading(reading: SharedReading): string {
  const json = JSON.stringify(toPayload(reading));
  return toBase64Url(new TextEncoder().encode(json));
}
