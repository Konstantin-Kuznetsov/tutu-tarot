import type { DrawnTarotCard, TransportMode } from "@/domain/types";

const UPRIGHT: Record<TransportMode, string> = {
  avia: "поднимает над землёй — дорога будет короткой и резкой",
  railway: "сажает к окну — дорога будет долгой и созерцательной",
  bus: "ведёт по земле — дорога будет упрямой и близкой",
};

const REVERSED: Record<TransportMode, string> = {
  avia: "поднимает над землёй, но неохотно — в пути будет тряско",
  railway: "сажает к окну и просит терпения — время растянется",
  bus: "ведёт по земле через сопротивление — дорога вымотает",
};

export const FOG_REASON =
  "Дорога скрыта туманом: карты не увидели ни одного пути, который можно проверить сегодня.";

export function roadReason(card: DrawnTarotCard, mode: TransportMode | null): string {
  if (!mode) return FOG_REASON;
  const phrase = card.reversed ? REVERSED[mode] : UPRIGHT[mode];
  return `«${card.name}» ${phrase}.`;
}
