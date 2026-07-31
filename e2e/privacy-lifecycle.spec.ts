import {
  devices,
  expect,
  test,
  type Browser,
  type Page,
  type TestInfo,
} from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("player presentation export is denied by default and abandoning clears connected clients", async ({
  browser,
  page: hostPage,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "This scenario creates its own phone player context.",
  );
  const playerContext = await createPhoneContext(browser, testInfo);
  const playerPage = await playerContext.newPage();
  const diagnostics = createDiagnostics();
  watchPage(hostPage, "host", diagnostics);
  watchPage(playerPage, "player", diagnostics);

  const roomCode = createRoomCode("DEFAULT");

  try {
    await test.step("the room starts with player presentation export off", async () => {
      await createClassroomRoom(hostPage, roomCode);

      const playerExportToggle = hostPage.getByRole("checkbox", {
        name: "Let players export their own team after the hunt",
      });
      await expect(playerExportToggle).not.toBeChecked();

      await openLobby(hostPage, roomCode);
      await openJoinPage(playerPage, roomCode);
      await expect(
        playerPage.getByText(/This host allows players to make a separate presentation/),
      ).toHaveCount(0);
      await joinTeam(playerPage, "Avery", "Team 1");
    });

    await test.step("ending the hunt does not expose a player export", async () => {
      await hostPage.getByRole("button", { name: "Start game" }).click();
      await expect(
        playerPage.getByRole("group", { name: "Game board" }),
      ).toBeVisible();

      await hostPage.getByRole("button", { name: "End hunt" }).click();
      await expect(
        playerPage.getByRole("heading", {
          name: "Turn your board into Google Slides",
        }),
      ).toHaveCount(0);

      await hostPage
        .getByRole("button", { name: /^Team 1\b/ })
        .click();
      await expect(
        hostPage.getByRole("heading", {
          name: "Turn your board into Google Slides",
        }),
      ).toBeVisible();
    });

    await test.step("abandoning removes the room and clears the connected player", async () => {
      diagnostics.allowRoomEnded404.add(playerPage);
      await abandonRoom(hostPage, roomCode);

      await expect(
        playerPage.getByRole("heading", { name: "Join a scavenger hunt" }),
      ).toBeVisible();
      await expect(
        playerPage.getByRole("status").filter({
          hasText: "This room has ended. This device was cleared.",
        }),
      ).toBeVisible();
      await expectStoredRoomIdentity(playerPage, null, null);
      await expectPendingProofCount(playerPage, 0);
    });

    expect(
      diagnostics.unexpected,
      formatDiagnostics(diagnostics),
    ).toEqual([]);
  } finally {
    await playerContext.close();
  }
});

test("authorized export stays gated, photos remain team-bound, and player deletion and leave clear data", async ({
  browser,
  page: hostPage,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "This scenario creates its own desktop and phone player contexts.",
  );
  test.setTimeout(90_000);
  const firstPlayerContext = await createDesktopContext(browser, testInfo);
  const phonePlayerContext = await createPhoneContext(browser, testInfo);
  const firstPlayerPage = await firstPlayerContext.newPage();
  const phonePlayerPage = await phonePlayerContext.newPage();
  const diagnostics = createDiagnostics();
  watchPage(hostPage, "host", diagnostics);
  watchPage(firstPlayerPage, "first player", diagnostics);
  watchPage(phonePlayerPage, "phone player", diagnostics);

  const roomCode = createRoomCode("PRIVATE");
  let deletedProofUrl = "";

  try {
    await test.step("the host deliberately enables photos and player exports", async () => {
      await createClassroomRoom(hostPage, roomCode);

      const photoProofSelect = hostPage.getByRole("combobox", {
        name: /^Photo proof/,
      });
      await expect(photoProofSelect).toHaveValue("none");
      await hostPage.waitForTimeout(400);
      await photoProofSelect.selectOption("required");
      await expect(photoProofSelect).toHaveValue("required");
      await hostPage
        .getByRole("combobox", { name: "Approval", exact: true })
        .selectOption("host");
      await hostPage
        .getByRole("checkbox", {
          name: /I have participant approval and any additional approval/,
        })
        .check();
      await hostPage
        .getByRole("checkbox", {
          name: "Let players export their own team after the hunt",
        })
        .check();
      await hostPage
        .getByRole("checkbox", {
          name: /I have approval to let players make and keep separate copies/,
        })
        .check();
      await hostPage.getByRole("button", { name: "Save and continue" }).click();
      await expect(
        hostPage.getByRole("heading", { name: "Name your teams" }),
      ).toBeVisible();

      await openLobby(hostPage, roomCode);
      await Promise.all([
        openJoinPage(firstPlayerPage, roomCode),
        openJoinPage(phonePlayerPage, roomCode),
      ]);
      await Promise.all([
        expect(
          firstPlayerPage.getByText(
            /This host allows players to make a separate presentation/,
          ),
        ).toBeVisible(),
        expect(
          phonePlayerPage.getByText(
            /This host allows players to make a separate presentation/,
          ),
        ).toBeVisible(),
      ]);
      await Promise.all([
        joinTeam(firstPlayerPage, "Alex", "Team 1"),
        joinTeam(phonePlayerPage, "Riley", "Team 2"),
      ]);
    });

    await test.step("a real image reaches host review and leaves no queued retry", async () => {
      await hostPage.getByRole("button", { name: "Start game" }).click();
      await Promise.all([
        expect(
          firstPlayerPage.getByRole("group", { name: "Game board" }),
        ).toBeVisible(),
        expect(
          phonePlayerPage.getByRole("group", { name: "Game board" }),
        ).toBeVisible(),
      ]);

      await uploadFirstAvailablePhoto(firstPlayerPage);
      await expect(
        hostPage.getByRole("button", { name: /^Open proof photo for / }),
      ).toBeVisible();
      await expectPendingProofCount(firstPlayerPage, 0);

      await hostPage
        .getByRole("button", { name: /^Open proof photo for / })
        .click();
      const proofDialog = hostPage.getByRole("dialog");
      const proofImage = proofDialog.getByRole("img", { name: /proof from/i });
      deletedProofUrl = (await proofImage.getAttribute("src")) ?? "";
      expect(deletedProofUrl).not.toBe("");
      const cachedProof = await hostPage.evaluate(async (url) => {
        const response = await fetch(url, { cache: "force-cache" });
        await response.arrayBuffer();
        return {
          cacheControl: response.headers.get("cache-control"),
          status: response.status,
        };
      }, deletedProofUrl);
      expect(cachedProof.status).toBe(200);
      expect(cachedProof.cacheControl).toContain("no-store");
      await proofDialog
        .getByRole("button", { name: "Close proof photo" })
        .click();
    });

    await test.step("review export waits for both board reveal and player confirmation", async () => {
      await hostPage.getByRole("button", { name: "Hide board" }).click();
      await expect(
        phonePlayerPage.getByRole("heading", { name: "Waiting for the host" }),
      ).toBeVisible();

      await hostPage.getByRole("button", { name: "End hunt" }).click();
      await expect(
        phonePlayerPage.getByRole("heading", {
          name: "Turn your board into Google Slides",
        }),
      ).toHaveCount(0);

      await hostPage
        .getByRole("button", { name: "Submitted", exact: true })
        .click();
      await expect(
        hostPage.getByRole("button", { name: "Approved", exact: true }),
      ).toBeVisible();
    });

    await test.step("moving a player does not move their existing team photo", async () => {
      await hostPage.getByRole("button", { name: "Room", exact: true }).click();
      hostPage.once("dialog", async (dialog) => {
        expect(dialog.message()).toContain(
          "Existing photos stay with their original team.",
        );
        await dialog.accept();
      });
      const moveAlex = hostPage.getByLabel("Move Alex to another team");
      await moveAlex.selectOption({ label: "Team 2" });
      await expect(moveAlex.locator("option:checked")).toHaveText("Team 2");
      const alexTeamCard = hostPage.getByRole("article").filter({
        has: moveAlex,
      });
      await expect(alexTeamCard).toContainText("Team 2");
      await expect(alexTeamCard).toContainText("Alex");

      await hostPage.getByRole("button", { name: "Live", exact: true }).click();
      const proofArticle = hostPage
        .getByRole("button", { name: /^Open proof photo for / })
        .locator("xpath=ancestor::article");
      await expect(proofArticle).toContainText("Team 1");
      await expect(proofArticle).toContainText(/Submitted by Alex/);
    });

    await test.step("deleting that player also deletes their submission and local identity", async () => {
      await hostPage.getByRole("button", { name: "Room", exact: true }).click();
      hostPage.once("dialog", async (dialog) => {
        expect(dialog.message()).toContain(
          "This permanently deletes 1 proof and their photos.",
        );
        await dialog.accept();
      });
      await hostPage
        .getByRole("button", { name: "Delete Alex's room data" })
        .click();

      await expect(
        firstPlayerPage.getByRole("heading", {
          name: "Join a scavenger hunt",
        }),
      ).toBeVisible();
      await expectStoredRoomIdentity(firstPlayerPage, null, null);
      await expectPendingProofCount(firstPlayerPage, 0);

      await hostPage.getByRole("button", { name: "Live", exact: true }).click();
      await expect(
        hostPage.getByRole("button", { name: /^Open proof photo for / }),
      ).toHaveCount(0);
      await expect(hostPage.getByText("No proofs yet", { exact: true })).toBeVisible();
      diagnostics.expectedNotFoundUrls.add(
        new URL(deletedProofUrl, hostPage.url()).href,
      );
      const deletedProof = await hostPage.evaluate(async (url) => {
        const response = await fetch(url, { cache: "force-cache" });
        return response.status;
      }, deletedProofUrl);
      expect(deletedProof).toBe(404);
    });

    await test.step("the remaining phone player must confirm before downloading", async () => {
      await hostPage.getByRole("button", { name: "Show board" }).click();
      const exportHeading = phonePlayerPage.getByRole("heading", {
        name: "Turn your board into Google Slides",
      });
      await expect(exportHeading).toBeVisible();

      const downloadButton = phonePlayerPage.getByRole("button", {
        name: "Download presentation",
      });
      await expect(downloadButton).toBeDisabled();
      await phonePlayerPage
        .getByRole("checkbox", {
          name: /I understand this creates a separate copy with my team’s names/,
        })
        .check();
      await expect(downloadButton).toBeEnabled();
      await expectNoHorizontalOverflow(phonePlayerPage);
    });

    await test.step("leaving clears the phone, then abandon clears a removed stale client", async () => {
      phonePlayerPage.once("dialog", async (dialog) => {
        expect(dialog.message()).toContain(
          "Leave this room and delete your submissions",
        );
        await dialog.accept();
      });
      await phonePlayerPage
        .getByRole("button", { name: "Leave and clear this device" })
        .click();
      await expect(
        phonePlayerPage.getByRole("heading", { name: "Join a scavenger hunt" }),
      ).toBeVisible();
      await expectStoredRoomIdentity(phonePlayerPage, null, null);
      await expectPendingProofCount(phonePlayerPage, 0);

      diagnostics.allowRoomEnded404.add(firstPlayerPage);
      await abandonRoom(hostPage, roomCode);
      await expect(
        firstPlayerPage.getByRole("heading", { name: "Join a scavenger hunt" }),
      ).toBeVisible();
      await expectStoredRoomIdentity(firstPlayerPage, null, null);
    });

    expect(
      diagnostics.unexpected,
      formatDiagnostics(diagnostics),
    ).toEqual([]);
  } finally {
    await Promise.all([
      firstPlayerContext.close(),
      phonePlayerContext.close(),
    ]);
  }
});

async function createClassroomRoom(hostPage: Page, roomCode: string) {
  await hostPage.goto("/host?template=classroom");
  await expect(
    hostPage.getByRole("heading", { name: "Create Classroom Starter." }),
  ).toBeVisible();
  await hostPage.getByLabel("Room code").fill(roomCode);
  await hostPage.getByLabel("Host name").fill("Morgan");
  await hostPage.getByLabel("PIN").fill("24681357");
  await hostPage
    .getByRole("button", { name: "Create game from template" })
    .click();
  await expect(
    hostPage.getByRole("heading", {
      name: "Build the hunt one step at a time.",
    }),
  ).toBeVisible();
}

async function openLobby(hostPage: Page, roomCode: string) {
  await hostPage.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(
    hostPage.getByRole("heading", { name: "Join the game" }),
  ).toBeVisible();
  await expect(hostPage.getByText(roomCode, { exact: true })).toBeVisible();
  await expect(hostPage.getByText("Lobby open", { exact: true })).toBeVisible();
}

async function openJoinPage(playerPage: Page, roomCode: string) {
  await playerPage.goto(`/?code=${encodeURIComponent(roomCode)}`);
  await expect(
    playerPage.getByRole("heading", {
      name: "Join your team, then start filling the board.",
    }),
  ).toBeVisible();
}

async function joinTeam(
  playerPage: Page,
  playerName: string,
  teamName: string,
) {
  await playerPage.getByLabel("First name or nickname").fill(playerName);
  await playerPage.getByRole("button", { name: teamName, exact: true }).click();
  await playerPage.getByRole("button", { name: "Open board" }).click();
  await expect(
    playerPage.getByRole("heading", { name: "Waiting for the host" }),
  ).toBeVisible();
}

async function uploadFirstAvailablePhoto(playerPage: Page) {
  const board = playerPage.getByRole("group", { name: "Game board" });
  const taskButtons = board.getByRole("button");
  const taskCount = await taskButtons.count();

  for (let index = 0; index < taskCount; index += 1) {
    const taskButton = taskButtons.nth(index);
    const accessibleName = await taskButton.getAttribute("aria-label");

    if (accessibleName?.startsWith("FREE.")) {
      continue;
    }

    await taskButton.click();
    const photoInput = playerPage.getByLabel(/^Choose photo for /);
    await expect(photoInput).toBeAttached();
    await photoInput.setInputFiles({
      name: "tiny-proof.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await expect(
      playerPage.getByRole("status").filter({ hasText: /Photo (?:compressed and )?sent/ }),
    ).toBeVisible();
    return;
  }

  throw new Error("No photo task was available on the player board.");
}

async function abandonRoom(hostPage: Page, roomCode: string) {
  await hostPage.getByRole("button", { name: "Room", exact: true }).click();
  await hostPage
    .getByRole("button", { name: /Abandon game/i })
    .click();
  await expect(
    hostPage.getByRole("dialog", { name: `Abandon ${roomCode}` }),
  ).toBeVisible();
  await hostPage.getByLabel("Type ABANDON to confirm").fill("ABANDON");
  await hostPage
    .getByRole("button", { name: "Abandon Game", exact: true })
    .click();
  await expect(
    hostPage.getByRole("heading", { name: "Create or reopen a hunt." }),
  ).toBeVisible();
}

async function expectStoredRoomIdentity(
  page: Page,
  expectedPlayer: string | null,
  expectedGameCode: string | null,
) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        player: window.localStorage.getItem("scavenger-blackout-player"),
        gameCode: window.localStorage.getItem("scavenger-blackout-game-code"),
      })),
    )
    .toEqual({
      player: expectedPlayer,
      gameCode: expectedGameCode,
    });
}

async function expectPendingProofCount(page: Page, expectedCount: number) {
  await expect.poll(() => readPendingProofCount(page)).toBe(expectedCount);
}

async function readPendingProofCount(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = window.indexedDB.open(
          "scavenger-blackout-pending-proofs",
          1,
        );

        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains("pendingProofs")) {
            database.createObjectStore("pendingProofs", { keyPath: "id" });
          }
        };
        request.onerror = () =>
          reject(request.error ?? new Error("Could not inspect proof storage."));
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("pendingProofs", "readonly");
          const countRequest = transaction.objectStore("pendingProofs").count();
          countRequest.onerror = () =>
            reject(
              countRequest.error ?? new Error("Could not count saved proofs."),
            );
          countRequest.onsuccess = () => {
            const count = countRequest.result;
            database.close();
            resolve(count);
          };
        };
      }),
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
}

async function createPhoneContext(browser: Browser, testInfo: TestInfo) {
  return browser.newContext({
    ...devices["Pixel 7"],
    baseURL: testInfo.project.use.baseURL as string,
  });
}

async function createDesktopContext(browser: Browser, testInfo: TestInfo) {
  return browser.newContext({
    baseURL: testInfo.project.use.baseURL as string,
    viewport: { width: 1280, height: 800 },
  });
}

type Diagnostics = {
  allowRoomEnded404: WeakSet<Page>;
  expectedNotFoundUrls: Set<string>;
  expectedRoomEnded404: string[];
  unexpected: string[];
};

function createDiagnostics(): Diagnostics {
  return {
    allowRoomEnded404: new WeakSet<Page>(),
    expectedNotFoundUrls: new Set<string>(),
    expectedRoomEnded404: [],
    unexpected: [],
  };
}

function watchPage(page: Page, label: string, diagnostics: Diagnostics) {
  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }

    const text = message.text();
    const sourceUrl = message.location().url;
    if (
      (diagnostics.allowRoomEnded404.has(page) ||
        diagnostics.expectedNotFoundUrls.has(sourceUrl)) &&
      /404|Failed to load resource/i.test(text)
    ) {
      diagnostics.expectedRoomEnded404.push(`${label} console: ${text}`);
      return;
    }
    diagnostics.unexpected.push(`${label} console: ${text}`);
  });
  page.on("pageerror", (error) => {
    diagnostics.unexpected.push(`${label} page: ${error.message}`);
  });
  page.on("response", (response) => {
    if (!response.url().includes("/api/") || response.status() < 400) {
      return;
    }

    const detail = `${label} response: ${response.status()} ${response.url()}`;
    if (
      response.status() === 404 &&
      (diagnostics.allowRoomEnded404.has(page) ||
        diagnostics.expectedNotFoundUrls.has(response.url()))
    ) {
      diagnostics.expectedRoomEnded404.push(detail);
      return;
    }
    diagnostics.unexpected.push(detail);
  });
}

function formatDiagnostics(diagnostics: Diagnostics) {
  return [
    ...diagnostics.unexpected,
    ...diagnostics.expectedRoomEnded404.map(
      (item) => `Expected room-ended 404: ${item}`,
    ),
  ].join("\n");
}

function createRoomCode(label: string) {
  const labelSuffix = label.slice(0, 4).toUpperCase();
  const timeSuffix = Date.now().toString(36).slice(-6).toUpperCase();
  const randomSuffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `E2E-${labelSuffix}-${timeSuffix}-${randomSuffix}`;
}
