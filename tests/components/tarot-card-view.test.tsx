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

  // The actual defect this task fixes: a written reading, once supplied,
  // must replace the deck's own stock meaning -- not sit alongside it.
  it("shows its matching reading instead of the deck's stock meaning when one is supplied", () => {
    const reading = "Башня рушит старые стены, чтобы освободить дорогу к каменным столбам и тишине.";
    render(<TarotCardView card={tower} revealed readingText={reading} />);

    expect(screen.getByText(reading)).toBeInTheDocument();
    expect(screen.queryByText(tower.meaning)).not.toBeInTheDocument();
  });

  // The safety net: no reading (AI unconfigured, or its output failed
  // validation) must fall back to exactly today's behaviour.
  it("falls back to the deck's own meaning when no reading is supplied", () => {
    render(<TarotCardView card={tower} revealed />);

    expect(screen.getByText(tower.meaning)).toBeInTheDocument();
  });
});
