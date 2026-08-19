import type { TransportMode } from "@/domain/types";

// Tutu MCP explains itself. Alongside `modes_summary`, a
// `search_multitransport` response carries `meta.unavailable[]`, one entry
// per mode that produced nothing, each with a machine-readable `reason` and
// a human `detail`. Measured live on 2026-08-18:
//
//   { mode: "avia", reason: "no_route",
//     detail: "avia requires avia_id for origin, but the geo lookup did not
//              return one — try passing a more specific city name." }
//
// That is the difference between "there is no airport in Тосно" and "Tutu is
// down", and the app used to discard it and show one generic line for both.
// This module turns those entries into a single sentence in the oracle's own
// voice.
//
// The detail string is English prose written by a service we do not control,
// so it is matched loosely and only for the shapes actually observed. Every
// unrecognised reason produces null rather than a guess -- the same rule
// seasonWindow.ts follows, and for the same reason: a confident wrong
// sentence about someone's trip is worse than no sentence.
export interface ModeUnavailable {
  mode: TransportMode;
  reason: string;
  detail?: string;
}

const MODE_SUBJECT: Record<TransportMode, string> = {
  avia: "Самолёт",
  railway: "Поезд",
  bus: "Автобус",
  etrain: "Электричка",
};

const MODE_VERB: Record<TransportMode, string> = {
  avia: "не долетит",
  railway: "не дойдёт",
  bus: "не доедет",
  etrain: "не довезёт",
};

// The one detail shape worth naming precisely: Tutu resolved the city
// perfectly well (it comes back with a geo_id and a region) but that place
// has no airport of its own, so the avia leg cannot even be attempted.
// Which end of the journey is at fault changes the sentence, and the detail
// says which.
function airportlessEnd(entry: ModeUnavailable): "origin" | "destination" | null {
  const detail = entry.detail?.toLowerCase() ?? "";
  if (!detail.includes("avia_id")) return null;
  if (detail.includes("for origin")) return "origin";
  if (detail.includes("for destination")) return "destination";
  return null;
}

// One sentence, not a list: when several modes come back unavailable the
// airportless case is the one worth saying out loud, because it is the only
// one that tells the traveller something they can act on (leave from the
// nearest city that has an airport). Everything else collapses into the
// plain "this road does not exist" statement, which is still honest and
// still specific about which mode.
export function roadUnavailableNote(
  // Tolerates undefined on purpose. searchTutuOffers always sets this, but
  // RitualDeps.searchOffers is an injection point -- a stub, a fixture, or a
  // future response shape that omits the field must not take the whole
  // ritual down with a TypeError. Found exactly that way: five run-ritual
  // tests went red on `undefined.length` the moment this was wired in.
  unavailable: ModeUnavailable[] | undefined,
): string | null {
  if (!unavailable || unavailable.length === 0) return null;

  for (const entry of unavailable) {
    const end = airportlessEnd(entry);
    if (!end) continue;
    // Deliberately "города отправления", not the city's own name. Russian
    // wants the genitive here, and Russian toponyms decline inconsistently
    // -- Тосно does not change ("у Тосно"), Тверь does ("у Твери") -- so
    // interpolating a raw name produces broken grammar for a large share of
    // the atlas and of anything a traveller might type. There is no reliable
    // way to decline an arbitrary place name, and a product that speaks
    // Russian badly reads worse than one that speaks it plainly. Nothing is
    // lost: the departure city sits in the form strip and the destination in
    // the headline, both on screen while this line is read.
    const place = end === "origin" ? "города отправления" : "города назначения";
    return `${MODE_SUBJECT[entry.mode]} эту дорогу не возьмёт: у ${place} нет своего аэропорта.`;
  }

  const named = unavailable.filter((entry) => entry.reason === "no_route");
  if (named.length === 0) return null;

  if (named.length === 1) {
    const entry = named[0];
    return `${MODE_SUBJECT[entry.mode]} сюда ${MODE_VERB[entry.mode]} — прямого пути нет.`;
  }

  // Two or more modes, all simply absent. Naming each one keeps the line
  // honest about how thoroughly the road was looked for, which is the whole
  // point of saying anything at all instead of "ничего не нашлось".
  // "ни X, ни Y, ни Z" -- the particle repeats before every item in Russian.
  // Joining on ", " alone produced "Ни самолёт, автобус, ни электричка".
  const subjects = named.map((entry) => MODE_SUBJECT[entry.mode].toLocaleLowerCase("ru-RU"));
  return `Ни ${subjects.join(", ни ")} прямой дороги сюда не нашли.`;
}
