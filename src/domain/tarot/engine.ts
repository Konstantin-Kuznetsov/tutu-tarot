import type { TarotArchetype, TarotPosition, TarotSpread, TripIntent } from "@/domain/types";
import { tarotCards } from "./cards";

const positions: TarotPosition[] = ["Зов", "Путь", "Дар маршрута"];

function normalizeIntent(input: TripIntent): string {
  return [
    input.departureCity.trim().toLocaleLowerCase("ru-RU"),
    input.dateFrom,
    input.dateTo,
    String(input.travelerCount),
  ].join("|");
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 4294967296;
  };
}

export function drawTarotSpread(input: TripIntent): TarotSpread {
  const seed = normalizeIntent(input);
  const random = nextRandom(hashSeed(seed));
  const deck = [...tarotCards];
  const cards = positions.map((position) => {
    const index = Math.floor(random() * deck.length);
    const [card] = deck.splice(index, 1);
    return { ...card, position };
  });
  const archetypes = Array.from(
    new Set(cards.flatMap((card) => card.archetypes)),
  ) as TarotArchetype[];

  return { seed, cards, archetypes };
}
