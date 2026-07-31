import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadGameState,
  resetGameProofs,
  subscribeToGameChanges,
  type GameState,
} from "../src/gameService";

describe("game service realtime ordering", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    FakeWebSocket.instances = [];
  });

  it("coalesces live update bursts and ignores revisions already loaded or seen", async () => {
    vi.useFakeTimers();
    installBrowserGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(gameState("coalesce-game", "COALESCE", 10, "Current")),
      ),
    );

    await loadGameState("COALESCE");
    const onChange = vi.fn();
    const unsubscribe = subscribeToGameChanges("coalesce-game", onChange);
    const socket = FakeWebSocket.instances.at(-1)!;

    expect(socket.url).toBe("wss://example.com/api/games/COALESCE/ws");
    socket.emit("open");
    socket.emit("message", {
      data: JSON.stringify({ type: "room-change", reason: "change", revision: 11 }),
    });
    socket.emit("message", {
      data: JSON.stringify({ type: "room-change", reason: "change", revision: 9 }),
    });
    socket.emit("message", {
      data: JSON.stringify({ type: "room-change", reason: "change", revision: 12 }),
    });
    socket.emit("message", {
      data: JSON.stringify({ type: "room-change", reason: "change", revision: 11 }),
    });

    await vi.advanceTimersByTimeAsync(25);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(12);

    socket.emit("message", {
      data: JSON.stringify({ type: "room-change", reason: "change", revision: 12 }),
    });
    socket.emit("message", {
      data: JSON.stringify({ type: "room-change", reason: "change", revision: 10 }),
    });
    await vi.advanceTimersByTimeAsync(25);
    expect(onChange).toHaveBeenCalledTimes(1);

    socket.emit("message", {
      data: JSON.stringify({ type: "room-change", reason: "legacy-change" }),
    });
    await vi.advanceTimersByTimeAsync(25);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(undefined);

    unsubscribe();
    socket.emit("message", {
      data: JSON.stringify({ type: "room-change", reason: "change", revision: 13 }),
    });
    await vi.advanceTimersByTimeAsync(25);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("returns the newest loaded room state when HTTP responses arrive out of order", async () => {
    const newest = gameState("race-game", "RACE", 20, "Newest state");
    const stale = gameState("race-game", "RACE", 19, "Stale state");
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(jsonResponse(newest))
        .mockResolvedValueOnce(jsonResponse(stale)),
    );

    expect((await loadGameState("RACE")).game.name).toBe("Newest state");
    const secondResult = await loadGameState("RACE");

    expect(secondResult.revision).toBe(20);
    expect(secondResult.game.name).toBe("Newest state");
  });

  it("retries a live revision until the refresh is acknowledged", async () => {
    vi.useFakeTimers();
    installBrowserGlobals();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(gameState("retry-game", "RETRY", 10, "Before update")),
      )
      .mockRejectedValueOnce(new Error("Temporary refresh failure"))
      .mockResolvedValueOnce(
        jsonResponse(gameState("retry-game", "RETRY", 11, "After update")),
      );
    vi.stubGlobal("fetch", fetchMock);

    await loadGameState("RETRY");
    const onChange = vi.fn(async (revision?: number) => {
      try {
        const state = await loadGameState("RETRY");
        return revision === undefined || state.revision >= revision;
      } catch {
        return false;
      }
    });
    const unsubscribe = subscribeToGameChanges("retry-game", onChange);
    const socket = FakeWebSocket.instances.at(-1)!;

    socket.emit("message", {
      data: JSON.stringify({
        type: "room-change",
        reason: "change",
        revision: 11,
      }),
    });
    await vi.advanceTimersByTimeAsync(25);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(250);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    socket.emit("message", {
      data: JSON.stringify({
        type: "room-change",
        reason: "change",
        revision: 11,
      }),
    });
    await vi.advanceTimersByTimeAsync(25);
    expect(onChange).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("retries a terminal update without a revision after a transient failure", async () => {
    vi.useFakeTimers();
    installBrowserGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(gameState("terminal-game", "TERMINAL", 4, "Current")),
      ),
    );

    await loadGameState("TERMINAL");
    const onChange = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const unsubscribe = subscribeToGameChanges("terminal-game", onChange);
    const socket = FakeWebSocket.instances.at(-1)!;

    socket.emit("message", {
      data: JSON.stringify({ type: "room-change", reason: "closed" }),
    });
    await vi.advanceTimersByTimeAsync(25);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(undefined);

    await vi.advanceTimersByTimeAsync(250);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    unsubscribe();
  });

  it("sends proof cleanup and timer reset as one room action", async () => {
    const state = gameState("reset-game", "RESET", 3, "Reset room");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(state))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { deletedImages: 2, deletedSubmissions: 2 },
          }),
          { headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await loadGameState("RESET");
    await resetGameProofs(state.game.id, {
      activeStopId: null,
      phase: "play",
      timerRunning: false,
      timerStartedAt: "2026-07-27T12:00:00.000Z",
      timerSecondsTotal: 0,
      boardHidden: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/games/RESET/actions");
    const request = fetchMock.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      action: "resetGameProofs",
      payload: {
        gameId: "reset-game",
        patch: {
          activeStopId: null,
          phase: "play",
          timerRunning: false,
          timerStartedAt: "2026-07-27T12:00:00.000Z",
          timerSecondsTotal: 0,
          boardHidden: true,
        },
      },
    });
  });
});

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  private listeners = new Map<string, Array<(event: { data?: unknown }) => void>>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(
    type: string,
    listener: (event: { data?: unknown }) => void,
  ) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string, event: { data?: unknown } = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  close() {
    this.emit("close");
  }
}

function installBrowserGlobals() {
  const eventTarget = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const browserWindow = {
    ...eventTarget,
    WebSocket: FakeWebSocket,
    location: {
      protocol: "https:",
      host: "example.com",
    },
    setTimeout,
    clearTimeout,
  };
  vi.stubGlobal("window", browserWindow);
  vi.stubGlobal("document", {
    ...eventTarget,
    visibilityState: "visible",
  });
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("WebSocket", FakeWebSocket);
}

function jsonResponse(state: GameState) {
  return new Response(JSON.stringify(state), {
    headers: { "content-type": "application/json" },
  });
}

function gameState(
  id: string,
  code: string,
  revision: number,
  name: string,
): GameState {
  return {
    revision,
    game: {
      id,
      code,
      name,
      phase: "review",
      activeStopId: null,
      timerRunning: false,
      timerStartedAt: new Date(0).toISOString(),
      timerSecondsTotal: 0,
      boardHidden: true,
      setupComplete: false,
      playMode: "teams",
      winCondition: "blackout",
      boardSize: 3,
      boardMode: "shared",
      freeSpace: true,
      boardsNeedShuffle: false,
      proofMode: "none",
      approvalMode: "host",
      timerMode: "none",
      timerDurationMinutes: 60,
      lobbyOpen: true,
      teamsLocked: false,
    },
    groups: [],
    tasks: [],
    boardAssignments: [],
    stops: [],
    membership: {
      id: `${id}-host`,
      gameId: id,
      role: "host",
      groupId: null,
      displayName: "Host",
    },
    memberships: [],
    roster: [],
    submissions: [],
  };
}
