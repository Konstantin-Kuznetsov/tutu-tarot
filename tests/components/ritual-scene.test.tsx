import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RitualScene } from "@/components/RitualScene";

describe("RitualScene", () => {
  function mockReducedMotion(matches: boolean) {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  }

  it("renders an atmospheric tarot scene without mounting a 3D canvas", () => {
    mockReducedMotion(false);

    render(<RitualScene stage="idle" />);

    expect(screen.getByLabelText("Мистический расклад карт")).toBeInTheDocument();
    expect(screen.queryByLabelText("3D tarot ritual scene")).not.toBeInTheDocument();
    expect(document.querySelector("canvas")).not.toBeInTheDocument();
  });

  it("keeps the tarot scene available when reduced motion is preferred", () => {
    mockReducedMotion(true);

    render(<RitualScene stage="idle" />);

    expect(screen.getByLabelText("Мистический расклад карт")).toBeInTheDocument();
    expect(document.querySelector("canvas")).not.toBeInTheDocument();
  });
});
