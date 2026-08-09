import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("project foundation", () => {
  it("enables React strict mode", () => {
    expect(nextConfig.reactStrictMode).toBe(true);
  });
});
