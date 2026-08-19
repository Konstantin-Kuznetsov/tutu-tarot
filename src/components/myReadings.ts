"use client";

import { useSyncExternalStore } from "react";

// «Мои расклады» without an account, a session or a server. The whole reading
// already fits in its own share code -- that is what makes the link work with
// no database -- so a history is just a list of those codes, kept in the one
// place that survives a reload and never leaves the machine.
//
// localStorage rather than a cookie, deliberately: a cookie is uploaded with
// every single request, including every card image and every static asset,
// and the server has no use for this list whatsoever. It is also capped at
// 4KB, which twenty readings would exhaust. localStorage is ~5MB and stays
// in the browser.
const KEY = "tutu-tarot/readings/v1";

// Deliberately more than the code: the code alone would have to be decoded to
// show anything, and `decodeReading` pulls in zod -- 65KB gzip, about a
// quarter of the main page's JavaScript, measured when it was accidentally
// bundled once before (see docs/technical.md §8). Storing the handful of
// facts a tile shows keeps the list rendering with no decoder in the browser
// at all. The code stays alongside them for the link and the thumbnail.
export interface RememberedReading {
  code: string;
  destinationName: string;
  departureCity: string;
  dateFrom: string;
  dateTo: string;
  travelerCount: number;
  savedAt: number;
}

// One reading is ~200 bytes of JSON. The cap exists so a browser that never
// clears storage cannot grow this without bound; oldest fall off the end.
const LIMIT = 50;

function read(): RememberedReading[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Hand-checked rather than schema-validated, for the same reason the
    // snapshot exists at all: pulling a validator in here would undo the
    // saving. Anything malformed is skipped, never thrown -- this data can
    // be edited by hand in devtools and must not be able to break the page.
    return parsed.filter((entry): entry is RememberedReading =>
      Boolean(entry) &&
      typeof entry === "object" &&
      typeof (entry as RememberedReading).code === "string" &&
      typeof (entry as RememberedReading).destinationName === "string" &&
      typeof (entry as RememberedReading).savedAt === "number",
    );
  } catch {
    // Private mode in some browsers throws on access rather than returning
    // null, and a corrupt value throws in JSON.parse. Neither is worth a
    // broken page: the history simply reads as empty.
    return [];
  }
}

function write(entries: RememberedReading[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, LIMIT)));
  } catch {
    // Quota exceeded, or storage disabled. Losing the history is acceptable;
    // failing the reading that produced it is not.
  }
}

// Subscribers are notified through a real event so a list rendered in one tab
// updates when a reading is remembered in another. `storage` only fires in
// *other* tabs, so the writer dispatches its own event too.
const CHANGED = "tutu-tarot/readings-changed";
const listeners = new Set<() => void>();

// useSyncExternalStore compares snapshots by identity, so `snapshot` must
// return the very same array until something actually changes -- rebuilding
// it on every call would loop forever. Dropped only by `invalidate`, which
// every write and every event goes through.
let cache: RememberedReading[] | null = null;

// Every change goes through here, including this tab's own: the cache is
// dropped first, then listeners are told. Notifying without dropping it was
// a real bug -- useSyncExternalStore answers a notification by calling
// getSnapshot, which would have handed back the stale array, so the
// cross-tab update this event plumbing exists for would have done nothing
// at all. Caught by a test that cleared storage and still saw the old list.
function invalidate(): void {
  cache = null;
  for (const listener of listeners) listener();
}

// Attached once, at module scope, rather than per subscription. Hanging them
// off `subscribe` looked tidier and was wrong: with no component mounted
// there is no listener, so a change made while the list is closed would
// leave the cache holding a stale array for the next time it opens. The
// cache belongs to the module, so what invalidates it has to as well.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event: StorageEvent) => {
    // `key === null` is a whole-storage clear, which is also our business.
    if (event.key === null || event.key === KEY) invalidate();
  });
  window.addEventListener(CHANGED, invalidate);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): RememberedReading[] {
  if (cache === null) cache = read();
  return cache;
}

// The server has no localStorage and must render the same thing on both
// sides of hydration: an empty history, replaced on the client's first
// commit. A stable constant, not a fresh [], for the identity reason above.
const EMPTY: RememberedReading[] = [];
function serverSnapshot(): RememberedReading[] {
  return EMPTY;
}

export function remember(entry: Omit<RememberedReading, "savedAt">): void {
  if (typeof window === "undefined") return;
  // Re-reading the same reading (a reload, a second visit) moves it to the
  // top rather than adding a duplicate: the code is the identity.
  const rest = read().filter((existing) => existing.code !== entry.code);
  write([{ ...entry, savedAt: Date.now() }, ...rest]);
  // Storage is the single source of truth; the cache is rebuilt from it on
  // the next read rather than kept in step by hand in two places.
  invalidate();
  window.dispatchEvent(new Event(CHANGED));
}

export function forget(code: string): void {
  if (typeof window === "undefined") return;
  write(read().filter((entry) => entry.code !== code));
  invalidate();
  window.dispatchEvent(new Event(CHANGED));
}

export function useRememberedReadings(): RememberedReading[] {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
