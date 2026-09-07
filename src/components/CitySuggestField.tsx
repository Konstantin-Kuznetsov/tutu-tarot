"use client";

import { useEffect, useId, useRef, useState } from "react";
import { DEPARTURE_CITIES } from "@/domain/travel/departureCities";

// The Figma reference ("🪁 Suggest Field", node 32:3124 in the Tutu design
// system) shows matching cities in a dropdown the instant you type -- this
// is that behaviour, scoped to the one city field this product actually
// has ("Откуда"; there is no "Куда" input, the tarot draw picks the
// destination). Live suggestions come from Tutu's ptt suggest API;
// DEPARTURE_CITIES remains the instant/error fallback, not the primary
// source of truth.
//
// ё/е folding mirrors homeCity.ts's `normalize`: a traveller typing "Орел"
// must still match "Орёл" in the fallback list.
function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
}

const QUICK_PICKS = DEPARTURE_CITIES.slice(0, 6);
const MAX_SUGGESTIONS = 6;
const SUGGEST_ENDPOINT = "https://ptt.tutu.ru/v1/suggest/search/?transport=ptt&prefix=";
const SUGGEST_DEBOUNCE_MS = 200;

interface CitySuggestion {
  key: string;
  name: string;
  regionName: string | null;
}

interface TutuSuggestSource {
  geo_type?: string;
  geo_id?: string | number;
  name?: string;
  region_name?: string | null;
  country_name?: string | null;
}

interface TutuSuggestHit {
  _source?: TutuSuggestSource;
}

interface TutuSuggestResponse {
  hits?: {
    hits?: TutuSuggestHit[];
  };
}

function fallbackSuggestionsFor(query: string): CitySuggestion[] {
  const trimmed = query.trim();
  const fallbackCities = trimmed.length === 0 ? QUICK_PICKS : DEPARTURE_CITIES;

  const needle = normalize(trimmed);
  // Prefix matches ("Ка" -> Казань) read before mid-word matches ("Ка" ->
  // Нижнекамск) rather than in whatever order the source list happens to
  // use, without needing two passes over the whole list.
  const prefix: CitySuggestion[] = [];
  const contains: CitySuggestion[] = [];
  for (const city of fallbackCities) {
    const normalized = normalize(city);
    const suggestion = { key: `fallback:${city}`, name: city, regionName: null };
    if (trimmed.length === 0 || normalized.startsWith(needle)) prefix.push(suggestion);
    else if (normalized.includes(needle)) contains.push(suggestion);
  }
  return [...prefix, ...contains].slice(0, MAX_SUGGESTIONS);
}

function suggestionsFromTutu(payload: TutuSuggestResponse): CitySuggestion[] {
  const seen = new Set<string>();
  const hits = payload.hits?.hits ?? [];

  return hits
    .map((hit) => hit._source)
    .filter((source): source is TutuSuggestSource => Boolean(source))
    .filter((source) => source.geo_type === "LOCALITY")
    .filter((source) => source.country_name === "Россия")
    .filter((source) => typeof source.name === "string" && source.name.trim().length > 0)
    .flatMap((source) => {
      const name = source.name?.trim() ?? "";
      const regionName = source.region_name?.trim() || null;
      const key = String(source.geo_id ?? `${name}:${regionName ?? ""}`);
      const duplicateKey = `${name}:${regionName ?? ""}`;
      if (seen.has(duplicateKey)) return [];
      seen.add(duplicateKey);
      return [{ key, name, regionName }];
    })
    .slice(0, MAX_SUGGESTIONS);
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
  const [remoteSuggestions, setRemoteSuggestions] = useState<CitySuggestion[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const fallbackSuggestions = fallbackSuggestionsFor(value);

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

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await window.fetch(`${SUGGEST_ENDPOINT}${encodeURIComponent(value.trim())}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("suggest_failed");

        const payload = (await response.json()) as TutuSuggestResponse;
        const remoteSuggestions = suggestionsFromTutu(payload);
        setRemoteSuggestions(remoteSuggestions.length > 0 ? remoteSuggestions : []);
        setHighlighted(0);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRemoteSuggestions(null);
        setHighlighted(0);
      }
    }, SUGGEST_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, value]);

  const visibleSuggestions = open ? (remoteSuggestions ?? fallbackSuggestions) : [];

  function selectCity(city: CitySuggestion) {
    onChange(city.name);
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
      setHighlighted((current) => (current + 1) % Math.max(visibleSuggestions.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return;
      setHighlighted(
        (current) => (current - 1 + visibleSuggestions.length) % Math.max(visibleSuggestions.length, 1),
      );
    } else if (event.key === "Enter") {
      const suggestion = visibleSuggestions[highlighted];
      if (!open || !suggestion) return;
      // Stops the ticket's own onSubmit from firing on this Enter — the
      // traveller is completing the field, not the form.
      event.preventDefault();
      selectCity(suggestion);
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
        aria-activedescendant={open && visibleSuggestions.length > 0 ? `${listboxId}-${highlighted}` : undefined}
        placeholder={placeholder}
        value={value}
        required={required}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setRemoteSuggestions(null);
          setHighlighted(0);
        }}
        onFocus={() => {
          setOpen(true);
          setRemoteSuggestions(null);
        }}
        onKeyDown={onKeyDown}
      />
      {open && visibleSuggestions.length > 0 ? (
        <ul className="city-suggest__panel" role="listbox" id={listboxId}>
          {visibleSuggestions.map((city, index) => (
            <li
              key={city.key}
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
              <span className="city-suggest__name">{city.name}</span>
              {city.regionName ? <span className="city-suggest__region">{city.regionName}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
