import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RitualScene } from "@/components/RitualScene";

vi.mock("@/components/RitualScene3D", () => ({
  RitualScene3D: () => (
    <div aria-label="3D tarot ritual scene">
      <canvas />
    </div>
  ),
}));

describe("RitualScene", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  it("renders the fallback without mounting the 3D scene when reduced motion is preferred", () => {
    render(<RitualScene stage="idle" />);

    expect(screen.getByLabelText("Tarot ritual scene")).toBeInTheDocument();
    expect(screen.queryByLabelText("3D tarot ritual scene")).not.toBeInTheDocument();
  });
});
