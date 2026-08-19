import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MyReadingsList } from "@/components/MyReadingsList";
import { forget, remember } from "@/components/myReadings";

const KEY = "tutu-tarot/readings/v1";

const entry = (over: Partial<Record<string, unknown>> = {}) => ({
  code: "code-a",
  destinationName: "Байкал",
  departureCity: "Москва",
  dateFrom: "2026-09-10",
  dateTo: "2026-09-17",
  travelerCount: 2,
  ...over,
});

const stored = () => JSON.parse(window.localStorage.getItem(KEY) ?? "[]");

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  // Clearing storage directly does not fire a `storage` event in the same
  // window, so the store's cache would still hold the previous test's list.
  window.dispatchEvent(new Event("tutu-tarot/readings-changed"));
});

describe("remembering a reading", () => {
  it("keeps the code and the facts a tile needs", () => {
    remember(entry());
    expect(stored()).toHaveLength(1);
    expect(stored()[0]).toMatchObject({
      code: "code-a", destinationName: "Байкал", departureCity: "Москва", travelerCount: 2,
    });
    expect(typeof stored()[0].savedAt).toBe("number");
  });

  it("puts the newest first", () => {
    remember(entry({ code: "old" }));
    remember(entry({ code: "new" }));
    expect(stored().map((e: { code: string }) => e.code)).toEqual(["new", "old"]);
  });

  // The code is the identity of a reading -- the same three cards, the same
  // destination, the same trip. Drawing it again, or reloading the page,
  // must move it up rather than pile up copies.
  it("does not duplicate the same reading, it moves it up", () => {
    remember(entry({ code: "a" }));
    remember(entry({ code: "b" }));
    remember(entry({ code: "a" }));
    expect(stored().map((e: { code: string }) => e.code)).toEqual(["a", "b"]);
  });

  it("forgets one without touching the rest", () => {
    remember(entry({ code: "a" }));
    remember(entry({ code: "b" }));
    forget("a");
    expect(stored().map((e: { code: string }) => e.code)).toEqual(["b"]);
  });

  // This data sits in devtools where anyone can edit it, and survives across
  // deploys that may change its shape. A broken value must read as "no
  // history", never as a broken page.
  it("survives storage that is not what it expects", () => {
    for (const junk of ["not json", "{}", "[1,2,3]", '[{"code":42}]', "null"]) {
      cleanup();
      window.localStorage.setItem(KEY, junk);
      window.dispatchEvent(new Event("tutu-tarot/readings-changed"));
      expect(() => render(<MyReadingsList />), junk).not.toThrow();
      screen.getByRole("heading", { name: "Мои расклады" });
    }
  });
});

describe("the readings list", () => {
  it("says the pile is empty when it is", () => {
    render(<MyReadingsList />);
    expect(screen.getByText(/Здесь появятся расклады/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Расклад:/ })).toBeNull();
  });

  it("shows a tile per reading, linking to the reading itself", () => {
    remember(entry({ code: "abc", destinationName: "Байкал" }));
    render(<MyReadingsList />);

    const tile = screen.getByRole("link", { name: /Байкал/ });
    expect(tile).toHaveAttribute("href", "/r/abc");
    // The thumbnail route, not the 1200x630 social preview.
    expect(screen.getByRole("img", { name: "Расклад: Байкал" })).toHaveAttribute("src", "/r/abc/thumb");
  });

  it("writes the dates the way a person reads them", () => {
    remember(entry({ code: "one", dateFrom: "2026-09-08", dateTo: "2026-09-12" }));
    render(<MyReadingsList />);
    expect(screen.getByText("8 – 12 сентября")).toBeInTheDocument();
  });

  it("names both months when the trip crosses one", () => {
    remember(entry({ code: "two", dateFrom: "2026-09-28", dateTo: "2026-10-03" }));
    render(<MyReadingsList />);
    expect(screen.getByText("28 сентября – 3 октября")).toBeInTheDocument();
  });

  it("declines the count of readings", () => {
    remember(entry({ code: "a" }));
    const { unmount } = render(<MyReadingsList />);
    expect(screen.getByText("1 расклад")).toBeInTheDocument();
    unmount();

    remember(entry({ code: "b" }));
    render(<MyReadingsList />);
    expect(screen.getByText("2 расклада")).toBeInTheDocument();
  });

  // The facts the picture itself does not carry, and the only thing telling
  // two readings to the same place apart.
  it("shows where the traveller was leaving from", () => {
    remember(entry({ code: "c", departureCity: "Псков", travelerCount: 3 }));
    render(<MyReadingsList />);
    expect(screen.getByText(/из города Псков · 3 чел\./)).toBeInTheDocument();
  });
});
