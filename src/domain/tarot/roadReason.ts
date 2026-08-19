import type { DrawnTarotCard, TransportMode } from "@/domain/types";

const UPRIGHT: Record<TransportMode, string> = {
  avia: "поднимает над землёй — дорога будет короткой и резкой",
  railway: "сажает к окну — дорога будет долгой и созерцательной",
  bus: "ведёт по земле — дорога будет упрямой и близкой",
  etrain: "сажает в пригородный вагон — дорога будет короткой и простой",
};

const REVERSED: Record<TransportMode, string> = {
  avia: "поднимает над землёй, но неохотно — в пути будет тряско",
  railway: "сажает к окну и просит терпения — время растянется",
  bus: "ведёт по земле через сопротивление — дорога вымотает",
  // Deliberately no longer mentions пересадки: a real change on the road now
  // has its own sentence (see transferClause), and two different voices
  // talking about the same fact in one paragraph read as a stutter.
  etrain: "сажает в пригородный вагон и просит терпения — придётся считать минуты",
};

export const FOG_REASON =
  "Дорога скрыта туманом: карты не увидели ни одного пути, который можно проверить сегодня.";

// The clause below reads "с N пересадкой/пересадками", which is the
// instrumental case -- and in the instrumental every plural collapses to one
// form, so unlike the nominative there is no 2-4 / 5+ split to make. Only
// the singular differs, and 11 is the usual exception (одиннадцать
// пересадок, not одиннадцать пересадка).
function pluralTransfers(count: number): string {
  const isSingular = count % 10 === 1 && count % 100 !== 11;
  return `${count} ${isSingular ? "пересадкой" : "пересадками"}`;
}

// A change on the road is part of the prophecy, not an accident of ticketing.
// The card cannot *cause* a transfer -- reality reports the roads and the
// third card names one of them, which is the rule the whole app is built on
// -- but the card that named this road is the one that speaks about its
// shape, exactly as it already speaks about its mode above. A broken journey
// read as intent is the difference between "your flight has a layover" and
// an oracle that saw the pause coming.
//
// Place names appear after a colon, in the nominative, and are never
// declined: "через Москву" would need the accusative, and Russian toponyms
// decline inconsistently enough that interpolating a raw name breaks the
// grammar for a large share of them (see roadUnavailable.ts for the same
// decision and the same reasoning).
function transferClause(card: DrawnTarotCard, transfers: number, via: string[]): string | null {
  if (transfers <= 0) return null;

  const where = via.length > 0 ? ` Место излома: ${via.join(", ")}.` : "";
  const count = pluralTransfers(transfers);

  return card.reversed
    ? ` Путь ляжет с ${count} — и перевёрнутая карта делает стык хрупким: держите время про запас.${where}`
    : ` Путь ляжет с ${count} — разрыв в дороге здесь часть знака, а не помеха.${where}`;
}

export function roadReason(
  card: DrawnTarotCard,
  mode: TransportMode | null,
  // Optional so every existing call site, fixture and share-link path that
  // knows nothing about the shape of the road keeps producing exactly the
  // sentence it produced before.
  road?: { transfers?: number; via?: string[] },
): string {
  if (!mode) return FOG_REASON;
  const phrase = card.reversed ? REVERSED[mode] : UPRIGHT[mode];
  const transfer = transferClause(card, road?.transfers ?? 0, road?.via ?? []);
  return `«${card.name}» ${phrase}.${transfer ?? ""}`;
}
