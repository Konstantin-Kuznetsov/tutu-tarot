import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TravelResult, type RitualResultViewModel } from "@/components/TravelResult";
import { FOG_REASON } from "@/domain/tarot/roadReason";

// Shared fixture: what test 1 originally inlined, now extended with the
// three drawn cards and the road the third card chose, so it can also feed
// the road-block tests below.
const resultWithRoad: RitualResultViewModel = {
  prediction: {
    headline: "Карты указывают на Усьвинские Столбы",
    opening: "Башня говорит о камне.",
    summary: "Путь подтвержден.",
    cardReadings: [],
  },
  destination: { name: "Усьвинские Столбы", region: "Пермский край" },
  spreadCards: [
    {
      id: "star", number: 17, name: "Звезда", image: "/tarot/17-star.webp",
      archetypes: ["north", "water", "mystery"], transport: ["avia"],
      meaning: "северный свет, вода и надежда",
      meaningReversed: "свет тусклый, ориентир придётся искать самому",
      position: "Зов", reversed: false,
    },
    {
      id: "moon", number: 18, name: "Луна", image: "/tarot/18-moon.webp",
      archetypes: ["north", "water", "solitude", "mystery"], transport: ["railway"],
      meaning: "ночная дорога, туман и то, что видно только впотьмах",
      meaningReversed: "туман рассеивается, страх был напрасным",
      position: "Дар", reversed: false,
    },
    {
      id: "hermit", number: 9, name: "Отшельник", image: "/tarot/09-hermit.webp",
      archetypes: ["solitude", "mystery", "cliffs"], transport: ["railway"],
      meaning: "дорога к тишине и высокому месту",
      meaningReversed: "одиночество тяготит, нужен попутчик",
      position: "Путь", reversed: false,
    },
  ],
  roadChoice: {
    mode: "railway",
    reason: "«Отшельник» сажает к окну — дорога будет долгой и созерцательной.",
    best: { id: "t-0", title: "Поезд: ФПК", price: "691.77 RUB", mode: "railway", url: "https://www.tutu.ru/poezda/" },
  },
  sourceLinks: [{ label: "Путеводитель Туту", url: "https://www.tutu.ru/geo/" }],
  transportOffers: [{ id: "transport-0", title: "Москва - Пермь", price: "4200 RUB" }],
  hotelOffers: [{ id: "hotel-0", title: "Отель в Перми" }],
  warnings: [],
};

describe("TravelResult", () => {
  it("keeps prediction first and the proof links as a trust footer at the end", () => {
    render(<TravelResult result={resultWithRoad} />);

    const prediction = screen.getByText("Карты указывают на Усьвинские Столбы");
    const proofLink = screen.getByRole("link", { name: "Путеводитель Туту" });
    const transportOffer = screen.getByText("Москва - Пермь");

    expect(proofLink).toHaveAttribute("href", "https://www.tutu.ru/geo/");
    expect(prediction.compareDocumentPosition(proofLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(transportOffer.compareDocumentPosition(proofLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders an offer without a checkout URL as non-link content", () => {
    render(
      <TravelResult
        result={{
          prediction: {
            headline: "Карты указывают на Усьвинские Столбы",
            opening: "Башня говорит о камне.",
            summary: "Путь подтвержден.",
            cardReadings: [],
          },
          destination: { name: "Усьвинские Столбы", region: "Пермский край" },
          roadChoice: { mode: null, reason: FOG_REASON, best: null },
          sourceLinks: [],
          transportOffers: [{ id: "transport-0", title: "Вариант без ссылки" }],
          hotelOffers: [],
          warnings: [],
        }}
      />,
    );

    expect(screen.getByText("Вариант без ссылки")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Вариант без ссылки" })).not.toBeInTheDocument();
  });

  it("leads the roads with the one the card chose", () => {
    render(<TravelResult result={resultWithRoad} />);

    const road = screen.getByRole("region", { name: "Дорога, которую выбрала карта" });
    expect(road).toHaveTextContent("Поезд: ФПК");
    expect(road).toHaveTextContent("«Отшельник»");
    expect(within(road).getByRole("link")).toHaveAttribute(
      "href", expect.stringContaining("tutu.ru"),
    );
  });

  it("shows the fog message and no hero road when nothing was found", () => {
    render(<TravelResult result={{ ...resultWithRoad, roadChoice: { mode: null, reason: FOG_REASON, best: null } }} />);

    const road = screen.getByRole("region", { name: "Дорога, которую выбрала карта" });
    expect(road).toHaveTextContent("туман");
    expect(within(road).queryByRole("link")).toBeNull();
  });

  // Regression: a mode the third card actually names must always render the
  // hero, never the fog treatment -- even when its `best` came from
  // modes_summary rather than a matched offer (see runRitual's
  // offerFromSummary). Before the fix, this exact shape (mode set, offer
  // list only carrying an unrelated mode) produced `best: null` and the
  // component fell through to the fog block while still showing a
  // confident, mode-specific reason above it.
  it("renders the hero, never the fog, whenever the card named a real mode", () => {
    const summaryDerivedRoad: typeof resultWithRoad = {
      ...resultWithRoad,
      roadChoice: {
        mode: "bus",
        reason: "«Отшельник» ведёт по земле — дорога будет упрямой и близкой.",
        best: {
          id: "summary-bus",
          title: "Автобус: билеты на Туту",
          subtitle: "В пути от 2 ч 30 мин",
          price: "от 3220 ₽",
          url: "https://bus.tutu.ru/",
          mode: "bus",
        },
      },
    };

    render(<TravelResult result={summaryDerivedRoad} />);

    const road = screen.getByRole("region", { name: "Дорога, которую выбрала карта" });
    expect(within(road).queryByText(/туман/i)).toBeNull();
    expect(road).toHaveTextContent("от 3220 ₽");
    expect(within(road).getByRole("link")).toHaveAttribute("href", "https://bus.tutu.ru/");
  });

  it("says nothing when the search had no warnings", () => {
    render(<TravelResult result={resultWithRoad} />);
    expect(screen.queryByText(/провер/i)).toBeNull();
  });

  it("tells the reader, in Russian and in the product's own voice, when roads could not be fully checked", () => {
    render(<TravelResult result={{ ...resultWithRoad, warnings: ["Tutu MCP search_multitransport failed: 500"] }} />);

    const road = screen.getByRole("region", { name: "Дорога, которую выбрала карта" });
    // Never the raw diagnostic string itself — only the product-voiced line.
    expect(road).not.toHaveTextContent("Tutu MCP");
    expect(road).not.toHaveTextContent("500");
    expect(road).toHaveTextContent("Туту сейчас отвечает не на все запросы");
  });

  // The measured defect this task fixes: "Tutu refused the request" and
  // "Tutu answered, and there's nothing for these dates" used to render the
  // exact same vague line. transportOutcome lets the road block say which
  // one actually happened.
  it("says plainly that Tutu is not answering when the transport leg failed, distinct from the old vague line", () => {
    render(
      <TravelResult
        result={{
          ...resultWithRoad,
          roadChoice: { mode: null, reason: FOG_REASON, best: null },
          warnings: ["Tutu MCP search_multitransport failed with 503"],
          transportOutcome: "failed",
        }}
      />,
    );

    const road = screen.getByRole("region", { name: "Дорога, которую выбрала карта" });
    expect(road).toHaveTextContent("Туту сейчас не отвечает — этот раздел проверить не удалось.");
    expect(road).not.toHaveTextContent("Дороги удалось проверить не полностью");
    expect(road).not.toHaveTextContent("503");
  });

  it("says nothing was found for these dates when the transport leg came back empty — a real answer, not an error", () => {
    render(
      <TravelResult
        result={{
          ...resultWithRoad,
          roadChoice: { mode: null, reason: FOG_REASON, best: null },
          warnings: [],
          transportOutcome: "empty",
        }}
      />,
    );

    const road = screen.getByRole("region", { name: "Дорога, которую выбрала карта" });
    expect(road).toHaveTextContent("Туту ответил: на эти даты здесь ничего не нашлось. Это не сбой, а честный ответ.");
    expect(road).not.toHaveTextContent("Туту сейчас не отвечает");
  });

  // The specific half of the pair. The generic "ничего не нашлось" line
  // above is true but useless; Tutu's own reason ("no airport at the
  // departure end") is the fact a traveller can act on, so it renders
  // above it rather than instead of it.
  it("shows Tutu's own reason above the generic empty line", () => {
    render(
      <TravelResult
        result={{
          ...resultWithRoad,
          roadChoice: { mode: null, reason: FOG_REASON, best: null },
          warnings: [],
          transportOutcome: "empty",
          roadNote: "Самолёт эту дорогу не возьмёт: у города отправления нет своего аэропорта.",
        }}
      />,
    );

    const road = screen.getByRole("region", { name: "Дорога, которую выбрала карта" });
    expect(road).toHaveTextContent("у города отправления нет своего аэропорта");
    expect(road).toHaveTextContent("Туту ответил: на эти даты здесь ничего не нашлось.");
  });

  // On "failed" Tutu never got far enough to have a reason, and on "served"
  // there is a road and nothing to explain -- a leftover note in either
  // position would contradict what the rest of the block is saying.
  it("keeps the reason out of the way when the leg failed or was served", () => {
    const note = "Самолёт эту дорогу не возьмёт: у города отправления нет своего аэропорта.";

    const { unmount } = render(
      <TravelResult result={{ ...resultWithRoad, roadChoice: { mode: null, reason: FOG_REASON, best: null }, warnings: [], transportOutcome: "failed", roadNote: note }} />,
    );
    expect(screen.getByRole("region", { name: "Дорога, которую выбрала карта" }))
      .not.toHaveTextContent("нет своего аэропорта");
    unmount();

    render(<TravelResult result={{ ...resultWithRoad, transportOutcome: "served", roadNote: note }} />);
    expect(screen.getByRole("region", { name: "Дорога, которую выбрала карта" }))
      .not.toHaveTextContent("нет своего аэропорта");
  });

  it("passes the hotel leg's own outcome to the hotels section, independent of the transport leg's", () => {
    render(
      <TravelResult
        result={{
          ...resultWithRoad,
          transportOutcome: "served",
          hotelsOutcome: "failed",
          hotelOffers: [
            { id: "hotel-fallback", title: "Открыть поиск отелей на Туту", url: "https://hotel.tutu.ru/" },
          ],
        }}
      />,
    );

    const road = screen.getByRole("region", { name: "Дорога, которую выбрала карта" });
    // The transport leg was fine -- no outcome note under the road block.
    expect(road).not.toHaveTextContent("Туту сейчас не отвечает");

    // The hotels section carries its own, separate note for its own outcome.
    expect(screen.getByText("Туту сейчас не отвечает — этот раздел проверить не удалось.")).toBeInTheDocument();
  });

  it("keeps the prediction above the roads", () => {
    const { container } = render(<TravelResult result={resultWithRoad} />);
    const order = Array.from(container.querySelectorAll("[data-block]")).map(
      (node) => node.getAttribute("data-block"),
    );
    expect(order).toEqual(["prediction", "spread", "road", "other-roads", "hotels", "sources"]);
  });

  // The actual defect this task fixes: cardReadings travelled in the
  // response and in the shared-reading page's data, but nothing ever
  // rendered it -- the page kept showing the deck's own stock meaning.
  it("shows each card's own written reading, matched by id rather than array order", () => {
    render(
      <TravelResult
        result={{
          ...resultWithRoad,
          prediction: {
            ...resultWithRoad.prediction,
            cardReadings: [
              // Deliberately out of spreadCards order (moon, then hermit,
              // then star) -- proves the match is by id, not by position in
              // this array or in spreadCards.
              { id: "moon", position: "Дар", cardName: "Луна", text: "Луна освещает ночную дорогу к тишине." },
              { id: "hermit", position: "Путь", cardName: "Отшельник", text: "Отшельник ведёт к высокому месту в одиночестве." },
              { id: "star", position: "Зов", cardName: "Звезда", text: "Звезда зовёт на север, к воде и надежде." },
            ],
          },
        }}
      />,
    );

    // Each reading appears under its own card, not the deck's stock meaning.
    expect(screen.getByText("Звезда зовёт на север, к воде и надежде.")).toBeInTheDocument();
    expect(screen.getByText("Луна освещает ночную дорогу к тишине.")).toBeInTheDocument();
    expect(screen.getByText("Отшельник ведёт к высокому месту в одиночестве.")).toBeInTheDocument();
    expect(screen.queryByText("северный свет, вода и надежда")).not.toBeInTheDocument();
    expect(screen.queryByText("ночная дорога, туман и то, что видно только впотьмах")).not.toBeInTheDocument();
    expect(screen.queryByText("дорога к тишине и высокому месту")).not.toBeInTheDocument();
  });

  it("falls back to each card's own deck meaning when no reading exists for it, exactly as before", () => {
    render(<TravelResult result={resultWithRoad} />);

    expect(screen.getByText("северный свет, вода и надежда")).toBeInTheDocument();
    expect(screen.getByText("ночная дорога, туман и то, что видно только впотьмах")).toBeInTheDocument();
    expect(screen.getByText("дорога к тишине и высокому месту")).toBeInTheDocument();
  });

  it("renders the closing line as a quiet coda after the spread when one is present", () => {
    render(
      <TravelResult
        result={{
          ...resultWithRoad,
          prediction: { ...resultWithRoad.prediction, closingLine: "Дорога уже начертана картами." },
        }}
      />,
    );

    expect(screen.getByText("Дорога уже начертана картами.")).toBeInTheDocument();
  });

  it("renders no closing line when the prediction doesn't carry one", () => {
    render(<TravelResult result={resultWithRoad} />);
    expect(document.querySelector(".spread-panel__closing")).not.toBeInTheDocument();
  });
});

// The compact guide-facts strip near the headline (see GuideStrip in
// TravelResult.tsx) -- added because the only existing guide link sat
// quietly at the very bottom of the reading and a user reported never
// finding it. `resultWithRoad`'s own destination carries no guide facts at
// all (a plain `{ name, region }`, same as most other fixtures in this
// file), so the tests above already cover "renders nothing without them"
// implicitly; the cases below build their own destination to cover the
// strip's actual content.
describe("TravelResult guide strip", () => {
  it("renders nothing when the destination carries no source/sourceUrl", () => {
    render(<TravelResult result={resultWithRoad} />);
    expect(document.querySelector(".guide-strip")).not.toBeInTheDocument();
  });

  it("is itself the link to the guide page, and shows source, days, rating and season for a rated route", () => {
    render(
      <TravelResult
        result={{
          ...resultWithRoad,
          destination: {
            ...resultWithRoad.destination,
            source: "provereno.tutu",
            sourceUrl: "https://provereno.tutu.ru/kaliningradskaya-2025",
            routeDays: 6,
            rating: "9,3",
            seasonWindow: "май-октябрь",
          },
        }}
      />,
    );

    const strip = screen.getByRole("link", { name: "Проверено Туту · 6 дней · 9,3 · лучшее время: май-октябрь" });
    expect(strip).toHaveAttribute("href", "https://provereno.tutu.ru/kaliningradskaya-2025");
  });

  it("declines the day count correctly (2 дня, not 2 день/2 дней)", () => {
    render(
      <TravelResult
        result={{
          ...resultWithRoad,
          destination: {
            ...resultWithRoad.destination,
            source: "provereno.tutu",
            sourceUrl: "https://provereno.tutu.ru/tver",
            routeDays: 2,
          },
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "Проверено Туту · 2 дня" })).toBeInTheDocument();
  });

  // A regional geo guide (no routeDays/rating -- ten atlas entries are this
  // shape) still has to show something honest, never a bare label or a
  // dangling "·" for the facts it doesn't have.
  it("falls back to the region, with no dangling separator, for a regional guide with no days or rating", () => {
    render(
      <TravelResult
        result={{
          ...resultWithRoad,
          destination: {
            ...resultWithRoad.destination,
            name: "Чечня",
            region: "Чеченская Республика",
            source: "geo.tutu",
            sourceUrl: "https://www.tutu.ru/geo/rossiya/kurort/chechnya/",
            // No routeDays, rating or seasonWindow -- matches
            // chechnya-kezenoy-am in atlas.ts exactly.
          },
        }}
      />,
    );

    const strip = screen.getByRole("link", { name: "Путеводитель Туту · Чеченская Республика" });
    expect(strip).toHaveAttribute("href", "https://www.tutu.ru/geo/rossiya/kurort/chechnya/");
    expect(strip.textContent).not.toMatch(/·\s*$/);
    expect(strip.textContent).not.toMatch(/^\s*·/);
  });

  it("sits above the spread, right after the headline", () => {
    render(
      <TravelResult
        result={{
          ...resultWithRoad,
          destination: {
            ...resultWithRoad.destination,
            source: "provereno.tutu",
            sourceUrl: "https://provereno.tutu.ru/perm-2",
            routeDays: 6,
            rating: "8,8",
          },
        }}
      />,
    );

    const strip = screen.getByRole("link", { name: "Проверено Туту · 6 дней · 8,8" });
    const spread = screen.getByRole("region", { name: "Расклад карт" });
    expect(strip.compareDocumentPosition(spread) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Lives inside the prediction block, not a new [data-block] step of its
    // own -- the stagger sequence must stay exactly as it was.
    const order = Array.from(document.querySelectorAll("[data-block]")).map((node) => node.getAttribute("data-block"));
    expect(order).toEqual(["prediction", "spread", "road", "other-roads", "hotels", "sources"]);
  });
});

// The measured defect this task fixes: a user picked 5-15 October and saw
// "Путеводитель Туту · летние месяцы" with nothing explaining that this is
// the guide's own recommended season, not a claim about their trip. These
// cover the quiet line that now states the mismatch outright (see
// SeasonMismatchNote in TravelResult.tsx and its own comment).
describe("TravelResult season mismatch note", () => {
  const baseIntent = { departureCity: "Москва", travelerCount: 2 };

  it("says plainly that the guide recommends a different season when the trip falls outside it", () => {
    render(
      <TravelResult
        result={{
          ...resultWithRoad,
          destination: {
            ...resultWithRoad.destination,
            source: "geo.tutu",
            sourceUrl: "https://www.tutu.ru/geo/rossiya/kurort/tyumen/",
            seasonWindow: "летние месяцы",
          },
          intent: { ...baseIntent, dateFrom: "2026-10-05", dateTo: "2026-10-15" },
        }}
      />,
    );

    expect(
      screen.getByText("Путеводитель Туту рекомендует для этой поездки другое время года, чем вы выбрали."),
    ).toBeInTheDocument();
  });

  it("says nothing when the trip falls inside the guide's recommended season", () => {
    render(
      <TravelResult
        result={{
          ...resultWithRoad,
          destination: {
            ...resultWithRoad.destination,
            source: "geo.tutu",
            sourceUrl: "https://www.tutu.ru/geo/rossiya/kurort/tyumen/",
            seasonWindow: "летние месяцы",
          },
          intent: { ...baseIntent, dateFrom: "2026-07-01", dateTo: "2026-07-10" },
        }}
      />,
    );

    expect(screen.queryByText(/рекомендует для этой поездки другое время года/)).not.toBeInTheDocument();
  });

  it("never renders for a круглый год destination, whatever the dates", () => {
    render(
      <TravelResult
        result={{
          ...resultWithRoad,
          destination: {
            ...resultWithRoad.destination,
            source: "provereno.tutu",
            sourceUrl: "https://provereno.tutu.ru/perm-2",
            seasonWindow: "круглый год",
          },
          intent: { ...baseIntent, dateFrom: "2026-01-05", dateTo: "2026-01-15" },
        }}
      />,
    );

    expect(screen.queryByText(/рекомендует для этой поездки другое время года/)).not.toBeInTheDocument();
  });

  it("says nothing for a window it cannot parse with certainty, even outside any recognisable season", () => {
    render(
      <TravelResult
        result={{
          ...resultWithRoad,
          destination: {
            ...resultWithRoad.destination,
            source: "provereno.tutu",
            sourceUrl: "https://provereno.tutu.ru/hmao",
            seasonWindow: "круглосуточно",
          },
          intent: { ...baseIntent, dateFrom: "2026-10-05", dateTo: "2026-10-15" },
        }}
      />,
    );

    expect(screen.queryByText(/рекомендует для этой поездки другое время года/)).not.toBeInTheDocument();
  });

  it("says nothing when the reading carries no intent at all (hand-built fixtures)", () => {
    render(
      <TravelResult
        result={{
          ...resultWithRoad,
          destination: {
            ...resultWithRoad.destination,
            source: "geo.tutu",
            sourceUrl: "https://www.tutu.ru/geo/rossiya/kurort/tyumen/",
            seasonWindow: "летние месяцы",
          },
        }}
      />,
    );

    expect(screen.queryByText(/рекомендует для этой поездки другое время года/)).not.toBeInTheDocument();
  });
});

// The bug this kills: the page told the traveller «карты не увидели ни
// одного пути» and «Туту ответил: ничего не нашлось», and then showed a
// path in the next breath. If a way through was found, the cards found it
// — there is nothing to apologise for and nothing that "wasn't found".
describe("a two-train plan is the road, not a consolation", () => {
  const plan = {
    via: ["Москва"],
    transferCount: 1,
    departureAt: "2026-09-15T19:23:00+03:00",
    arrivalAt: "2026-09-19T06:30:00+07:00",
    durationMin: 6187,
    priceFrom: 17936,
    legs: [
      { trainNumber: "010У", from: "Псков — Псков-Пасс.", to: "Москва — Ленинградский вокзал",
        departureAt: "2026-09-15T19:23:00+03:00", arrivalAt: "2026-09-16T06:47:00+03:00",
        durationMin: 684, priceFrom: 3146, url: "https://mtp-deeplink.tutu.ru/x", seatCategories: [] },
      { trainNumber: "010Н", from: "Москва — Ярославский вокзал", to: "Иркутск",
        departureAt: "2026-09-16T23:20:00+03:00", arrivalAt: "2026-09-19T06:30:00+07:00",
        durationMin: 4750, priceFrom: 14790, url: "https://mtp-deeplink.tutu.ru/y", seatCategories: [] },
    ],
  };

  const withPlan = {
    ...resultWithRoad,
    roadChoice: {
      mode: "railway" as const,
      reason: "«Отшельник» сажает к окну — дорога будет долгой и созерцательной. Путь ляжет с 1 пересадкой — разрыв в дороге здесь часть знака, а не помеха. Место излома: Москва.",
      best: null,
    },
    warnings: [],
    transportOutcome: "empty" as const,
    roadNote: "Поезд сюда не дойдёт — прямого пути нет.",
    interchangePlan: plan,
  };

  it("shows the plan inside the road block the card chose", () => {
    render(<TravelResult result={withPlan} />);
    const road = screen.getByRole("region", { name: "Дорога, которую выбрала карта" });

    expect(road).toHaveTextContent("Пересадка: Москва");
    expect(road).toHaveTextContent("010У");
    expect(road).toHaveTextContent("Это план, а не билет");
    // The card's own sentence, about a road that has no single ticket.
    expect(road).toHaveTextContent("Путь ляжет с 1 пересадкой");
  });

  it("says nothing about fog, emptiness, or a missing road", () => {
    render(<TravelResult result={withPlan} />);
    const road = screen.getByRole("region", { name: "Дорога, которую выбрала карта" });

    expect(road).not.toHaveTextContent("Дорога скрыта туманом");
    expect(road).not.toHaveTextContent("ничего не нашлось");
    expect(road).not.toHaveTextContent("прямого пути нет");
  });

  it("does not repeat the plan as a second road when it is the only one", () => {
    render(<TravelResult result={withPlan} />);
    expect(screen.queryByRole("region", { name: "Ещё одна дорога" })).toBeNull();
    expect(screen.getAllByText(/Это план, а не билет/)).toHaveLength(1);
  });

  it("keeps the fog when there is neither an offer nor a plan", () => {
    render(<TravelResult result={{ ...withPlan, interchangePlan: null }} />);
    const road = screen.getByRole("region", { name: "Дорога, которую выбрала карта" });

    expect(road).toHaveTextContent("ничего не нашлось");
    expect(road).toHaveTextContent("прямого пути нет");
  });

  // A plan next to a road the card already named is an alternative, not the
  // answer -- four times cheaper by train than by air is worth seeing.
  it("shows the plan as a second road when a bookable one also exists", () => {
    render(<TravelResult result={{ ...withPlan, roadChoice: resultWithRoad.roadChoice, transportOutcome: "served" }} />);

    expect(screen.getByRole("region", { name: "Дорога, которую выбрала карта" }))
      .not.toHaveTextContent("Это план, а не билет");
    expect(screen.getByRole("region", { name: "Ещё одна дорога" }))
      .toHaveTextContent("Пересадка: Москва");
  });
});

it("keeps «ничего не нашлось» out of the ticket list when a plan is the road", () => {
  const plan = {
    via: ["Москва"], transferCount: 1, durationMin: 6187, priceFrom: 17936,
    legs: [{ trainNumber: "010У", from: "Псков", to: "Москва", priceFrom: 3146, seatCategories: [] }],
  };
  render(
    <TravelResult
      result={{
        ...resultWithRoad,
        roadChoice: { mode: "railway", reason: "«Отшельник» сажает к окну.", best: null },
        transportOffers: [{ id: "transport-fallback", title: "Открыть поиск билетов на Туту", url: "https://avia.tutu.ru/" }],
        warnings: [],
        transportOutcome: "empty",
        interchangePlan: plan,
      }}
    />,
  );

  const tickets = screen.getByRole("heading", { name: "Билеты по предсказанию" }).closest("section")!;
  expect(tickets).not.toHaveTextContent("ничего не нашлось");
  // The way into Tutu's own search stays: only the false sentence goes.
  expect(tickets).toHaveTextContent("Открыть поиск билетов на Туту");
});
