export type TarotPosition = "Зов" | "Путь" | "Дар маршрута";

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
  name: string;
  image?: string;
  archetypes: TarotArchetype[];
  meaning: string;
}

export interface DrawnTarotCard extends TarotCardDefinition {
  position: TarotPosition;
}

export interface TarotSpread {
  seed: string;
  cards: DrawnTarotCard[];
  archetypes: TarotArchetype[];
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
