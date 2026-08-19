import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MyReadingsDialog } from "@/components/MyReadingsDialog";
import { remember } from "@/components/myReadings";

const entry = (code: string, name: string) => ({
  code, destinationName: name, departureCity: "Москва",
  dateFrom: "2026-09-10", dateTo: "2026-09-17", travelerCount: 2,
});

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  window.dispatchEvent(new Event("tutu-tarot/readings-changed"));
});

describe("the history opens over the reading", () => {
  // The whole reason this is a dialog and not a route: a reading costs a
  // Tutu search to produce, and glancing at your history used to throw the
  // one on screen away.
  it("starts closed, so nothing covers the reading until asked", () => {
    render(<MyReadingsDialog />);
    expect(document.querySelector("dialog")?.open).toBe(false);
  });

  it("opens on the button and shows the readings", () => {
    remember(entry("abc", "Байкал"));
    render(<MyReadingsDialog />);

    fireEvent.click(screen.getByRole("button", { name: "Мои расклады" }));

    expect(document.querySelector("dialog")?.open).toBe(true);
    expect(screen.getByRole("link", { name: /Байкал/ })).toHaveAttribute("href", "/r/abc");
  });

  it("closes on its own close button", () => {
    render(<MyReadingsDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Мои расклады" }));
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(document.querySelector("dialog")?.open).toBe(false);
  });

  // The backdrop belongs to the dialog element itself, so a click outside
  // the panel lands on the dialog and nothing else. A click on the panel
  // must not close it -- that is the difference between dismissing and
  // reading.
  it("closes on a click outside the panel, but not inside it", () => {
    remember(entry("abc", "Байкал"));
    render(<MyReadingsDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Мои расклады" }));

    fireEvent.click(screen.getByRole("link", { name: /Байкал/ }));
    expect(document.querySelector("dialog")?.open, "click inside").toBe(true);

    fireEvent.click(document.querySelector("dialog")!);
    expect(document.querySelector("dialog")?.open, "click on backdrop").toBe(false);
  });

  // The browser closes a dialog on Escape without telling the component, so
  // state has to follow the element rather than the two drifting apart.
  it("follows the element when the browser closes it", () => {
    render(<MyReadingsDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Мои расклады" }));

    // Not through fireEvent: this is the browser closing the dialog on its
    // own (Escape), which is exactly the case the component has to follow.
    act(() => document.querySelector("dialog")!.close());
    expect(document.querySelector("dialog")?.open).toBe(false);

    // And it can be opened again afterwards -- the state really did follow.
    fireEvent.click(screen.getByRole("button", { name: "Мои расклады" }));
    expect(document.querySelector("dialog")?.open).toBe(true);
  });

  it("says the pile is empty rather than showing an empty box", () => {
    render(<MyReadingsDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Мои расклады" }));
    expect(screen.getByText(/Здесь появятся расклады/)).toBeInTheDocument();
  });
});
