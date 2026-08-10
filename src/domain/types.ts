export type TarotPosition = "Зов" | "Дар" | "Путь";

export type TransportMode = "avia" | "railway" | "bus";

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
