import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TarotCardView } from "@/components/TarotCardView";
import type { DrawnTarotCard } from "@/domain/types";

const tower: DrawnTarotCard = {
  id: "tower", number: 16, name: "Башня", image: "/tarot/16-tower.webp",
  archetypes: ["cliffs"], transport: ["avia"],
  meaning: "камень, высота и резкая перемена взгляда",
  meaningReversed: "обвал случился раньше, теперь строят заново",
  position: "Зов", reversed: false,
};

describe("TarotCardView", () => {
  it("shows the artwork and the upright meaning when revealed", () => {
    render(<TarotCardView card={tower} revealed />);
    expect(screen.getByRole("img", { name: /Башня/ })).toHaveAttribute(
      "src", expect.stringContaining("16-tower"),
    );
    expect(screen.getByText(tower.meaning)).toBeInTheDocument();
  });

  it("marks a reversed card and shows its reversed meaning", () => {
    render(<TarotCardView card={{ ...tower, reversed: true }} revealed />);
    expect(screen.getByTestId("tarot-card")).toHaveAttribute("data-reversed", "true");
    expect(screen.getByText(tower.meaningReversed)).toBeInTheDocument();
    expect(screen.queryByText(tower.meaning)).not.toBeInTheDocument();
  });

  it("hides the artwork before the reveal", () => {
    render(<TarotCardView card={tower} revealed={false} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
