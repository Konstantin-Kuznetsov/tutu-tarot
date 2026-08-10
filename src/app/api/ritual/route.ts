import { NextResponse } from "next/server";
import { z } from "zod";
import { isCalendarDate } from "@/domain/validation/dates";
import { runRitual } from "@/server/ritual/runRitual";

// The Tutu MCP search budget is 18s (src/server/tutu/mcpClient.ts); 30s leaves
// room for narration and cold start. Do not raise past what the deployment
// plan allows.
export const maxDuration = 30;

const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate);

const ritualRequestSchema = z.object({
  departureCity: z.string().trim().min(2),
  dateFrom: calendarDateSchema,
  dateTo: calendarDateSchema,
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
