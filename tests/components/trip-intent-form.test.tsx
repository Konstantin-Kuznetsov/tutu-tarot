import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TripIntentForm } from "@/components/TripIntentForm";
import { pickFutureDateRange } from "../support/pickFutureDateRange";

describe("TripIntentForm", () => {
  it("submits normalized trip intent", () => {
    const onSubmit = vi.fn();
    render(<TripIntentForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Откуда"), { target: { value: " Москва " } });
    const { from, to } = pickFutureDateRange();
    fireEvent.change(screen.getByLabelText("Путешественники"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Начать расклад" }));

    expect(onSubmit).toHaveBeenCalledWith({
      departureCity: "Москва",
      dateFrom: from,
      dateTo: to,
      travelerCount: 2,
    });
  });

  it("disables submit until both ends of the date range are picked", () => {
    const onSubmit = vi.fn();
    render(<TripIntentForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Откуда"), { target: { value: "Москва" } });
    const submit = screen.getByRole("button", { name: "Начать расклад" });
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
});
