import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RitualStage } from "@/components/RitualStage";

// Task 10 disables the submit button until both endpoints are chosen, so the
// dates must be picked through the calendar before submitting.
//
// DateRangeCalendar always renders two adjacent months at once (current
// cursor + the next), CSS-only responsive stacking rather than a
// conditional single-month DOM (see its own file) — so day "10" and day
// "17" each exist as two same-named buttons the instant the panel opens.
// tests/e2e/helpers.ts already documents and works around this exact
// ambiguity by taking the first match (the earlier, currently-focused
// month); mirrored here with getAllByRole()[0] since RTL has no Playwright
// -style .first().
function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("Город вылета"), { target: { value: "Москва" } });
  fireEvent.click(screen.getByRole("button", { name: /Когда поедете/ }));
  fireEvent.click(screen.getByRole("button", { name: "Следующий месяц" }));
  fireEvent.click(screen.getAllByRole("button", { name: "10" })[0]);
  fireEvent.click(screen.getAllByRole("button", { name: "17" })[0]);
  fireEvent.click(screen.getByRole("button", { name: "Начать расклад" }));
}

describe("continuous ritual flow", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("holds the third card until the search answers", async () => {
    // A fetch that never resolves within this test's window — same
    // never-settling shape as the next test's, just without capturing the
    // executor's resolve (nothing here ever calls it).
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    render(<RitualStage />);
    fillAndSubmit();

    await act(async () => { vi.advanceTimersByTime(2_000); });
    expect(screen.getAllByTestId("tarot-card").filter(
      (card) => card.getAttribute("data-revealed") === "true",
    )).toHaveLength(2);

    vi.unstubAllGlobals();
  });

  it("announces the consultation when the search runs long", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    render(<RitualStage />);
    fillAndSubmit();
    await act(async () => { vi.advanceTimersByTime(4_000); });

    expect(screen.getByText(/сверяется с дорогами/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("never sends the user back to a separate screen", () => {
    render(<RitualStage />);
    fillAndSubmit();
    expect(screen.queryByRole("link", { name: /результат/i })).toBeNull();
    expect(screen.queryByRole("navigation", { name: /экраны/i })).toBeNull();
  });
});
