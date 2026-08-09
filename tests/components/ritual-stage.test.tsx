import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RitualStage } from "@/components/RitualStage";

// Mirrors the helper in trip-intent-form.test.tsx (Task 10 replaced the
// ticket's two native date inputs with a DateRangeCalendar popover). Opens
// the popover and picks 10-17 September 2026, which is what the fixture
// `seed` below is written against. Both rendered months share every day
// number, so day clicks pick the first ("current") match after stepping
// forward — same disambiguation as date-range-calendar.test.tsx.
function pickSeptember10to17() {
  fireEvent.click(screen.getByRole("button", { name: /Когда поедете/ }));

  const today = new Date();
  const monthsToSeptember2026 = (2026 - today.getFullYear()) * 12 + (8 - today.getMonth());
  for (let step = 0; step < monthsToSeptember2026; step += 1) {
    fireEvent.click(screen.getByRole("button", { name: "Следующий месяц" }));
  }

  fireEvent.click(screen.getAllByRole("button", { name: "10" })[0]);
  fireEvent.click(screen.getAllByRole("button", { name: "17" })[0]);
}

const ritualResponse = {
  ritualId: "demo",
  seed: "москва|2026-09-10|2026-09-17|2",
  spreadCards: [],
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

function okResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("RitualStage", () => {
  it("keeps the ritual scene visible briefly even when the API responds immediately", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(okResponse(ritualResponse));
    vi.stubGlobal("fetch", fetchMock);

    render(<RitualStage />);
    fireEvent.change(screen.getByLabelText("Город вылета"), { target: { value: "Москва" } });
    pickSeptember10to17();
    fireEvent.change(screen.getByLabelText("Путешественники"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Начать расклад" }));

    expect(fetchMock).toHaveBeenCalledOnce();
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByLabelText("Мистический расклад карт")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1700);
    });
    expect(screen.getByLabelText("Мистический расклад карт")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(screen.getByText("Карты указывают на Усьвинские Столбы")).toBeInTheDocument();
  });

  it("submits the ritual with XMLHttpRequest when browser fetch is unavailable", async () => {
    vi.useFakeTimers();

    class FakeXMLHttpRequest {
      static latest: FakeXMLHttpRequest | null = null;
      method = "";
      url = "";
      requestBody = "";
      status = 0;
      responseText = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor() {
        FakeXMLHttpRequest.latest = this;
      }

      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }

      setRequestHeader() {}

      send(body?: Document | XMLHttpRequestBodyInit | null) {
        this.requestBody = String(body);
        window.setTimeout(() => {
          this.status = 200;
          this.responseText = JSON.stringify(ritualResponse);
          this.onload?.();
        }, 0);
      }
    }

    vi.stubGlobal("fetch", undefined);
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);

    render(<RitualStage />);
    fireEvent.change(screen.getByLabelText("Город вылета"), { target: { value: "Москва" } });
    pickSeptember10to17();
    fireEvent.change(screen.getByLabelText("Путешественники"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Начать расклад" }));

    expect(FakeXMLHttpRequest.latest?.method).toBe("POST");
    expect(FakeXMLHttpRequest.latest?.url).toBe("/api/ritual");
    expect(FakeXMLHttpRequest.latest?.requestBody).toContain('"departureCity":"Москва"');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1900);
    });

    expect(screen.getByText("Карты указывают на Усьвинские Столбы")).toBeInTheDocument();
  });
});
