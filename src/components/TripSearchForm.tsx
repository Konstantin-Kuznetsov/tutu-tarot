"use client";

import { useState } from "react";
import { DateRangeCalendar, type DateRange } from "@/components/DateRangeCalendar";
import { CitySuggestField } from "@/components/CitySuggestField";
import type { TripIntent } from "@/domain/types";

// Just the ticket — the three fields and the submit button, owning their own
// draft state and handing a finished TripIntent up.
//
// Split out of TripIntentForm (which is now the tarot entry screen's chrome
// *around* this) so the same ticket can also sit on the Lumora hero's white
// panel without dragging a second <h1>, a second full-page background and a
// second set of fine print along with it. Both hosts render this identical
// markup, so the ticket only ever has one implementation to keep in step.
//
// Colour comes entirely from custom properties (--cloth, --line, --gold,
// --text…). Those resolve to the dark tarot palette at :root, so this
// component only looks right inside an element that redefines them to the
// light Tutu set — `.table` and `.lumora__search` both do; see their shared
// rule in globals.css.

// Small inline field icons. Plain stroke SVGs rather than an icon-library
// dependency — three glyphs don't justify one. aria-hidden: the label text
// next to each already says what the field is for.
function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8.5" cy="8" r="2.8" />
      <path d="M3.5 19c0-2.9 2.3-5 5-5s5 2.1 5 5" />
      <circle cx="16.5" cy="8.5" r="2.2" />
      <path d="M15 14.3c2.2.4 3.8 2.2 3.8 4.7" />
    </svg>
  );
}

export function TripSearchForm({ onSubmit }: { onSubmit(intent: TripIntent): void }) {
  const [departureCity, setDepartureCity] = useState("");
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  const [travelerCount, setTravelerCount] = useState(2);

  return (
    <form
      className="ticket"
      onSubmit={(event) => {
        event.preventDefault();
        if (!range.from || !range.to) return;
        onSubmit({
          departureCity: departureCity.trim(),
          dateFrom: range.from,
          dateTo: range.to,
          travelerCount,
        });
      }}
    >
      <div className="field">
        <CitySuggestField
          id="departureCity"
          label="Откуда"
          icon={<PinIcon />}
          placeholder="Москва"
          value={departureCity}
          onChange={setDepartureCity}
          required
        />
      </div>
      <div className="field">
        <DateRangeCalendar value={range} onChange={setRange} />
      </div>
      <div className="field">
        <label className="lab" htmlFor="travelerCount">
          <PeopleIcon />
          Путешественники
        </label>
        <input
          id="travelerCount"
          type="number"
          min={1}
          max={8}
          value={travelerCount}
          onChange={(event) => setTravelerCount(Number(event.target.value))}
          required
        />
      </div>
      <button type="submit" className="btn" disabled={!range.from || !range.to}>
        Разложить карты
      </button>
    </form>
  );
}
