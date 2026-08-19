import { TRANSPORT_MODES } from "@/domain/types";
import type { ModesSummary, TransportMode, TripIntent } from "@/domain/types";

// Both a validity list and a priority order, and deliberately the same one:
// TRANSPORT_MODES is declared grandest-first with etrain last, which is
// exactly the precedence this file wants. Deriving it means a mode added to
// the type can never be silently absent from the usable set.
const MODE_ORDER = TRANSPORT_MODES;
const MINUTES_PER_DAY = 24 * 60;

// A road may not eat more than a third of the holiday in one direction.
// Moscow to Vladivostok by rail is 9330 minutes — six and a half days each
// way against a seven-day trip. It exists, and it is not a road.
const MAX_SHARE_OF_TRIP = 1 / 3;

function tripMinutes(intent: TripIntent): number {
  const from = Date.parse(`${intent.dateFrom}T00:00:00Z`);
  const to = Date.parse(`${intent.dateTo}T00:00:00Z`);
  const days = Number.isFinite(from) && Number.isFinite(to) ? (to - from) / 86_400_000 : 1;
  return Math.max(1, days) * MINUTES_PER_DAY;
}

export function usableModes(summary: ModesSummary, intent: TripIntent): TransportMode[] {
  const existing = MODE_ORDER.filter((mode) => (summary[mode]?.count ?? 0) > 0);
  if (existing.length === 0) return [];

  const budget = tripMinutes(intent) * MAX_SHARE_OF_TRIP;
  const sane = existing.filter((mode) => {
    const duration = summary[mode]?.minDurationMin;
    return duration === null || duration === undefined || duration <= budget;
  });
  if (sane.length > 0) return sane;

  // Everything is too slow. A long road still beats no road.
  const fastest = [...existing].sort(
    (a, b) => (summary[a]?.minDurationMin ?? Infinity) - (summary[b]?.minDurationMin ?? Infinity),
  )[0];
  return [fastest];
}
