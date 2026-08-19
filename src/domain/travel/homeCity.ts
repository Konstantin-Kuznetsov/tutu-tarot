import type { TravelAtlasItem } from "@/domain/types";

// The oracle used to be able to send you where you already are: from Казань
// it offered «Казань и Татарстан» (reproduced live, 2026-08-19). Nothing in
// the selection ever looked at the departure city -- the word `departureCity`
// appeared nowhere in src/domain/travel/ at all. The seed depends on it, so
// the *choice* varied, but nothing excluded the traveller's own city.
//
// What counts as "already there" is the whole question, and the atlas
// answers it: a destination is matched on its own identity -- `name` and
// `anchorPlace` -- and never on `nearestTransportHub` or `hotelSearchCity`.
// Those last two are gateways, not the place itself. Усьвинские Столбы are
// reached through Пермь and lie some 200km away; excluding them for a Perm
// resident would delete a genuinely different trip. Казань и Татарстан, by
// contrast, carries Казань as both its name and its anchor, and Псков is
// simply Псков.
//
// Measured across the atlas of 31: Москва and Санкт-Петербург collide with
// nothing at all, Казань and Псков each collide with exactly one, and Пермь
// collides only through a hub and is therefore left alone.

// Lowercase, «ё» folded to «е», and whitespace collapsed. The ё/е fold is
// not decoration: a traveller in Орёл who types «Орел» -- as most people do,
// and as most keyboards encourage -- must still be recognised as being in
// the same city the atlas might spell with ё.
function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/\s+/g, " ");
}

// Whole-phrase match, not a substring: «Казань и Татарстан» contains «Казань»
// as a word and should match, while a hypothetical «Тверская область» must
// not be excluded for someone departing «Тверь». Bounded by anything that is
// not a Cyrillic letter, so a multi-word city («Минеральные Воды», «Нижний
// Новгород») still matches as one phrase.
//
// Built once per departure city, never once per destination. The first
// version constructed a RegExp inside the per-destination loop, which is
// invisible on a single request and ruinous in the reachability test: 29 568
// draws x 31 destinations x 2 fields is nearly two million compilations, and
// the suite went from passing to timing out at 5s.
function matcherFor(departureCity: string): RegExp | null {
  const city = normalize(departureCity);
  // A one- or two-letter fragment would match far too much; a real city name
  // is longer than that, and an empty field must never exclude anything.
  if (city.length < 3) return null;
  const escaped = city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^а-я])${escaped}([^а-я]|$)`, "u");
}

function matches(matcher: RegExp, destination: TravelAtlasItem): boolean {
  return [destination.name, destination.anchorPlace]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .some((value) => matcher.test(normalize(value)));
}

export function isDeparturePlace(departureCity: string, destination: TravelAtlasItem): boolean {
  const matcher = matcherFor(departureCity);
  return matcher !== null && matches(matcher, destination);
}

// The atlas minus wherever the traveller already is. Falls back to the full
// list if the filter somehow empties it: a reading with no destination at all
// is a far worse outcome than one that suggests the city you are standing in,
// and with 31 destinations against one departure city it cannot happen today.
export function withoutHomeCity(
  destinations: TravelAtlasItem[],
  departureCity: string,
): TravelAtlasItem[] {
  const matcher = matcherFor(departureCity);
  if (matcher === null) return destinations;

  const remaining = destinations.filter((destination) => !matches(matcher, destination));
  return remaining.length > 0 ? remaining : destinations;
}
