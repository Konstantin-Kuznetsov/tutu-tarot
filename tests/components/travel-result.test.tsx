import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TravelResult } from "@/components/TravelResult";

describe("TravelResult", () => {
  it("renders prediction before Tutu proof links", () => {
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

    expect(screen.getByText("Карты указывают на Усьвинские Столбы")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Путеводитель Туту" })).toHaveAttribute("href", "https://www.tutu.ru/geo/");
    expect(screen.getByText("Москва - Пермь")).toBeInTheDocument();
  });
});
