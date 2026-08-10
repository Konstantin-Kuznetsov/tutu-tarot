import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tarotCards } from "@/domain/tarot/cards";

describe("tarot card images", () => {
  it("has a committed image file for every card", () => {
    const missing = tarotCards
      .map((card) => card.image)
      .filter((image) => !existsSync(path.join(process.cwd(), "public", image)));
    expect(missing).toEqual([]);
  });
});
