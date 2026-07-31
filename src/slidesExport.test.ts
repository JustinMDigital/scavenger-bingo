import { afterEach, describe, expect, it, vi } from "vitest";
import type { Game, Group, RosterMember, Submission, Task } from "./gameService";
import {
  buildPlayerSlidesExportModel,
  requestGoogleDriveAccessToken,
  uploadPresentationToGoogleDrive,
} from "./slidesExport";

const GAME: Game = {
  activeStopId: null,
  approvalMode: "host",
  boardHidden: false,
  boardMode: "shared",
  boardSize: 3,
  boardsNeedShuffle: false,
  code: "CLASS-1",
  freeSpace: true,
  id: "game-1",
  lobbyOpen: false,
  name: "Biology Photo Hunt",
  phase: "review",
  playMode: "teams",
  proofMode: "optional",
  setupComplete: true,
  teamsLocked: true,
  timerDurationMinutes: 30,
  timerMode: "duration",
  timerRunning: false,
  timerSecondsTotal: 0,
  timerStartedAt: "2026-07-26T18:00:00.000Z",
  winCondition: "blackout",
};

const GROUP: Group = {
  color: "oklch(0.49 0.18 245)",
  dark: "oklch(0.36 0.14 245)",
  id: "blue-team",
  name: "Blue Team",
  shortName: "Blue Team",
  soft: "oklch(0.94 0.045 245)",
};

const TASKS: Task[] = [
  task("free", "Free Space", true),
  task("approved", "Approved Item"),
  task("pending", "Pending Item"),
  task("retake", "Retake Item"),
  task("no-photo", "Completed Without Photo"),
  task("untouched", "Untouched Item"),
];

const ROSTER: RosterMember[] = [
  rosterMember("player-1", "Avery", "blue-team"),
  rosterMember("player-2", "Jordan", "blue-team"),
  rosterMember("player-3", "Morgan", "red-team"),
  {
    displayName: "Teacher",
    gameId: "game-1",
    groupId: null,
    id: "host-1",
    role: "host",
  },
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("player Google Slides export model", () => {
  it("keeps board order, current team members, and every requested task state", () => {
    const submissions = [
      submission("approved", "approved", true, "Avery"),
      submission("pending", "pending", true, "Jordan"),
      submission("retake", "retake", true, "Avery"),
      submission("no-photo", "approved", false, "Jordan"),
    ];
    const model = buildPlayerSlidesExportModel({
      exportedAt: new Date("2026-07-26T19:00:00.000Z"),
      game: GAME,
      group: GROUP,
      roster: ROSTER,
      submissions,
      tasks: TASKS,
    });

    expect(model.members).toEqual(["Avery", "Jordan"]);
    expect(model.itemSlides.map((item) => item.task.id)).toEqual([
      "approved",
      "pending",
      "retake",
      "no-photo",
    ]);
    expect(model.itemSlides.map((item) => item.status)).toEqual([
      "approved",
      "pending",
      "retake",
      "approved",
    ]);
    expect(model.itemSlides[3].noPhotoLabel).toBe("Completed without a photo");
    expect(model.needsWork).toEqual([
      { reason: "Retake needed", task: TASKS[3] },
      { reason: "Not started", task: TASKS[5] },
    ]);
    expect(model.submittedCount).toBe(4);
    expect(model.approvedCount).toBe(3);
    expect(model.totalCount).toBe(6);
  });

  it("does not include another team's submissions or roster names", () => {
    const otherSubmission = {
      ...submission("approved", "approved", true, "Morgan"),
      groupId: "red-team",
    };
    const model = buildPlayerSlidesExportModel({
      game: GAME,
      group: GROUP,
      roster: ROSTER,
      submissions: [otherSubmission],
      tasks: TASKS.slice(0, 2),
    });

    expect(model.members).toEqual(["Avery", "Jordan"]);
    expect(model.submittedCount).toBe(0);
    expect(model.itemSlides).toEqual([]);
    expect(model.needsWork.map((item) => item.task.id)).toEqual(["approved"]);
  });

  it("uses the individual player's name and produces a safe filename", () => {
    const individualGame = { ...GAME, name: 'Cells: <Lab> / Week 1', playMode: "individual" as const };
    const individualGroup = {
      ...GROUP,
      id: "player-1",
      name: "Avery",
      shortName: "Avery",
    };
    const individualRoster = [
      rosterMember("player-1", "Avery", "player-1"),
      rosterMember("player-2", "Jordan", "player-2"),
    ];
    const model = buildPlayerSlidesExportModel({
      game: individualGame,
      group: individualGroup,
      roster: individualRoster,
      submissions: [],
      tasks: TASKS.slice(0, 1),
    });

    expect(model.members).toEqual(["Avery"]);
    expect(model.fileName).toBe("Cells- -Lab- - Week 1 — Avery.pptx");
  });

  it("handles a maximum 25-item untouched board in one ordered summary", () => {
    const tasks = Array.from({ length: 25 }, (_, index) =>
      task(`task-${index + 1}`, `Task ${index + 1}`),
    );
    const model = buildPlayerSlidesExportModel({
      game: { ...GAME, boardSize: 5 },
      group: GROUP,
      roster: ROSTER,
      submissions: [],
      tasks,
    });

    expect(model.itemSlides).toEqual([]);
    expect(model.needsWork).toHaveLength(25);
    expect(model.needsWork.map((item) => item.task.id)).toEqual(
      tasks.map((item) => item.id),
    );
  });
});

describe("Google Drive presentation upload", () => {
  it("asks for an account on every shared-device authorization", async () => {
    const callbacks: Array<(response: {
      access_token?: string;
      expires_in?: number;
    }) => void> = [];
    const requestAccessToken = vi.fn();
    const initTokenClient = vi.fn((config: {
      callback: (response: { access_token?: string; expires_in?: number }) => void;
    }) => {
      callbacks.push(config.callback);
      return { requestAccessToken };
    });
    vi.stubGlobal("window", {
      google: {
        accounts: {
          oauth2: { initTokenClient },
        },
      },
    });

    const firstTokenPromise = requestGoogleDriveAccessToken(
      "client.apps.googleusercontent.com",
    );
    await vi.waitFor(() => {
      expect(requestAccessToken).toHaveBeenLastCalledWith({
        prompt: "select_account",
      });
    });
    callbacks[0]({ access_token: "first-student-token", expires_in: 3600 });
    await expect(firstTokenPromise).resolves.toBe("first-student-token");

    const secondTokenPromise = requestGoogleDriveAccessToken(
      "client.apps.googleusercontent.com",
    );
    await vi.waitFor(() => {
      expect(initTokenClient).toHaveBeenCalledTimes(2);
      expect(requestAccessToken).toHaveBeenLastCalledWith({
        prompt: "select_account",
      });
    });
    callbacks[1]({ access_token: "second-student-token", expires_in: 3600 });
    await expect(secondTokenPromise).resolves.toBe("second-student-token");
  });

  it("uploads a PowerPoint as a native Google Slides file with narrow bearer access", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        id: "slides-123",
        name: "Biology Photo Hunt",
        webViewLink: "https://docs.google.com/presentation/d/slides-123/edit",
      }),
    );
    const artifact = {
      blob: new Blob(["pptx-bytes"], {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
      fileName: "Biology Photo Hunt.pptx",
      warnings: [],
    };
    const result = await uploadPresentationToGoogleDrive({
      accessToken: "short-lived-token",
      artifact,
    });

    expect(result.id).toBe("slides-123");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("uploadType=multipart");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer short-lived-token",
    });
    expect(String((init?.headers as Record<string, string>)["Content-Type"])).toContain(
      "multipart/related",
    );
    const bodyText = await (init?.body as Blob).text();
    expect(bodyText).toContain("application/vnd.google-apps.presentation");
    expect(bodyText).toContain("Biology Photo Hunt");
    expect(bodyText).toContain("pptx-bytes");
  });

  it("returns an actionable Google API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        { error: { message: "Drive API is disabled for this project." } },
        { status: 403 },
      ),
    );

    await expect(
      uploadPresentationToGoogleDrive({
        accessToken: "token",
        artifact: {
          blob: new Blob(["pptx"]),
          fileName: "Deck.pptx",
          warnings: [],
        },
      }),
    ).rejects.toThrow("Drive API is disabled for this project.");
  });
});

function task(id: string, title: string, free = false): Task {
  return {
    description: `${title} prompt`,
    free,
    icon: "Camera",
    id,
    sortOrder: 0,
    title,
  };
}

function rosterMember(
  id: string,
  displayName: string,
  groupId: string,
): RosterMember {
  return {
    displayName,
    gameId: "game-1",
    groupId,
    id,
    role: "player",
  };
}

function submission(
  taskId: string,
  status: Submission["status"],
  hasPhoto: boolean,
  submittedByName: string,
): Submission {
  return {
    createdAt: 1_721_000_000_000,
    groupId: "blue-team",
    id: `submission-${taskId}`,
    imageName: hasPhoto ? `${taskId}.jpg` : "",
    imagePath: hasPhoto ? `CLASS-1/submission-${taskId}` : "",
    imageUrl: hasPhoto
      ? `https://example.com/api/games/CLASS-1/proofs/submission-${taskId}`
      : "",
    status,
    submittedBy: submittedByName.toLowerCase(),
    submittedByName,
    taskId,
    updatedAt: 1_721_000_000_000,
  };
}
