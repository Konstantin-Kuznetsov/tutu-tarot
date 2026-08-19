import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RitualStage } from "@/components/RitualStage";
import type { DrawnTarotCard, TarotPosition } from "@/domain/types";

function okResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function stubCard(position: TarotPosition, id: string): DrawnTarotCard {
  return {
    id,
    number: 0,
    name: `Карта ${id}`,
    image: `/tarot/${id}.webp`,
    archetypes: ["road"],
    transport: ["railway"],
    meaning: "значение",
    meaningReversed: "обратное значение",
    position,
    reversed: false,
  };
}

// Minimal but complete RitualResultViewModel — used by both new tests below,
// this one carrying all three spreadCards so TravelResult's spread-panel
// (the permanent home for the three cards once "revealed") actually renders
// something to assert against.
const spreadRitualResponse = {
  ritualId: "demo",
  seed: "москва|2026-09-10|2026-09-17|2",
  spreadCards: [stubCard("Зов", "call"), stubCard("Дар", "gift"), stubCard("Путь", "road")],
  destination: { name: "Усьвинские Столбы", region: "Пермский край" },
  prediction: {
    headline: "Карты указывают на Усьвинские Столбы",
    opening: "Башня зовет к камню.",
    summary: "Дорога подтверждается Туту.",
    cardReadings: [],
  },
  roadChoice: { mode: null, reason: "Дорога скрыта туманом.", best: null },
  transportOffers: [],
  hotelOffers: [],
  sourceLinks: [],
  warnings: [],
};

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
  fireEvent.change(screen.getByLabelText("Откуда"), { target: { value: "Москва" } });
  fireEvent.click(screen.getByRole("button", { name: /Когда поедете/ }));
  fireEvent.click(screen.getByRole("button", { name: "Следующий месяц" }));
  fireEvent.click(screen.getAllByRole("button", { name: "10" })[0]);
  fireEvent.click(screen.getAllByRole("button", { name: "17" })[0]);
  fireEvent.click(screen.getByRole("button", { name: "Разложить карты" }));
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

  // Fix round (task 11 review, finding 1): the receded form's
  // pointer-events: none blocks clicks but never made the form keyboard-
  // inert, so Tab-to-submit-button (or refocusing the city field and
  // pressing Enter) could fire a second startRitual mid-deal. That second
  // call's clearTimers() used to strand the first call's still-pending
  // dealtFloor timer, corrupting a search that was about to succeed into a
  // false "error". jsdom does not enforce the `inert` attribute's actual
  // focus/hit-test blocking (it only reflects the attribute — see
  // RitualStage's own comment on why `inert` alone isn't the full fix), so
  // this drives the second submission straight through the DOM rather than
  // via real Tab/Enter — exactly the scenario the startRitual re-entrancy
  // guard (not the `inert` attribute) has to reject on its own.
  it("ignores a second submission fired while the first is still dealing", async () => {
    // A mutable object property (not a bare `let`) so TypeScript doesn't
    // narrow the pending resolver back to `null` at the read below — it has
    // no way to know the executor closure runs between the assignment and
    // that read.
    const pending: { resolve: ((response: Response) => void) | null } = { resolve: null };
    const fetchMock = vi.fn(
      () => new Promise<Response>((resolve) => { pending.resolve = resolve; }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<RitualStage />);
    fillAndSubmit();

    // Still "dealing" (well short of both the 1800ms floor and the 3000ms
    // consult threshold) — activate the still-mounted submit button again.
    await act(async () => { vi.advanceTimersByTime(500); });
    fireEvent.click(screen.getByRole("button", { name: "Разложить карты" }));

    // The guard rejects the re-entrant call before it ever builds a
    // request: exactly one fetch went out, not two competing ones.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Let the deal timers and the dealtFloor elapse, then let the one real
    // request resolve successfully.
    await act(async () => { vi.advanceTimersByTime(2_000); });
    pending.resolve?.(okResponse(spreadRitualResponse));
    // Flush the promise continuation, then sit out READING_HOLD_MS — the
    // resolved search now lands on the intermediate screen's "reading" beat
    // rather than straight on the result, so the reading is not on screen
    // the microtask after the fetch settles any more.
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_500); });

    // No false failure, and the search that was about to succeed actually
    // does.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Карты указывают на Усьвинские Столбы")).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  // Fix round (task 11 review, finding 2): every mock elsewhere in this
  // suite either never resolves or resolves after the ~1.8s deal floor, so
  // a regression deleting the dealtFloor half of startRitual's Promise.all
  // would still pass the whole suite. This is the one case the brief names
  // by name: "do not flip the third card early, even when the search
  // returns almost instantly."
  //
  // It now also covers the intermediate screen the flow gained afterwards:
  // the run goes dealing -> all three cards face-up on that screen -> only
  // then the reading. The middle assertion block is the one that would fail
  // if "reading" were ever collapsed back into "revealed".
  it("opens every card on the intermediate screen before the reading takes over", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(spreadRitualResponse));
    vi.stubGlobal("fetch", fetchMock);

    render(<RitualStage />);
    fillAndSubmit();

    // Let the already-resolving fetch's own promise chain fully settle
    // while staying well under DEAL_STEP_MS * 2 (the 1800ms floor).
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });

    // Third slot ("Путь") is still face-down: RitualScene's own
    // "tarot-card" testid (TravelResult's revealed spread uses a different
    // testid, "spread-card", so this can't accidentally match that instead).
    const dealingCards = screen.getAllByTestId("tarot-card");
    expect(dealingCards).toHaveLength(3);
    expect(dealingCards[2]).toHaveAttribute("data-revealed", "false");
    expect(screen.queryByTestId("spread-card")).not.toBeInTheDocument();

    // Cross the floor. Every card is now face-up — including "Путь", whose
    // identity only the answered search could supply — and this is still
    // the intermediate screen: the reading has not replaced it.
    await act(async () => { await vi.advanceTimersByTimeAsync(1_800); });

    const openedCards = screen.getAllByTestId("tarot-card");
    expect(openedCards).toHaveLength(3);
    openedCards.forEach((card) => expect(card).toHaveAttribute("data-revealed", "true"));
    expect(screen.queryByTestId("spread-card")).not.toBeInTheDocument();
    expect(screen.queryByText("Карты указывают на Усьвинские Столбы")).not.toBeInTheDocument();

    // Only once the hold elapses does the reading itself take the screen.
    await act(async () => { await vi.advanceTimersByTimeAsync(2_500); });

    expect(screen.queryByTestId("tarot-card")).not.toBeInTheDocument();
    const revealedCards = screen.getAllByTestId("spread-card");
    expect(revealedCards).toHaveLength(3);
    revealedCards.forEach((card) => expect(card).toHaveAttribute("data-revealed", "true"));
    expect(screen.getByText("Карты указывают на Усьвинские Столбы")).toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
