export type TarotPosition = "Зов" | "Дар" | "Путь";

// The single runtime list of transport modes, with the type derived from it
// rather than declared alongside it. That direction matters: a hand-written
// union plus a hand-written array drift silently, and they did. The deck's
// "every mode is carried by at least six cards" invariant iterated its own
// hardcoded array of three, so when "etrain" was added as a fourth mode the
// test kept passing while covering nothing about it -- typed as
// TransportMode[], so nothing complained. Deriving the type from the array
// means any future mode is checked by every loop that walks this list, on
// the day it is added.
//
// "etrain" is Tutu's пригородная электричка -- the humble local train. It is
// deliberately last here, last in every MODE_ORDER, and last in every card's
// `transport` list (see cards.ts): a card names it only when nothing grander
// is available, which is what makes adding it strictly additive -- no draw
// that worked before this mode existed resolves differently now.
export const TRANSPORT_MODES = ["avia", "railway", "bus", "etrain"] as const;

export type TransportMode = (typeof TRANSPORT_MODES)[number];

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

// Rail fare ladder. Tutu returns these as codes on a rail entry's `fares`
// summary and on every leg of an interchange plan; the four below are the
// ones observed live. An unknown code is dropped rather than shown raw --
// «SOFT» on screen would be worse than one fewer chip.
export type SeatCategoryCode = "SEDENTARY" | "RESERVED_SEAT" | "COMPARTMENT" | "SOFT";

export interface SeatCategory {
  code: SeatCategoryCode;
  label: string;
  priceFrom: number;
  seatsLeft?: number;
}

// One train of a two-train plan. Each leg is separately bookable -- it
// carries its own checkout_url -- which is what makes a plan showable at
// all, even though the plan as a whole has no single ticket.
export interface InterchangeLeg {
  trainNumber?: string;
  from: string;
  to: string;
  departureAt?: string;
  arrivalAt?: string;
  durationMin?: number;
  priceFrom?: number;
  url?: string;
  seatCategories: SeatCategory[];
}

// `meta.modes_summary.railway.interchange_routes`: what Tutu offers when no
// direct train runs the route. Deliberately kept out of the ranked variant
// list by Tutu itself, because a plan is two purchases rather than one
// ticket -- so it is never the road the third card names, and the product
// has to say plainly that it is a plan.
//
// `priceFrom` is a *sum of the cheapest fare on each leg* (Tutu labels this
// itself, in `price_basis`), not a quoted price for the journey. Presenting
// it as one would be the exact kind of invented fact this app refuses.
export interface InterchangePlan {
  via: string[];
  transferCount: number;
  departureAt?: string;
  arrivalAt?: string;
  durationMin?: number;
  priceFrom?: number;
  legs: InterchangeLeg[];
}
