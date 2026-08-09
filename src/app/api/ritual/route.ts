import { NextResponse } from "next/server";
import { z } from "zod";
import { runRitual } from "@/server/ritual/runRitual";

const ritualRequestSchema = z.object({
  departureCity: z.string().trim().min(2),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  travelerCount: z.number().int().min(1).max(8),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = ritualRequestSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_ritual_request" }, { status: 400 });
  }

  if (parsed.data.dateTo < parsed.data.dateFrom) {
    return NextResponse.json({ error: "invalid_date_range" }, { status: 400 });
  }

  const result = await runRitual(parsed.data);
  return NextResponse.json(result);
}
