import { describe, expect, it, vi } from "vitest";
import { buildRoadChoiceAndSources, runRitual } from "@/server/ritual/runRitual";
import { tarotCards } from "@/domain/tarot/cards";
import type { DrawnTarotCard, TripIntent } from "@/domain/types";

const intent: TripIntent = {
  departureCity: "Москва",
  dateFrom: "2026-09-10",
  dateTo: "2026-09-17",
  travelerCount: 2,
};

function searchStub(summary: Record<string, unknown>, offers: unknown[] = []) {
  return vi.fn().mockResolvedValue({
    transport: offers,
    hotels: [{ id: "hotel-0", title: "Отель" }],
    modesSummary: summary,
    warnings: [],
  });
}

describe("runRitual", () => {
  it("draws three cards with one job each", async () => {
    const result = await runRitual(intent, {
      searchOffers: searchStub({ railway: { count: 5, minPrice: 700, minDurationMin: 104 } }, [
        { id: "t-0", title: "Поезд: ФПК", mode: "railway", url: "https://www.tutu.ru/poezda/" },
      ]),
    });

    expect(result.spreadCards.map((card) => card.position)).toEqual(["Зов", "Дар", "Путь"]);
    expect(new Set(result.spreadCards.map((card) => card.id)).size).toBe(3);
  });

  it("never names a road that does not exist", async () => {
    const result = await runRitual(intent, {
      searchOffers: searchStub({ railway: { count: 5, minPrice: 700, minDurationMin: 104 } }, [
        { id: "t-0", title: "Поезд: ФПК", mode: "railway", url: "https://www.tutu.ru/poezda/" },
      ]),
    });

    expect(result.roadChoice.mode).toBe("railway");
    expect(result.spreadCards[2].transport).toContain("railway");
    expect(result.roadChoice.best?.mode).toBe("railway");
    expect(result.roadChoice.reason).toContain(result.spreadCards[2].name);
  });

  it("falls back to fog when the search found no road at all", async () => {
    const result = await runRitual(intent, { searchOffers: searchStub({}) });

    expect(result.roadChoice.mode).toBeNull();
    expect(result.roadChoice.reason).toContain("туман");
    expect(result.spreadCards).toHaveLength(3);
  });

  it("is deterministic against the same search response", async () => {
    const summary = { avia: { count: 3, minPrice: 9000, minDurationMin: 300 } };
    const first = await runRitual(intent, { searchOffers: searchStub(summary) });
    const second = await runRitual(intent, { searchOffers: searchStub(summary) });

    expect(second.spreadCards.map((card) => `${card.id}:${card.reversed}`)).toEqual(
      first.spreadCards.map((card) => `${card.id}:${card.reversed}`),
    );
  });

  // Regression for the bug found in review: modes_summary and the returned
  // `variants` page can disagree (see tests/server/tutu-normalize.test.ts's
  // Москва -> Владимир fixture, where modes_summary reports both railway
  // and bus while the fetched page carries only a railway variant). Force
  // bus to be the *only* usable mode -- `usableModes` then returns exactly
  // ["bus"], so `pathCard.transport.find(candidate => modes.includes(...))`
  // deterministically lands on "bus" regardless of which card the seeded
  // draw picks -- while the stubbed `offers.transport` page carries zero
  // bus variants, reproducing the defect exactly.
  it("still names a real road when the chosen mode has no offer on the fetched page", async () => {
    const result = await runRitual(intent, {
      searchOffers: searchStub(
        { bus: { count: 6, minPrice: 3220, minDurationMin: 150 } },
        [{ id: "t-0", title: "Поезд: ФПК", mode: "railway", url: "https://www.tutu.ru/poezda/" }],
      ),
    });

    expect(result.roadChoice.mode).toBe("bus");
    expect(result.roadChoice.best).not.toBeNull();
    expect(result.roadChoice.best?.mode).toBe("bus");
    // Honest "from" price/duration, not a specific ticket: no checkout URL,
    // just the general Tutu bus search.
    expect(result.roadChoice.best?.price).toBe(`от 3\u00A0220\u00A0₽`);
    expect(result.roadChoice.best?.url).toBe("https://bus.tutu.ru/");
  });
});

// Direct, hash-independent coverage of the shared tail both runRitual and
// the shared-link page (src/app/r/[code]/page.tsx) call — see its own
// comment in runRitual.ts for why the two call sites were merged.
describe("buildRoadChoiceAndSources", () => {
  const pathCard: DrawnTarotCard = {
    id: "hermit",
    number: 9,
    name: "Отшельник",
    image: "/tarot/09-hermit.webp",
    archetypes: ["solitude"],
    transport: ["railway", "bus"],
    meaning: "тишина",
    meaningReversed: "одиночество тяготит, нужен попутчик",
    position: "Путь",
    reversed: false,
  };

  const destination = {
    id: "test-destination",
    name: "Владимир",
    region: "Владимирская область",
    routeTitle: "Тестовый маршрут",
    anchorPlace: "Владимир",
    nearestTransportHub: "Владимир",
    hotelSearchCity: "Владимир",
    tags: [],
    season: [],
    mood: [],
    tarotArchetypes: [],
    source: "fallback" as const,
    sourceUrl: "https://example.com",
    oracleHook: "Тестовый знак маршрута.",
  };

  it("builds a non-null hero from modes_summary when the mode has no matching offer", () => {
    const { roadChoice } = buildRoadChoiceAndSources({
      mode: "bus",
      pathCard,
      transportOffers: [
        { id: "t-0", title: "Поезд: ФПК", mode: "railway", price: "691.77 RUB", url: "https://www.tutu.ru/poezda/order/?tn=705" },
      ],
      modesSummary: {
        railway: { count: 19, minPrice: 691.77, minDurationMin: 104 },
        bus: { count: 6, minPrice: 3220, minDurationMin: 150 },
      },
      destination,
    });

    expect(roadChoice.mode).toBe("bus");
    expect(roadChoice.best).not.toBeNull();
    expect(roadChoice.best).toMatchObject({
      mode: "bus",
      price: `от 3\u00A0220\u00A0₽`,
      url: "https://bus.tutu.ru/",
    });
    expect(roadChoice.best?.subtitle).toContain("2 ч 30 мин");
  });

  it("uses the real offer directly when the mode is present on the fetched page", () => {
    const { roadChoice } = buildRoadChoiceAndSources({
      mode: "railway",
      pathCard,
      transportOffers: [
        { id: "t-0", title: "Поезд: ФПК", mode: "railway", price: "691.77 RUB", url: "https://www.tutu.ru/poezda/order/?tn=705" },
      ],
      modesSummary: { railway: { count: 19, minPrice: 691.77, minDurationMin: 104 } },
      destination,
    });

    expect(roadChoice.best?.id).toBe("t-0");
  });

  it("stays fog when there is no mode at all, never fabricating a hero", () => {
    const { roadChoice } = buildRoadChoiceAndSources({
      mode: null,
      pathCard,
      transportOffers: [],
      modesSummary: {},
      destination,
    });

    expect(roadChoice.mode).toBeNull();
    expect(roadChoice.best).toBeNull();
    expect(roadChoice.reason).toContain("туман");
  });

  it("labels the verified-route source only for provereno.tutu", () => {
    const { sourceLinks } = buildRoadChoiceAndSources({
      mode: null,
      pathCard,
      transportOffers: [],
      modesSummary: {},
      destination: { ...destination, source: "provereno.tutu", geoUrl: "https://www.tutu.ru/geo/" },
    });

    expect(sourceLinks).toEqual([
      { label: "Проверенный маршрут Туту", url: "https://example.com" },
      { label: "Путеводитель Туту", url: "https://www.tutu.ru/geo/" },
    ]);
  });

  // Regression caught by a live check of the guide-facts merge: the ten
  // atlas entries sourced from a regional geo guide (source: "geo.tutu")
  // carry a geoUrl identical to their own sourceUrl -- both fields are real
  // data from data/tutu-guides.json, but the guide *is* the geo page for
  // those entries, so a naive "always show geoUrl when present" produced
  // two links with different labels pointing at the exact same URL.
  it("does not duplicate the proof link when geoUrl is the same URL as sourceUrl", () => {
    const { sourceLinks } = buildRoadChoiceAndSources({
      mode: null,
      pathCard,
      transportOffers: [],
      modesSummary: {},
      destination: {
        ...destination,
        source: "geo.tutu",
        sourceUrl: "https://www.tutu.ru/geo/rossiya/kurort/karelia/",
        geoUrl: "https://www.tutu.ru/geo/rossiya/kurort/karelia/",
      },
    });

    expect(sourceLinks).toEqual([
      // "Путеводитель Туту", not the generic "Источник маршрута": a geo.tutu
      // source is named the same here as it is on the guide strip, so one
      // destination never shows its single Tutu page under two names.
      { label: "Путеводитель Туту", url: "https://www.tutu.ru/geo/rossiya/kurort/karelia/" },
    ]);
  });
});

// The design rule that makes adding a fourth transport mode safe, encoded
// so it cannot quietly rot: "etrain" is always LAST in a card's transport
// list. `runRitual` picks the mode with
// `pathCard.transport.find(candidate => modes.includes(candidate))` -- the
// first entry that is actually available -- so a mode sitting last can only
// ever be chosen when nothing ahead of it exists. That is what makes the
// change strictly additive: no draw that resolved to avia/railway/bus
// before suburban trains were requested resolves differently now.
describe("etrain is a strictly additive mode", () => {
  it("never appears before another mode in any card's transport list", () => {
    for (const card of tarotCards) {
      const index = card.transport.indexOf("etrain");
      if (index === -1) continue;
      expect(index).toBe(card.transport.length - 1);
    }
  });

  it("is carried by enough cards that it can actually be drawn", () => {
    const carriers = tarotCards.filter((card) => card.transport.includes("etrain"));
    expect(carriers.length).toBeGreaterThanOrEqual(4);
  });

  // Without this, requesting etrain from Tutu would be worse than not
  // requesting it: a search that found only suburban trains would leave the
  // third card with no mode it could name, and the reading would show fog
  // over a road that exists.
  it("names a road when the suburban train is the only one that exists", async () => {
    const result = await runRitual(intent, {
      searchOffers: searchStub({ etrain: { count: 4, minPrice: 210, minDurationMin: 65 } }, [
        { id: "t-0", title: "Электричка", mode: "etrain", url: "https://www.tutu.ru/prigorod/" },
      ]),
    });

    expect(result.roadChoice.mode).toBe("etrain");
    expect(result.roadChoice.best).not.toBeNull();
    expect(result.roadChoice.reason).not.toContain("туман");
    expect(result.spreadCards[2].transport).toContain("etrain");
  });

  // The other half of the same rule, from the outside: when a grander road
  // is also available, the suburban train must not win.
  it("loses to a long-distance train when both are available", async () => {
    const result = await runRitual(intent, {
      searchOffers: searchStub({
        railway: { count: 12, minPrice: 700, minDurationMin: 104 },
        etrain: { count: 4, minPrice: 210, minDurationMin: 65 },
      }, [{ id: "t-0", title: "Поезд: ФПК", mode: "railway", url: "https://www.tutu.ru/poezda/" }]),
    });

    expect(result.roadChoice.mode).not.toBe("etrain");
  });
});

// The page contradicted itself: «Дорога скрыта туманом: карты не увидели ни
// одного пути» sitting directly above five flights the same response had
// found. Two ways in, one rule out -- fog is only for an empty search.
describe("fog is only for an empty search", () => {
  const card: DrawnTarotCard = {
    id: "hermit", number: 9, name: "Отшельник", image: "/tarot/09-hermit.webp",
    archetypes: ["solitude"], transport: ["railway", "etrain"],
    meaning: "тишина", meaningReversed: "одиночество тяготит",
    position: "Путь", reversed: false,
  };
  const place = {
    id: "baikal", name: "Байкал", region: "Иркутская область",
    routeTitle: "Байкал", anchorPlace: "Байкал", nearestTransportHub: "Иркутск",
    hotelSearchCity: "Иркутск", tags: [], season: [], mood: [], tarotArchetypes: [],
    source: "geo.tutu" as const, sourceUrl: "https://example.com", oracleHook: "знак",
  };

  // The third card can name nothing even when roads exist: drawPathCard
  // falls back to the whole deck once every card that could name a usable
  // mode is already on the table, and the card it lands on may carry none.
  it("says the road was not named, not that nothing was found", () => {
    const { roadChoice } = buildRoadChoiceAndSources({
      mode: null,
      pathCard: card,
      transportOffers: [],
      modesSummary: { avia: { count: 5, minPrice: 33948, minDurationMin: 415 } },
      destination: place,
    });

    expect(roadChoice.reason).not.toContain("туман");
    expect(roadChoice.reason).toContain("дороги есть");
  });

  it("keeps the fog when Tutu really found nothing", () => {
    const { roadChoice } = buildRoadChoiceAndSources({
      mode: null,
      pathCard: card,
      transportOffers: [],
      modesSummary: {},
      destination: place,
    });

    expect(roadChoice.reason).toContain("туман");
  });

  // The shared-link case: the mode is frozen into the code, so a reading
  // that found nothing in September reopens in October with flights on the
  // page and a null mode in the link.
  it("does not repeat a stale fog when today's search finds roads", () => {
    const { roadChoice } = buildRoadChoiceAndSources({
      mode: null,
      pathCard: card,
      transportOffers: [
        { id: "t-0", title: "Авиабилеты: Nordwind", mode: "avia", url: "https://avia.tutu.ru/" },
      ],
      modesSummary: { avia: { count: 5, minPrice: 33948, minDurationMin: 415 } },
      destination: place,
    });

    expect(roadChoice.reason).not.toContain("туман");
  });
});
