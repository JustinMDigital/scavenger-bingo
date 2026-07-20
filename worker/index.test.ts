import { exports as workerExports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createStarterRoom, upgradeRoom } from "./model";

const ORIGIN = "https://example.com";
const HOST_COOKIE = "scavenger_session=host-session-00000000000001";
const PLAYER_COOKIE = "scavenger_session=player-session-000000000001";
const OTHER_COOKIE = "scavenger_session=other-session-0000000000001";

describe("Cloudflare game room", () => {
  it("upgrades legacy fixed rooms without losing their existing data", () => {
    const legacyRoom = createStarterRoom({
      code: "LEGACY",
      pinSalt: "salt",
      pinHash: "hash",
      now: 1_700_000_000_000,
    });
    const legacyRecord = legacyRoom as unknown as Record<string, unknown>;
    const legacyGame = legacyRoom.game as unknown as Record<string, unknown>;
    legacyRecord.version = 1;
    for (const key of [
      "setupComplete", "playMode", "winCondition", "boardSize", "boardMode",
      "freeSpace", "proofMode", "approvalMode", "timerMode",
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
    expect(upgraded.game.setupComplete).toBe(true);
    expect(upgraded.game.playMode).toBe("teams");
    expect(upgraded.game.winCondition).toBe("blackout");
    expect(upgraded.game.boardSize).toBe(5);
    expect(upgraded.tasks).toHaveLength(42);
    expect(upgraded.memberships[0].isOwner).toBe(true);
  });

  it("runs a complete host, player, proof, and moderation flow", async () => {
    const host = await postJson("/api/games/CF-TEST/host", HOST_COOKIE, {
      pin: "2468",
      displayName: "Taylor Host",
    });
    expect(host.status).toBe(200);

    const hostStateResponse = await get("/api/games/CF-TEST", HOST_COOKIE);
    expect(hostStateResponse.status).toBe(200);
    const hostState = await hostStateResponse.json<GameState>();
    expect(hostState.membership?.role).toBe("host");
    expect(hostState.game.setupComplete).toBe(false);
    expect(hostState.groups).toHaveLength(0);
    expect(hostState.boardAssignments).toHaveLength(0);
    expect(hostState.stops).toHaveLength(0);
    expect(hostState.game.timerMode).toBe("none");

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

    const playerJoin = await postJson("/api/games/CF-TEST/join", PLAYER_COOKIE, {
      gameId: configuredState.game.id,
      groupId: "team-1",
      displayName: "Jordan Player",
    });
    expect(playerJoin.status).toBe(200);

    const otherJoin = await postJson("/api/games/CF-TEST/join", OTHER_COOKIE, {
      gameId: configuredState.game.id,
      groupId: "team-2",
      displayName: "Morgan Player",
    });
    expect(otherJoin.status).toBe(200);

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
        taskIds: [hostState.tasks[0].id, null, hostState.tasks[1].id],
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

    const oversizedProof = await SELF_FETCH(`${ORIGIN}/api/games/CF-TEST/proofs`, {
      method: "POST",
      headers: proofHeaders(assignedTask!.taskId),
      body: new Uint8Array(500 * 1024 + 1),
    });
    expect(oversizedProof.status).toBe(413);

    const proof = await SELF_FETCH(`${ORIGIN}/api/games/CF-TEST/proofs`, {
      method: "POST",
      headers: proofHeaders(assignedTask!.taskId),
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    });
    expect(proof.status).toBe(200);
    const proofBody = await proof.json<{ data: { id: string; status: string } }>();
    expect(proofBody.data.status).toBe("pending");

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
    expect(hostProof.headers.get("content-type")).toBe("image/jpeg");

    const approve = await postJson("/api/games/CF-TEST/actions", HOST_COOKIE, {
      action: "updateSubmissionStatus",
      payload: { submissionId: proofBody.data.id, status: "approved" },
    });
    expect(approve.status).toBe(200);

    const playerState = await (
      await get("/api/games/CF-TEST", PLAYER_COOKIE)
    ).json<GameState>();
    expect(playerState.membership?.role).toBe("player");
    expect(playerState.submissions).toHaveLength(1);
    expect(playerState.submissions[0].status).toBe("approved");

    const otherState = await (
      await get("/api/games/CF-TEST", OTHER_COOKIE)
    ).json<GameState>();
    expect(otherState.submissions).toEqual([]);

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
      pin: "2468",
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

  it("renames and removes empty teams and manages co-host ownership", async () => {
    const hostCookie = "scavenger_session=manage-host-session-00000001";
    const playerCookie = "scavenger_session=manage-player-session-000001";
    expect((await postJson("/api/games/MANAGE-TEST/host", hostCookie, {
      pin: "1357",
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
  game: { id: string; boardHidden: boolean; setupComplete: boolean; timerMode: string; playMode: string; boardSize: number };
  groups: Array<{ id: string; name: string }>;
  tasks: Array<{ id: string }>;
  boardAssignments: Array<{ groupId: string; taskId: string; slotOrder: number }>;
  membership: { role: string } | null;
  memberships: Array<{ id: string; isOwner?: boolean }>;
  roster: unknown[];
  submissions: Array<{ status: string; imagePath: string }>;
  stops: Array<{ arriveTime: string }>;
};
