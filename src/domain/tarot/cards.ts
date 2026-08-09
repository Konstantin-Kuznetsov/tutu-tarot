import type { TarotCardDefinition } from "@/domain/types";

export const tarotCards: TarotCardDefinition[] = [
  {
    id: "hermit",
    name: "Отшельник",
    archetypes: ["solitude", "mystery", "cliffs"],
    meaning: "дорога к тишине и высокому месту",
  },
  {
    id: "chariot",
    name: "Колесница",
    archetypes: ["road", "renewal"],
    meaning: "путь складывается через движение и смену горизонта",
  },
  {
    id: "tower",
    name: "Башня",
    archetypes: ["cliffs", "renewal"],
    meaning: "камень, высота и резкая перемена взгляда",
  },
  {
    id: "star",
    name: "Звезда",
    archetypes: ["north", "water", "mystery"],
    meaning: "северный свет, вода и надежда",
  },
  {
    id: "sun",
    name: "Солнце",
    archetypes: ["sun", "food", "renewal"],
    meaning: "тепло, вкус и открытая дорога",
  },
  {
    id: "lovers",
    name: "Влюбленные",
    archetypes: ["culture", "food", "water"],
    meaning: "место для близости, прогулок и красивого выбора",
  },
  {
    id: "wheel",
    name: "Колесо Фортуны",
    archetypes: ["road", "mystery"],
    meaning: "маршрут сам поворачивает в нужную сторону",
  },
  {
    id: "judgement",
    name: "Суд",
    archetypes: ["culture", "renewal"],
    meaning: "старые истории возвращаются новым смыслом",
  },
];
