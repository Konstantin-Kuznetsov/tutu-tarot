import type { ModesSummary, TransportMode } from "@/domain/types";

export interface NormalizedOffer {
  id: string;
  title: string;
  price?: string;
  subtitle?: string;
  url?: string;
  mode?: TransportMode;
}

const MODES: TransportMode[] = ["avia", "railway", "bus"];

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

function transportTitle(record: Record<string, unknown>): string {
  const explicitTitle = readString(record.title);
  if (explicitTitle) return explicitTitle;

  const labels: Record<string, string> = {
    avia: "Авиабилеты",
    railway: "Поезд",
    bus: "Автобус",
  };
  const label = labels[String(record.transport)] ?? "Билеты";
  const carriers = readStringList(record.carriers);
  return carriers.length > 0 ? `${label}: ${carriers.join(", ")}` : label;
}

export function normalizeTransportOffers(raw: unknown): NormalizedOffer[] {
  return readItems(raw).slice(0, 5).map((item, index) => {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const departure = readString(record.departure);
    const arrival = readString(record.arrival);
    const duration = formatDuration(record.duration_min);
    return {
      id: `transport-${index}`,
      title: transportTitle(record),
      price: readPrice(record.price),
      subtitle: duration ? `В пути ${duration}` : departure && arrival ? `${departure} - ${arrival}` : readString(record.subtitle),
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
