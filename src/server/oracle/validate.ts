import { travelAtlas } from "@/domain/travel/atlas";

// What the model is trusted to write, and nothing more: one text per drawn
// card (keyed by the card id the caller sent it) and a single closing line.
// It never carries a destination, a region, a transport mode, a price, or a
// link -- those are rendered from RitualResult elsewhere and this shape has
// no field for any of them.
export interface AiCardReading {
  id: string;
  text: string;
}

// opening joins cardReadings/closingLine as free text the model writes: a
// single introductory paragraph about the chosen destination and route,
// grounded in whatever guide facts the caller sent (see
// NarrationRequestInput in aiClient.ts). Validated with the exact same
// isCleanText rule as the other two fields below -- length bounds, no URLs,
// predominantly Cyrillic, no other atlas destination's name -- so it can
// never smuggle in anything the card readings and closing line couldn't.
export interface AiNarration {
  opening: string;
  cardReadings: AiCardReading[];
  closingLine: string;
}

// The only two facts validation needs from the caller: which three card ids
// were actually sent (so a reply can't reference a card that wasn't drawn)
// and which destination was already chosen (so its own name is allowed to
// appear while every other atlas name is not).
export interface NarrationContext {
  cardIds: string[];
  destinationName: string;
}

const MIN_TEXT_LENGTH = 20;
const MAX_TEXT_LENGTH = 400;

// Matches "http://", "https://" and bare "www." -- deliberately loose rather
// than a strict URL grammar, because the goal is "does this look like a
// link", not RFC 3986 conformance.
const URL_PATTERN = /https?:\/\/|www\./i;

// "Predominantly Cyrillic" is a ratio over letters, not a language
// classifier: it catches a model answering in English (mostly Latin
// letters) and a model emitting markup or code fences (the tag names and
// JSON punctuation pull the ratio down), without pretending to detect every
// possible non-Russian reply.
function isPredominantlyCyrillic(text: string): boolean {
  const letters = text.match(/\p{L}/gu);
  if (!letters || letters.length === 0) return false;
  const cyrillicCount = letters.filter((letter) => /\p{Script=Cyrillic}/u.test(letter)).length;
  return cyrillicCount / letters.length > 0.5;
}

// All travelAtlas names other than the one already chosen. This is the
// "known names" half of the destination check: it rejects a model that
// names a different place we already curated, matched case-insensitively.
// It cannot reject a place we have never heard of -- that limit is
// structural, not lexical: the route itself (destination, region, mode,
// price, links) is never read from anything this module returns, so no
// text passing this check can redirect the trip regardless of what it says.
function otherDestinationNames(chosenName: string): string[] {
  const chosenLower = chosenName.toLowerCase();
  return travelAtlas.map((item) => item.name).filter((name) => name.toLowerCase() !== chosenLower);
}

function isCleanText(text: unknown, forbiddenNames: string[]): text is string {
  if (typeof text !== "string") return false;
  if (text.length < MIN_TEXT_LENGTH || text.length > MAX_TEXT_LENGTH) return false;
  if (URL_PATTERN.test(text)) return false;
  if (!isPredominantlyCyrillic(text)) return false;

  const lower = text.toLowerCase();
  if (forbiddenNames.some((name) => lower.includes(name.toLowerCase()))) return false;

  return true;
}

// Takes untrusted model output (a raw string, expected to be JSON) and
// either returns a narration safe to render or null, telling the caller to
// fall back to the written-in template. Never throws: every branch that
// touches the parsed shape is guarded, so malformed input degrades to null
// instead of an exception reaching the caller.
export function validateNarration(raw: string, context: NarrationContext): AiNarration | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const record = parsed as { opening?: unknown; cardReadings?: unknown; closingLine?: unknown };
  if (!Array.isArray(record.cardReadings) || record.cardReadings.length !== 3) return null;

  const forbiddenNames = otherDestinationNames(context.destinationName);

  if (!isCleanText(record.opening, forbiddenNames)) return null;

  const seenIds = new Set<string>();
  const cardReadings: AiCardReading[] = [];

  for (const entry of record.cardReadings) {
    if (!entry || typeof entry !== "object") return null;
    const { id, text } = entry as { id?: unknown; text?: unknown };

    if (typeof id !== "string" || !context.cardIds.includes(id)) return null;
    if (seenIds.has(id)) return null;
    seenIds.add(id);

    if (!isCleanText(text, forbiddenNames)) return null;
    cardReadings.push({ id, text });
  }

  if (!isCleanText(record.closingLine, forbiddenNames)) return null;

  return { opening: record.opening, cardReadings, closingLine: record.closingLine };
}
