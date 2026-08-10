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
