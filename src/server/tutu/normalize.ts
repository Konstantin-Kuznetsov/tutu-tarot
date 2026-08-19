import type { ModeUnavailable } from "@/domain/travel/roadUnavailable";
import { TRANSPORT_MODES } from "@/domain/types";
import type { InterchangeLeg, InterchangePlan, ModesSummary, SeatCategory, SeatCategoryCode, TransportMode } from "@/domain/types";

export interface NormalizedOffer {
  id: string;
  title: string;
  price?: string;
  subtitle?: string;
  url?: string;
  mode?: TransportMode;
  // Number of changes on the outbound leg (segments - 1), and the places
  // they happen. Carried on the offer rather than derived at render time
  // because the third card's own reading now speaks about the change (see
  // roadReason) -- the prophecy has to know the shape of the road, not just
  // its mode.
  transfers?: number;
  via?: string[];
  // The rail fare ladder, when this offer's mode has one. Empty for every
  // mode that does not.
  seatCategories?: SeatCategory[];
}

// Derived, never re-typed: see TRANSPORT_MODES on why a second hand-written
// list of modes is how "etrain" once slipped past the deck invariant.
const MODES = TRANSPORT_MODES;

function readMode(value: unknown): TransportMode | undefined {
  return MODES.find((mode) => mode === value);
}

export function readModesSummary(raw: unknown): ModesSummary {
  const meta = raw && typeof raw === "object" ? (raw as { meta?: unknown }).meta : undefined;
  const source = meta && typeof meta === "object"
    ? (meta as { modes_summary?: unknown }).modes_summary
    : undefined;
  if (!source || typeof source !== "object") return {};

  const summary: ModesSummary = {};
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const mode = readMode(key);
    if (!mode || !value || typeof value !== "object") continue;

    const record = value as { count?: unknown; min_price?: unknown; min_duration_min?: unknown };
    if (typeof record.count !== "number" || record.count <= 0) continue;

    summary[mode] = {
      count: record.count,
      minPrice: typeof record.min_price === "number" ? record.min_price : null,
      minDurationMin: typeof record.min_duration_min === "number" ? record.min_duration_min : null,
    };
  }
  return summary;
}

// The companion to readModesSummary: `meta.unavailable[]` says which modes
// produced nothing and why. Same defensive shape as everything else here --
// anything that is not a recognised mode with a string reason is skipped
// rather than passed along half-formed. See roadUnavailable.ts for what is
// done with it.
export function readUnavailable(raw: unknown): ModeUnavailable[] {
  const meta = raw && typeof raw === "object" ? (raw as { meta?: unknown }).meta : undefined;
  const source = meta && typeof meta === "object" ? (meta as { unavailable?: unknown }).unavailable : undefined;
  if (!Array.isArray(source)) return [];

  const entries: ModeUnavailable[] = [];
  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const record = item as { mode?: unknown; reason?: unknown; detail?: unknown };
    const mode = readMode(record.mode);
    if (!mode || typeof record.reason !== "string") continue;
    entries.push({
      mode,
      reason: record.reason,
      detail: typeof record.detail === "string" ? record.detail : undefined,
    });
  }
  return entries;
}

// "Москва — Шереметьево (SVO), терм. B" -> "Москва";
// "Абакан, 2038230" -> "Абакан"; "Псков — Псков-Пасс. (2004500)" -> "Псков".
// Station strings carry the city first and the platform/terminal/geo id
// after a dash or a comma, and only the city is fit to put in a sentence.
// Left in the nominative on purpose -- see roadReason for why no Russian
// place name is ever declined by this codebase.
export function stationCity(value: string): string {
  const beforeDash = value.split(" — ")[0];
  return beforeDash.split(",")[0].trim();
}

const SEAT_LABELS: Record<SeatCategoryCode, string> = {
  SEDENTARY: "сидячий",
  RESERVED_SEAT: "плацкарт",
  COMPARTMENT: "купе",
  SOFT: "СВ",
  LUX: "люкс",
};

// Cheapest first, which is also the ladder a traveller reads. Fixed order
// rather than sorting by price: the rungs mean something (сидячий is always
// humbler than СВ), and a day when купе happens to undercut плацкарт should
// not reshuffle the ladder.
const SEAT_ORDER: SeatCategoryCode[] = ["SEDENTARY", "RESERVED_SEAT", "COMPARTMENT", "SOFT", "LUX"];

// `price_from` arrives in two different shapes under the same name, which is
// how the ladder came to render as nothing on every ordinary train. On an
// interchange plan's leg it is an object -- `{ amount: 2501.26, currency:
// "RUB" }` -- while on a rail variant's own `fares.seat_categories` it is a
// bare number, `3997.31`. Reading only the object form silently produced an
// empty ladder for the far more common case, with nothing to show for it and
// nothing to warn about it.
function readAmount(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (value && typeof value === "object") {
    const amount = (value as { amount?: unknown }).amount;
    if (typeof amount === "number") return amount;
  }
  return undefined;
}

function readSeatCategories(value: unknown): SeatCategory[] {
  if (!value || typeof value !== "object") return [];
  const source = value as Record<string, unknown>;
  const found: SeatCategory[] = [];
  for (const code of SEAT_ORDER) {
    const entry = source[code];
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { price_from?: unknown; seats_left?: unknown };
    const price = readAmount(record.price_from);
    if (price === undefined) continue;
    found.push({
      code,
      label: SEAT_LABELS[code],
      priceFrom: price,
      // Only `seats_left`, never the sibling `count` that a rail variant's
      // fares summary carries: `count` is how many fare rows are on sale in
      // that category, not how many seats are left. Rendering 16 fares as
      // «16 мест» would be a made-up fact of exactly the kind this app
      // refuses -- so an entry without seats_left simply shows no count.
      seatsLeft: typeof record.seats_left === "number" ? record.seats_left : undefined,
    });
  }
  return found;
}

// Read straight off `meta.modes_summary.railway`, NOT through
// readModesSummary: that function drops any mode whose `count` is 0, and a
// route with no direct train but a two-train plan is reported as exactly
// `railway: { count: 0, ..., interchange_routes: [...] }`. Reusing it here
// would have discarded every plan there is.
export function readInterchangePlan(raw: unknown): InterchangePlan | null {
  const meta = raw && typeof raw === "object" ? (raw as { meta?: unknown }).meta : undefined;
  const summary = meta && typeof meta === "object" ? (meta as { modes_summary?: unknown }).modes_summary : undefined;
  const railway = summary && typeof summary === "object" ? (summary as { railway?: unknown }).railway : undefined;
  const routes = railway && typeof railway === "object" ? (railway as { interchange_routes?: unknown }).interchange_routes : undefined;
  if (!Array.isArray(routes) || routes.length === 0) return null;

  const first = routes[0];
  if (!first || typeof first !== "object") return null;
  const plan = first as Record<string, unknown>;

  const legs: InterchangeLeg[] = (Array.isArray(plan.legs) ? plan.legs : [])
    .filter((leg): leg is Record<string, unknown> => Boolean(leg) && typeof leg === "object")
    .map((leg) => ({
      trainNumber: readString(leg.train_number),
      from: readString(leg.from) ?? "",
      to: readString(leg.to) ?? "",
      departureAt: readString(leg.departure_at),
      arrivalAt: readString(leg.arrival_at),
      durationMin: typeof leg.duration_min === "number" ? leg.duration_min : undefined,
      priceFrom: leg.price_from && typeof leg.price_from === "object"
        ? ((leg.price_from as { amount?: unknown }).amount as number | undefined)
        : undefined,
      url: readString(leg.checkout_url),
      seatCategories: readSeatCategories(leg.seat_categories),
    }));

  // A plan with no legs is not a plan -- nothing to link to and nothing to
  // show. Better to render no block than an empty one.
  if (legs.length === 0) return null;

  return {
    via: (Array.isArray(plan.via) ? plan.via : []).filter((v): v is string => typeof v === "string"),
    transferCount: typeof plan.transfer_count === "number" ? plan.transfer_count : Math.max(0, legs.length - 1),
    departureAt: readString(plan.departure_at),
    arrivalAt: readString(plan.arrival_at),
    durationMin: typeof plan.duration_min === "number" ? plan.duration_min : undefined,
    priceFrom: plan.price_from && typeof plan.price_from === "object"
      ? ((plan.price_from as { amount?: unknown }).amount as number | undefined)
      : undefined,
    legs,
  };
}

function readItems(raw: unknown): unknown[] {
  if (raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)) {
    return (raw as { items: unknown[] }).items;
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as { variants?: unknown }).variants)) {
    return (raw as { variants: unknown[] }).variants;
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as { offers?: unknown }).offers)) {
    return (raw as { offers: unknown[] }).offers;
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as { hotels?: unknown }).hotels)) {
    return (raw as { hotels: unknown[] }).hotels;
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// One money format for the whole product: "13 320 ₽".
//
// Before this there were two, on the same screen: a real offer printed
// `691.77 RUB` straight from the payload, while a hero built from
// modes_summary printed `от 3220 ₽` -- so a reading could show both styles
// at once depending on which path produced its road.
//
// Rounded to whole roubles, the way Tutu's own listings show them: kopecks
// on a ticket are noise, and «691,77 ₽» reads as a utility bill rather than
// a fare. Grouped with a non-breaking space so a price never wraps across
// lines mid-number.
//
// The thousands separator is inserted by hand rather than through
// Intl.NumberFormat("ru-RU") deliberately: Intl's grouping depends on the
// ICU data the runtime was built with, and a Node without full ICU silently
// falls back to "13,320". This produces the same bytes on every machine,
// which matters when the same string is asserted in tests and rendered on a
// server and a client.
//
// A currency that is not RUB keeps its own code instead of being stamped
// with ₽ -- the app has only ever seen RUB, and inventing a symbol for
// something else would be exactly the kind of confident wrong detail this
// codebase refuses.
export function formatPrice(amount: number, currency = "RUB"): string {
  const grouped = String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
  return currency === "RUB" ? `${grouped}\u00A0₽` : `${grouped}\u00A0${currency}`;
}

function readPrice(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const price = value as { amount?: unknown; currency?: unknown };
  if (typeof price.amount !== "number") return undefined;
  return formatPrice(price.amount, typeof price.currency === "string" ? price.currency : "RUB");
}

// Exported so the road hero can format modes_summary's min_duration_min the
// same way an actual offer's duration is formatted (see runRitual's
// offerFromSummary) — one formatting rule, not two that could drift apart.
export function formatDuration(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  const total = Math.round(value);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;

  // Past a day, hours stop being readable: a two-train plan to Абакан is
  // 6187 minutes, and "103 ч 7 мин" is a number to decode rather than a
  // duration to feel. Days first, then the remaining hours; minutes are
  // dropped at that scale because nobody plans a four-day journey to the
  // minute.
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const restHours = hours % 24;
    const dayWord = days % 10 === 1 && days % 100 !== 11 ? "день" : days % 10 >= 2 && days % 10 <= 4 && !(days % 100 >= 12 && days % 100 <= 14) ? "дня" : "дней";
    return restHours > 0 ? `${days} ${dayWord} ${restHours} ч` : `${days} ${dayWord}`;
  }

  if (hours === 0) return `${minutes} мин`;
  return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

// A variant's journey lives in `legs[]`, and each leg's own `segments[]` is
// where the actual vehicles are. `legs` is NOT the transfer list -- a leg is
// labelled "outbound"/"return", so a one-leg variant can still carry several
// segments, which is exactly what a journey with changes looks like. (A
// first pass at this read `legs.length` and concluded a 20-variant response
// had no composite routes at all; it was measuring the wrong axis.)
// Only the outbound leg is read here: that is the road the reading is about.
function readSegments(record: Record<string, unknown>): Record<string, unknown>[] {
  const legs = Array.isArray(record.legs) ? record.legs : [];
  const outbound = legs.find(
    (leg) => leg && typeof leg === "object" && (leg as { label?: unknown }).label === "outbound",
  ) ?? legs[0];
  if (!outbound || typeof outbound !== "object") return [];
  const segments = (outbound as { segments?: unknown }).segments;
  return Array.isArray(segments)
    ? segments.filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
    : [];
}

// The name a train actually travels under -- "Ласточка", "АВРОРА" -- which
// only ever arrives inside a segment, never on the variant itself. This is
// the most evocative fact the whole search returns and it was being thrown
// away: a road hero that says «Поезд «АВРОРА» №739У» is the oracle naming
// the road, while «Поезд: ФПК» names a legal entity.
function vehicleName(segment: Record<string, unknown> | undefined): string | undefined {
  if (!segment) return undefined;
  const meta = segment.vehicle_meta;
  if (!meta || typeof meta !== "object") return undefined;
  return readString((meta as { name?: unknown }).name);
}

function pluralTransfers(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} пересадка`;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return `${count} пересадки`;
  return `${count} пересадок`;
}

function transportTitle(record: Record<string, unknown>): string {
  const explicitTitle = readString(record.title);
  if (explicitTitle) return explicitTitle;

  const labels: Record<string, string> = {
    avia: "Авиабилеты",
    railway: "Поезд",
    bus: "Автобус",
    etrain: "Электричка",
  };
  const label = labels[String(record.transport)] ?? "Билеты";

  // Prefer what the vehicle is called over who operates it. Falls all the
  // way back to the old carrier form when a segment carries no name, so
  // buses and flights (which have no vehicle_meta) read exactly as before.
  const segments = readSegments(record);
  const name = vehicleName(segments[0]);
  const voyage = readString(segments[0]?.voyage_no);
  if (name) return voyage ? `${label} «${name}» №${voyage}` : `${label} «${name}»`;

  const carriers = readStringList(record.carriers);
  const operator = carriers.length > 0 ? `${label}: ${carriers.join(", ")}` : label;
  return voyage ? `${operator} №${voyage}` : operator;
}

// "В пути 3 ч 26 мин · 1 пересадка". Silent when the road is direct: saying
// "без пересадок" on every direct route is noise on the overwhelming
// majority of readings.
function transportSubtitle(record: Record<string, unknown>): string | undefined {
  const duration = formatDuration(record.duration_min);
  const departure = readString(record.departure);
  const arrival = readString(record.arrival);
  const base = duration
    ? `В пути ${duration}`
    : departure && arrival
      ? `${departure} - ${arrival}`
      : readString(record.subtitle);

  const transfers = Math.max(0, readSegments(record).length - 1);
  if (transfers === 0) return base;
  return base ? `${base} · ${pluralTransfers(transfers)}` : pluralTransfers(transfers);
}

export function normalizeTransportOffers(raw: unknown): NormalizedOffer[] {
  return readItems(raw).slice(0, 5).map((item, index) => {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const segments = readSegments(record);
    const transfers = Math.max(0, segments.length - 1);
    const via = segments
      .slice(0, -1)
      .map((segment) => stationCity(readString(segment.to) ?? ""))
      .filter(Boolean);
    const seatCategories = readSeatCategories(
      record.fares && typeof record.fares === "object"
        ? (record.fares as { seat_categories?: unknown }).seat_categories
        : undefined,
    );
    return {
      id: `transport-${index}`,
      title: transportTitle(record),
      price: readPrice(record.price),
      subtitle: transportSubtitle(record),
      // Set only when there is something to say. A direct offer with no fare
      // ladder -- which is most of them -- serialises byte-identically to
      // what it did before these fields existed, rather than carrying
      // `transfers: 0, via: [], seatCategories: []` into the API response
      // and the page payload for every one of up to five offers.
      ...(transfers > 0 ? { transfers } : {}),
      ...(via.length > 0 ? { via } : {}),
      ...(seatCategories.length > 0 ? { seatCategories } : {}),
      url:
        readString(record.search_results_url) ||
        readString(record.checkout_url) ||
        readString(record.checkoutUrl) ||
        readString(record.url),
      mode: readMode(record.transport),
    };
  });
}

export function normalizeHotelOffers(raw: unknown): NormalizedOffer[] {
  return readItems(raw).slice(0, 5).map((item, index) => {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const bestOffer =
      record.best_offer && typeof record.best_offer === "object" ? (record.best_offer as Record<string, unknown>) : {};
    return {
      id: `hotel-${index}`,
      title: readString(record.name) || readString(record.title) || "Вариант проживания",
      price: readPrice(bestOffer.price) || readPrice(record.price),
      subtitle: readString(record.address) || readString(record.subtitle),
      url:
        readString(bestOffer.checkout_url) ||
        readString(bestOffer.checkoutUrl) ||
        readString(record.checkout_url) ||
        readString(record.checkoutUrl) ||
        readString(record.url),
    };
  });
}
