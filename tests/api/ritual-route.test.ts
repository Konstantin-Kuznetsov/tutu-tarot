import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/ritual/runRitual", () => ({
  runRitual: vi.fn(),
}));

import { POST } from "@/app/api/ritual/route";
import { runRitual } from "@/server/ritual/runRitual";

function createRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/ritual", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/ritual", () => {
  beforeEach(() => {
    vi.mocked(runRitual).mockReset();
    vi.mocked(runRitual).mockResolvedValue({} as Awaited<ReturnType<typeof runRitual>>);
  });

  it("rejects invalid traveler count", async () => {
    const response = await POST(createRequest({
      departureCity: "Москва",
      dateFrom: "2026-09-10",
      dateTo: "2026-09-17",
      travelerCount: 0,
    }));

    expect(response.status).toBe(400);
    expect(runRitual).not.toHaveBeenCalled();
  });

  it.each([
    { field: "dateFrom", value: "2026-02-30" },
    { field: "dateTo", value: "2026-99-99" },
  ])("rejects invalid $field value $value without running the ritual", async ({ field, value }) => {
    const response = await POST(createRequest({
      departureCity: "Москва",
      dateFrom: field === "dateFrom" ? value : "2026-09-10",
      dateTo: field === "dateTo" ? value : "2026-09-17",
      travelerCount: 2,
    }));

    expect(response.status).toBe(400);
    expect(runRitual).not.toHaveBeenCalled();
  });

  it("rejects an inverted date range without running the ritual", async () => {
    const response = await POST(createRequest({
      departureCity: "Москва",
      dateFrom: "2026-09-17",
      dateTo: "2026-09-10",
      travelerCount: 2,
    }));

    expect(response.status).toBe(400);
    expect(runRitual).not.toHaveBeenCalled();
  });
});
