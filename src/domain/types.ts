export type TarotPosition = "Зов" | "Дар" | "Путь";

// "etrain" is Tutu's пригородная электричка -- the humble local train.
// It is deliberately last in every MODE_ORDER and last in every card's
// `transport` list (see cards.ts): a card names it only when nothing
// grander is available, which makes adding it strictly additive -- no draw
// that worked before this mode existed resolves differently now.
export type TransportMode = "avia" | "railway" | "bus" | "etrain";

export type TarotArchetype =
  | "solitude"
  | "road"
  | "cliffs"
  | "water"
  | "north"
  | "culture"
  | "food"
  | "sun"
  | "renewal"
  | "mystery"
  | "star";

export interface TripIntent {
  departureCity: string;
  dateFrom: string;
  dateTo: string;
  travelerCount: number;
}

export interface TarotCardDefinition {
  id: string;
  number: number;
  name: string;
  image: string;
  archetypes: TarotArchetype[];
  transport: TransportMode[];
  meaning: string;
  meaningReversed: string;
}

export interface DrawnTarotCard extends TarotCardDefinition {
  position: TarotPosition;
  reversed: boolean;
}

export interface TravelAtlasItem {
  id: string;
  name: string;
  region: string;
  routeTitle: string;
  anchorPlace: string;
  nearestTransportHub: string;
  hotelSearchCity: string;
  tags: string[];
  season: string[];
  mood: string[];
  tarotArchetypes: TarotArchetype[];
  source: "provereno.tutu" | "geo.tutu" | "fallback";
  sourceUrl: string;
  geoUrl?: string;
  image?: string;
  oracleHook: string;
  routeDays?: number;
  rating?: string;
  // The four guide facts data/tutu-guides.json carries that the type didn't
  // already have a place for (routeDays/rating did): the window the route
  // actually runs in, the route's own waypoints, its highlight list, and the
  // guide's own one-line summary. All optional because ten atlas entries are
  // sourced from a regional geo guide rather than a single rated route (see
  // routeDays/rating's own null-ness for those same ten) and seasonWindow is
  // additionally absent for three entries even among the rest: two because
  // the source page names no overall season at all, and one (hmao-yugra)
  // because the collector's raw value there was an opening-hours phrase, not
  // a season, and was dropped -- see atlas.ts's own per-entry comments for
  // which.
  seasonWindow?: string;
  stops?: string[];
  highlights?: string[];
  oneLine?: string;
}

export interface DestinationSelection {
  destination: TravelAtlasItem;
  score: number;
  reasons: string[];
}

export interface ModeSummary {
  count: number;
  minPrice: number | null;
  minDurationMin: number | null;
}

export type ModesSummary = Partial<Record<TransportMode, ModeSummary>>;

// What happened to one leg of a Tutu MCP search (transport or hotels),
// distinct from the diagnostic `warnings` strings: "served" (real offers
// came back), "empty" (Tutu answered, nothing usable for these dates -- a
// real answer, not an error) or "failed" (every attempt was refused or
// could not complete -- the reading was never actually checked). The two
// failure-adjacent states render different copy (see LEG_OUTCOME_COPY in
// src/components/OfferList.tsx) because they mean different things to a
// reader: "empty" is safe to trust, "failed" is not.
export type LegOutcome = "served" | "empty" | "failed";
