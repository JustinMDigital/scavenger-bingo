import { exports as workerExports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const ORIGIN = "https://example.com";
const HOST_COOKIE = "scavenger_session=host-session-00000000000001";
const PLAYER_COOKIE = "scavenger_session=player-session-000000000001";
const OTHER_COOKIE = "scavenger_session=other-session-0000000000001";

describe("Cloudflare game room", () => {
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
    expect(hostState.groups).toHaveLength(3);
    expect(hostState.tasks).toHaveLength(42);
    expect(hostState.boardAssignments).toHaveLength(75);
    expect(hostState.game.boardHidden).toBe(true);

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
      gameId: hostState.game.id,
      groupId: "team-1",
      displayName: "Jordan Player",
    });
    expect(playerJoin.status).toBe(200);

    const otherJoin = await postJson("/api/games/CF-TEST/join", OTHER_COOKIE, {
      gameId: hostState.game.id,
      groupId: "team-2",
      displayName: "Morgan Player",
    });
    expect(otherJoin.status).toBe(200);

    const unhide = await postJson("/api/games/CF-TEST/actions", HOST_COOKIE, {
      action: "updateGame",
      payload: { gameId: hostState.game.id, patch: { boardHidden: false } },
    });
    expect(unhide.status).toBe(200);

    const boardUpdate = await postJson("/api/games/CF-TEST/actions", HOST_COOKIE, {
      action: "setGroupBoardTasks",
      payload: {
        gameId: hostState.game.id,
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
          payload: { gameId: hostState.game.id, patch: { boardHidden: true } },
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
        "x-game-id": hostState.game.id,
        "x-group-id": "team-1",
        "x-task-id": taskId,
      };
    }
  });
});

function get(path: string, cookie: string) {
  return workerFetch(`${ORIGIN}${path}`, { headers: { cookie } });
}

function postJson(path: string, cookie: string, body: unknown) {
  return workerFetch(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      cookie,
      origin: ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function workerFetch(input: string, init?: RequestInit) {
  return workerExports.default.fetch(new Request(input, init));
}

const SELF_FETCH = workerFetch;

type GameState = {
  game: { id: string; boardHidden: boolean };
  groups: unknown[];
  tasks: Array<{ id: string }>;
  boardAssignments: Array<{ groupId: string; taskId: string; slotOrder: number }>;
  membership: { role: string } | null;
  roster: unknown[];
  submissions: Array<{ status: string }>;
};
