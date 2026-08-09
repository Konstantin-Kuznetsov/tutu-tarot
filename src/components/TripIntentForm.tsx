"use client";

import { useState } from "react";
import type { TripIntent } from "@/domain/types";

// The entire entry screen ("01 Вход.dc.html" in the Claude Design project),
// not just the form: the fan, the service line, the h1, the promise, the
// ticket, and the fine print. RitualStage mounts this alone at the idle
// stage (see its own comment) so there is exactly one <h1> in the document.
//
// The mockup's ticket has 4 columns (city / "when" link / travelers /
// button) because its date range is a single field linking out to a
// calendar screen. This keeps the pre-existing two separate date inputs
// instead (5 columns total) — Task 10 is what turns them into the
// mockup's calendar, not this task, per the brief.
export function TripIntentForm({ onSubmit }: { onSubmit(intent: TripIntent): void }) {
  const [departureCity, setDepartureCity] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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
            onSubmit({
              departureCity: departureCity.trim(),
              dateFrom,
              dateTo,
              travelerCount,
            });
          }}
        >
          <div className="field">
            <label className="lab" htmlFor="departureCity">
              Город вылета
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
            <label className="lab" htmlFor="dateFrom">
              Дата начала
            </label>
            <input
              id="dateFrom"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label className="lab" htmlFor="dateTo">
              Дата конца
            </label>
            <input
              id="dateTo"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              required
            />
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
          <button type="submit" className="btn">
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
