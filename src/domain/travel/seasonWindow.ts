// Parses the free-text "season window" strings the Tutu guide collector
// picked up (data/tutu-guides.json's seasonWindow field, copied verbatim
// into atlas.ts's own seasonWindow) into calendar months, so the UI can
// tell a traveller honestly when their own dates fall outside the guide's
// recommended season -- without ever guessing at a format this parser
// doesn't fully understand. The atlas carries exactly 19 distinct phrasings
// today (see tests/domain/season-window.test.ts for the full table); this
// is built against that reality, not an imagined format, and anything it
// doesn't recognise with certainty comes back "unparseable" rather than a
// best-effort guess -- a wrong "you're going at the wrong time" is far
// worse than saying nothing at all.

// Matches a single month word, nominative or genitive ("апрель"/"апреля"),
// which is the only inflection the atlas's 19 phrasings ever use.
const MONTH_PATTERNS: ReadonlyArray<readonly [RegExp, number]> = [
  [/^январ[ья]$/, 1],
  [/^феврал[ья]$/, 2],
  [/^март[а]?$/, 3],
  [/^апрел[ья]$/, 4],
  [/^ма[йя]$/, 5],
  [/^июн[ья]$/, 6],
  [/^июл[ья]$/, 7],
  [/^август[а]?$/, 8],
  [/^сентябр[ья]$/, 9],
  [/^октябр[ья]$/, 10],
  [/^ноябр[ья]$/, 11],
  [/^декабр[ья]$/, 12],
];

// "лета"/"осени" etc -- a season noun on its own is only resolvable to one
// representative month when paired with a start/middle/end qualifier (see
// QUALIFIER_POSITION below); "конца лета" needs both this table and that one.
const SEASON_MONTHS: Readonly<Record<string, readonly [number, number, number]>> = {
  лето: [6, 7, 8],
  лета: [6, 7, 8],
  весна: [3, 4, 5],
  весны: [3, 4, 5],
  осень: [9, 10, 11],
  осени: [9, 10, 11],
  зима: [12, 1, 2],
  зимы: [12, 1, 2],
};

// "летние месяцы" -- a season *adjective* plus "месяцы" -- means the whole
// season, unlike the noun forms above which need a qualifier to narrow to
// one month. Distinct table because the words themselves differ.
const SEASON_ADJECTIVE_MONTHS: Readonly<Record<string, readonly [number, number, number]>> = {
  летние: [6, 7, 8],
  зимние: [12, 1, 2],
  весенние: [3, 4, 5],
  осенние: [9, 10, 11],
};

// Fuzzy month-boundary qualifiers ("с середины июня", "до конца лета",
// "третьей декады августа"). The task spec says these can be treated at
// whole-month resolution -- accurate enough for a seasonal hint -- so a
// qualifier attached directly to a month word is simply ignored (see
// resolveSingleMonth: it returns as soon as it finds a month word,
// regardless of any qualifier already seen). It only matters on its own,
// attached to a bare season noun, to pick which of that season's three
// months stands in for the whole phrase.
const QUALIFIER_POSITION: Readonly<Record<string, "start" | "middle" | "end">> = {
  начало: "start",
  начала: "start",
  начале: "start",
  первая: "start",
  первой: "start",
  первую: "start",
  середина: "middle",
  середины: "middle",
  середину: "middle",
  вторая: "middle",
  второй: "middle",
  вторую: "middle",
  конец: "end",
  конца: "end",
  концу: "end",
  третья: "end",
  третьей: "end",
  третью: "end",
  // A bare "декада" ("ten-day span") carries no start/middle/end meaning of
  // its own -- it always shows up in the data paired with an ordinal
  // ("третьей декады") that already set the position, so this entry never
  // actually decides anything; it's here only so the word doesn't fall
  // through as an unrecognised token and make the whole phrase unparseable.
  декада: "end",
  декады: "end",
  декаду: "end",
};

function monthFromWord(word: string): number | null {
  for (const [pattern, month] of MONTH_PATTERNS) {
    if (pattern.test(word)) return month;
  }
  return null;
}

// Resolves a phrase ("июня", "середины июня", "конца лета") to the single
// calendar month it refers to at whole-month resolution. Returns null when
// the phrase names no month/season this parser recognises, or names a
// season noun with no qualifier to pick a month from it (e.g. a bare
// "лето") -- both cases must stay unparseable, never a guess.
function resolveSingleMonth(phrase: string): number | null {
  const words = phrase.split(/\s+/).filter(Boolean);
  let position: "start" | "middle" | "end" | null = null;

  for (const word of words) {
    const month = monthFromWord(word);
    if (month !== null) return month;

    if (word in SEASON_MONTHS) {
      if (position === null) return null;
      const [start, middle, end] = SEASON_MONTHS[word];
      return position === "start" ? start : position === "end" ? end : middle;
    }

    const qualifierPosition = QUALIFIER_POSITION[word];
    if (qualifierPosition && position === null) {
      position = qualifierPosition;
    }
  }

  return null;
}

// Inclusive month range, wrapping across the year boundary when the end
// month is numerically smaller than the start (e.g. a hypothetical
// "ноябрь-март" would mean Nov, Dec, Jan, Feb, Mar). None of today's 19
// phrasings wrap, but a range parser that silently got this wrong for one
// that did would be exactly the kind of confident-but-wrong mismatch this
// feature exists to avoid.
function monthRange(start: number, end: number): number[] {
  const months: number[] = [];
  let month = start;
  for (let i = 0; i < 12; i += 1) {
    months.push(month);
    if (month === end) break;
    month = month === 12 ? 1 : month + 1;
  }
  return months;
}

// "с X по Y" / "с X до Y" -- the only two-sided connector words the atlas
// uses for a spelled-out range.
const FROM_TO_PATTERN = /^с\s+(.+?)\s+(?:по|до)\s+(.+)$/;

// Parses one comma/semicolon-separated segment of a window string into the
// months it covers, or null if this segment isn't a shape the parser
// recognises with confidence.
function parseSegment(segment: string): number[] | null {
  const trimmed = segment.trim();
  if (!trimmed) return null;

  // Dashes are normalised to a plain hyphen by the caller, so any hyphen
  // here is a range delimiter ("май-октябрь") -- no month name contains one.
  const dashIndex = trimmed.indexOf("-");
  if (dashIndex !== -1) {
    const start = resolveSingleMonth(trimmed.slice(0, dashIndex));
    const end = resolveSingleMonth(trimmed.slice(dashIndex + 1));
    return start !== null && end !== null ? monthRange(start, end) : null;
  }

  const fromTo = FROM_TO_PATTERN.exec(trimmed);
  if (fromTo) {
    const start = resolveSingleMonth(fromTo[1]);
    const end = resolveSingleMonth(fromTo[2]);
    return start !== null && end !== null ? monthRange(start, end) : null;
  }

  const single = resolveSingleMonth(trimmed);
  return single === null ? null : [single];
}

export type ParsedSeasonWindow =
  // "круглый год" -- open every month, and never a mismatch candidate.
  | { kind: "always" }
  // A confidently parsed set of calendar months (1-12).
  | { kind: "months"; months: ReadonlySet<number> }
  // Anything this parser can't parse with certainty -- callers must treat
  // this exactly like "always" for mismatch purposes (say nothing), even
  // though the meaning is really "unknown", not "no restriction".
  | { kind: "unparseable" };

// Three different dash characters show up across the 19 phrasings (hyphen,
// en dash, em dash) plus inconsistent spacing around them; this is the one
// normalisation pass every entry point below goes through first.
function normalize(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, " ");
}

const SEASON_ADJECTIVE_PATTERN = /^(летние|зимние|весенние|осенние)\s+месяц[а-я]*$/;

export function parseSeasonWindow(raw: string): ParsedSeasonWindow {
  const normalized = normalize(raw);
  if (normalized === "круглый год") return { kind: "always" };

  const adjectiveMatch = SEASON_ADJECTIVE_PATTERN.exec(normalized);
  if (adjectiveMatch) {
    return { kind: "months", months: new Set(SEASON_ADJECTIVE_MONTHS[adjectiveMatch[1]]) };
  }

  // Multi-range forms are separated by a comma or a semicolon and must be
  // read as a union of every segment, not just the first one.
  const segments = normalized.split(/[,;]/).map((part) => part.trim()).filter(Boolean);
  if (segments.length === 0) return { kind: "unparseable" };

  const months = new Set<number>();
  for (const segment of segments) {
    const parsed = parseSegment(segment);
    // One unparseable segment makes the whole window unparseable -- a
    // partially-understood multi-range string is exactly the case where a
    // confident-looking but wrong month set is most likely.
    if (parsed === null) return { kind: "unparseable" };
    parsed.forEach((month) => months.add(month));
  }

  return { kind: "months", months };
}

// The caption shown next to the raw window text in the guide strip (see
// TravelResult's guideStripText): frames it explicitly as the guide's own
// advice, not a description of the dates the traveller picked. "Круглый
// год" is left bare -- "лучшее время: круглый год" ("best time: year
// round") reads oddly, since "any time" isn't really a recommendation.
export function seasonWindowCaption(raw: string): string {
  const trimmed = raw.trim();
  if (normalize(raw) === "круглый год") return trimmed;
  return `лучшее время: ${trimmed}`;
}

function monthOfIsoDate(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

// Generous safety cap on how many calendar months a trip range walk can
// step through -- real trips built through the app's own date picker never
// approach this, but a malformed dateTo < dateFrom pair (shouldn't happen;
// the API already rejects it) must still terminate rather than loop.
const MAX_MONTHS_WALKED = 36;

// Every calendar month (1-12) the trip touches, from dateFrom's month
// through dateTo's month inclusive. A trip spanning two months contributes
// both; one spanning a single month contributes just that one.
export function monthsInTripRange(dateFrom: string, dateTo: string): ReadonlySet<number> {
  const from = monthOfIsoDate(dateFrom);
  const to = monthOfIsoDate(dateTo);
  if (!from || !to) return new Set();

  const months = new Set<number>();
  let { year, month } = from;
  for (let step = 0; step < MAX_MONTHS_WALKED; step += 1) {
    months.add(month);
    if (year === to.year && month === to.month) break;
    month = month === 12 ? 1 : month + 1;
    if (month === 1) year += 1;
  }
  return months;
}

// True only when the window parses to a confident set of months AND none of
// the trip's own months fall inside it. False for "круглый год", for a
// window this parser can't confidently read, and for any trip that overlaps
// the window in at least one month -- in every one of those cases, staying
// silent (or, for the in-window case, simply not being a mismatch) is the
// only safe answer.
export function isOutsideSeasonWindow(seasonWindow: string, dateFrom: string, dateTo: string): boolean {
  const parsed = parseSeasonWindow(seasonWindow);
  if (parsed.kind !== "months") return false;

  const tripMonths = monthsInTripRange(dateFrom, dateTo);
  if (tripMonths.size === 0) return false;

  for (const month of tripMonths) {
    if (parsed.months.has(month)) return false;
  }
  return true;
}
