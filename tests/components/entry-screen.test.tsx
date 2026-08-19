import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Page from "@/app/page";

// The entry screen is now LumoraHero (rendered by RitualStage at the idle
// stage), not the old tarot `.enter` screen. These assertions were rewritten
// against it: the deck fan, the "Туту · сервис путешествий" service line and
// the "Таро-турагент" title all belonged to that earlier screen and no
// longer exist anywhere on the page.
describe("entry screen", () => {
  it("presents the title and the promise", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { name: "Куда зовёт дорога?" })).toBeInTheDocument();
    // Matched on a fragment, not the whole sentence: the copy carries a <br>
    // mid-sentence, so the surrounding text nodes never normalise to one
    // contiguous string.
    expect(screen.getByText(/колода выбирает маршрут по России/i)).toBeInTheDocument();
  });

  it("puts the search ticket on the page", () => {
    render(<Page />);
    expect(screen.getByLabelText("Откуда")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Когда поедете/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Путешественники")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Разложить карты" })).toBeInTheDocument();
  });

  it("carries the Tutu strapline", () => {
    render(<Page />);
    expect(screen.getByText("Путешествуйте выгодно с Туту")).toBeInTheDocument();
  });

  it("exposes exactly one main landmark", () => {
    render(<Page />);
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("carries no prototype navigation", () => {
    render(<Page />);
    expect(document.querySelector(".proto-nav")).toBeNull();
  });
});
