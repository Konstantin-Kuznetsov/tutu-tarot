import { tarotCards } from "@/domain/tarot/cards";
import { travelAtlas } from "@/domain/travel/atlas";
import type { DrawnTarotCard, TarotPosition, TravelAtlasItem } from "@/domain/types";
import type { SharedReading, SharedReadingCard } from "./code";

// Shared by src/app/r/[code]/page.tsx and its opengraph-image.tsx sibling,
// so both reconstruct the frozen prophecy (three drawn cards + the
// destination they pointed to) from a SharedReading the exact same way,
// rather than two copies of this lookup drifting apart.

// Fixed by construction: SharedReading.cards is always [Зов, Дар, Путь], the
// same order runRitual itself produces ([...draw.cards, pathCard]).
export const SHARED_READING_POSITIONS: TarotPosition[] = ["Зов", "Дар", "Путь"];

export interface ResolvedSharedReading {
  destination: TravelAtlasItem;
  spreadCards: DrawnTarotCard[];
}

// decodeReading already checked every card id against the real deck and the
// destination id against the real atlas, so a lookup only comes back empty
// here if the deck/atlas itself changed under a link someone had already
// shared. Treated the same as an untrusted code -- null, never a throw --
// rather than a crash.
export function resolveSharedReading(reading: SharedReading): ResolvedSharedReading | null {
  const destination = travelAtlas.find((place) => place.id === reading.destinationId);
  if (!destination) return null;

  const cardById = new Map(tarotCards.map((card) => [card.id, card]));
  const spreadCards: DrawnTarotCard[] = [];

  for (let index = 0; index < reading.cards.length; index += 1) {
    const drawn: SharedReadingCard = reading.cards[index];
    const definition = cardById.get(drawn.id);
    if (!definition) return null;
    spreadCards.push({ ...definition, position: SHARED_READING_POSITIONS[index], reversed: drawn.reversed });
  }

  return { destination, spreadCards };
}
