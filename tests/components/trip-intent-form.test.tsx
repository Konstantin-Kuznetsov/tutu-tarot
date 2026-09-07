import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TripSearchForm } from "@/components/TripSearchForm";
import { pickFutureDateRange } from "../support/pickFutureDateRange";

function suggestResponse(items: unknown[]): Response {
  return new Response(JSON.stringify({ hits: { hits: items } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// The filename lags the subject: the ticket moved out of TripIntentForm into
// TripSearchForm when LumoraHero became the entry screen, and TripSearchForm
// is what actually ships on the page. Pointed at the live component rather
// than at the wrapper that no longer renders anywhere; renaming the file is a
// separate tidy-up.
describe("TripSearchForm", () => {
  it("submits normalized trip intent", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(suggestResponse([])));
    const onSubmit = vi.fn();
    render(<TripSearchForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Откуда"), { target: { value: " Москва " } });
    const { from, to } = pickFutureDateRange();
    fireEvent.change(screen.getByLabelText("Путешественники"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Разложить карты" }));

    expect(onSubmit).toHaveBeenCalledWith({
      departureCity: "Москва",
      dateFrom: from,
      dateTo: to,
      travelerCount: 2,
    });
  });

  it("disables submit until both ends of the date range are picked", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(suggestResponse([])));
    const onSubmit = vi.fn();
    render(<TripSearchForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Откуда"), { target: { value: "Москва" } });
    const submit = screen.getByRole("button", { name: "Разложить карты" });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Когда поедете/ }));
    // Day 10 of the current month renders disabled once today is already
    // past it (DateRangeCalendar disables anything before today) — step
    // into next month first so the click lands on a selectable day.
    if (new Date().getDate() >= 10) {
      fireEvent.click(screen.getByRole("button", { name: "Следующий месяц" }));
    }
    fireEvent.click(screen.getAllByRole("button", { name: "10" })[0]);
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getAllByRole("button", { name: "17" })[0]);
    expect(submit).not.toBeDisabled();
  });

  it("offers Tutu locality suggestions as you type and fills the field on pick", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      suggestResponse([
        {
          _source: {
            geo_type: "LOCALITY",
            geo_id: "2656873",
            name: "Казань",
            region_name: "Республика Татарстан",
            country_name: "Россия",
          },
        },
        {
          _source: {
            geo_type: "LOCALITY",
            geo_id: "3326011",
            name: "Казанка",
            region_name: "Томская область",
            country_name: "Россия",
          },
        },
        {
          _source: {
            geo_type: "RAILWAY_STATION",
            geo_id: "2961212",
            name: "Казань Пасс",
            region_name: "Республика Татарстан",
            country_name: "Россия",
          },
        },
        {
          _source: {
            geo_type: "LOCALITY",
            geo_id: "2658189",
            name: "Могилёв",
            region_name: "Могилёвская область",
            country_name: "Беларусь",
          },
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onSubmit = vi.fn();
    render(<TripSearchForm onSubmit={onSubmit} />);

    const city = screen.getByLabelText("Откуда");
    fireEvent.change(city, { target: { value: "Казан" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ptt.tutu.ru/v1/suggest/search/?transport=ptt&prefix=%D0%9A%D0%B0%D0%B7%D0%B0%D0%BD",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    const option = screen.getByRole("option", { name: /Казань/ });
    expect(option).toHaveTextContent("Республика Татарстан");
    expect(screen.queryByRole("option", { name: /Казань Пасс/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Могилёв/ })).not.toBeInTheDocument();
    fireEvent.mouseDown(option);

    expect(city).toHaveValue("Казань");
    expect(screen.queryByRole("option", { name: /Казань/ })).not.toBeInTheDocument();
  });
});
