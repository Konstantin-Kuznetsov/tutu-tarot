import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Page from "@/app/page";

describe("entry screen", () => {
  it("presents the service line, the title and the promise", () => {
    render(<Page />);
    expect(screen.getByText(/Туту · сервис путешествий/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Таро-турагент" })).toBeInTheDocument();
    expect(
      screen.getByText("Колода выбирает маршрут по России, а Туту проверяет дорогу и ночлег."),
    ).toBeInTheDocument();
  });

  it("shows the deck fan above the title", () => {
    render(<Page />);
    expect(screen.getByTestId("deck-fan").querySelectorAll(".back")).toHaveLength(3);
  });

  it("keeps the honest fine print", () => {
    render(<Page />);
    expect(screen.getByText(/Билеты, поезда и отели — настоящие/i)).toBeInTheDocument();
  });

  it("carries no prototype navigation", () => {
    render(<Page />);
    expect(document.querySelector(".proto-nav")).toBeNull();
  });
});
