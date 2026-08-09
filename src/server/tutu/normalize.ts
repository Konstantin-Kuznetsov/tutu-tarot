export interface NormalizedOffer {
  id: string;
  title: string;
  price?: string;
  subtitle?: string;
  url?: string;
}

function readItems(raw: unknown): unknown[] {
  if (raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)) {
    return (raw as { items: unknown[] }).items;
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

export function normalizeTransportOffers(raw: unknown): NormalizedOffer[] {
  return readItems(raw).slice(0, 5).map((item, index) => {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const departure = readString(record.departure);
    const arrival = readString(record.arrival);
    return {
      id: `transport-${index}`,
      title: readString(record.title) || "Вариант дороги",
      price: readPrice(record.price),
      subtitle: departure && arrival ? `${departure} - ${arrival}` : readString(record.subtitle),
      url: readString(record.checkout_url) || readString(record.checkoutUrl) || readString(record.url),
    };
  });
}

export function normalizeHotelOffers(raw: unknown): NormalizedOffer[] {
  return readItems(raw).slice(0, 5).map((item, index) => {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      id: `hotel-${index}`,
      title: readString(record.name) || readString(record.title) || "Вариант проживания",
      price: readPrice(record.price),
      subtitle: readString(record.address) || readString(record.subtitle),
      url: readString(record.checkout_url) || readString(record.checkoutUrl) || readString(record.url),
    };
  });
}
