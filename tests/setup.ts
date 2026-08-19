import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

// The real next/cache's unstable_cache (used by src/server/oracle/narrator.ts
// to cache AI narration) looks for a workStore/incrementalCache that only
// exists while Next.js itself is handling a request -- it throws
// ("Invariant: incrementalCache missing") the instant it's called from a
// plain Vitest test, which runs outside that machinery entirely. This stand-in
// gives every test the same "same key -> same cached result, a thrown
// callback caches nothing" contract the real implementation provides in
// production, without needing a running Next.js server. The store is cleared
// after every test so no reading identity's cached result leaks from one
// test into the next.
const nextCacheStore = new Map<string, unknown>();

vi.mock("next/cache", () => ({
  unstable_cache:
    <Args extends unknown[], Result>(
      callback: (...args: Args) => Promise<Result>,
      keyParts: string[] = [],
      // Third param is unstable_cache's { revalidate, tags } options -- this
      // stand-in caches for the lifetime of the test regardless, since no
      // test needs revalidate/tag behavior, only "same key -> same result".
    ) =>
      async (...args: Args): Promise<Result> => {
        const cacheKey = JSON.stringify({ keyParts, args });
        if (nextCacheStore.has(cacheKey)) {
          return nextCacheStore.get(cacheKey) as Result;
        }
        // A rejected callback (see narrator.ts: requestNarration failures are
        // turned into a throw precisely so they are never cached) must not
        // be stored -- propagate it and leave the key empty for next time,
        // matching the real unstable_cache's behavior on a thrown callback.
        const result = await callback(...args);
        nextCacheStore.set(cacheKey, result);
        return result;
      },
}));

afterEach(() => {
  nextCacheStore.clear();
});

// vitest's jsdom environment hands tests a `window.localStorage` that is a
// bare object with no methods at all: `[object Object]`, and
// `clear`/`getItem`/`setItem` all undefined. A jsdom window built directly
// has a proper `[object Storage]` -- the methods live on Storage.prototype,
// and only own properties survive the copy into the test global.
//
// The app is unaffected (verified in a real browser: a reading is saved and
// the list renders), but anything that touches storage is untestable without
// this. A minimal, correct Storage stands in: same method names, same
// string coercion, same "missing key returns null" contract.
class TestStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.values.has(key) ? (this.values.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.values.set(String(key), String(value));
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

if (typeof window !== "undefined" && typeof window.localStorage?.getItem !== "function") {
  Object.defineProperty(window, "localStorage", {
    value: new TestStorage(),
    configurable: true,
    writable: true,
  });
}
