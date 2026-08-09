import { tarotCards } from "@/domain/tarot/cards";
import type {
  DrawnTarotCard,
  TarotArchetype,
  TarotPosition,
  TransportMode,
  TripIntent,
} from "@/domain/types";

export type ArchetypeWeights = Partial<Record<TarotArchetype, number>>;

export interface DestinationDraw {
  seed: string;
  cards: DrawnTarotCard[];
}

const DESTINATION_POSITIONS: TarotPosition[] = ["Зов", "Дар"];

export function ritualSeed(intent: TripIntent): string {
  return [
    intent.departureCity.trim().toLocaleLowerCase("ru-RU"),
    intent.dateFrom,
    intent.dateTo,
    String(intent.travelerCount),
  ].join("|");
}

// Deterministic 32-bit hash. Same string always yields the same number, so the
// same intent always yields the same reading.
function hash(input: string): number {
  let value = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function pick<T>(pool: T[], salt: string): T {
  return pool[hash(salt) % pool.length];
}

function isReversed(salt: string): boolean {
  return (hash(`${salt}|orientation`) & 1) === 1;
}

export function drawDestinationCards(intent: TripIntent): DestinationDraw {
  const seed = ritualSeed(intent);
  const cards: DrawnTarotCard[] = [];

  for (const position of DESTINATION_POSITIONS) {
    const salt = `${seed}|${position}`;
    const pool = tarotCards.filter((card) => !cards.some((drawn) => drawn.id === card.id));
    const card = pick(pool, salt);
    cards.push({ ...card, position, reversed: isReversed(salt) });
  }

  return { seed, cards };
}

export function drawPathCard(
  seed: string,
  usableModes: TransportMode[],
  excludeIds: string[],
): DrawnTarotCard {
  const remaining = tarotCards.filter((card) => !excludeIds.includes(card.id));
  const matching = remaining.filter((card) =>
    card.transport.some((mode) => usableModes.includes(mode)),
  );
  // No usable mode, or every matching card is already on the table: a loose
  // card-to-road link beats no card at all.
  const pool = matching.length > 0 ? matching : remaining;
  const salt = `${seed}|Путь`;

  return { ...pick(pool, salt), position: "Путь", reversed: isReversed(salt) };
}

export function archetypeWeightsFrom(cards: DrawnTarotCard[]): ArchetypeWeights {
  const weights: ArchetypeWeights = {};
  for (const card of cards) {
    const weight = card.reversed ? 0.5 : 1;
    for (const archetype of card.archetypes) {
      weights[archetype] = (weights[archetype] ?? 0) + weight;
    }
  }
  return weights;
}
