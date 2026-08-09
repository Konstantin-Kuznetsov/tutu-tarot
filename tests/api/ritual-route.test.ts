import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/ritual/route";

describe("POST /api/ritual", () => {
  it("rejects invalid traveler count", async () => {
    const request = new Request("http://localhost/api/ritual", {
      method: "POST",
      body: JSON.stringify({
        departureCity: "Москва",
        dateFrom: "2026-09-10",
        dateTo: "2026-09-17",
        travelerCount: 0,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
