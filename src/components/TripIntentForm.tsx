"use client";

import { useState } from "react";
import { DateRangeCalendar, type DateRange } from "@/components/DateRangeCalendar";
import type { TripIntent } from "@/domain/types";

// The entire entry screen ("01 Вход.dc.html" in the Claude Design project),
// not just the form: the fan, the service line, the h1, the promise, the
// ticket, and the fine print. RitualStage mounts this alone at the idle
// stage (see its own comment) so there is exactly one <h1> in the document.
//
// The mockup's ticket has 4 columns (city / "when" link / travelers /
// button) because its date range is a single field linking out to a
// calendar screen ("04 Календарь.dc.html"). Task 10 folds that separate
// screen into a single popover field here instead — same one-field-not-two
// idea, without a page navigation — so the ticket now matches the mockup's
// column count.
export function TripIntentForm({ onSubmit }: { onSubmit(intent: TripIntent): void }) {
  const [departureCity, setDepartureCity] = useState("");
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  const [travelerCount, setTravelerCount] = useState(2);

  return (
    <div className="table">
      <main className="enter">
        <div className="fan" data-testid="deck-fan" aria-hidden="true">
          <div className="back" />
          <div className="back" />
          <div className="back" />
        </div>
        <p className="caps">Туту · сервис путешествий</p>
        <h1>Таро-турагент</h1>
        <p className="sub">Колода выбирает маршрут по России, а Туту проверяет дорогу и ночлег.</p>
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
            <label className="lab" htmlFor="departureCity">
              Откуда
            </label>
            <input
              id="departureCity"
              type="text"
              placeholder="Москва"
              autoComplete="off"
              value={departureCity}
              onChange={(event) => setDepartureCity(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <DateRangeCalendar value={range} onChange={setRange} />
          </div>
          <div className="field">
            <label className="lab" htmlFor="travelerCount">
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
            Начать расклад
          </button>
        </form>
        <div className="rule" aria-hidden="true">
          <span className="diamond" />
        </div>
        <p className="fine">Предсказание — на удачу. Билеты, поезда и отели — настоящие.</p>
      </main>
    </div>
  );
}
