import { NextResponse } from "next/server";
import { z } from "zod";
import { runRitual } from "@/server/ritual/runRitual";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  const match = datePattern.exec(value);
  if (!match) return false;

  const year = Number(match[0].slice(0, 4));
  const month = Number(match[0].slice(5, 7));
  const day = Number(match[0].slice(8, 10));
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const calendarDateSchema = z.string().regex(datePattern).refine(isCalendarDate);

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
