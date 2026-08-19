import type { ModeUnavailable } from "@/domain/travel/roadUnavailable";
import type { ModesSummary, TransportMode } from "@/domain/types";

export interface NormalizedOffer {
  id: string;
  title: string;
  price?: string;
  subtitle?: string;
  url?: string;
  mode?: TransportMode;
}

const MODES: TransportMode[] = ["avia", "railway", "bus", "etrain"];

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

function readPrice(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const price = value as { amount?: unknown; currency?: unknown };
  if (typeof price.amount !== "number") return undefined;
  return `${price.amount} ${typeof price.currency === "string" ? price.currency : "RUB"}`;
}

// Exported so the road hero can format modes_summary's min_duration_min the
// same way an actual offer's duration is formatted (see runRitual's
// offerFromSummary) — one formatting rule, not two that could drift apart.
export function formatDuration(minutes: unknown): string | undefined {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return undefined;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours > 0 && remainder > 0) return `${hours} ч ${remainder} мин`;
  if (hours > 0) return `${hours} ч`;
  return `${remainder} мин`;
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
// away: a road hero that says «Поезд „АВРОРА“ №739У» is the oracle naming
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
    return {
      id: `transport-${index}`,
      title: transportTitle(record),
      price: readPrice(record.price),
      subtitle: transportSubtitle(record),
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
