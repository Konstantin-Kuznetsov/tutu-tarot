import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TravelResult } from "@/components/TravelResult";

describe("TravelResult", () => {
  it("renders prediction before Tutu proof links and offers", () => {
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
          sourceLinks: [{ label: "Путеводитель Туту", url: "https://www.tutu.ru/geo/" }],
          transportOffers: [{ id: "transport-0", title: "Москва - Пермь", price: "4200 RUB" }],
          hotelOffers: [{ id: "hotel-0", title: "Отель в Перми" }],
          warnings: [],
        }}
      />,
    );

    const prediction = screen.getByText("Карты указывают на Усьвинские Столбы");
    const proofLink = screen.getByRole("link", { name: "Путеводитель Туту" });
    const transportOffer = screen.getByText("Москва - Пермь");

    expect(proofLink).toHaveAttribute("href", "https://www.tutu.ru/geo/");
    expect(prediction.compareDocumentPosition(proofLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(proofLink.compareDocumentPosition(transportOffer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
});
