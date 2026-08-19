"use client";

import { useEffect, useId, useRef, useState } from "react";
import { DEPARTURE_CITIES } from "@/domain/travel/departureCities";

// The Figma reference ("🪁 Suggest Field", node 32:3124 in the Tutu design
// system) shows matching cities in a dropdown the instant you type — this
// is that behaviour, scoped to the one city field this product actually
// has ("Откуда"; there is no "Куда" input, the tarot draw picks the
// destination). DEPARTURE_CITIES is a plain population/hub-weighted list,
// not the travelAtlas — see that file's own comment for why the two are
// kept separate.
//
// ё/е folding mirrors homeCity.ts's `normalize`: a traveller typing "Орел"
// must still match "Орёл" in the list.
function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
}

const QUICK_PICKS = DEPARTURE_CITIES.slice(0, 6);
const MAX_SUGGESTIONS = 6;

function suggestionsFor(query: string): readonly string[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return QUICK_PICKS;

  const needle = normalize(trimmed);
  // Prefix matches ("Ка" -> Казань) read before mid-word matches ("Ка" ->
  // Нижнекамск) rather than in whatever order the source list happens to
  // use, without needing two passes over the whole list.
  const prefix: string[] = [];
  const contains: string[] = [];
  for (const city of DEPARTURE_CITIES) {
    const normalized = normalize(city);
    if (normalized.startsWith(needle)) prefix.push(city);
    else if (normalized.includes(needle)) contains.push(city);
  }
  return [...prefix, ...contains].slice(0, MAX_SUGGESTIONS);
}

export function CitySuggestField({
  id,
  label,
  icon,
  value,
  onChange,
  placeholder,
  required,
}: {
  id: string;
  label: string;
  icon?: React.ReactNode;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const suggestions = open ? suggestionsFor(value) : [];

  // Close on outside click — the input's own onBlur can't do this alone,
  // since clicking an option first blurs the input (losing focus to the
  // button/li) before the click handler that would select it ever runs.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function selectCity(city: string) {
    onChange(city);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlighted(0);
        return;
      }
      setHighlighted((current) => (current + 1) % Math.max(suggestions.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return;
      setHighlighted((current) => (current - 1 + suggestions.length) % Math.max(suggestions.length, 1));
    } else if (event.key === "Enter") {
      if (!open || suggestions.length === 0) return;
      // Stops the ticket's own onSubmit from firing on this Enter — the
      // traveller is completing the field, not the form.
      event.preventDefault();
      selectCity(suggestions[highlighted]);
    } else if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="city-suggest" ref={rootRef}>
      <label className="lab" htmlFor={id}>
        {icon}
        {label}
      </label>
      <input
        id={id}
        type="text"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && suggestions.length > 0 ? `${listboxId}-${highlighted}` : undefined}
        placeholder={placeholder}
        value={value}
        required={required}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setHighlighted(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && suggestions.length > 0 ? (
        <ul className="city-suggest__panel" role="listbox" id={listboxId}>
          {suggestions.map((city, index) => (
            <li
              key={city}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === highlighted}
              data-active={index === highlighted}
              // onMouseDown (not onClick) fires before the input's blur,
              // so the outside-click handler above never gets a chance to
              // close the panel out from under this selection.
              onMouseDown={(event) => {
                event.preventDefault();
                selectCity(city);
              }}
              onMouseEnter={() => setHighlighted(index)}
            >
              {city}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
