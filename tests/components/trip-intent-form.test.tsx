import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TripSearchForm } from "@/components/TripSearchForm";
import { pickFutureDateRange } from "../support/pickFutureDateRange";

// The filename lags the subject: the ticket moved out of TripIntentForm into
// TripSearchForm when LumoraHero became the entry screen, and TripSearchForm
// is what actually ships on the page. Pointed at the live component rather
// than at the wrapper that no longer renders anywhere; renaming the file is a
// separate tidy-up.
describe("TripSearchForm", () => {
  it("submits normalized trip intent", () => {
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

  it("offers matching cities as you type and fills the field on pick", () => {
    const onSubmit = vi.fn();
    render(<TripSearchForm onSubmit={onSubmit} />);

    const city = screen.getByLabelText("Откуда");
    fireEvent.change(city, { target: { value: "Казан" } });

    const option = screen.getByRole("option", { name: "Казань" });
    fireEvent.mouseDown(option);

    expect(city).toHaveValue("Казань");
    expect(screen.queryByRole("option", { name: "Казань" })).not.toBeInTheDocument();
  });
});
