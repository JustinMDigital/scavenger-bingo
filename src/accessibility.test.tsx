// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import axe from "axe-core";
import "fake-indexeddb/auto";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App, { GroupView, HostGate, HostLiveBoard } from "./App";
import { PlayerSlidesExport } from "./PlayerSlidesExport";
import type {
  Game,
  GameState,
  Group,
  Submission,
  Task,
} from "./gameService";
import type { PresentationArtifact } from "./slidesExport";

const gameServiceMocks = vi.hoisted(() => ({
  loadGameState: vi.fn(),
  subscribeToGameChanges: vi.fn(),
}));

vi.mock("./gameService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./gameService")>();

  return {
    ...actual,
    loadGameState: gameServiceMocks.loadGameState,
    subscribeToGameChanges: gameServiceMocks.subscribeToGameChanges,
  };
});

const slidesExportMocks = vi.hoisted(() => ({
  createPlayerSlidesDeck: vi.fn(),
  downloadPresentation: vi.fn(),
  primeGoogleIdentity: vi.fn().mockResolvedValue(undefined),
  requestGoogleDriveAccessToken: vi.fn(),
  uploadPresentationToGoogleDrive: vi.fn(),
}));

vi.mock("./slidesExport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./slidesExport")>();

  return {
    ...actual,
    ...slidesExportMocks,
  };
});

const TEST_GAME: Game = {
  activeStopId: null,
  approvalMode: "host",
  boardHidden: false,
  boardMode: "shared",
  boardSize: 3,
  boardsNeedShuffle: false,
  code: "A11Y-ROOM",
  freeSpace: false,
  id: "game-a11y",
  lobbyOpen: false,
  name: "Accessible Hunt",
  phase: "live",
  playMode: "teams",
  proofMode: "optional",
  setupComplete: true,
  teamsLocked: false,
  timerDurationMinutes: 30,
  timerMode: "none",
  timerRunning: false,
  timerSecondsTotal: 0,
  timerStartedAt: "",
  winCondition: "blackout",
};

const TEST_GROUP: Group = {
  color: "oklch(0.49 0.18 245)",
  dark: "oklch(0.36 0.14 245)",
  id: "blue-team",
  name: "Blue Team",
  shortName: "Blue Team",
  soft: "oklch(0.94 0.045 245)",
};

const TEST_TASKS: Task[] = [
  {
    description: "Photograph a colorful wall.",
    icon: "Camera",
    id: "mural",
    sortOrder: 1,
    title: "Find a mural",
  },
  {
    description: "Photograph the whole team together.",
    icon: "Users",
    id: "team-photo",
    sortOrder: 2,
    title: "Team photo",
  },
];

const TEST_SUBMISSION: Submission = {
  createdAt: 1_721_000_000_000,
  groupId: TEST_GROUP.id,
  id: "submission-team-photo",
  imageName: "team.jpg",
  imagePath: "A11Y-ROOM/submission-team-photo",
  imageUrl: "https://example.com/team.jpg",
  status: "pending",
  submittedBy: "player-1",
  submittedByName: "Avery",
  taskId: "team-photo",
  updatedAt: 1_721_000_000_000,
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.clearAllMocks();
  gameServiceMocks.loadGameState.mockReset();
  gameServiceMocks.subscribeToGameChanges.mockReset();
});

describe("public page accessibility", () => {
  it.each([
    ["/", "Join a scavenger hunt"],
    ["/privacy", "Privacy"],
    ["/terms", "Terms"],
    ["/support", "Support"],
    ["/templates/classroom", "Classroom Starter"],
  ])("has no automated accessibility violations at %s", async (path, heading) => {
    window.history.replaceState({}, "", path);
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: heading })).toBeTruthy();
    });
    if (path === "/privacy" || path === "/terms" || path === "/support") {
      expect(document.title).toBe(`${heading} | Scavenger Blackout`);
    }

    const result = await axe.run(document.body, {
      rules: {
        "color-contrast": { enabled: false },
      },
    });

    expect(
      result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => node.target),
      })),
    ).toEqual([]);
  });

  it("publishes the configured monitored support contact", async () => {
    window.history.replaceState({}, "", "/support");
    render(<App />);

    const contact = await screen.findByRole("link", {
      name: "support@example.org",
    });
    expect(contact.getAttribute("href")).toBe("mailto:support@example.org");
  });

  it("explains the Google Drive export on the privacy page", async () => {
    window.history.replaceState({}, "", "/privacy");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Google Drive access" }),
    ).toBeTruthy();
    expect(screen.getByText(/short-lived Google access token/i)).toBeTruthy();
    expect(screen.getByText(/Room deletion cannot recall/i)).toBeTruthy();
  });

  it("presents the game as something anyone can host", async () => {
    render(<App />);

    expect(await screen.findByText(/anyone can host/i)).toBeTruthy();
    expect(screen.getByText(/friends, family, a class, or any other group/i)).toBeTruthy();
  });
});

describe("focused interaction accessibility", () => {
  it("clears a stale player board when the host has ended the room", async () => {
    let notifyRoomChange: (() => void) | undefined;
    const playerState: GameState = {
      revision: 1,
      game: TEST_GAME,
      groups: [TEST_GROUP],
      tasks: TEST_TASKS,
      boardAssignments: TEST_TASKS.map((task, index) => ({
        groupId: TEST_GROUP.id,
        slotOrder: index + 1,
        taskId: task.id,
      })),
      stops: [],
      membership: {
        displayName: "Avery",
        gameId: TEST_GAME.id,
        groupId: TEST_GROUP.id,
        id: "player-1",
        role: "player",
      },
      memberships: [],
      roster: [],
      submissions: [],
    };
    gameServiceMocks.loadGameState
      .mockResolvedValueOnce(playerState)
      .mockRejectedValueOnce(
        new Error("No active game found for that code."),
      );
    gameServiceMocks.subscribeToGameChanges.mockImplementation(
      (_gameId, onChange: () => void) => {
        notifyRoomChange = onChange;
        return () => undefined;
      },
    );
    window.localStorage.setItem(
      "scavenger-blackout-player",
      JSON.stringify({
        gameId: TEST_GAME.id,
        groupId: TEST_GROUP.id,
        membershipId: "player-1",
        name: "Avery",
      }),
    );
    window.localStorage.setItem(
      "scavenger-blackout-game-code",
      TEST_GAME.code,
    );
    window.history.replaceState({}, "", `/?code=${TEST_GAME.code}`);

    render(<App />);
    await screen.findByRole("heading", { name: "0 of 2 sent" });
    expect(notifyRoomChange).toBeTypeOf("function");

    await act(async () => {
      notifyRoomChange?.();
    });

    await screen.findByRole("heading", { name: "Join a scavenger hunt" });
    expect(
      screen.queryByRole("heading", { name: "0 of 2 sent" }),
    ).toBeNull();
    expect(
      window.localStorage.getItem("scavenger-blackout-player"),
    ).toBeNull();
    expect(
      window.localStorage.getItem("scavenger-blackout-game-code"),
    ).toBeNull();
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("");
  });

  it("reveals and copies the host PIN with clear state and feedback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <HostGate
        defaultDisplayName="Host"
        defaultGameCode="A11Y-ROOM"
        isBusy={false}
        isExistingRoom
        onClaim={vi.fn()}
      />,
    );

    const pinInput = screen.getByLabelText("PIN") as HTMLInputElement;
    fireEvent.change(pinInput, { target: { value: "24681012" } });
    expect(pinInput.type).toBe("password");

    const revealButton = screen.getByRole("button", { name: "Show PIN" });
    expect(revealButton.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(revealButton);
    expect(pinInput.type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide PIN" }).getAttribute("aria-pressed"))
      .toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Copy PIN" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("24681012"));
    expect((await screen.findByRole("status")).textContent).toBe("PIN copied.");
  });

  it("announces task state, exposes selection, and restores focus after closing", async () => {
    function TaskPanelHarness() {
      const [selectedTaskId, setSelectedTaskId] = useState("");
      const [isDismissed, setIsDismissed] = useState(false);
      const selectedTask =
        TEST_TASKS.find((task) => task.id === selectedTaskId) ?? null;

      return (
        <GroupView
          boardView="grid"
          game={TEST_GAME}
          group={TEST_GROUP}
          groups={[TEST_GROUP]}
          isBoardHidden={false}
          isTaskCardDismissed={isDismissed}
          onBoardViewChange={vi.fn()}
          onCompleteTask={vi.fn()}
          onDiscardPendingProof={vi.fn()}
          onDismissTaskCard={() => setIsDismissed(true)}
          onLeave={vi.fn()}
          onRetryPendingProof={vi.fn()}
          onSubmitProof={vi.fn()}
          onTaskSelect={(taskId) => {
            setSelectedTaskId(taskId);
            setIsDismissed(false);
          }}
          pendingProofs={[]}
          retryingProofId=""
          roster={[]}
          selectedTask={selectedTask}
          submissions={[TEST_SUBMISSION]}
          tasks={TEST_TASKS}
          uploadingTaskId=""
        />
      );
    }

    render(<TaskPanelHarness />);

    const readyTask = screen.getByRole("button", {
      name: /Find a mural.*Status: Ready/i,
    });
    const submittedTask = screen.getByRole("button", {
      name: /Team photo.*Status: Submitted/i,
    });
    expect(readyTask.getAttribute("aria-pressed")).toBe("false");
    expect(readyTask.getAttribute("aria-expanded")).toBe("false");
    expect(submittedTask).toBeTruthy();

    fireEvent.click(readyTask);

    const panel = screen.getByRole("region", { name: "Find a mural" });
    expect(panel.id).toBe(readyTask.getAttribute("aria-controls"));
    expect(readyTask.getAttribute("aria-pressed")).toBe("true");
    expect(readyTask.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(panel);

    const result = await axe.run(document.body, {
      rules: {
        "color-contrast": { enabled: false },
      },
    });
    expect(
      result.violations.map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => node.target),
      })),
    ).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Close current task" }));

    expect(screen.queryByRole("region", { name: "Find a mural" })).toBeNull();
    expect(readyTask.getAttribute("aria-pressed")).toBe("false");
    expect(readyTask.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(readyTask);
  });

  it("gives the host live-board close button a specific name", () => {
    const onClose = vi.fn();

    render(
      <HostLiveBoard
        boardSize={3}
        group={TEST_GROUP}
        onClose={onClose}
        setSubmissionStatus={vi.fn()}
        submissions={[TEST_SUBMISSION]}
        tasks={TEST_TASKS}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: /Team photo.*Status: Submitted/i,
      }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Close Blue Team live board" }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows player presentation export only after host authorization and review", () => {
    const viewProps = {
      boardView: "grid" as const,
      group: TEST_GROUP,
      groups: [TEST_GROUP],
      isTaskCardDismissed: true,
      onBoardViewChange: vi.fn(),
      onCompleteTask: vi.fn(),
      onDiscardPendingProof: vi.fn(),
      onDismissTaskCard: vi.fn(),
      onLeave: vi.fn(),
      onRetryPendingProof: vi.fn(),
      onSubmitProof: vi.fn(),
      onTaskSelect: vi.fn(),
      pendingProofs: [],
      retryingProofId: "",
      roster: [],
      selectedTask: null,
      submissions: [TEST_SUBMISSION],
      tasks: TEST_TASKS,
      uploadingTaskId: "",
    };
    const { rerender } = render(
      <GroupView
        {...viewProps}
        game={{
          ...TEST_GAME,
          phase: "review",
          playerExportMode: "host-only",
        }}
        isBoardHidden={false}
      />,
    );

    expect(
      screen.queryByRole("region", { name: "Turn your board into Google Slides" }),
    ).toBeNull();

    rerender(
      <GroupView
        {...viewProps}
        game={{
          ...TEST_GAME,
          setupComplete: false,
          phase: "review",
          playerExportMode: "team-after-review",
        }}
        isBoardHidden={false}
      />,
    );
    expect(
      screen.queryByRole("region", { name: "Turn your board into Google Slides" }),
    ).toBeNull();

    rerender(
      <GroupView
        {...viewProps}
        game={{
          ...TEST_GAME,
          setupComplete: true,
          phase: "review",
          playerExportMode: "team-after-review",
        }}
        isBoardHidden={false}
      />,
    );
    expect(
      screen.getByRole("region", { name: "Turn your board into Google Slides" }),
    ).toBeTruthy();

    rerender(
      <GroupView
        {...viewProps}
        game={{
          ...TEST_GAME,
          setupComplete: true,
          phase: "review",
          playerExportMode: "team-after-review",
        }}
        isBoardHidden
      />,
    );
    expect(
      screen.queryByRole("region", { name: "Turn your board into Google Slides" }),
    ).toBeNull();
  });

  it("shows loading on only the export action that is running", async () => {
    let resolveArtifact: ((artifact: PresentationArtifact) => void) | undefined;
    const artifactPromise = new Promise<PresentationArtifact>((resolve) => {
      resolveArtifact = resolve;
    });
    slidesExportMocks.createPlayerSlidesDeck.mockReturnValue(artifactPromise);

    render(
      <PlayerSlidesExport
        audience="host"
        game={{ ...TEST_GAME, phase: "review" }}
        group={TEST_GROUP}
        roster={[]}
        submissions={[TEST_SUBMISSION]}
        tasks={TEST_TASKS}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Download presentation" }),
    );

    const exportSection = screen.getByRole("region", {
      name: "Turn your board into Google Slides",
    });
    expect(exportSection.getAttribute("aria-busy")).toBe("true");
    expect(
      screen.getByRole("button", { name: "Choose Google account and create" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Preparing download..." }),
    ).toBeTruthy();

    await act(async () => {
      resolveArtifact?.({
        blob: new Blob(["presentation"]),
        fileName: "Accessible Hunt.pptx",
        warnings: [],
      });
      await artifactPromise;
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Download presentation" }),
      ).toBeTruthy();
      expect(exportSection.getAttribute("aria-busy")).toBe("false");
    });
    expect(slidesExportMocks.downloadPresentation).toHaveBeenCalledOnce();
  });

  it("requires a player to confirm each separate presentation copy", async () => {
    slidesExportMocks.createPlayerSlidesDeck.mockResolvedValue({
      blob: new Blob(["presentation"]),
      fileName: "Accessible Hunt.pptx",
      warnings: [],
    });

    render(
      <PlayerSlidesExport
        audience="player"
        game={{ ...TEST_GAME, phase: "review" }}
        group={TEST_GROUP}
        roster={[]}
        submissions={[TEST_SUBMISSION]}
        tasks={TEST_TASKS}
      />,
    );

    const googleButton = screen.getByRole("button", {
      name: "Choose Google account and create",
    }) as HTMLButtonElement;
    const downloadButton = screen.getByRole("button", {
      name: "Download presentation",
    }) as HTMLButtonElement;
    expect(googleButton.disabled).toBe(true);
    expect(downloadButton.disabled).toBe(true);
    expect(slidesExportMocks.primeGoogleIdentity).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /I understand this creates a separate copy/i,
      }),
    );

    expect(downloadButton.disabled).toBe(false);
    fireEvent.click(downloadButton);
    await waitFor(() => {
      expect(slidesExportMocks.downloadPresentation).toHaveBeenCalledOnce();
    });
  });
});
