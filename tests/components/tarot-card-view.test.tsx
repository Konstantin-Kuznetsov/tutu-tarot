import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TarotCardView } from "@/components/TarotCardView";

describe("TarotCardView", () => {
  it("hides the card name before reveal", () => {
    render(<TarotCardView name="Отшельник" revealed={false} />);
    expect(screen.queryByText("Отшельник")).not.toBeInTheDocument();
  });

  it("shows the card name after reveal", () => {
    render(<TarotCardView name="Отшельник" revealed />);
    expect(screen.getByText("Отшельник")).toBeInTheDocument();
  });
});
