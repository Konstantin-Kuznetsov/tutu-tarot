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

  it("keeps the prediction above the roads", () => {
    const { container } = render(<TravelResult result={resultWithRoad} />);
    const order = Array.from(container.querySelectorAll("[data-block]")).map(
      (node) => node.getAttribute("data-block"),
    );
    expect(order).toEqual(["prediction", "spread", "road", "other-roads", "hotels", "sources"]);
  });
});
