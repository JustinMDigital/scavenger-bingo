import { expect, test, type Page } from "@playwright/test";

test("template browser keeps matching context and starts the chosen game", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name.includes("phone")) {
    await page.setViewportSize({ width: 390, height: 844 });
  }

  await page.goto("/templates");
  await expect(
    page.getByRole("heading", { name: "Start with a game that already fits." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Start Quick Bingo" })).toBeVisible();

  const kidsFilter = page.getByRole("button", { name: "Kids & family" });
  await kidsFilter.click();
  await expect(kidsFilter).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\/templates\?filter=kids$/);
  await expect(page.getByText("4 matches", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "At-Home Adventure" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Park & Playground" }),
  ).toBeVisible();
  await expect(
    page.getByText("Best match for kids & family", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Kids’ Indoor Hunt" }),
  ).toBeVisible();

  const useAtHome = page.getByRole("link", { name: "Start At-Home Adventure" });
  const actionBox = await useAtHome.boundingBox();
  expect(actionBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page);

  await page
    .getByRole("link", { name: "See what is inside At-Home Adventure" })
    .click();
  await expect(page).toHaveURL(/\/templates\/at-home-adventure\?filter=kids$/);
  await expect(
    page.getByRole("heading", { name: "At-Home Adventure" }),
  ).toBeVisible();
  await expect(page.getByText("16 editable tasks", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Preview the challenges." })
      .getByText("Cozy Color", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "All templates" }),
  ).toHaveAttribute("href", "/templates?filter=kids");

  await page.getByRole("link", { name: "All templates" }).click();
  await expect(kidsFilter).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => {
    window.localStorage.setItem("scavenger-blackout-game-code", "OLD-ROOM");
  });
  await page.getByRole("link", { name: "Start At-Home Adventure" }).click();
  await expect(
    page.getByRole("heading", { name: "Create At-Home Adventure." }),
  ).toBeVisible();
  await expect(page.getByText("No photos", { exact: true })).toBeVisible();
  await expect(page.getByText("3×3 bingo", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
}
