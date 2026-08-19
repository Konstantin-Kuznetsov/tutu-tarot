"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// See TripSearchForm's own comment on PinIcon/PeopleIcon — same reasoning
// applies here (one glyph, no icon-library dependency).
function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
    </svg>
  );
}

export interface DateRange {
  from: string | null;
  to: string | null;
}

interface DateRangeCalendarProps {
  value: DateRange;
  onChange: (next: DateRange) => void;
}

// Local date parts on purpose. toISOString() converts to UTC and moves the
// date one day back for every user east of UTC, which is all of Russia.
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const MONTH_FORMAT = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" });
const RANGE_FORMAT = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function monthGrid(year: number, month: number): Array<Date | null> {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday-first
  const days = new Date(year, month + 1, 0).getDate();
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, index) => new Date(year, month, index + 1)),
  ];
}

function nightsBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// Standard Russian pluralisation rule (mod 10 / mod 100), not a magnitude
// threshold — a threshold like "n < 5" only happens to agree with the real
// rule for 0-14 and diverges at every later number where n % 10 is 1
// (except 11) or 2-4 (except 12-14): 21 nights is "ночь", 22 is "ночи", 25
// is "ночей", and the twelve-month span this calendar covers reaches all of
// them.
export function nightsWord(nights: number): string {
  const mod10 = nights % 10;
  const mod100 = nights % 100;
  if (mod10 === 1 && mod100 !== 11) return "ночь";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "ночи";
  return "ночей";
}

function label(value: DateRange): string {
  if (!value.from) return "Когда поедете";
  const from = RANGE_FORMAT.format(new Date(`${value.from}T00:00:00`));
  if (!value.to) return `${from} — выберите возвращение`;
  const to = RANGE_FORMAT.format(new Date(`${value.to}T00:00:00`));
  const nights = nightsBetween(value.from, value.to);
  return `${from} – ${to}, ${nights} ${nightsWord(nights)}`;
}

export function DateRangeCalendar({ value, onChange }: DateRangeCalendarProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const today = useMemo(() => startOfToday(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const maxKey = toDateKey(new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()));
  const minKey = toDateKey(today);

  function selectDay(key: string) {
    // `key <= value.from` (not `<`) also catches a second click on the
    // already-selected start day: re-anchor there instead of falling
    // through to "to: key", which would set to === from and hand back a
    // 0-night range with the panel closed. A holiday needs at least one
    // night, so the only way to "complete" a range is a click strictly
    // after the start.
    if (!value.from || value.to || key <= value.from) {
      onChange({ from: key, to: null });
      return;
    }
    onChange({ from: value.from, to: key });
    setOpen(false);
  }

  const months = [0, 1].map((offset) => new Date(cursor.getFullYear(), cursor.getMonth() + offset, 1));
  const previewEnd = value.from && !value.to ? hovered : value.to;

  return (
    <div className="calendar">
      <button
        type="button"
        ref={triggerRef}
        className="calendar__trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <CalendarIcon />
        {label(value)}
      </button>

      {open ? (
        <div className="calendar__panel" role="dialog" aria-label="Выбор дат поездки">
          <div className="calendar__nav">
            <button type="button" aria-label="Предыдущий месяц"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>←</button>
            <button type="button" aria-label="Следующий месяц"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>→</button>
          </div>

          <div className="calendar__months">
            {months.map((month) => (
              <table className="calendar__month" key={toDateKey(month)}>
                <caption>{MONTH_FORMAT.format(month)}</caption>
                <thead>
                  <tr>{WEEKDAYS.map((day) => <th key={day} scope="col">{day}</th>)}</tr>
                </thead>
                <tbody>
                  {chunk(monthGrid(month.getFullYear(), month.getMonth()), 7).map((week, index) => (
                    <tr key={index}>
                      {week.map((day, dayIndex) => {
                        if (!day) return <td key={dayIndex} />;
                        const key = toDateKey(day);
                        const disabled = key < minKey || key > maxKey;
                        const inRange =
                          Boolean(value.from && previewEnd && key > value.from && key < previewEnd);
                        // value.from/value.to are both in scope right here, so the
                        // start/end distinction the mockup's directional gradient
                        // needs is available for free — see the CSS comment above
                        // `.field .calendar` for how `data-position` drives it.
                        const position =
                          key === value.from ? "start" : key === value.to ? "end" : undefined;
                        const edge = position !== undefined;
                        return (
                          <td key={dayIndex}>
                            <button
                              type="button"
                              disabled={disabled}
                              aria-pressed={edge}
                              data-in-range={inRange}
                              data-edge={edge}
                              data-position={position}
                              onMouseEnter={() => setHovered(key)}
                              onClick={() => selectDay(key)}
                            >
                              {day.getDate()}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}
