import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TripIntentForm } from "@/components/TripIntentForm";

describe("TripIntentForm", () => {
  it("submits normalized trip intent", () => {
    const onSubmit = vi.fn();
    render(<TripIntentForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Город вылета"), { target: { value: " Москва " } });
    fireEvent.change(screen.getByLabelText("Дата начала"), { target: { value: "2026-09-10" } });
    fireEvent.change(screen.getByLabelText("Дата конца"), { target: { value: "2026-09-17" } });
    fireEvent.change(screen.getByLabelText("Путешественники"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Начать расклад" }));

    expect(onSubmit).toHaveBeenCalledWith({
      departureCity: "Москва",
      dateFrom: "2026-09-10",
      dateTo: "2026-09-17",
      travelerCount: 2,
    });
  });
});
