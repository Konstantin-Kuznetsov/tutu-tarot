import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LEG_OUTCOME_COPY, OfferList } from "@/components/OfferList";
import type { NormalizedOffer } from "@/server/tutu/normalize";

// mcpClient always backs a failed/empty leg with a single fallback offer
// (transportFallback/hotelFallback) that links into Tutu's own general
// search -- so the "0 offers" branch below is a defensive fallback for a
// caller that doesn't do that, not the shape OfferList is normally handed.
const fallbackOffer: NormalizedOffer = {
  id: "hotel-fallback",
  title: "Открыть поиск отелей на Туту",
  subtitle: "Пермь, 2026-09-10 - 2026-09-14",
  url: "https://hotel.tutu.ru/",
};

describe("OfferList outcome copy", () => {
  it("says plainly that Tutu is not answering when the leg failed, and keeps the search link", () => {
    render(<OfferList title="Где остановиться" offers={[fallbackOffer]} outcome="failed" />);

    expect(screen.getByText(LEG_OUTCOME_COPY.failed)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Открыть поиск отелей на Туту/ });
    expect(link).toHaveAttribute("href", "https://hotel.tutu.ru/");
  });

  it("says nothing was found for these dates when the leg came back empty, a real answer not an error", () => {
    render(<OfferList title="Где остановиться" offers={[fallbackOffer]} outcome="empty" />);

    expect(screen.getByText(LEG_OUTCOME_COPY.empty)).toBeInTheDocument();
    // Never the failed copy for an empty (successfully-answered) leg.
    expect(screen.queryByText(LEG_OUTCOME_COPY.failed)).not.toBeInTheDocument();
  });

  it("never mixes up the two messages", () => {
    const { rerender } = render(<OfferList title="Где остановиться" offers={[fallbackOffer]} outcome="failed" />);
    expect(screen.queryByText(LEG_OUTCOME_COPY.empty)).not.toBeInTheDocument();

    rerender(<OfferList title="Где остановиться" offers={[fallbackOffer]} outcome="empty" />);
    expect(screen.queryByText(LEG_OUTCOME_COPY.failed)).not.toBeInTheDocument();
  });

  it("shows no outcome note at all when the leg was served", () => {
    render(
      <OfferList
        title="Где остановиться"
        offers={[{ id: "hotel-0", title: "Отель Пермь" }]}
        outcome="served"
      />,
    );

    expect(screen.queryByText(LEG_OUTCOME_COPY.failed)).not.toBeInTheDocument();
    expect(screen.queryByText(LEG_OUTCOME_COPY.empty)).not.toBeInTheDocument();
  });

  it("renders exactly as before when outcome is omitted (legacy fixtures)", () => {
    render(<OfferList title="Где остановиться" offers={[]} />);

    expect(screen.getByText("Карты оставили эту часть маршрута в тумане. Попробуйте другие даты.")).toBeInTheDocument();
    expect(screen.queryByText(LEG_OUTCOME_COPY.failed)).not.toBeInTheDocument();
    expect(screen.queryByText(LEG_OUTCOME_COPY.empty)).not.toBeInTheDocument();
  });

  it("shows the failed copy even in the truly-empty branch (no fallback offer supplied)", () => {
    render(<OfferList title="Где остановиться" offers={[]} outcome="failed" />);

    expect(screen.getByText(LEG_OUTCOME_COPY.failed)).toBeInTheDocument();
    expect(screen.queryByText(/тумане/)).not.toBeInTheDocument();
  });

  it("shows the outcome note above a grouped transport grid too, not only the flat hotel grid", () => {
    render(
      <OfferList
        title="Билеты по предсказанию"
        offers={[{ id: "t-0", title: "Поезд: ФПК", mode: "railway" }]}
        outcome="failed"
      />,
    );

    expect(screen.getByText(LEG_OUTCOME_COPY.failed)).toBeInTheDocument();
    expect(screen.getByText("Поезд: ФПК")).toBeInTheDocument();
  });
});
