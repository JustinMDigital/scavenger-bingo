import {
  devices,
  expect,
  test,
  type Page,
} from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("one host and two independent players can start and update a hunt", async ({
  browser,
  page: hostPage,
}, testInfo) => {
  const desktopPlayerContext = await browser.newContext({
    baseURL: testInfo.project.use.baseURL as string,
    viewport: { width: 1280, height: 800 },
  });
  const phonePlayerContext = await browser.newContext({
    ...devices["Pixel 7"],
    baseURL: testInfo.project.use.baseURL as string,
  });
  const desktopPlayer = await desktopPlayerContext.newPage();
  const phonePlayer = await phonePlayerContext.newPage();
  const browserErrors: string[] = [];

  watchForBrowserErrors(hostPage, "host", browserErrors);
  watchForBrowserErrors(desktopPlayer, "desktop player", browserErrors);
  watchForBrowserErrors(phonePlayer, "phone player", browserErrors);

  const roomCode = createRoomCode(testInfo.project.name);
  const hostPin = "24681357";

  try {
    await test.step("host creates a ready-to-play no-photo room", async () => {
      await hostPage.goto("/host?template=classroom");
      await expect(
        hostPage.getByRole("heading", { name: "Create Classroom Starter." }),
      ).toBeVisible();

      await hostPage.getByLabel("Room code").fill(roomCode);
      await hostPage.getByLabel("Host name").fill("Morgan");
      await hostPage.getByLabel("PIN").fill(hostPin);
      await hostPage
        .getByRole("button", { name: "Create game from template" })
        .click();

      await expect(
        hostPage.getByRole("heading", {
          name: "Build the hunt one step at a time.",
        }),
      ).toBeVisible();
      await hostPage.getByRole("button", { name: "Invite" }).click();
      await expect(
        hostPage.getByRole("heading", { name: "Join the game" }),
      ).toBeVisible();
      await expect(hostPage.getByText(roomCode, { exact: true })).toBeVisible();
      await expect(hostPage.getByText("Lobby open", { exact: true })).toBeVisible();
    });

    await test.step("two isolated browser sessions join different teams", async () => {
      await Promise.all([
        joinRoom(desktopPlayer, roomCode, "Alex", "Team 1"),
        joinRoom(phonePlayer, roomCode, "Riley", "Team 2"),
      ]);

      await expect(
        hostPage.getByRole("heading", { name: "2 players joined" }),
      ).toBeVisible();
      await expect(hostPage.getByText("Alex", { exact: true })).toBeVisible();
      await expect(hostPage.getByText("Riley", { exact: true })).toBeVisible();
    });

    await test.step("the host starts play and both boards reveal live", async () => {
      await hostPage.getByRole("button", { name: "Start game" }).click();
      await expect(
        hostPage.getByRole("heading", { name: "Classroom Scavenger Bingo" }),
      ).toBeVisible();

      await Promise.all([
        expect(desktopPlayer.getByRole("group", { name: "Game board" })).toBeVisible(),
        expect(phonePlayer.getByRole("group", { name: "Game board" })).toBeVisible(),
      ]);
      await expect(desktopPlayer.getByText("1 approved", { exact: true })).toBeVisible();
      await expect(phonePlayer.getByText("1 approved", { exact: true })).toBeVisible();
    });

    await test.step("one team's update stays isolated before the second team plays", async () => {
      await completeFirstAvailableTask(desktopPlayer);
      await expect(desktopPlayer.getByText("2 approved", { exact: true })).toBeVisible();
      await expect(phonePlayer.getByText("1 approved", { exact: true })).toBeVisible();

      const teamOneCard = hostPage.locator(".team-card").filter({ hasText: "Team 1" });
      const teamTwoCard = hostPage.locator(".team-card").filter({ hasText: "Team 2" });
      await expect(teamOneCard).toContainText("2/9");
      await expect(teamOneCard).toContainText("1 submitted");
      await expect(teamTwoCard).toContainText("1/9");
      await expect(teamTwoCard).toContainText("0 submitted");
    });

    await test.step("the second player completes a square and the host sees both updates", async () => {
      await completeFirstAvailableTask(phonePlayer);
      await expect(phonePlayer.getByText("2 approved", { exact: true })).toBeVisible();

      const teamOneCard = hostPage.locator(".team-card").filter({ hasText: "Team 1" });
      const teamTwoCard = hostPage.locator(".team-card").filter({ hasText: "Team 2" });
      await expect(teamOneCard).toContainText("2/9");
      await expect(teamOneCard).toContainText("1 submitted");
      await expect(teamTwoCard).toContainText("2/9");
      await expect(teamTwoCard).toContainText("1 submitted");
    });

    await test.step("the phone-sized player remains usable without horizontal overflow", async () => {
      await expect
        .poll(() =>
          phonePlayer.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
          ),
        )
        .toBe(true);
    });

    expect(browserErrors, browserErrors.join("\n")).toEqual([]);
  } finally {
    await Promise.all([
      desktopPlayerContext.close(),
      phonePlayerContext.close(),
    ]);
  }
});

async function joinRoom(
  page: Page,
  roomCode: string,
  playerName: string,
  teamName: string,
) {
  await page.goto(`/?code=${encodeURIComponent(roomCode)}`);
  await expect(
    page.getByRole("heading", {
      name: "Join your team, then start filling the board.",
    }),
  ).toBeVisible();
  await page.getByLabel("First name or nickname").fill(playerName);
  await page.getByRole("button", { name: teamName }).click();
  await page.getByRole("button", { name: "Open board" }).click();
  await expect(
    page.getByRole("heading", { name: "Waiting for the host" }),
  ).toBeVisible();
}

async function completeFirstAvailableTask(page: Page) {
  const board = page.getByRole("group", { name: "Game board" });
  const taskButtons = board.getByRole("button");
  const taskCount = await taskButtons.count();

  for (let index = 0; index < taskCount; index += 1) {
    const taskButton = taskButtons.nth(index);
    const accessibleName = await taskButton.getAttribute("aria-label");
    if (!accessibleName?.startsWith("FREE.")) {
      await taskButton.click();
      await page.getByRole("button", { name: "Mark complete" }).click();
      return;
    }
  }

  throw new Error("No completable board task was available.");
}

function watchForBrowserErrors(
  page: Page,
  label: string,
  errors: string[],
) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`${label} console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    errors.push(`${label} page: ${error.message}`);
  });
}

function createRoomCode(projectName: string) {
  const projectSuffix = projectName.startsWith("phone") ? "P" : "D";
  const timeSuffix = Date.now().toString(36).slice(-7).toUpperCase();
  const randomSuffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `E2E-${projectSuffix}-${timeSuffix}-${randomSuffix}`;
}
