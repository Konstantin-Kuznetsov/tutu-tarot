import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TripIntentForm } from "@/components/TripIntentForm";

// Opens the DateRangeCalendar popover and picks 10-17 September 2026 (the
// dates the assertion below is pinned to). The panel opens on today's
// month; step forward with the "next month" control until September 2026
// is the first of the two visible months, then click its 10 and 17 — the
// same disambiguation date-range-calendar.test.tsx uses, since both visible
// months share every day number and an unscoped query would be ambiguous.
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

describe("TripIntentForm", () => {
  it("submits normalized trip intent", () => {
    const onSubmit = vi.fn();
    render(<TripIntentForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Город вылета"), { target: { value: " Москва " } });
    pickSeptember10to17();
    fireEvent.change(screen.getByLabelText("Путешественники"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Начать расклад" }));

    expect(onSubmit).toHaveBeenCalledWith({
      departureCity: "Москва",
      dateFrom: "2026-09-10",
      dateTo: "2026-09-17",
      travelerCount: 2,
    });
  });

  it("disables submit until both ends of the date range are picked", () => {
    const onSubmit = vi.fn();
    render(<TripIntentForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Город вылета"), { target: { value: "Москва" } });
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
