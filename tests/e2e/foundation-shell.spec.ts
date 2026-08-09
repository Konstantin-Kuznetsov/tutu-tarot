import { expect, test } from "@playwright/test";

test("renders the foundation shell", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Таро-турагент");
  await expect(page.getByRole("heading", { name: "Таро-турагент" })).toBeVisible();
  await expect(
    page.getByText("Колода выбирает маршрут по России, а Туту проверяет дорогу и ночлег."),
  ).toBeVisible();
});
