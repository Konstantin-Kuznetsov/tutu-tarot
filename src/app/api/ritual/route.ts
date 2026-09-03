import { NextResponse } from "next/server";
import { z } from "zod";
import { isCalendarDate } from "@/domain/validation/dates";
import { runRitual } from "@/server/ritual/runRitual";
import { logRitualFailure } from "@/server/observability/ritualLog";

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

  // runRitual used to be awaited bare: anything thrown inside it became a
  // 500 with no record of what broke or how far in, which is the one failure
  // mode nginx's access log cannot explain either -- it sees a 500 and
  // nothing else. The client's own error copy is unchanged; this only makes
  // sure the server keeps a line about why.
  const startedAt = Date.now();
  try {
    const result = await runRitual(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    // AbortError here is the 18-second search budget expiring (see
    // SEARCH_BUDGET_MS) -- by far the likeliest failure, and the one worth
    // being able to count. Narration failures never reach this point:
    // createPrediction falls back to its written-in texts rather than
    // throwing, which is why "search" is the only stage named.
    logRitualFailure(startedAt, "search", error);
    return NextResponse.json({ error: "ritual_failed" }, { status: 500 });
  }
}
