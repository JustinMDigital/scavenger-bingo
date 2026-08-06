import { env, exports as workerExports } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { GAME_KITS } from "../src/gameKits";
import { TASK_CATALOG } from "../src/taskCatalog";
import { createStarterRoom, createStarterTasks, upgradeRoom } from "./model";

const ORIGIN = "https://example.com";
const PUBLIC_APP_ORIGIN = "https://playrallyhunt.com";
const HOST_COOKIE = "scavenger_session=host-session-00000000000001";
const PLAYER_COOKIE = "scavenger_session=player-session-000000000001";
const OTHER_COOKIE = "scavenger_session=other-session-0000000000001";
const VALID_PNG_BYTES = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  ),
  (character) => character.charCodeAt(0),
);

describe("Cloudflare game room", () => {
  it("reports a narrow unauthenticated health signal", async () => {
    const response = await workerFetch(`${ORIGIN}/api/health`);
    const body = await response.json<{
      ok: boolean;
      backend: string;
      deployment: null | { id: string; tag: string; timestamp: string };
    }>();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      backend: "cloudflare-durable-objects",
    });
    if (body.deployment) {
      expect(body.deployment).toEqual({
        id: expect.any(String),
        tag: expect.any(String),
        timestamp: expect.any(String),
      });
    }
  });

  it("upgrades legacy fixed rooms without losing their existing data", () => {
    const legacyRoom = createStarterRoom({
      code: "LEGACY",
      pinSalt: "salt",
      pinHash: "hash",
      now: 1_700_000_000_000,
    });
    const legacyRecord = legacyRoom as unknown as Record<string, unknown>;
    const legacyGame = legacyRoom.game as unknown as Record<string, unknown>;
    legacyRoom.tasks = createStarterTasks();
    legacyRecord.version = 1;
    delete legacyRecord.revision;
    for (const key of [
      "setupComplete", "playMode", "winCondition", "boardSize", "boardMode",
      "freeSpace", "proofMode", "approvalMode", "playerExportMode", "timerMode",
      "timerDurationMinutes", "lobbyOpen", "teamsLocked",
    ]) delete legacyGame[key];
    legacyRoom.memberships.push({
      id: "legacy-host",
      gameId: legacyRoom.game.id,
      userId: "legacy-session",
      role: "host",
      groupId: null,
      displayName: "Original Host",
      createdAt: legacyRoom.createdAt,
    });

    const upgraded = upgradeRoom(legacyRecord);
    expect(upgraded.version).toBe(2);
    expect(upgraded.revision).toBe(0);
    expect(upgraded.game.setupComplete).toBe(true);
    expect(upgraded.game.playMode).toBe("teams");
    expect(upgraded.game.winCondition).toBe("blackout");
    expect(upgraded.game.boardSize).toBe(5);
    expect(upgraded.game.playerExportMode).toBe("host-only");
    expect(upgraded.tasks).toHaveLength(42);
    expect(upgraded.memberships[0].isOwner).toBe(true);
  });

  it("runs a complete host, player, proof, and moderation flow", async () => {
    const host = await postJson("/api/games/CF-TEST/host", HOST_COOKIE, {
      pin: "24682468",
      displayName: "Taylor Host",
    });
    expect(host.status).toBe(200);

    const hostStateResponse = await get("/api/games/CF-TEST", HOST_COOKIE);
    expect(hostStateResponse.status).toBe(200);
    const hostState = await hostStateResponse.json<GameState>();
    expect(hostState.membership?.role).toBe("host");
    expect(hostState.membership).not.toHaveProperty("userId");
    expect(hostState.game.setupComplete).toBe(false);
    expect(hostState.groups).toHaveLength(0);
    expect(hostState.boardAssignments).toHaveLength(0);
    expect(hostState.stops).toHaveLength(0);
    expect(hostState.game.timerMode).toBe("none");
    expect(hostState.game.playerExportMode).toBe("host-only");
    expect(hostState.tasks.filter((task) => task.id !== "free")).toHaveLength(0);

    const configured = await postJson("/api/games/CF-TEST/actions", HOST_COOKIE, {
      action: "configureGame",
      payload: { gameId: hostState.game.id, template: "classic", startTime: "2:00 PM" },
    });
    expect(configured.status).toBe(200);

    const configuredState = await (
      await get("/api/games/CF-TEST", HOST_COOKIE)
    ).json<GameState>();
    expect(configuredState.groups).toHaveLength(3);
    expect(configuredState.tasks).toHaveLength(42);
    expect(configuredState.boardAssignments).toHaveLength(75);
    expect(configuredState.stops).toHaveLength(3);
    expect(configuredState.stops[0].arriveTime).toBe("2:00 PM");
    expect(configuredState.game.boardHidden).toBe(true);
    expect(configuredState.game.playerExportMode).toBe("host-only");

    const enablePlayerRecaps = await postJson(
      "/api/games/CF-TEST/actions",
      HOST_COOKIE,
      {
        action: "configureGame",
        payload: {
          gameId: configuredState.game.id,
          config: { playerExportMode: "team-after-review" },
        },
      },
    );
    expect(enablePlayerRecaps.status).toBe(200);
    expect(
      (
        await (
          await get("/api/games/CF-TEST", HOST_COOKIE)
        ).json<GameState>()
      ).game.playerExportMode,
    ).toBe("team-after-review");

    const wrongPin = await postJson("/api/games/CF-TEST/host", OTHER_COOKIE, {
      pin: "9999",
      displayName: "Not Host",
    });
    expect(wrongPin.status).toBe(403);

    const publicStateResponse = await get("/api/games/CF-TEST", PLAYER_COOKIE);
    const publicState = await publicStateResponse.json<GameState>();
    expect(publicState.membership).toBeNull();
    expect(publicState.roster).toEqual([]);
    expect(publicState.submissions).toEqual([]);
    expect(publicState.boardAssignments).toEqual([]);

    const playerJoin = await postJson("/api/games/CF-TEST/join", PLAYER_COOKIE, {
      gameId: configuredState.game.id,
      groupId: "team-1",
      displayName: "Jordan Player",
    });
    expect(playerJoin.status).toBe(200);
    const playerJoinBody = await playerJoin.json<{ data: { id: string } }>();
    expect(playerJoinBody.data).not.toHaveProperty("userId");

    const otherJoin = await postJson("/api/games/CF-TEST/join", OTHER_COOKIE, {
      gameId: configuredState.game.id,
      groupId: "team-2",
      displayName: "Morgan Player",
    });
    expect(otherJoin.status).toBe(200);

    const hiddenPlayerState = await (
      await get("/api/games/CF-TEST", PLAYER_COOKIE)
    ).json<GameState>();
    expect(hiddenPlayerState.tasks).toEqual([]);
    expect(hiddenPlayerState.boardAssignments).toEqual([]);
    expect(hiddenPlayerState.roster.map((member) => member.displayName)).toEqual([
      "Jordan Player",
    ]);

    const unhide = await postJson("/api/games/CF-TEST/actions", HOST_COOKIE, {
      action: "updateGame",
      payload: { gameId: configuredState.game.id, patch: { boardHidden: false } },
    });
    expect(unhide.status).toBe(200);

    const boardUpdate = await postJson("/api/games/CF-TEST/actions", HOST_COOKIE, {
      action: "setGroupBoardTasks",
      payload: {
        gameId: configuredState.game.id,
        groupId: "team-1",
        taskIds: [
          configuredState.tasks[0].id,
          null,
          configuredState.tasks[1].id,
        ],
      },
    });
    expect(boardUpdate.status).toBe(200);

    const updatedHostState = await (
      await get("/api/games/CF-TEST", HOST_COOKIE)
    ).json<GameState>();
    const teamOneAssignments = updatedHostState.boardAssignments.filter(
      (item) => item.groupId === "team-1",
    );
    expect(teamOneAssignments.map((item) => item.slotOrder)).toEqual([1, 3]);

    const assignedTask = updatedHostState.boardAssignments.find(
      (item) => item.groupId === "team-1" && item.slotOrder === 1,
    );
    expect(assignedTask).toBeDefined();

    const unauthorizedOversizedProof = await SELF_FETCH(
      `${ORIGIN}/api/games/CF-TEST/proofs`,
      {
        method: "POST",
        headers: {
          ...proofHeaders(assignedTask!.taskId),
          cookie: OTHER_COOKIE,
        },
        body: new Uint8Array(500 * 1024 + 1),
      },
    );
    expect(unauthorizedOversizedProof.status).toBe(403);

    const oversizedProof = await SELF_FETCH(`${ORIGIN}/api/games/CF-TEST/proofs`, {
      method: "POST",
      headers: proofHeaders(assignedTask!.taskId),
      body: new Uint8Array(500 * 1024 + 1),
    });
    expect(oversizedProof.status).toBe(413);

    const invalidProof = await SELF_FETCH(`${ORIGIN}/api/games/CF-TEST/proofs`, {
      method: "POST",
      headers: proofHeaders(assignedTask!.taskId),
      body: new TextEncoder().encode("<html>not an image</html>"),
    });
    expect(invalidProof.status).toBe(415);

    const mismatchedProof = await SELF_FETCH(
      `${ORIGIN}/api/games/CF-TEST/proofs`,
      {
        method: "POST",
        headers: proofHeaders(assignedTask!.taskId),
        body: VALID_PNG_BYTES,
      },
    );
    expect(mismatchedProof.status).toBe(415);

    const extremeDimensionPng = VALID_PNG_BYTES.slice();
    new DataView(extremeDimensionPng.buffer).setUint32(16, 8_193);
    const extremeDimensionProof = await SELF_FETCH(
      `${ORIGIN}/api/games/CF-TEST/proofs`,
      {
        method: "POST",
        headers: {
          ...proofHeaders(assignedTask!.taskId),
          "content-type": "image/png",
        },
        body: extremeDimensionPng,
      },
    );
    expect(extremeDimensionProof.status).toBe(413);

    const proof = await SELF_FETCH(`${ORIGIN}/api/games/CF-TEST/proofs`, {
      method: "POST",
      headers: {
        ...proofHeaders(assignedTask!.taskId),
        "content-type": "image/png",
        "x-file-name": "misleading-name.jpg",
      },
      body: VALID_PNG_BYTES,
    });
    expect(proof.status).toBe(200);
    const proofBody = await proof.json<{ data: { id: string; status: string } }>();
    expect(proofBody.data.status).toBe("pending");
    expect((await postJson("/api/games/CF-TEST/actions", HOST_COOKIE, {
      action: "shuffleBoards",
      payload: { gameId: configuredState.game.id },
    })).status).toBe(409);
    expect((await postJson("/api/games/CF-TEST/actions", HOST_COOKIE, {
      action: "removeTask",
      payload: {
        gameId: configuredState.game.id,
        taskId: assignedTask!.taskId,
      },
    })).status).toBe(409);

    const forbiddenProof = await get(
      `/api/games/CF-TEST/proofs/${proofBody.data.id}`,
      OTHER_COOKIE,
    );
    expect(forbiddenProof.status).toBe(403);

    const hostProof = await get(
      `/api/games/CF-TEST/proofs/${proofBody.data.id}`,
      HOST_COOKIE,
    );
    expect(hostProof.status).toBe(200);
    expect(hostProof.headers.get("content-type")).toBe("image/png");
    expect(hostProof.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(hostProof.headers.get("pragma")).toBe("no-cache");
    expect(hostProof.headers.get("content-disposition")).toContain(
      'filename="misleading-name.png"',
    );

    const approve = await postJson("/api/games/CF-TEST/actions", HOST_COOKIE, {
      action: "updateSubmissionStatus",
      payload: { submissionId: proofBody.data.id, status: "approved" },
    });
    expect(approve.status).toBe(200);

    const playerState = await (
      await get("/api/games/CF-TEST", PLAYER_COOKIE)
    ).json<GameState>();
    expect(playerState.membership?.role).toBe("player");
    expect(playerState.membership).not.toHaveProperty("userId");
    expect(playerState.submissions).toHaveLength(1);
    expect(playerState.submissions[0].status).toBe("approved");
    expect(playerState.submissions[0].submittedBy).toBe(playerJoinBody.data.id);
    expect(playerState.submissions[0].submittedBy).not.toContain("session");
    expect(
      new Set(playerState.boardAssignments.map((item) => item.groupId)),
    ).toEqual(new Set(["team-1"]));

    const markSubmitted = await postJson(
      "/api/games/CF-TEST/actions",
      HOST_COOKIE,
      {
        action: "updateSubmissionStatus",
        payload: { submissionId: proofBody.data.id, status: "pending" },
      },
    );
    expect(markSubmitted.status).toBe(200);

    const submittedPlayerState = await (
      await get("/api/games/CF-TEST", PLAYER_COOKIE)
    ).json<GameState>();
    expect(submittedPlayerState.submissions[0].status).toBe("pending");

    const otherState = await (
      await get("/api/games/CF-TEST", OTHER_COOKIE)
    ).json<GameState>();
    expect(otherState.submissions).toEqual([]);

    const unsafeReset = await postJson(
      "/api/games/CF-TEST/actions",
      HOST_COOKIE,
      {
        action: "resetGameProofs",
        payload: {
          gameId: configuredState.game.id,
          patch: { name: "Unsupported reset change" },
        },
      },
    );
    expect(unsafeReset.status).toBe(400);
    expect(
      (
        await (
          await get("/api/games/CF-TEST", HOST_COOKIE)
        ).json<GameState>()
      ).submissions,
    ).toHaveLength(1);
    expect(
      await get(
        `/api/games/CF-TEST/proofs/${proofBody.data.id}`,
        HOST_COOKIE,
      ),
    ).toHaveProperty("status", 200);

    const reset = await postJson(
      "/api/games/CF-TEST/actions",
      HOST_COOKIE,
      {
        action: "resetGameProofs",
        payload: {
          gameId: configuredState.game.id,
          patch: {
            activeStopId: null,
            phase: "play",
            timerRunning: false,
            timerStartedAt: "2026-07-27T12:00:00.000Z",
            timerSecondsTotal: 0,
            boardHidden: true,
          },
        },
      },
    );
    expect(reset.status).toBe(200);
    expect(await reset.json()).toEqual({
      data: { deletedImages: 1, deletedSubmissions: 1 },
    });
    const resetState = await (
      await get("/api/games/CF-TEST", HOST_COOKIE)
    ).json<GameState>();
    expect(resetState.revision).toBe(otherState.revision + 1);
    expect(resetState.submissions).toEqual([]);
    expect(resetState.game).toMatchObject({
      activeStopId: null,
      phase: "play",
      timerRunning: false,
      timerStartedAt: "2026-07-27T12:00:00.000Z",
      timerSecondsTotal: 0,
      boardHidden: true,
    });

    const deletion = await postJson("/api/games/CF-TEST/actions", HOST_COOKIE, {
      action: "deletePlayerData",
      payload: { membershipId: playerJoinBody.data.id },
    });
    expect(deletion.status).toBe(200);
    expect(await get(`/api/games/CF-TEST/proofs/${proofBody.data.id}`, HOST_COOKIE))
      .toHaveProperty("status", 404);
    const deletedPlayerState = await (
      await get("/api/games/CF-TEST", PLAYER_COOKIE)
    ).json<GameState>();
    expect(deletedPlayerState.membership).toBeNull();
    expect(deletedPlayerState.submissions).toEqual([]);

    const crossSiteAction = await SELF_FETCH(
      `${ORIGIN}/api/games/CF-TEST/actions`,
      {
        method: "POST",
        headers: {
          cookie: HOST_COOKIE,
          origin: "https://attacker.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "updateGame",
          payload: { gameId: configuredState.game.id, patch: { boardHidden: true } },
        }),
      },
    );
    expect(crossSiteAction.status).toBe(403);

    const trustedProxyOrigin = await SELF_FETCH(
      `${ORIGIN}/api/games/NO-SUCH-ROOM/actions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: PUBLIC_APP_ORIGIN,
        },
        body: JSON.stringify({
          action: "updateGame",
          payload: {},
        }),
      },
    );
    expect(trustedProxyOrigin.status).toBe(404);

    function proofHeaders(taskId: string) {
      return {
        cookie: PLAYER_COOKIE,
        origin: ORIGIN,
        "content-type": "image/jpeg",
        "x-file-name": "group-selfie.jpg",
        "x-game-id": configuredState.game.id,
        "x-group-id": "team-1",
        "x-task-id": taskId,
      };
    }
  });

  it("supports free-for-all boards, automatic completion, and lobby controls", async () => {
    const hostCookie = "scavenger_session=ffa-host-session-000000000001";
    const firstPlayerCookie = "scavenger_session=ffa-player-session-000000001";
    const secondPlayerCookie = "scavenger_session=ffa-player-session-000000002";
    const latePlayerCookie = "scavenger_session=ffa-player-session-000000003";

    expect((await postJson("/api/games/FFA-TEST/host", hostCookie, {
      pin: "24682468",
      displayName: "Primary Host",
    })).status).toBe(200);
    const initial = await (await get("/api/games/FFA-TEST", hostCookie)).json<GameState>();

    expect((await postJson("/api/games/FFA-TEST/actions", hostCookie, {
      action: "configureGame",
      payload: { gameId: initial.game.id, template: "free-for-all" },
    })).status).toBe(200);

    const firstJoin = await postJson("/api/games/FFA-TEST/join", firstPlayerCookie, {
      gameId: initial.game.id,
      displayName: "Alex",
    });
    expect(firstJoin.status).toBe(200);
    const firstMembership = await firstJoin.json<{ data: { id: string; groupId: string } }>();
    expect(firstMembership.data.groupId).toBe(firstMembership.data.id);

    const secondJoin = await postJson("/api/games/FFA-TEST/join", secondPlayerCookie, {
      gameId: initial.game.id,
      displayName: "Blair",
    });
    expect(secondJoin.status).toBe(200);

    const hostState = await (await get("/api/games/FFA-TEST", hostCookie)).json<GameState>();
    expect(hostState.game.playMode).toBe("individual");
    expect(hostState.game.boardSize).toBe(4);
    expect(hostState.groups).toEqual([]);
    expect(hostState.boardAssignments).toHaveLength(32);
    expect(new Set(hostState.boardAssignments.map((item) => item.groupId)).size).toBe(2);

    expect((await postJson("/api/games/FFA-TEST/actions", hostCookie, {
      action: "updateGame",
      payload: { gameId: initial.game.id, patch: { boardHidden: false, lobbyOpen: false } },
    })).status).toBe(200);

    const firstState = await (await get("/api/games/FFA-TEST", firstPlayerCookie)).json<GameState>();
    const firstTask = firstState.boardAssignments.find(
      (item) => item.groupId === firstMembership.data.id,
    );
    expect(firstTask).toBeDefined();
    expect((await postJson("/api/games/FFA-TEST/actions", firstPlayerCookie, {
      action: "completeTask",
      payload: { gameId: initial.game.id, taskId: firstTask!.taskId },
    })).status).toBe(200);
    const completedState = await (await get("/api/games/FFA-TEST", firstPlayerCookie)).json<GameState>();
    expect(completedState.submissions).toHaveLength(1);
    expect(completedState.submissions[0].status).toBe("approved");
    expect(completedState.submissions[0].imagePath).toBe("");

    const lateJoin = await postJson("/api/games/FFA-TEST/join", latePlayerCookie, {
      gameId: initial.game.id,
      displayName: "Casey",
    });
    expect(lateJoin.status).toBe(409);
  });

  it("imports editable catalog copies and atomically shuffles room boards", async () => {
    const hostCookie = "scavenger_session=catalog-host-session-000000001";
    expect((await postJson("/api/games/CATALOG-TEST/host", hostCookie, {
      pin: "24682468",
      displayName: "Catalog Host",
    })).status).toBe(200);
    const initial = await (
      await get("/api/games/CATALOG-TEST", hostCookie)
    ).json<GameState>();

    expect((await postJson("/api/games/CATALOG-TEST/actions", hostCookie, {
      action: "configureGame",
      payload: { gameId: initial.game.id, template: "custom" },
    })).status).toBe(200);
    for (const name of ["Alpha", "Bravo"]) {
      expect((await postJson("/api/games/CATALOG-TEST/actions", hostCookie, {
        action: "addGroup",
        payload: { gameId: initial.game.id, name },
      })).status).toBe(200);
    }
    expect((await postJson("/api/games/CATALOG-TEST/actions", hostCookie, {
      action: "updateBoardSetup",
      payload: {
        gameId: initial.game.id,
        boardSize: 3,
        boardMode: "randomized",
        freeSpace: true,
      },
    })).status).toBe(200);

    expect((await postJson("/api/games/CATALOG-TEST/actions", hostCookie, {
      action: "addTask",
      payload: {
        gameId: initial.game.id,
        slug: "custom-welcome",
        title: "Custom Welcome",
        description: "Wave hello to the group.",
        icon: "Users",
        isFree: false,
        sortOrder: 2,
      },
    })).status).toBe(200);

    for (const catalogTask of TASK_CATALOG.slice(0, 8)) {
      expect((await postJson("/api/games/CATALOG-TEST/actions", hostCookie, {
        action: "addCatalogTask",
        payload: { gameId: initial.game.id, catalogTaskId: catalogTask.id },
      })).status, catalogTask.id).toBe(200);
    }
    expect((await postJson("/api/games/CATALOG-TEST/actions", hostCookie, {
      action: "addCatalogTask",
      payload: { gameId: initial.game.id, catalogTaskId: TASK_CATALOG[0].id },
    })).status).toBe(409);

    let state = await (
      await get("/api/games/CATALOG-TEST", hostCookie)
    ).json<GameState>();
    expect(state.tasks.filter((task) => task.id !== "free")).toHaveLength(9);
    expect(state.game.boardsNeedShuffle).toBe(true);

    expect((await postJson("/api/games/CATALOG-TEST/actions", hostCookie, {
      action: "shuffleBoards",
      payload: { gameId: initial.game.id },
    })).status).toBe(200);
    state = await (
      await get("/api/games/CATALOG-TEST", hostCookie)
    ).json<GameState>();
    expect(state.boardAssignments).toHaveLength(18);
    expect(state.game.boardsNeedShuffle).toBe(false);
    expect(
      new Set(
        state.boardAssignments
          .filter((assignment) => assignment.taskId !== "free")
          .map((assignment) => assignment.taskId),
      ).size,
    ).toBe(9);

    const imported = state.tasks.find(
      (task) => task.id === TASK_CATALOG[0].id,
    )!;
    const originalPositions = state.boardAssignments
      .filter((assignment) => assignment.taskId === imported.id)
      .map(({ groupId, slotOrder }) => ({ groupId, slotOrder }));
    expect((await postJson("/api/games/CATALOG-TEST/actions", hostCookie, {
      action: "updateTask",
      payload: {
        gameId: initial.game.id,
        taskId: imported.id,
        patch: {
          title: "Our Group Selfie",
          description: "Fit everyone into the frame.",
          icon: "Star",
        },
      },
    })).status).toBe(200);
    state = await (
      await get("/api/games/CATALOG-TEST", hostCookie)
    ).json<GameState>();
    expect(state.tasks.find((task) => task.id === imported.id)).toMatchObject({
      catalogId: imported.id,
      title: "Our Group Selfie",
      description: "Fit everyone into the frame.",
      icon: "Star",
    });
    expect(
      state.boardAssignments
        .filter((assignment) => assignment.taskId === imported.id)
        .map(({ groupId, slotOrder }) => ({ groupId, slotOrder })),
    ).toEqual(originalPositions);
    expect(TASK_CATALOG[0].title).toBe("Group Selfie");

    expect((await postJson("/api/games/CATALOG-TEST/actions", hostCookie, {
      action: "resetCatalogTask",
      payload: { gameId: initial.game.id, taskId: imported.id },
    })).status).toBe(200);
    state = await (
      await get("/api/games/CATALOG-TEST", hostCookie)
    ).json<GameState>();
    expect(state.tasks.find((task) => task.id === imported.id)).toMatchObject({
      title: TASK_CATALOG[0].title,
      description: TASK_CATALOG[0].description,
      icon: TASK_CATALOG[0].icon,
    });

    expect((await postJson("/api/games/CATALOG-TEST/actions", hostCookie, {
      action: "removeTask",
      payload: { gameId: initial.game.id, taskId: "custom-welcome" },
    })).status).toBe(200);
    expect((await postJson("/api/games/CATALOG-TEST/actions", hostCookie, {
      action: "updateBoardSetup",
      payload: {
        gameId: initial.game.id,
        boardSize: 3,
        boardMode: "shared",
        freeSpace: true,
      },
    })).status).toBe(200);
    expect((await postJson("/api/games/CATALOG-TEST/actions", hostCookie, {
      action: "addCatalogTask",
      payload: { gameId: initial.game.id, catalogTaskId: TASK_CATALOG[8].id },
    })).status).toBe(409);

    expect((await postJson("/api/games/CATALOG-TEST/actions", hostCookie, {
      action: "shuffleBoards",
      payload: { gameId: initial.game.id },
    })).status).toBe(200);
    state = await (
      await get("/api/games/CATALOG-TEST", hostCookie)
    ).json<GameState>();
    const firstBoard = state.boardAssignments.filter(
      (assignment) => assignment.groupId === state.groups[0].id,
    );
    const secondBoard = state.boardAssignments.filter(
      (assignment) => assignment.groupId === state.groups[1].id,
    );
    expect(secondBoard).toEqual(
      firstBoard.map((assignment) => ({
        ...assignment,
        groupId: state.groups[1].id,
      })),
    );

    expect((await postJson("/api/games/CATALOG-TEST/actions", hostCookie, {
      action: "removeTask",
      payload: { gameId: initial.game.id, taskId: imported.id },
    })).status).toBe(200);
    state = await (
      await get("/api/games/CATALOG-TEST", hostCookie)
    ).json<GameState>();
    expect(
      state.boardAssignments.some((assignment) => assignment.taskId === imported.id),
    ).toBe(false);
    expect(state.game.boardsNeedShuffle).toBe(true);

    expect((await postJson("/api/games/CATALOG-TEST/actions", hostCookie, {
      action: "addCatalogTask",
      payload: { gameId: initial.game.id, catalogTaskId: imported.id },
    })).status).toBe(200);
    state = await (
      await get("/api/games/CATALOG-TEST", hostCookie)
    ).json<GameState>();
    expect(state.tasks.find((task) => task.id === imported.id)).toMatchObject({
      title: TASK_CATALOG[0].title,
      description: TASK_CATALOG[0].description,
      icon: TASK_CATALOG[0].icon,
    });

    expect((await postJson("/api/games/CATALOG-TEST/actions", hostCookie, {
      action: "updateBoardSetup",
      payload: {
        gameId: initial.game.id,
        boardSize: 3,
        boardMode: "randomized",
        freeSpace: true,
      },
    })).status).toBe(200);
    expect((await postJson("/api/games/CATALOG-TEST/actions", hostCookie, {
      action: "addCatalogTask",
      payload: {
        gameId: initial.game.id,
        catalogTaskId: TASK_CATALOG[8].id,
      },
    })).status).toBe(200);
    state = await (
      await get("/api/games/CATALOG-TEST", hostCookie)
    ).json<GameState>();
    expect(state.tasks.filter((task) => task.id !== "free")).toHaveLength(9);
  });

  it("limits rapid joins from one shared network without consuming host seats", async () => {
    const hostCookie = "scavenger_session=burst-host-session-0000000001";
    expect((await postJson("/api/games/BURST-TEST/host", hostCookie, {
      pin: "24682468",
      displayName: "Burst Host",
    })).status).toBe(200);
    const initial = await (
      await get("/api/games/BURST-TEST", hostCookie)
    ).json<GameState>();
    expect((await postJson("/api/games/BURST-TEST/actions", hostCookie, {
      action: "configureGame",
      payload: { gameId: initial.game.id, template: "quick" },
    })).status).toBe(200);
    const configured = await (
      await get("/api/games/BURST-TEST", hostCookie)
    ).json<GameState>();

    for (let index = 0; index < 50; index += 1) {
      const cookie = `scavenger_session=burst-player-session-${String(index).padStart(4, "0")}`;
      const response = await workerFetch(`${ORIGIN}/api/games/BURST-TEST/join`, {
        method: "POST",
        headers: {
          cookie,
          "x-forwarded-for": "198.51.100.250",
          origin: ORIGIN,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          gameId: configured.game.id,
          groupId: configured.groups[0].id,
          displayName: `Player ${index + 1}`,
        }),
      });
      expect(response.status).toBe(200);
    }

    const limited = await workerFetch(`${ORIGIN}/api/games/BURST-TEST/join`, {
      method: "POST",
      headers: {
        cookie: "scavenger_session=burst-player-session-0050",
        "x-forwarded-for": "198.51.100.250",
        origin: ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        gameId: configured.game.id,
        groupId: configured.groups[0].id,
        displayName: "Player 51",
      }),
    });
    expect(limited.status).toBe(429);

    const hostState = await (
      await get("/api/games/BURST-TEST", hostCookie)
    ).json<GameState>();
    expect(hostState.memberships).toHaveLength(51);
  });

  it("uses separate browser and school-network room creation ceilings", async () => {
    const browserCookie = "scavenger_session=quota-browser-session-0000001";
    const networkIp = "198.51.100.240";

    for (let index = 0; index < 10; index += 1) {
      const response = await postJsonFromNetwork(
        `/api/games/QUOTA-${String(index).padStart(2, "0")}/host`,
        browserCookie,
        networkIp,
        {
          pin: "24682468",
          displayName: "Quota Host",
        },
      );
      expect(response.status).toBe(200);
    }

    const browserLimited = await postJsonFromNetwork(
      "/api/games/QUOTA-10/host",
      browserCookie,
      networkIp,
      {
        pin: "24682468",
        displayName: "Quota Host",
      },
    );
    expect(browserLimited.status).toBe(429);

    const otherBrowser = await postJsonFromNetwork(
      "/api/games/QUOTA-OTHER/host",
      "scavenger_session=quota-other-session-00000001",
      networkIp,
      {
        pin: "24682468",
        displayName: "Other Host",
      },
    );
    expect(otherBrowser.status).toBe(200);
  });

  it("supports three teachers and a full class behind one school network", async () => {
    const networkIp = "198.51.100.241";
    const roomCodes = ["SCHOOL-A", "SCHOOL-B", "SCHOOL-C"];
    const teacherCookies = roomCodes.map(
      (_, index) =>
        `scavenger_session=school-teacher-session-${String(index).padStart(8, "0")}`,
    );

    for (const [index, roomCode] of roomCodes.entries()) {
      expect((await postJsonFromNetwork(
        `/api/games/${roomCode}/host`,
        teacherCookies[index],
        networkIp,
        {
          pin: "24682468",
          displayName: `Teacher ${index + 1}`,
        },
      )).status).toBe(200);
    }

    const firstRoom = await (
      await get(`/api/games/${roomCodes[0]}`, teacherCookies[0])
    ).json<GameState>();
    expect((await postJson(
      `/api/games/${roomCodes[0]}/actions`,
      teacherCookies[0],
      {
        action: "configureGame",
        payload: { gameId: firstRoom.game.id, template: "classroom" },
      },
    )).status).toBe(200);
    const configured = await (
      await get(`/api/games/${roomCodes[0]}`, teacherCookies[0])
    ).json<GameState>();

    for (let index = 0; index < 30; index += 1) {
      const studentCookie =
        `scavenger_session=school-student-session-${String(index).padStart(8, "0")}`;
      const response = await postJsonFromNetwork(
        `/api/games/${roomCodes[0]}/join`,
        studentCookie,
        networkIp,
        {
          gameId: configured.game.id,
          groupId: configured.groups[index % configured.groups.length].id,
          displayName: `Student ${index + 1}`,
        },
      );
      expect(response.status).toBe(200);
    }

    const classState = await (
      await get(`/api/games/${roomCodes[0]}`, teacherCookies[0])
    ).json<GameState>();
    expect(classState.memberships).toHaveLength(31);
  });

  it("throttles one PIN guesser without locking out a shared school network", async () => {
    const hostCookie = "scavenger_session=pin-host-session-00000000001";
    const networkIp = "198.51.100.230";
    expect((await postJsonFromNetwork("/api/games/PIN-TEST/host", hostCookie, networkIp, {
      pin: "24682468",
      displayName: "PIN Host",
    })).status).toBe(200);

    const guesserCookie = "scavenger_session=pin-guesser-session-0000001";
    for (let index = 0; index < 5; index += 1) {
      const response = await postJsonFromNetwork(
        "/api/games/PIN-TEST/host",
        guesserCookie,
        networkIp,
        {
          pin: "00000000",
          displayName: "Guesser",
        },
      );
      expect(response.status).toBe(403);
    }
    expect((await postJsonFromNetwork(
      "/api/games/PIN-TEST/host",
      guesserCookie,
      networkIp,
      {
        pin: "00000000",
        displayName: "Guesser",
      },
    )).status).toBe(429);

    expect((await postJsonFromNetwork(
      "/api/games/PIN-TEST/host",
      "scavenger_session=pin-teacher-session-0000001",
      networkIp,
      {
        pin: "24682468",
        displayName: "Second Teacher",
      },
    )).status).toBe(200);
  });

  it("bounds JSON actions, live sockets, and member mutation bursts", async () => {
    const hostCookie = "scavenger_session=limits-host-session-000000001";
    expect((await postJson("/api/games/LIMITS-TEST/host", hostCookie, {
      pin: "24682468",
      displayName: "Limits Host",
    })).status).toBe(200);
    const state = await (
      await get("/api/games/LIMITS-TEST", hostCookie)
    ).json<GameState>();

    const oversizedJson = await workerFetch(
      `${ORIGIN}/api/games/LIMITS-TEST/actions`,
      {
        method: "POST",
        headers: {
          cookie: hostCookie,
          "x-forwarded-for": testClientIp(hostCookie),
          origin: ORIGIN,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "updateGame",
          payload: {
            gameId: state.game.id,
            padding: "x".repeat(64 * 1024),
          },
        }),
      },
    );
    expect(oversizedJson.status).toBe(413);

    const sockets: WebSocket[] = [];
    for (let index = 0; index < 3; index += 1) {
      const response = await getWebSocket("/api/games/LIMITS-TEST/ws", hostCookie);
      expect(response.status).toBe(101);
      const socket = (response as Response & { webSocket?: WebSocket }).webSocket;
      expect(socket).toBeDefined();
      (socket as WebSocket & { accept: () => void }).accept();
      sockets.push(socket!);
    }
    expect((await getWebSocket("/api/games/LIMITS-TEST/ws", hostCookie)).status)
      .toBe(429);

    expect((await postJson("/api/games/LIMITS-TEST/actions", hostCookie, {
      action: "updateGame",
      payload: {
        gameId: state.game.id,
        patch: { lobbyOpen: true },
      },
    })).status).toBe(200);

    // The HTTP action above proves a normal mutation succeeds. Prime the
    // remaining limiter entries directly so this rate-limit test does not
    // spend several seconds rewriting the full room state 180 times.
    const roomStub = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName("LIMITS-TEST"));
    await runInDurableObject(roomStub, async (instance) => {
      const room = instance as unknown as {
        recordMutation(sessionId: string): void;
      };
      for (let index = 0; index < 179; index += 1) {
        room.recordMutation("limits-host-session-000000001");
      }
    });

    expect((await postJson("/api/games/LIMITS-TEST/actions", hostCookie, {
      action: "updateGame",
      payload: {
        gameId: state.game.id,
        patch: { lobbyOpen: true },
      },
    })).status).toBe(429);

    sockets.forEach((socket) => socket.close(1000, "Test complete"));
  });

  it("orders successful actions in room state and live update messages", async () => {
    const hostCookie = "scavenger_session=revision-host-session-0000001";
    expect((await postJson("/api/games/REVISION-TEST/host", hostCookie, {
      pin: "24682468",
      displayName: "Revision Host",
    })).status).toBe(200);
    const initial = await (
      await get("/api/games/REVISION-TEST", hostCookie)
    ).json<GameState>();
    expect(initial.revision).toBeGreaterThan(0);

    const socketResponse = await getWebSocket(
      "/api/games/REVISION-TEST/ws",
      hostCookie,
    );
    expect(socketResponse.status).toBe(101);
    const socket = (socketResponse as Response & { webSocket?: WebSocket }).webSocket!;
    (socket as WebSocket & { accept: () => void }).accept();

    const firstMessage = nextWebSocketMessage(socket);
    expect((await postJson("/api/games/REVISION-TEST/actions", hostCookie, {
      action: "updateGame",
      payload: {
        gameId: initial.game.id,
        patch: { lobbyOpen: false },
      },
    })).status).toBe(200);
    const firstUpdate = JSON.parse(await firstMessage) as {
      type: string;
      reason: string;
      revision: number;
    };
    expect(firstUpdate).toEqual({
      type: "room-change",
      reason: "change",
      revision: initial.revision + 1,
    });

    const secondMessage = nextWebSocketMessage(socket);
    expect((await postJson("/api/games/REVISION-TEST/actions", hostCookie, {
      action: "updateGame",
      payload: {
        gameId: initial.game.id,
        patch: { lobbyOpen: true },
      },
    })).status).toBe(200);
    const secondUpdate = JSON.parse(await secondMessage) as {
      revision: number;
    };
    expect(secondUpdate.revision).toBe(firstUpdate.revision + 1);

    const afterActions = await (
      await get("/api/games/REVISION-TEST", hostCookie)
    ).json<GameState>();
    expect(afterActions.revision).toBe(secondUpdate.revision);

    expect((await postJson("/api/games/REVISION-TEST/actions", hostCookie, {
      action: "notAnAction",
      payload: {},
    })).status).toBe(400);
    const afterRejectedAction = await (
      await get("/api/games/REVISION-TEST", hostCookie)
    ).json<GameState>();
    expect(afterRejectedAction.revision).toBe(afterActions.revision);

    socket.close(1000, "Test complete");
  });

  it("serializes concurrent room changes without losing either update", async () => {
    const hostCookie = "scavenger_session=concurrent-host-session-00001";
    expect((await postJson("/api/games/CONCURRENT/host", hostCookie, {
      pin: "24682468",
      displayName: "Concurrent Host",
    })).status).toBe(200);
    const initial = await (
      await get("/api/games/CONCURRENT", hostCookie)
    ).json<GameState>();

    const [rename, closeLobby] = await Promise.all([
      postJson("/api/games/CONCURRENT/actions", hostCookie, {
        action: "updateGame",
        payload: {
          gameId: initial.game.id,
          patch: { name: "Both updates survived" },
        },
      }),
      postJson("/api/games/CONCURRENT/actions", hostCookie, {
        action: "updateGame",
        payload: {
          gameId: initial.game.id,
          patch: { lobbyOpen: false },
        },
      }),
    ]);

    expect(rename.status).toBe(200);
    expect(closeLobby.status).toBe(200);
    const finalState = await (
      await get("/api/games/CONCURRENT", hostCookie)
    ).json<GameState>();
    expect(finalState.revision).toBe(initial.revision + 2);
    expect(finalState.game.name).toBe("Both updates survived");
    expect(finalState.game.lobbyOpen).toBe(false);
  });

  it("keeps player presentations host-controlled and prevents late enablement", async () => {
    const hostCookie = "scavenger_session=export-host-session-000000001";
    const playerCookie = "scavenger_session=export-player-session-0000001";
    expect((await postJson("/api/games/EXPORT-POLICY/host", hostCookie, {
      pin: "24682468",
      displayName: "Export Host",
    })).status).toBe(200);
    const initial = await (
      await get("/api/games/EXPORT-POLICY", hostCookie)
    ).json<GameState>();
    expect(initial.game.playerExportMode).toBe("host-only");

    const invalidConfiguration = await postJson(
      "/api/games/EXPORT-POLICY/actions",
      hostCookie,
      {
        action: "configureGame",
        payload: {
          gameId: initial.game.id,
          config: {
            name: "Rejected partial configuration",
            playerExportMode: "team-after-review",
            timerMode: "invalid",
          },
        },
      },
    );
    expect(invalidConfiguration.status).toBe(400);
    expect(
      await (
        await get("/api/games/EXPORT-POLICY", hostCookie)
      ).json<GameState>(),
    ).toEqual(initial);

    const invalidTemplate = await postJson(
      "/api/games/EXPORT-POLICY/actions",
      hostCookie,
      {
        action: "configureGame",
        payload: {
          gameId: initial.game.id,
          template: "not-a-real-template",
        },
      },
    );
    expect(invalidTemplate.status).toBe(400);
    expect(
      await (
        await get("/api/games/EXPORT-POLICY", hostCookie)
      ).json<GameState>(),
    ).toEqual(initial);

    expect((await postJson("/api/games/EXPORT-POLICY/actions", playerCookie, {
      action: "configureGame",
      payload: {
        gameId: initial.game.id,
        config: { playerExportMode: "team-after-review" },
      },
    })).status).toBe(403);

    expect((await postJson("/api/games/EXPORT-POLICY/actions", hostCookie, {
      action: "configureGame",
      payload: {
        gameId: initial.game.id,
        config: { playerExportMode: "team-after-review" },
      },
    })).status).toBe(200);

    expect((await postJson("/api/games/EXPORT-POLICY/actions", hostCookie, {
      action: "updateGame",
      payload: {
        gameId: initial.game.id,
        patch: { setupComplete: true },
      },
    })).status).toBe(200);
    expect((await postJson("/api/games/EXPORT-POLICY/actions", hostCookie, {
      action: "updateGame",
      payload: {
        gameId: initial.game.id,
        patch: { playerExportMode: "host-only" },
      },
    })).status).toBe(200);
    expect((await postJson("/api/games/EXPORT-POLICY/actions", hostCookie, {
      action: "updateGame",
      payload: {
        gameId: initial.game.id,
        patch: {
          name: "Rejected partial update",
          boardHidden: false,
          playerExportMode: "team-after-review",
        },
      },
    })).status).toBe(409);
    expect((await postJson("/api/games/EXPORT-POLICY/actions", hostCookie, {
      action: "updateGame",
      payload: {
        gameId: initial.game.id,
        patch: {
          setupComplete: false,
          playerExportMode: "team-after-review",
        },
      },
    })).status).toBe(409);
    expect((await postJson("/api/games/EXPORT-POLICY/actions", hostCookie, {
      action: "updateGame",
      payload: {
        gameId: initial.game.id,
        patch: { setupComplete: false },
      },
    })).status).toBe(409);
    expect((await postJson("/api/games/EXPORT-POLICY/actions", hostCookie, {
      action: "configureGame",
      payload: {
        gameId: initial.game.id,
        config: { setupComplete: false },
      },
    })).status).toBe(409);
    const afterBypassAttempt = await (
      await get("/api/games/EXPORT-POLICY", hostCookie)
    ).json<GameState>();
    expect(afterBypassAttempt.game.setupComplete).toBe(true);
    expect(afterBypassAttempt.game.playerExportMode).toBe("host-only");
    expect(afterBypassAttempt.game.name).not.toBe("Rejected partial update");
    expect(afterBypassAttempt.game.boardHidden).toBe(true);
  });

  it("deletes expired room and proof data when registry release fails", async () => {
    const code = "EXPIRY-TEST";
    const hostCookie = "scavenger_session=expiry-host-session-000000001";
    expect((await postJson(`/api/games/${code}/host`, hostCookie, {
      pin: "24682468",
      displayName: "Expiry Host",
    })).status).toBe(200);
    const socketResponse = await getWebSocket(`/api/games/${code}/ws`, hostCookie);
    expect(socketResponse.status).toBe(101);
    const socket = (socketResponse as Response & { webSocket?: WebSocket }).webSocket!;
    (socket as WebSocket & { accept: () => void }).accept();
    const expiryMessage = nextWebSocketMessage(socket);

    const roomStub = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(code));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      await runInDurableObject(roomStub, async (instance, state) => {
        await state.storage.put(
          "proof:private-expiry-test",
          Uint8Array.from([1, 2, 3]).buffer,
        );
        Object.defineProperty(instance, "releaseRegistry", {
          configurable: true,
          value: async () => {
            throw new Error("Simulated registry failure with private details");
          },
        });

        await instance.alarm();

        expect(await state.storage.list()).toHaveProperty("size", 0);
        expect(
          await instance.fetch(
            new Request("https://room.internal/internal/exists"),
          ),
        ).toHaveProperty("status", 404);
      });

      const expiryWarnings = warning.mock.calls.filter(
        ([message]) => message === "Rally Hunt operational event",
      );
      expect(expiryWarnings).toContainEqual([
        "Rally Hunt operational event",
        {
          event: "room_expiry_registry_release_failed",
          localCleanupContinued: true,
        },
      ]);
      expect(JSON.stringify(expiryWarnings)).not.toContain(code);
      expect(JSON.stringify(expiryWarnings)).not.toContain("private-expiry-test");
      expect(JSON.parse(await expiryMessage)).toEqual({
        type: "room-change",
        reason: "expired",
      });
      expect((await get(`/api/games/${code}`, hostCookie)).status).toBe(404);
    } finally {
      warning.mockRestore();
    }
  });

  it("rehearses leaked-code containment, photo deletion, and room shutdown", async () => {
    const hostCookie = "scavenger_session=incident-host-session-00000001";
    const studentCookie = "scavenger_session=incident-student-session-00001";
    const lateCookie = "scavenger_session=incident-late-session-00000001";

    expect((await postJson("/api/games/INCIDENT-TEST/host", hostCookie, {
      pin: "24682468",
      displayName: "Incident Host",
    })).status).toBe(200);
    const initial = await (
      await get("/api/games/INCIDENT-TEST", hostCookie)
    ).json<GameState>();
    expect((await postJson("/api/games/INCIDENT-TEST/actions", hostCookie, {
      action: "configureGame",
      payload: { gameId: initial.game.id, template: "classic" },
    })).status).toBe(200);
    const configured = await (
      await get("/api/games/INCIDENT-TEST", hostCookie)
    ).json<GameState>();
    const groupId = configured.groups[0].id;

    const joined = await postJson(
      "/api/games/INCIDENT-TEST/join",
      studentCookie,
      {
        gameId: configured.game.id,
        groupId,
        displayName: "Student",
      },
    );
    expect(joined.status).toBe(200);
    const membership = await joined.json<{ data: { id: string } }>();
    expect((await postJson("/api/games/INCIDENT-TEST/actions", hostCookie, {
      action: "updateGame",
      payload: {
        gameId: configured.game.id,
        patch: { boardHidden: false, lobbyOpen: false },
      },
    })).status).toBe(200);

    const taskId = configured.boardAssignments.find(
      (assignment) => assignment.groupId === groupId,
    )?.taskId;
    expect(taskId).toBeDefined();
    const proof = await SELF_FETCH(`${ORIGIN}/api/games/INCIDENT-TEST/proofs`, {
      method: "POST",
      headers: {
        cookie: studentCookie,
        origin: ORIGIN,
        "content-type": "image/png",
        "x-file-name": "incident.png",
        "x-game-id": configured.game.id,
        "x-group-id": groupId,
        "x-task-id": taskId!,
      },
      body: VALID_PNG_BYTES,
    });
    expect(proof.status).toBe(200);
    const proofBody = await proof.json<{ data: { id: string } }>();

    expect((await postJson("/api/games/INCIDENT-TEST/join", lateCookie, {
      gameId: configured.game.id,
      groupId,
      displayName: "Unexpected visitor",
    })).status).toBe(409);

    expect((await postJson("/api/games/INCIDENT-TEST/actions", hostCookie, {
      action: "deletePlayerData",
      payload: { membershipId: membership.data.id },
    })).status).toBe(200);
    expect((await get(
      `/api/games/INCIDENT-TEST/proofs/${proofBody.data.id}`,
      hostCookie,
    )).status).toBe(404);

    expect((await postJson("/api/games/INCIDENT-TEST/actions", hostCookie, {
      action: "abandonGameLobby",
      payload: { gameId: configured.game.id },
    })).status).toBe(200);
    expect((await get("/api/games/INCIDENT-TEST", hostCookie)).status).toBe(404);
  });

  it("applies every curated game kit as an editable room copy", async () => {
    const hostCookie = "scavenger_session=kit-host-session-000000000001";
    expect((await postJson("/api/games/KIT-TEST/host", hostCookie, {
      pin: "24682468",
      displayName: "Template Host",
    })).status).toBe(200);
    const initial = await (await get("/api/games/KIT-TEST", hostCookie)).json<GameState>();

    for (const kit of GAME_KITS) {
      const response = await postJson("/api/games/KIT-TEST/actions", hostCookie, {
        action: "configureGame",
        payload: { gameId: initial.game.id, template: kit.id },
      });
      expect(response.status, kit.id).toBe(200);

      const state = await (await get("/api/games/KIT-TEST", hostCookie)).json<GameState>();
      expect(state.game.name).toBe(kit.gameName);
      expect(state.game.playMode).toBe(kit.playMode);
      expect(state.game.winCondition).toBe(kit.winCondition);
      expect(state.game.boardSize).toBe(kit.boardSize);
      expect(state.game.timerDurationMinutes).toBe(kit.timerDurationMinutes);
      expect(state.game.playerExportMode).toBe("host-only");
      expect(state.groups).toHaveLength(kit.teamCount);
      expect(state.tasks).toHaveLength(kit.tasks?.length ?? 42);
      expect(new Set(state.tasks.map((task) => task.id)).size).toBe(state.tasks.length);
      expect(state.boardAssignments).toHaveLength(
        kit.playMode === "teams" ? kit.teamCount * kit.boardSize * kit.boardSize : 0,
      );
    }

    const birthdayKit = GAME_KITS.find((kit) => kit.id === "birthday-party")!;
    await postJson("/api/games/KIT-TEST/actions", hostCookie, {
      action: "configureGame",
      payload: { gameId: initial.game.id, template: birthdayKit.id },
    });
    const birthdayState = await (await get("/api/games/KIT-TEST", hostCookie)).json<GameState>();
    const firstTask = birthdayState.tasks[0];
    expect((await postJson("/api/games/KIT-TEST/actions", hostCookie, {
      action: "updateTask",
      payload: {
        gameId: initial.game.id,
        taskId: firstTask.id,
        patch: { title: "Our Custom Opening Photo" },
      },
    })).status).toBe(200);
    const customized = await (await get("/api/games/KIT-TEST", hostCookie)).json<GameState>();
    expect(customized.tasks[0].title).toBe("Our Custom Opening Photo");
    expect(birthdayKit.tasks?.[0].title).toBe("Birthday Group Photo");

    await postJson("/api/games/KIT-TEST/actions", hostCookie, {
      action: "configureGame",
      payload: { gameId: initial.game.id, template: "quick" },
    });
    const reset = await (await get("/api/games/KIT-TEST", hostCookie)).json<GameState>();
    expect(reset.tasks).toHaveLength(42);
    expect(reset.tasks.some((task) => task.title === "Our Custom Opening Photo")).toBe(false);
  });

  it("creates a new room from a chosen public template", async () => {
    const hostCookie = "scavenger_session=template-create-host-00000001";
    const template = GAME_KITS.find((kit) => kit.id === "birthday-party")!;
    const response = await postJson("/api/games/TEMPLATE-START/host", hostCookie, {
      pin: "86428642",
      displayName: "Party Host",
      templateId: template.id,
    });

    expect(response.status).toBe(200);
    const state = await (
      await get("/api/games/TEMPLATE-START", hostCookie)
    ).json<GameState>();
    expect(state.game.name).toBe(template.gameName);
    expect(state.game.setupComplete).toBe(false);
    expect(state.game.boardHidden).toBe(true);
    expect(state.groups).toHaveLength(template.teamCount);
    expect(state.tasks).toHaveLength(template.tasks!.length);
    expect(state.boardAssignments).toHaveLength(
      template.teamCount * template.boardSize * template.boardSize,
    );
  });

  it("rejects invalid creation templates without leaving a room behind", async () => {
    const hostCookie = "scavenger_session=invalid-template-host-000001";
    const response = await postJson("/api/games/BAD-TEMPLATE/host", hostCookie, {
      pin: "86428642",
      displayName: "Template Host",
      templateId: "not-a-template",
    });

    expect(response.status).toBe(400);
    expect(await response.json<{ error: string }>()).toEqual({
      error: "Choose a valid game template.",
    });
    expect((await get("/api/games/BAD-TEMPLATE", hostCookie)).status).toBe(404);
    expect((await postJson("/api/games/BAD-TEMPLATE/host", hostCookie, {
      pin: "86428642",
      displayName: "Template Host",
      templateId: "quick",
    })).status).toBe(200);
  });

  it("protects a started hunt from template replacement", async () => {
    const hostCookie = "scavenger_session=started-template-host-00001";
    expect((await postJson("/api/games/LOCKED-TEMPLATE/host", hostCookie, {
      pin: "86428642",
      displayName: "Template Host",
      templateId: "quick",
    })).status).toBe(200);
    const initial = await (
      await get("/api/games/LOCKED-TEMPLATE", hostCookie)
    ).json<GameState>();

    expect((await postJson("/api/games/LOCKED-TEMPLATE/actions", hostCookie, {
      action: "updateGame",
      payload: {
        gameId: initial.game.id,
        patch: {
          setupComplete: true,
          phase: "live",
          boardHidden: false,
        },
      },
    })).status).toBe(200);

    const replace = await postJson(
      "/api/games/LOCKED-TEMPLATE/actions",
      hostCookie,
      {
        action: "configureGame",
        payload: { gameId: initial.game.id, template: "birthday-party" },
      },
    );
    expect(replace.status).toBe(409);
    expect(await replace.json<{ error: string }>()).toEqual({
      error: "Start a new room to use a different template after the hunt begins.",
    });

    const protectedState = await (
      await get("/api/games/LOCKED-TEMPLATE", hostCookie)
    ).json<GameState>();
    expect(protectedState.game.name).toBe("Quick Bingo");
    expect(protectedState.game.setupComplete).toBe(true);
    expect(protectedState.game.phase).toBe("live");
  });

  it("renames and removes empty teams and manages co-host ownership", async () => {
    const hostCookie = "scavenger_session=manage-host-session-00000001";
    const playerCookie = "scavenger_session=manage-player-session-000001";
    expect((await postJson("/api/games/MANAGE-TEST/host", hostCookie, {
      pin: "13571357",
      displayName: "Owner",
    })).status).toBe(200);
    const initial = await (await get("/api/games/MANAGE-TEST", hostCookie)).json<GameState>();
    await postJson("/api/games/MANAGE-TEST/actions", hostCookie, {
      action: "configureGame",
      payload: { gameId: initial.game.id, template: "quick" },
    });
    const configured = await (await get("/api/games/MANAGE-TEST", hostCookie)).json<GameState>();
    const firstGroupId = configured.groups[0].id;
    const secondGroupId = configured.groups[1].id;

    expect((await postJson("/api/games/MANAGE-TEST/actions", hostCookie, {
      action: "updateGroup",
      payload: { gameId: initial.game.id, groupId: firstGroupId, patch: { name: "Editors", colorKey: "teal", sortOrder: 2 } },
    })).status).toBe(200);
    const reordered = await (await get("/api/games/MANAGE-TEST", hostCookie)).json<GameState>();
    expect(reordered.groups[1].id).toBe(firstGroupId);
    expect((await postJson("/api/games/MANAGE-TEST/actions", hostCookie, {
      action: "removeGroup",
      payload: { gameId: initial.game.id, groupId: secondGroupId },
    })).status).toBe(200);

    const join = await postJson("/api/games/MANAGE-TEST/join", playerCookie, {
      gameId: initial.game.id,
      groupId: firstGroupId,
      displayName: "Co Host",
    });
    const joined = await join.json<{ data: { id: string } }>();
    expect((await postJson("/api/games/MANAGE-TEST/actions", hostCookie, {
      action: "promotePlayer",
      payload: { membershipId: joined.data.id },
    })).status).toBe(200);
    expect((await postJson("/api/games/MANAGE-TEST/actions", hostCookie, {
      action: "transferHost",
      payload: { membershipId: joined.data.id },
    })).status).toBe(200);
    const finalState = await (await get("/api/games/MANAGE-TEST", hostCookie)).json<GameState>();
    expect(finalState.groups).toHaveLength(1);
    expect(finalState.groups[0].name).toBe("Editors");
    expect(finalState.memberships.find((item) => item.id === joined.data.id)?.isOwner).toBe(true);
  });
});

function get(path: string, cookie: string) {
  return workerFetch(`${ORIGIN}${path}`, {
    headers: { cookie, "x-forwarded-for": testClientIp(cookie) },
  });
}

function getWebSocket(path: string, cookie: string) {
  return workerFetch(`${ORIGIN}${path}`, {
    headers: {
      cookie,
      "x-forwarded-for": testClientIp(cookie),
      Upgrade: "websocket",
    },
  });
}

function nextWebSocketMessage(socket: WebSocket) {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for a live room update.")),
      2_000,
    );
    socket.addEventListener("message", (event) => {
      clearTimeout(timeout);
      resolve(String(event.data));
    }, { once: true });
  });
}

function postJson(path: string, cookie: string, body: unknown) {
  return workerFetch(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      cookie,
      "x-forwarded-for": testClientIp(cookie),
      origin: ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function postJsonFromNetwork(
  path: string,
  cookie: string,
  networkIp: string,
  body: unknown,
) {
  return workerFetch(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      cookie,
      "x-forwarded-for": networkIp,
      origin: ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function testClientIp(cookie: string) {
  let hash = 0;
  for (const character of cookie) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `198.51.100.${(hash % 200) + 1}`;
}

function workerFetch(input: string, init?: RequestInit) {
  return workerExports.default.fetch(new Request(input, init));
}

const SELF_FETCH = workerFetch;

type GameState = {
  revision: number;
  game: {
    id: string;
    name: string;
    playerExportMode: "host-only" | "team-after-review";
    phase: string;
    activeStopId: string | null;
    timerRunning: boolean;
    timerStartedAt: string;
    timerSecondsTotal: number;
    boardHidden: boolean;
    boardMode: string;
    boardsNeedShuffle: boolean;
    setupComplete: boolean;
    timerMode: string;
    timerDurationMinutes: number;
    playMode: string;
    winCondition: string;
    boardSize: number;
  };
  groups: Array<{ id: string; name: string }>;
  tasks: Array<{
    id: string;
    catalogId?: string;
    title: string;
    description: string;
    icon: string;
  }>;
  boardAssignments: Array<{ groupId: string; taskId: string; slotOrder: number }>;
  membership: { id: string; role: string } | null;
  memberships: Array<{ id: string; isOwner?: boolean }>;
  roster: unknown[];
  submissions: Array<{ status: string; imagePath: string; submittedBy: string }>;
  stops: Array<{ arriveTime: string }>;
};
