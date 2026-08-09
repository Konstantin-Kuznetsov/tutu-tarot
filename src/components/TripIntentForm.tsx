"use client";

import { useState } from "react";
import type { TripIntent } from "@/domain/types";

export function TripIntentForm({ onSubmit }: { onSubmit(intent: TripIntent): void }) {
  const [departureCity, setDepartureCity] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [travelerCount, setTravelerCount] = useState(2);

  return (
    <form
      className="intent-form"
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
      <label>
        Город вылета
        <input value={departureCity} onChange={(event) => setDepartureCity(event.target.value)} required />
      </label>
      <label>
        Дата начала
        <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} required />
      </label>
      <label>
        Дата конца
        <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} required />
      </label>
      <label>
        Путешественники
        <input
          type="number"
          min={1}
          max={8}
          value={travelerCount}
          onChange={(event) => setTravelerCount(Number(event.target.value))}
          required
        />
      </label>
      <button type="submit">Начать расклад</button>
    </form>
  );
}
