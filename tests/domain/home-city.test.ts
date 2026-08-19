import { describe, expect, it } from "vitest";
import { isDeparturePlace, withoutHomeCity } from "@/domain/travel/homeCity";
import { travelAtlas } from "@/domain/travel/atlas";
import type { TravelAtlasItem } from "@/domain/types";

const item = (over: Partial<TravelAtlasItem>): TravelAtlasItem => ({
  id: "x", name: "Место", region: "Регион", routeTitle: "маршрут",
  anchorPlace: "Место", nearestTransportHub: "Хаб", hotelSearchCity: "Хаб",
  tags: [], season: [], mood: [], tarotArchetypes: [],
  source: "geo.tutu", sourceUrl: "https://example.com", oracleHook: "знак",
  ...over,
});

describe("the oracle does not send you where you already are", () => {
  // The live defect, reproduced on production 2026-08-19: from Казань the
  // cards offered «Казань и Татарстан».
  it("excludes a destination whose own name is the departure city", () => {
    const kazan = travelAtlas.find((d) => d.id === "kazan-tatarstan" || d.name.includes("Казань"))!;
    expect(kazan, "atlas must still carry a Kazan destination").toBeDefined();
    expect(isDeparturePlace("Казань", kazan)).toBe(true);
    expect(withoutHomeCity(travelAtlas, "Казань")).not.toContain(kazan);
  });

  it("excludes a destination that simply is the city", () => {
    const pskov = travelAtlas.find((d) => d.name === "Псков")!;
    expect(isDeparturePlace("Псков", pskov)).toBe(true);
  });

  // The distinction the whole module exists for. Усьвинские Столбы are
  // reached through Пермь and lie ~200km away: a Perm resident going there
  // is travelling, and deleting it would remove a real trip.
  it("keeps a destination that only shares its transport hub with home", () => {
    const usva = travelAtlas.find((d) => d.name === "Усьвинские Столбы")!;
    expect(usva.nearestTransportHub).toBe("Пермь");
    expect(isDeparturePlace("Пермь", usva)).toBe(false);
    expect(withoutHomeCity(travelAtlas, "Пермь")).toContain(usva);
  });

  it("costs Москва and Санкт-Петербург nothing at all", () => {
    // Measured across the atlas: neither collides with any destination's own
    // identity, so the two commonest departure cities lose no options.
    expect(withoutHomeCity(travelAtlas, "Москва")).toHaveLength(travelAtlas.length);
    expect(withoutHomeCity(travelAtlas, "Санкт-Петербург")).toHaveLength(travelAtlas.length);
  });
});

describe("matching is forgiving where people are, and strict where they are not", () => {
  it("ignores case and stray whitespace", () => {
    const target = item({ name: "Казань и Татарстан", anchorPlace: "Казань" });
    for (const typed of ["казань", "  КАЗАНЬ  ", "Казань"]) {
      expect(isDeparturePlace(typed, target), typed).toBe(true);
    }
  });

  // Most people type «Орел», and many keyboards make ё awkward; the atlas may
  // spell it «Орёл». They are the same city.
  it("treats ё and е as the same letter, in both directions", () => {
    expect(isDeparturePlace("Орел", item({ name: "Орёл", anchorPlace: "Орёл" }))).toBe(true);
    expect(isDeparturePlace("Орёл", item({ name: "Орел", anchorPlace: "Орел" }))).toBe(true);
  });

  it("matches a multi-word city as one phrase", () => {
    expect(isDeparturePlace("Минеральные Воды", item({ name: "Минеральные Воды", anchorPlace: "КМВ" }))).toBe(true);
    expect(isDeparturePlace("Нижний Новгород", item({ name: "Нижний Новгород и окрестности", anchorPlace: "—" }))).toBe(true);
  });

  // A substring match would delete «Тверская область» for anyone departing
  // «Тверь», which is a different place and a real trip.
  it("does not match a city that is merely a prefix of the name", () => {
    expect(isDeparturePlace("Тверь", item({ name: "Тверская область", anchorPlace: "Тверская область" }))).toBe(false);
    expect(isDeparturePlace("Орел", item({ name: "Орловское полесье", anchorPlace: "Орловское полесье" }))).toBe(false);
  });

  it("never excludes on an empty or two-letter field", () => {
    for (const typed of ["", "  ", "Мо"]) {
      expect(withoutHomeCity(travelAtlas, typed), typed).toHaveLength(travelAtlas.length);
    }
  });

  // Free text reaches this function straight from an input box, so a regex
  // metacharacter must be inert rather than an error or a wildcard.
  it("treats regex metacharacters as literal text", () => {
    expect(() => withoutHomeCity(travelAtlas, "Каза.ь")).not.toThrow();
    expect(isDeparturePlace("Каза.ь", item({ name: "Казань", anchorPlace: "Казань" }))).toBe(false);
    expect(() => withoutHomeCity(travelAtlas, "(((")).not.toThrow();
  });

  // The guard that keeps a reading possible no matter what: a filter that
  // removed everything would leave the ritual with no destination at all.
  it("falls back to the full atlas rather than returning nothing", () => {
    const only = [item({ name: "Казань", anchorPlace: "Казань" })];
    expect(withoutHomeCity(only, "Казань")).toEqual(only);
  });
});
