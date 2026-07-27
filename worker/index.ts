import { DurableObject } from "cloudflare:workers";
import {
  GROUP_COLOR_KEYS,
  MAX_PLAYABLE_TASKS_PER_ROOM,
  createBoardForGroup,
  createBoards,
  createFreeSpaceTask,
  createStarterRoom,
  createStarterTasks,
  getTaskSelectionLimit,
  toPublicGroup,
  upgradeRoom,
} from "./model";
import { getGameKit } from "../src/gameKits";
import { getCatalogTask } from "../src/taskCatalog";
import type {
  BoardSize,
  HuntPhase,
  StoredBoardAssignment,
  StoredGame,
  StoredGroup,
  StoredMembership,
  StoredRoom,
  StoredStop,
  StoredSubmission,
  StoredTask,
  SubmissionStatus,
} from "./model";

const SESSION_COOKIE = "scavenger_session";
const ROOM_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const ROOM_RESERVATION_MS = 5 * 60 * 1000;
const MAX_ACTIVE_ROOMS = 100;
const MAX_ROOMS_PER_BROWSER_PER_DAY = 10;
const MAX_ROOMS_PER_NETWORK_PER_DAY = 100;
const MAX_GROUPS_PER_ROOM = 8;
const MAX_MEMBERS_PER_ROOM = 100;
const MAX_PLAYERS_PER_ROOM = 95;
const MAX_NEW_JOINS_PER_NETWORK_WINDOW = 50;
const JOIN_WINDOW_MS = 60 * 1000;
const JOIN_ATTEMPTS_KEY_PREFIX = "join-attempts:";
const MAX_STOPS_PER_ROOM = 20;
const MAX_PROOF_BYTES = 500 * 1024;
const MAX_ROOM_PROOF_BYTES = 25 * 1024 * 1024;
const MAX_JSON_BYTES = 64 * 1024;
const MAX_IMAGE_DIMENSION = 8192;
const MAX_IMAGE_PIXELS = 20_000_000;
const MAX_SOCKETS_PER_MEMBERSHIP = 3;
const MAX_SOCKETS_PER_ROOM = 200;
const MAX_MUTATIONS_PER_MEMBERSHIP_WINDOW = 180;
const MUTATION_WINDOW_MS = 60 * 1000;
const MAX_HOST_ATTEMPTS = 5;
const HOST_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const HOST_ATTEMPTS_KEY_PREFIX = "host-attempts:";
const ROOM_KEY = "room";
const PUBLIC_APP_ORIGIN = "https://hunt.justinmdigital.com";

export interface Env {
  ASSETS: Fetcher;
  GAME_ROOMS: DurableObjectNamespace<GameRoom>;
  ROOM_REGISTRY: DurableObjectNamespace<RoomRegistry>;
}

type RegistryRoom = {
  expiresAt: number;
  reservationId: string;
  confirmed: boolean;
};

type RegistryState = {
  rooms: Record<string, number | RegistryRoom>;
  browserCreations?: Record<string, { day: string; count: number }>;
  networkCreations?: Record<string, { day: string; count: number }>;
  clientCreations?: Record<string, { day: string; count: number }>;
};

type ActionRequest = {
  action: string;
  payload?: Record<string, unknown>;
};

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true, backend: "cloudflare-durable-objects" });
    }

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    const match = url.pathname.match(
      /^\/api\/games\/([A-Za-z0-9-]{3,24})(\/.*)?$/,
    );

    if (!match) {
      return json({ error: "API route not found." }, 404);
    }

    if (!isSameOriginMutation(request)) {
      return json({ error: "Cross-site request rejected." }, 403);
    }

    const code = normalizeGameCode(match[1]);
    const session = readSession(request);
    const sessionId = session ?? crypto.randomUUID();
    const networkKey = await getNetworkKey(request);
    const browserKey = await hashKey(sessionId);
    const headers = new Headers(request.headers);
    headers.set("x-scavenger-session", sessionId);
    headers.set("x-scavenger-network", networkKey);
    headers.set("x-scavenger-browser", browserKey);
    headers.set("x-scavenger-room-code", code);
    headers.set("x-scavenger-public-origin", getPublicOrigin(request));
    headers.delete("cookie");

    const roomId = env.GAME_ROOMS.idFromName(code);
    const room = env.GAME_ROOMS.get(roomId);

    if (request.method === "POST" && match[2] === "/host") {
      const existsResponse = await room.fetch("https://room.internal/internal/exists");
      const exists = existsResponse.status === 204;

      if (!exists) {
        const registry = env.ROOM_REGISTRY.get(
          env.ROOM_REGISTRY.idFromName("global"),
        );
        const reserveResponse = await registry.fetch("https://registry.internal/reserve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            code,
            browserKey,
            networkKey,
            reservationId: sessionId,
            now: Date.now(),
          }),
        });

        if (!reserveResponse.ok) {
          return addSessionCookie(reserveResponse, sessionId, url);
        }

        headers.set("x-scavenger-allow-create", "1");
      }
    }

    const forwarded = new Request(request, { headers });
    const response = await room.fetch(forwarded);
    return addSessionCookie(response, sessionId, url);
  },
} satisfies ExportedHandler<Env>;

export class RoomRegistry extends DurableObject<Env> {
  private registry: RegistryState | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.registry =
        (await ctx.storage.get<RegistryState>("registry")) ??
        { rooms: {}, browserCreations: {}, networkCreations: {} };
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const registry = this.requireRegistry();

    if (request.method === "POST" && url.pathname === "/reserve") {
      const body = await readJson<{
        code?: string;
        browserKey?: string;
        networkKey?: string;
        reservationId?: string;
        now?: number;
      }>(request);
      const code = normalizeGameCode(body.code ?? "");
      const browserKey = body.browserKey?.slice(0, 128) ?? "unknown-browser";
      const networkKey = body.networkKey?.slice(0, 128) ?? "unknown-network";
      const reservationId = body.reservationId?.slice(0, 128) ?? "";
      const now = Number.isFinite(body.now) ? Number(body.now) : Date.now();

      for (const [roomCode, value] of Object.entries(registry.rooms)) {
        if (registryRoom(value).expiresAt <= now) delete registry.rooms[roomCode];
      }

      const existingRoom = registry.rooms[code];
      if (existingRoom) {
        const existing = registryRoom(existingRoom);
        if (!existing.confirmed && existing.reservationId === reservationId) {
          return json({ ok: true, alreadyReserved: true });
        }
        return json({ error: "That room code was just claimed. Choose another code." }, 409);
      }

      if (Object.keys(registry.rooms).length >= MAX_ACTIVE_ROOMS) {
        warnOperationalEvent("active_room_limit", {
          activeRooms: Object.keys(registry.rooms).length,
        });
        return json(
          { error: "The free public beta is at its active-room limit. Try again later." },
          429,
        );
      }

      const day = new Date(now).toISOString().slice(0, 10);
      registry.browserCreations ??= {};
      registry.networkCreations ??= {};
      clearOldDailyCounters(registry.browserCreations, day);
      clearOldDailyCounters(registry.networkCreations, day);
      const browserCount =
        registry.browserCreations[browserKey]?.day === day
          ? registry.browserCreations[browserKey].count
          : 0;
      const networkCount =
        registry.networkCreations[networkKey]?.day === day
          ? registry.networkCreations[networkKey].count
          : 0;

      if (browserCount >= MAX_ROOMS_PER_BROWSER_PER_DAY) {
        warnOperationalEvent("browser_room_creation_limit", {
          dailyCreations: browserCount,
        });
        return json(
          { error: "This browser has reached today's room-creation limit." },
          429,
        );
      }
      if (networkCount >= MAX_ROOMS_PER_NETWORK_PER_DAY) {
        warnOperationalEvent("network_room_creation_limit", {
          dailyCreations: networkCount,
        });
        return json(
          { error: "This network has reached today's safety limit. Contact support if this is a school event." },
          429,
        );
      }

      registry.rooms[code] = {
        expiresAt: now + ROOM_RESERVATION_MS,
        reservationId,
        confirmed: false,
      };
      registry.browserCreations[browserKey] = { day, count: browserCount + 1 };
      registry.networkCreations[networkKey] = { day, count: networkCount + 1 };
      await this.ctx.storage.put("registry", registry);
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/confirm") {
      const body = await readJson<{
        code?: string;
        reservationId?: string;
        expiresAt?: number;
      }>(request);
      const code = normalizeGameCode(body.code ?? "");
      const existing = registry.rooms[code];
      if (!existing) {
        throw new HttpError(409, "The room reservation expired. Create the room again.");
      }
      const normalized = registryRoom(existing);
      if (
        normalized.confirmed ||
        normalized.reservationId !== body.reservationId?.slice(0, 128)
      ) {
        throw new HttpError(409, "The room reservation no longer belongs to this browser.");
      }
      registry.rooms[code] = {
        expiresAt: Number.isFinite(body.expiresAt)
          ? Number(body.expiresAt)
          : Date.now() + ROOM_LIFETIME_MS,
        reservationId: normalized.reservationId,
        confirmed: true,
      };
      await this.ctx.storage.put("registry", registry);
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/release") {
      const body = await readJson<{ code?: string; reservationId?: string }>(request);
      const code = normalizeGameCode(body.code ?? "");
      const existing = registry.rooms[code];
      if (existing) {
        const normalized = registryRoom(existing);
        if (
          !body.reservationId ||
          normalized.reservationId === body.reservationId.slice(0, 128)
        ) {
          delete registry.rooms[code];
        }
      }
      await this.ctx.storage.put("registry", registry);
      return json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/stats") {
      return json({ activeRooms: Object.keys(registry.rooms).length });
    }

    return json({ error: "Registry route not found." }, 404);
  }

  private requireRegistry() {
    if (!this.registry) throw new Error("Room registry is unavailable.");
    return this.registry;
  }
}

export class GameRoom extends DurableObject<Env> {
  private room: StoredRoom | null = null;
  private mutationAttempts = new Map<string, number[]>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const storedRoom = (await ctx.storage.get<StoredRoom>(ROOM_KEY)) ?? null;
      this.room = storedRoom ? upgradeRoom(storedRoom) : null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/internal/exists") {
        return new Response(null, { status: this.room ? 204 : 404 });
      }

      const sessionId = request.headers.get("x-scavenger-session") ?? "";
      const code = normalizeGameCode(
        request.headers.get("x-scavenger-room-code") ?? codeFromPath(url.pathname),
      );
      const publicOrigin =
        request.headers.get("x-scavenger-public-origin") ?? url.origin;

      if (request.method === "GET" && url.pathname.endsWith("/ws")) {
        return this.openWebSocket(sessionId);
      }

      if (request.method === "GET" && /\/proofs\/[^/]+$/.test(url.pathname)) {
        return await this.getProof(url.pathname.split("/").pop() ?? "", sessionId);
      }

      if (request.method === "GET") {
        return this.getGameState(sessionId, publicOrigin);
      }

      if (request.method === "POST" && url.pathname.endsWith("/host")) {
        return await this.claimHost(request, sessionId, code);
      }

      if (request.method === "POST" && url.pathname.endsWith("/join")) {
        return await this.joinGame(request, sessionId);
      }

      if (request.method === "POST" && url.pathname.endsWith("/proofs")) {
        return await this.saveProof(request, sessionId, publicOrigin);
      }

      if (request.method === "POST" && url.pathname.endsWith("/actions")) {
        return await this.performAction(request, sessionId, publicOrigin);
      }

      return json({ error: "Room route not found." }, 404);
    } catch (error) {
      if (request.headers.get("x-scavenger-allow-create") === "1" && !this.room) {
        const code = normalizeGameCode(request.headers.get("x-scavenger-room-code") ?? "");
        const reservationId = request.headers.get("x-scavenger-session") ?? undefined;
        if (code) await this.releaseRegistry(code, reservationId);
      }

      if (isHttpError(error)) {
        return json({ error: error.message }, error.status);
      }

      console.error("Unhandled game room error", error);
      return json({ error: "The room could not complete that request." }, 500);
    }
  }

  async alarm() {
    const code = this.room?.game.code;

    if (code) {
      await this.releaseRegistry(code);
    }

    this.broadcast("expired");
    for (const socket of this.ctx.getWebSockets()) {
      socket.close(1000, "Room expired");
    }
    await this.ctx.storage.deleteAll();
    this.room = null;
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message === "string" && message === "ping") {
      socket.send("pong");
    }
  }

  webSocketClose(socket: WebSocket, code: number, reason: string) {
    socket.close(code, reason);
  }

  private async claimHost(request: Request, sessionId: string, code: string) {
    const body = await readJson<{
      pin?: string;
      displayName?: string;
      templateId?: string;
    }>(request);
    const pin = body.pin?.trim() ?? "";
    const displayName = cleanName(body.displayName, "Host name");
    const isCreatingRoom = !this.room;
    const browserRateKey =
      `browser:${request.headers.get("x-scavenger-browser") || sessionId}`;
    const networkRateKey =
      `network:${request.headers.get("x-scavenger-network") || "unknown"}`;
    const minimumPinLength = isCreatingRoom ? 8 : 4;

    if (pin.length < minimumPinLength || pin.length > 32) {
      throw new HttpError(
        400,
        isCreatingRoom
          ? "New room PINs must be 8 to 32 characters."
          : "Host PIN must be 4 to 32 characters.",
      );
    }

    if (isCreatingRoom) {
      if (request.headers.get("x-scavenger-allow-create") !== "1") {
        throw new HttpError(404, `No active game found for ${code}.`);
      }

      const pinSalt = crypto.randomUUID();
      const pinHash = await hashPin(pinSalt, pin);
      const newRoom = createStarterRoom({ code, pinSalt, pinHash });
      if (body.templateId !== undefined) {
        const templateId = stringValue(body.templateId).trim().toLowerCase();
        if (!getGameKit(templateId)) {
          throw new HttpError(400, "Choose a valid game template.");
        }
        applyRoomTemplate(newRoom, templateId);
        normalizePlayerOwnership(newRoom);
        regenerateBoards(newRoom);
      }
      this.room = newRoom;
      await this.ctx.storage.setAlarm(this.room.expiresAt);
    } else {
      if (body.templateId !== undefined) {
        throw new HttpError(
          409,
          "Open the existing room before choosing a different template.",
        );
      }
      await this.checkHostRateLimit(browserRateKey, MAX_HOST_ATTEMPTS, "browser");
      await this.checkHostRateLimit(networkRateKey, 50, "network");
      const existingRoom = this.requireRoom();
      const candidateHash = await hashPin(existingRoom.pinSalt, pin);

      if (!constantTimeEqual(candidateHash, existingRoom.pinHash)) {
        await Promise.all([
          this.recordFailedHostAttempt(browserRateKey),
          this.recordFailedHostAttempt(networkRateKey),
        ]);
        throw new HttpError(403, "Invalid host PIN.");
      }

      await Promise.all([
        this.ctx.storage.delete(`${HOST_ATTEMPTS_KEY_PREFIX}${browserRateKey}`),
        this.ctx.storage.delete(`${HOST_ATTEMPTS_KEY_PREFIX}${networkRateKey}`),
      ]);
    }

    const room = this.requireRoom();
    const existing = room.memberships.find((item) => item.userId === sessionId);
    if (!existing && room.memberships.length >= MAX_MEMBERS_PER_ROOM) {
      throw new HttpError(409, "This room has reached its member limit.");
    }
    const membership: StoredMembership = existing
      ? {
          ...existing,
          role: "host",
          groupId: null,
          displayName,
          isOwner: existing.isOwner ?? !room.memberships.some((item) => item.isOwner),
        }
      : {
          id: crypto.randomUUID(),
          gameId: room.game.id,
          userId: sessionId,
          role: "host",
          groupId: null,
          displayName,
          createdAt: Date.now(),
          isOwner: isCreatingRoom || !room.memberships.some((item) => item.isOwner),
        };

    room.memberships = [
      ...room.memberships.filter((item) => item.userId !== sessionId),
      membership,
    ];
    await this.saveRoom();
    if (isCreatingRoom) {
      try {
        await this.confirmRegistry(code, sessionId, room.expiresAt);
      } catch (error) {
        await this.ctx.storage.deleteAll();
        this.room = null;
        await this.releaseRegistry(code, sessionId);
        throw error;
      }
    }
    this.broadcast();
    return json({ data: publicMembership(membership) });
  }

  private async joinGame(request: Request, sessionId: string) {
    const room = this.requireRoom();
    const body = await readJson<{
      gameId?: string;
      groupId?: string;
      displayName?: string;
    }>(request);
    requireGameId(room, body.gameId);
    const displayName = cleanName(body.displayName, "Name");

    if (!room.game.lobbyOpen) {
      throw new HttpError(409, "The host has closed this lobby.");
    }

    const existing = room.memberships.find((item) => item.userId === sessionId);
    if (existing?.role === "host") {
      throw new HttpError(409, "This browser is already hosting the room.");
    }
    const playerCount = room.memberships.filter((item) => item.role === "player").length;
    if (!existing && playerCount >= MAX_PLAYERS_PER_ROOM) {
      throw new HttpError(409, "This room has reached its player limit.");
    }

    const membershipId = existing?.id ?? crypto.randomUUID();
    let groupId: string;

    if (room.game.playMode === "individual") {
      groupId = membershipId;
    } else if (room.game.teamsLocked && existing?.groupId) {
      groupId = existing.groupId;
    } else if (room.game.teamsLocked) {
      const playerCounts = new Map(room.groups.map((group) => [group.id, 0]));
      room.memberships.forEach((item) => {
        if (item.role === "player" && item.groupId && playerCounts.has(item.groupId)) {
          playerCounts.set(item.groupId, (playerCounts.get(item.groupId) ?? 0) + 1);
        }
      });
      groupId = [...room.groups]
        .sort((first, second) =>
          (playerCounts.get(first.id) ?? 0) - (playerCounts.get(second.id) ?? 0) ||
          first.sortOrder - second.sortOrder,
        )[0]?.id ?? "";
    } else {
      groupId = body.groupId ?? existing?.groupId ?? "";
    }

    if (room.game.playMode === "teams" && !room.groups.some((item) => item.id === groupId)) {
      throw new HttpError(400, "Choose a valid team.");
    }

    if (!existing) {
      await this.recordNewJoin(
        request.headers.get("x-scavenger-network") ?? "unknown-network",
        room.game.code,
      );
    }

    const membership: StoredMembership = existing
      ? { ...existing, groupId, displayName }
      : {
          id: membershipId,
          gameId: room.game.id,
          userId: sessionId,
          role: "player",
          groupId,
          displayName,
          createdAt: Date.now(),
        };

    if (
      room.game.playMode === "individual" &&
      !room.boardAssignments.some((item) => item.groupId === membership.id)
    ) {
      room.boardAssignments.push(
        ...createBoardForGroup(
          membership.id,
          room.tasks,
          room.game.boardSize,
          room.game.boardMode,
          room.game.freeSpace,
          room.boardAssignments,
          crypto.randomUUID(),
        ),
      );
    }

    room.memberships = [
      ...room.memberships.filter((item) => item.userId !== sessionId),
      membership,
    ];
    await this.saveRoom();
    this.broadcast();
    return json({ data: publicMembership(membership) });
  }

  private async saveProof(request: Request, sessionId: string, origin: string) {
    const room = this.requireRoom();
    const membership = requirePlayer(room, sessionId);
    const gameId = request.headers.get("x-game-id") ?? "";
    const groupId = request.headers.get("x-group-id") ?? "";
    const taskId = request.headers.get("x-task-id") ?? "";
    const suppliedImageName = cleanFileName(
      decodeHeaderValue(request.headers.get("x-file-name") ?? "proof.jpg"),
    );
    const declaredContentType =
      request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    requireGameId(room, gameId);
    const ownerId = getMembershipOwnerId(room, membership);

    if (ownerId !== groupId) {
      throw new HttpError(403, "Players can only submit for their own board.");
    }
    if (room.game.boardHidden) {
      throw new HttpError(409, "The board is hidden until the host starts the hunt.");
    }

    if (room.game.proofMode === "none") {
      throw new HttpError(409, "This game does not use photo proof.");
    }

    const task = room.tasks.find((item) => item.id === taskId);
    const isAssigned = room.boardAssignments.some(
      (item) => item.groupId === groupId && item.taskId === taskId,
    );
    if (!task || !isAssigned || task.free) {
      throw new HttpError(400, "That task is not available for proof submission.");
    }
    if (!isAllowedImageType(declaredContentType)) {
      throw new HttpError(415, "Upload a JPG, PNG, or WebP proof photo.");
    }

    const bytes = await readLimitedBytes(
      request,
      MAX_PROOF_BYTES,
      "Proof photos must be 500 KB or smaller.",
    );
    if (bytes.byteLength === 0) {
      throw new HttpError(413, "Proof photos must be 500 KB or smaller.");
    }
    const image = inspectImage(bytes);
    if (image.contentType !== declaredContentType) {
      throw new HttpError(415, "The proof photo type does not match its image data.");
    }
    if (
      image.width > MAX_IMAGE_DIMENSION ||
      image.height > MAX_IMAGE_DIMENSION ||
      image.width * image.height > MAX_IMAGE_PIXELS
    ) {
      throw new HttpError(413, "Proof photos must be no larger than 8,192 pixels per side.");
    }

    const now = Date.now();
    const imageName = normalizeImageFileName(suppliedImageName, image.contentType);
    const existing = room.submissions.find(
      (item) => item.groupId === groupId && item.taskId === taskId,
    );
    const existingBytes = existing?.byteLength ?? 0;
    const roomProofBytes = room.submissions.reduce(
      (total, item) => total + (item.byteLength ?? 0),
      0,
    );
    if (roomProofBytes - existingBytes + bytes.byteLength > MAX_ROOM_PROOF_BYTES) {
      warnOperationalEvent("room_proof_storage_limit", {
        roomCode: room.game.code,
        storedBytes: roomProofBytes,
      });
      throw new HttpError(
        413,
        "This room has reached its 25 MB photo limit. Remove proofs before adding more.",
      );
    }
    const contentType = image.contentType;
    const submission: StoredSubmission = existing
      ? {
          ...existing,
          submittedBy: sessionId,
          submittedByName: membership.displayName,
          imageName,
          contentType,
          byteLength: bytes.byteLength,
          status: room.game.approvalMode === "automatic" ? "approved" : "pending",
          updatedAt: now,
        }
      : {
          id: crypto.randomUUID(),
          groupId,
          taskId,
          submittedBy: sessionId,
          submittedByName: membership.displayName,
          imagePath: "",
          imageName,
          contentType,
          byteLength: bytes.byteLength,
          status: room.game.approvalMode === "automatic" ? "approved" : "pending",
          createdAt: now,
          updatedAt: now,
        };
    submission.imagePath = `${room.game.code}/${submission.id}`;

    await this.ctx.storage.put(proofKey(submission.id), bytes);
    room.submissions = [
      submission,
      ...room.submissions.filter((item) => item.id !== submission.id),
    ];
    await this.saveRoom();
    this.broadcast();
    return json({ data: publicSubmission(submission, room, origin) });
  }

  private async getProof(submissionId: string, sessionId: string) {
    const room = this.requireRoom();
    const membership = room.memberships.find((item) => item.userId === sessionId);
    const submission = room.submissions.find((item) => item.id === submissionId);

    if (!membership || !submission) {
      throw new HttpError(404, "Proof photo not found.");
    }
    if (
      membership.role !== "host" &&
      getMembershipOwnerId(room, membership) !== submission.groupId
    ) {
      throw new HttpError(403, "This proof belongs to another team.");
    }

    const bytes = await this.ctx.storage.get<ArrayBuffer>(proofKey(submission.id));
    if (!bytes) throw new HttpError(404, "Proof photo not found.");

    return new Response(bytes, {
      headers: {
        "cache-control": "private, max-age=300",
        "content-disposition": `inline; filename="${safeHeaderValue(submission.imageName)}"`,
        "content-type": submission.contentType,
        "x-content-type-options": "nosniff",
      },
    });
  }

  private async performAction(request: Request, sessionId: string, origin: string) {
    const room = this.requireRoom();
    const body = await readJson<ActionRequest>(request);
    if (room.memberships.some((item) => item.userId === sessionId)) {
      this.recordMutation(sessionId);
    }
    const payload = body.payload ?? {};
    let data: unknown = null;

    if (body.action === "completeTask") {
      const membership = requirePlayer(room, sessionId);
      requireGameId(room, payload.gameId);
      if (room.game.boardHidden) {
        throw new HttpError(409, "The board is hidden until the host starts the game.");
      }
      if (room.game.proofMode === "required") {
        throw new HttpError(409, "This task requires photo proof.");
      }
      const ownerId = getMembershipOwnerId(room, membership);
      const taskId = stringValue(payload.taskId);
      const task = room.tasks.find((item) => item.id === taskId);
      const isAssigned = room.boardAssignments.some(
        (item) => item.groupId === ownerId && item.taskId === taskId,
      );
      if (!task || !isAssigned || task.free) {
        throw new HttpError(400, "That task is not available for completion.");
      }
      const existing = room.submissions.find(
        (item) => item.groupId === ownerId && item.taskId === taskId,
      );
      if (existing) {
        room.submissions = room.submissions.filter((item) => item.id !== existing.id);
        if (existing.imagePath) await this.ctx.storage.delete(proofKey(existing.id));
        data = null;
      } else {
        const now = Date.now();
        const submission: StoredSubmission = {
          id: crypto.randomUUID(),
          groupId: ownerId,
          taskId,
          submittedBy: sessionId,
          submittedByName: membership.displayName,
          imagePath: "",
          imageName: "",
          contentType: "",
          status: "approved",
          createdAt: now,
          updatedAt: now,
        };
        room.submissions.unshift(submission);
        data = publicSubmission(submission, room, origin);
      }
      await this.saveRoom();
      this.broadcast();
      return json({ data });
    }

    if (body.action === "leaveGame") {
      const membership = requirePlayer(room, sessionId);
      requireGameId(room, payload.gameId);
      const deleted = await deleteMembershipData(this.ctx.storage, room, membership);
      await this.saveRoom();
      this.broadcast("player-left");
      return json({ data: deleted });
    }

    requireHost(room, sessionId);

    switch (body.action) {
      case "configureGame": {
        requireGameId(room, payload.gameId);
        if (room.submissions.length > 0) {
          throw new HttpError(409, "Reset proofs before changing the game format.");
        }
        if (payload.template !== undefined) {
          if (room.game.setupComplete || room.game.phase !== "review") {
            throw new HttpError(
              409,
              "Start a new room to use a different template after the hunt begins.",
            );
          }
          applyRoomTemplate(room, stringValue(payload.template), optionalString(payload.startTime));
        }
        if (payload.config !== undefined) {
          applyGameConfiguration(room, objectValue(payload.config));
        }
        normalizePlayerOwnership(room);
        regenerateBoards(room);
        data = room.game;
        break;
      }
      case "movePlayer": {
        if (room.game.playMode === "individual") {
          throw new HttpError(409, "Free-for-all players do not belong to teams.");
        }
        const membership = requirePlayerMembership(room, stringValue(payload.membershipId));
        const groupId = stringValue(payload.groupId);
        if (!room.groups.some((item) => item.id === groupId)) {
          throw new HttpError(400, "Choose a valid team.");
        }
        membership.groupId = groupId;
        data = publicMembership(membership);
        break;
      }
      case "kickPlayer": {
        const membership = requirePlayerMembership(room, stringValue(payload.membershipId));
        data = await deleteMembershipData(this.ctx.storage, room, membership);
        break;
      }
      case "deletePlayerData": {
        const membership = requirePlayerMembership(room, stringValue(payload.membershipId));
        data = await deleteMembershipData(this.ctx.storage, room, membership);
        break;
      }
      case "promotePlayer": {
        const membership = requirePlayerMembership(room, stringValue(payload.membershipId));
        membership.role = "host";
        membership.groupId = null;
        membership.isOwner = false;
        room.boardAssignments = room.boardAssignments.filter(
          (item) => item.groupId !== membership.id,
        );
        data = publicMembership(membership);
        break;
      }
      case "removeCohost": {
        const currentHost = requireHost(room, sessionId);
        if (!currentHost.isOwner) throw new HttpError(403, "Only the primary host can remove co-hosts.");
        const membership = room.memberships.find(
          (item) => item.id === stringValue(payload.membershipId) && item.role === "host",
        );
        if (!membership || membership.isOwner) {
          throw new HttpError(400, "Choose a co-host.");
        }
        room.memberships = room.memberships.filter((item) => item.id !== membership.id);
        data = publicMembership(membership);
        break;
      }
      case "transferHost": {
        const currentHost = requireHost(room, sessionId);
        if (!currentHost.isOwner) throw new HttpError(403, "Only the primary host can transfer ownership.");
        const nextOwner = room.memberships.find(
          (item) => item.id === stringValue(payload.membershipId) && item.role === "host",
        );
        if (!nextOwner) throw new HttpError(404, "Co-host not found.");
        room.memberships.forEach((item) => {
          if (item.role === "host") item.isOwner = item.id === nextOwner.id;
        });
        data = publicMembership(nextOwner);
        break;
      }
      case "addGroup": {
        requireGameId(room, payload.gameId);
        if (room.game.playMode !== "teams") {
          throw new HttpError(409, "Free-for-all games do not use teams.");
        }
        if (room.groups.length >= MAX_GROUPS_PER_ROOM) {
          throw new HttpError(409, `Rooms can have up to ${MAX_GROUPS_PER_ROOM} teams.`);
        }
        const nextOrder = room.groups.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1;
        const desiredName = optionalString(payload.name)?.trim() || `Team ${nextOrder}`;
        const group = createGroup(room, desiredName, nextOrder);
        room.groups.push(group);
        room.boardAssignments.push(
          ...createBoardForGroup(
            group.id,
            room.tasks,
            room.game.boardSize,
            room.game.boardMode,
            room.game.freeSpace,
            room.boardAssignments,
            crypto.randomUUID(),
          ),
        );
        data = toPublicGroup(group);
        break;
      }
      case "updateGroup": {
        requireGameId(room, payload.gameId);
        const group = room.groups.find((item) => item.id === stringValue(payload.groupId));
        if (!group) throw new HttpError(404, "Team not found.");
        const patch = objectValue(payload.patch);
        if (patch.name !== undefined) {
          const name = cleanName(patch.name, "Team name").slice(0, 40);
          group.name = name;
          group.shortName = name.slice(0, 24);
        }
        if (patch.colorKey !== undefined) {
          const colorKey = stringValue(patch.colorKey);
          if (!(GROUP_COLOR_KEYS as readonly string[]).includes(colorKey)) {
            throw new HttpError(400, "Choose a valid team color.");
          }
          group.colorKey = colorKey;
        }
        if (patch.sortOrder !== undefined) {
          const desiredPosition = Math.min(
            room.groups.length,
            Math.max(1, positiveInteger(patch.sortOrder, group.sortOrder)),
          );
          const reordered = [...room.groups]
            .filter((item) => item.id !== group.id)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          reordered.splice(desiredPosition - 1, 0, group);
          reordered.forEach((item, index) => {
            item.sortOrder = index + 1;
          });
        }
        data = toPublicGroup(group);
        break;
      }
      case "removeGroup": {
        requireGameId(room, payload.gameId);
        const groupId = stringValue(payload.groupId);
        if (room.memberships.some((item) => item.role === "player" && item.groupId === groupId)) {
          throw new HttpError(409, "Move or remove this team's players first.");
        }
        if (room.submissions.some((item) => item.groupId === groupId)) {
          throw new HttpError(409, "Reset proofs before removing this team.");
        }
        if (!room.groups.some((item) => item.id === groupId)) {
          throw new HttpError(404, "Team not found.");
        }
        room.groups = room.groups.filter((item) => item.id !== groupId);
        room.boardAssignments = room.boardAssignments.filter(
          (item) => item.groupId !== groupId,
        );
        break;
      }
      case "updateSubmissionStatus": {
        const submission = room.submissions.find(
          (item) => item.id === stringValue(payload.submissionId),
        );
        const status = stringValue(payload.status) as SubmissionStatus;
        if (!submission || !["pending", "approved", "retake"].includes(status)) {
          throw new HttpError(400, "Choose a valid submission status.");
        }
        submission.status = status;
        submission.updatedAt = Date.now();
        data = publicSubmission(submission, room, origin);
        break;
      }
      case "resetGameProofs": {
        requireGameId(room, payload.gameId);
        const deletedSubmissions = room.submissions.length;
        await deleteProofs(this.ctx.storage, room.submissions);
        room.submissions = [];
        data = { deletedImages: deletedSubmissions, deletedSubmissions };
        break;
      }
      case "abandonGameLobby": {
        requireGameId(room, payload.gameId);
        const currentHost = requireHost(room, sessionId);
        if (!currentHost.isOwner) {
          throw new HttpError(403, "Only the primary host can abandon the room.");
        }
        const deletedSubmissions = room.submissions.length;
        const removedMemberships = room.memberships.length;
        const code = room.game.code;
        this.broadcast("closed");
        await this.releaseRegistry(code);
        await this.ctx.storage.deleteAll();
        this.room = null;
        return json({
          data: { deletedImages: deletedSubmissions, deletedSubmissions, removedMemberships },
        });
      }
      case "addTask": {
        requireGameId(room, payload.gameId);
        const taskLimit = getTaskSelectionLimit(room.game);
        if (room.tasks.filter((item) => !item.free).length >= taskLimit) {
          throw new HttpError(409, getTaskLimitMessage(room.game, taskLimit));
        }
        const task = createTask(payload, room.tasks);
        room.tasks.push(task);
        room.game.boardsNeedShuffle = true;
        data = task;
        break;
      }
      case "addCatalogTask": {
        requireGameId(room, payload.gameId);
        const taskLimit = getTaskSelectionLimit(room.game);
        if (room.tasks.filter((item) => !item.free).length >= taskLimit) {
          throw new HttpError(409, getTaskLimitMessage(room.game, taskLimit));
        }
        const catalogTask = getCatalogTask(stringValue(payload.catalogTaskId));
        if (!catalogTask) throw new HttpError(404, "Catalog task not found.");
        if (room.tasks.some((item) => item.id === catalogTask.id)) {
          throw new HttpError(409, "That task is already on the boards.");
        }
        const task: StoredTask = {
          id: catalogTask.id,
          catalogId: catalogTask.id,
          title: catalogTask.title,
          description: catalogTask.description,
          icon: catalogTask.icon,
          sortOrder:
            room.tasks.reduce((highest, item) => Math.max(highest, item.sortOrder), 0) + 1,
        };
        room.tasks.push(task);
        room.game.boardsNeedShuffle = true;
        data = task;
        break;
      }
      case "updateTask": {
        requireGameId(room, payload.gameId);
        const task = room.tasks.find((item) => item.id === stringValue(payload.taskId));
        if (!task) throw new HttpError(404, "Task not found.");
        applyTaskPatch(task, objectValue(payload.patch));
        data = task;
        break;
      }
      case "resetCatalogTask": {
        requireGameId(room, payload.gameId);
        const task = room.tasks.find((item) => item.id === stringValue(payload.taskId));
        const catalogTask = task?.catalogId ? getCatalogTask(task.catalogId) : null;
        if (!task || !catalogTask) {
          throw new HttpError(404, "Original catalog task not found.");
        }
        task.title = catalogTask.title;
        task.description = catalogTask.description;
        task.icon = catalogTask.icon;
        data = task;
        break;
      }
      case "removeTask": {
        requireGameId(room, payload.gameId);
        const taskId = stringValue(payload.taskId);
        if (room.submissions.some((item) => item.taskId === taskId)) {
          throw new HttpError(409, "A proof still uses that task.");
        }
        const task = room.tasks.find((item) => item.id === taskId);
        if (task?.free) throw new HttpError(409, "The free square is controlled by board setup.");
        room.boardAssignments = room.boardAssignments.filter((item) => item.taskId !== taskId);
        room.tasks = room.tasks.filter((item) => item.id !== taskId);
        room.game.boardsNeedShuffle = true;
        break;
      }
      case "updateBoardSetup": {
        requireGameId(room, payload.gameId);
        if (room.submissions.length > 0) {
          throw new HttpError(409, "Boards lock after proofs arrive.");
        }
        const boardSize = Number(payload.boardSize);
        if (![3, 4, 5].includes(boardSize)) {
          throw new HttpError(400, "Choose a valid board size.");
        }
        const boardMode = enumValue(
          payload.boardMode,
          ["shared", "randomized"] as const,
          "board style",
        );
        const freeSpace = boardSize % 2 === 1 && Boolean(payload.freeSpace);
        if (
          room.game.boardSize === boardSize &&
          room.game.boardMode === boardMode &&
          room.game.freeSpace === freeSpace
        ) {
          data = room.game;
          break;
        }
        const selectedTaskCount = room.tasks.filter((item) => !item.free).length;
        const sharedCapacity =
          boardSize * boardSize - (freeSpace ? 1 : 0);
        if (boardMode === "shared" && selectedTaskCount > sharedCapacity) {
          throw new HttpError(
            409,
            `Remove ${selectedTaskCount - sharedCapacity} tasks before using shared boards.`,
          );
        }
        room.game.boardSize = boardSize as BoardSize;
        room.game.boardMode = boardMode;
        room.game.freeSpace = freeSpace;
        room.boardAssignments = [];
        room.game.boardsNeedShuffle = true;
        data = room.game;
        break;
      }
      case "shuffleBoards": {
        requireGameId(room, payload.gameId);
        if (room.submissions.length > 0) {
          throw new HttpError(409, "Boards lock after proofs arrive.");
        }
        const playableTaskCount = room.tasks.filter((item) => !item.free).length;
        const needsFreeSquare = room.game.freeSpace && room.game.boardSize % 2 === 1;
        const requiredTaskCount =
          room.game.boardSize * room.game.boardSize - (needsFreeSquare ? 1 : 0);
        if (playableTaskCount < requiredTaskCount) {
          throw new HttpError(
            409,
            `Add ${requiredTaskCount - playableTaskCount} more tasks before shuffling.`,
          );
        }
        const owners = getBoardOwners(room);
        if (room.game.playMode === "teams" && owners.length === 0) {
          throw new HttpError(409, "Add at least one team before shuffling.");
        }
        room.boardAssignments = createBoards(
          owners,
          room.tasks,
          room.game.boardSize,
          room.game.boardMode,
          room.game.freeSpace,
          crypto.randomUUID(),
        );
        room.game.boardsNeedShuffle = false;
        data = room.boardAssignments;
        break;
      }
      case "setGroupBoardTasks": {
        requireGameId(room, payload.gameId);
        if (room.submissions.length > 0) {
          throw new HttpError(409, "Boards lock after proofs arrive.");
        }
        const groupId = stringValue(payload.groupId);
        const isValidOwner = room.game.playMode === "teams"
          ? room.groups.some((item) => item.id === groupId)
          : room.memberships.some(
              (item) => item.id === groupId && item.role === "player",
            );
        if (!isValidOwner) {
          throw new HttpError(404, "Board owner not found.");
        }
        const slots = arrayValue(payload.taskIds)
          .slice(0, room.game.boardSize * room.game.boardSize)
          .map((taskId, index) =>
            taskId === null || taskId === undefined || taskId === ""
              ? null
              : { taskId: String(taskId), slotOrder: index + 1 },
          );
        const taskIds = slots
          .filter((slot): slot is { taskId: string; slotOrder: number } => slot !== null)
          .map((slot) => slot.taskId);
        if (new Set(taskIds).size !== taskIds.length) {
          throw new HttpError(400, "Each board task must be unique.");
        }
        const validTaskIds = new Set(room.tasks.map((item) => item.id));
        if (taskIds.some((item) => !validTaskIds.has(item))) {
          throw new HttpError(400, "A board task no longer exists.");
        }
        room.boardAssignments = [
          ...room.boardAssignments.filter((item) => item.groupId !== groupId),
          ...slots
            .filter((slot): slot is { taskId: string; slotOrder: number } => slot !== null)
            .map((slot) => ({ groupId, ...slot })),
        ];
        data = room.boardAssignments.filter((item) => item.groupId === groupId);
        break;
      }
      case "updateStop": {
        const stop = room.stops.find((item) => item.id === stringValue(payload.stopId));
        if (!stop) throw new HttpError(404, "Stop not found.");
        applyStopPatch(stop, objectValue(payload.patch));
        data = stop;
        break;
      }
      case "addStop": {
        requireGameId(room, payload.gameId);
        if (room.stops.length >= MAX_STOPS_PER_ROOM) {
          throw new HttpError(409, `Rooms can have up to ${MAX_STOPS_PER_ROOM} stops.`);
        }
        const stop = createStop(payload);
        room.stops.push(stop);
        data = stop;
        break;
      }
      case "removeStop": {
        if (room.game.timerMode === "schedule" && room.stops.length <= 1) {
          throw new HttpError(409, "Scheduled games need at least one stop.");
        }
        const stopId = stringValue(payload.stopId);
        room.stops = room.stops.filter((item) => item.id !== stopId);
        if (room.game.activeStopId === stopId) room.game.activeStopId = null;
        break;
      }
      case "updateGame": {
        requireGameId(room, payload.gameId);
        applyGamePatch(room, objectValue(payload.patch));
        data = room.game;
        break;
      }
      default:
        throw new HttpError(400, "Unknown room action.");
    }

    await this.saveRoom();
    this.broadcast();
    return json({ data });
  }

  private getGameState(sessionId: string, origin: string) {
    const room = this.requireRoom();
    const membership = room.memberships.find((item) => item.userId === sessionId) ?? null;
    const isHost = membership?.role === "host";
    const isPlayer = membership?.role === "player";
    const visibleSubmissions = isHost
      ? room.submissions
      : isPlayer
        ? room.submissions.filter(
            (item) => item.groupId === getMembershipOwnerId(room, membership),
          )
        : [];
    const canSeeBoard = isHost || !room.game.boardHidden;
    const visibleRoster = isHost
      ? room.memberships
      : isPlayer
        ? room.memberships.filter((item) =>
            room.game.playMode === "individual"
              ? item.id === membership.id
              : item.role === "player" && item.groupId === membership.groupId,
          )
        : [];

    return json({
      game: room.game,
      groups: [...room.groups].sort((a, b) => a.sortOrder - b.sortOrder).map(toPublicGroup),
      tasks: canSeeBoard
        ? [...room.tasks].sort((a, b) => a.sortOrder - b.sortOrder)
        : [],
      boardAssignments: canSeeBoard
        ? [...room.boardAssignments].sort((a, b) => a.slotOrder - b.slotOrder)
        : [],
      stops: [...room.stops].sort((a, b) => a.sortOrder - b.sortOrder),
      membership: membership ? publicMembership(membership) : null,
      memberships: isHost
        ? [...room.memberships]
            .sort((a, b) => a.createdAt - b.createdAt)
            .map(publicMembership)
        : membership
          ? [publicMembership(membership)]
          : [],
      roster: visibleRoster
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((item) => ({
          id: item.id,
          gameId: item.gameId,
          role: item.role,
          groupId: item.groupId,
          displayName: item.displayName,
        })),
      submissions: visibleSubmissions.map((item) => publicSubmission(item, room, origin)),
      expiresAt: room.expiresAt,
    });
  }

  private openWebSocket(sessionId: string) {
    const room = this.requireRoom();
    if (!room.memberships.some((item) => item.userId === sessionId)) {
      throw new HttpError(403, "Join the room before opening live updates.");
    }
    if (this.ctx.getWebSockets(sessionId).length >= MAX_SOCKETS_PER_MEMBERSHIP) {
      warnOperationalEvent("membership_socket_limit", {
        roomCode: room.game.code,
      });
      throw new HttpError(429, "This browser already has enough live connections.");
    }
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS_PER_ROOM) {
      warnOperationalEvent("room_socket_limit", {
        roomCode: room.game.code,
        sockets: this.ctx.getWebSockets().length,
      });
      throw new HttpError(429, "This room has reached its live-connection limit.");
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [sessionId]);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async saveRoom() {
    const room = this.requireRoom();
    await this.ctx.storage.put(ROOM_KEY, room);
  }

  private requireRoom() {
    if (!this.room) throw new HttpError(404, "Game not found.");
    return this.room;
  }

  private broadcast(reason = "change") {
    const message = JSON.stringify({ type: "room-change", reason });
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
      } catch {
        socket.close(1011, "Update failed");
      }
    }
  }

  private async checkHostRateLimit(
    rateKey: string,
    maximum: number,
    scope: "browser" | "network",
  ) {
    const cutoff = Date.now() - HOST_ATTEMPT_WINDOW_MS;
    const storageKey = `${HOST_ATTEMPTS_KEY_PREFIX}${rateKey}`;
    const attempts = (
      (await this.ctx.storage.get<number[]>(storageKey)) ?? []
    ).filter(
      (timestamp) => timestamp > cutoff,
    );
    await this.ctx.storage.put(storageKey, attempts);
    if (attempts.length >= maximum) {
      warnOperationalEvent("host_pin_rate_limit", {
        roomCode: this.room?.game.code ?? "unknown",
        scope,
        attempts: attempts.length,
      });
      throw new HttpError(429, "Too many PIN attempts. Try again in 15 minutes.");
    }
  }

  private async recordFailedHostAttempt(rateKey: string) {
    const storageKey = `${HOST_ATTEMPTS_KEY_PREFIX}${rateKey}`;
    const attempts = (await this.ctx.storage.get<number[]>(storageKey)) ?? [];
    attempts.push(Date.now());
    await this.ctx.storage.put(storageKey, attempts.slice(-50));
  }

  private async recordNewJoin(networkKey: string, roomCode: string) {
    const cutoff = Date.now() - JOIN_WINDOW_MS;
    const storageKey = `${JOIN_ATTEMPTS_KEY_PREFIX}${networkKey.slice(0, 128)}`;
    const joins = ((await this.ctx.storage.get<number[]>(storageKey)) ?? []).filter(
      (timestamp) => timestamp > cutoff,
    );
    if (joins.length >= MAX_NEW_JOINS_PER_NETWORK_WINDOW) {
      warnOperationalEvent("rapid_room_join_limit", {
        roomCode,
        recentJoinCount: joins.length,
      });
      throw new HttpError(
        429,
        "This room is receiving joins too quickly. Wait one minute or ask the host for help.",
      );
    }
    joins.push(Date.now());
    await this.ctx.storage.put(storageKey, joins);
  }

  private recordMutation(sessionId: string) {
    const now = Date.now();
    const cutoff = now - MUTATION_WINDOW_MS;
    const attempts = (this.mutationAttempts.get(sessionId) ?? []).filter(
      (timestamp) => timestamp > cutoff,
    );
    if (attempts.length >= MAX_MUTATIONS_PER_MEMBERSHIP_WINDOW) {
      warnOperationalEvent("membership_mutation_limit", {
        roomCode: this.room?.game.code ?? "unknown",
        recentMutations: attempts.length,
      });
      throw new HttpError(429, "Too many updates. Wait one minute and try again.");
    }
    attempts.push(now);
    this.mutationAttempts.set(sessionId, attempts);
  }

  private async confirmRegistry(code: string, reservationId: string, expiresAt: number) {
    const registry = this.env.ROOM_REGISTRY.get(
      this.env.ROOM_REGISTRY.idFromName("global"),
    );
    const response = await registry.fetch("https://registry.internal/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, reservationId, expiresAt }),
    });
    if (!response.ok) {
      const result: { error?: string } = await response
        .json<{ error?: string }>()
        .catch(() => ({}));
      throw new HttpError(response.status, result.error ?? "Room reservation expired.");
    }
  }

  private async releaseRegistry(code: string, reservationId?: string) {
    const registry = this.env.ROOM_REGISTRY.get(
      this.env.ROOM_REGISTRY.idFromName("global"),
    );
    await registry.fetch("https://registry.internal/release", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, ...(reservationId ? { reservationId } : {}) }),
    });
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function isHttpError(error: unknown): error is HttpError {
  return (
    error instanceof Error &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  );
}

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
    },
  });
}

function warnOperationalEvent(
  event: string,
  details: Record<string, string | number | boolean>,
) {
  console.warn("Scavenger Bingo operational event", {
    event,
    ...details,
  });
}

function registryRoom(value: number | RegistryRoom): RegistryRoom {
  return typeof value === "number"
    ? { expiresAt: value, reservationId: "legacy", confirmed: true }
    : value;
}

function clearOldDailyCounters(
  counters: Record<string, { day: string; count: number }>,
  day: string,
) {
  for (const [key, value] of Object.entries(counters)) {
    if (value.day !== day) delete counters[key];
  }
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    const bytes = await readLimitedBytes(
      request,
      MAX_JSON_BYTES,
      "Request body must be 64 KB or smaller.",
    );
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

async function readLimitedBytes(
  request: Request,
  maximumBytes: number,
  message: string,
) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new HttpError(413, message);
  }
  if (!request.body) return new ArrayBuffer(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new HttpError(413, message);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

function normalizeGameCode(value: string) {
  return value.trim().toUpperCase();
}

function codeFromPath(pathname: string) {
  return pathname.split("/")[3] ?? "";
}

function readSession(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([A-Za-z0-9-]{20,80})`));
  return match?.[1] ?? null;
}

function addSessionCookie(response: Response, sessionId: string, url: URL) {
  if (response.status === 101 || response.headers.has("set-cookie")) return response;

  const headers = new Headers(response.headers);
  headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${
      url.protocol === "https:" ? "; Secure" : ""
    }`,
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isSameOriginMutation(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  return (
    !origin ||
    origin === new URL(request.url).origin ||
    origin === PUBLIC_APP_ORIGIN
  );
}

function getPublicOrigin(request: Request) {
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  if (forwardedHost === new URL(PUBLIC_APP_ORIGIN).host) {
    return PUBLIC_APP_ORIGIN;
  }

  if (request.headers.get("origin") === PUBLIC_APP_ORIGIN) {
    return PUBLIC_APP_ORIGIN;
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      if (new URL(referer).origin === PUBLIC_APP_ORIGIN) {
        return PUBLIC_APP_ORIGIN;
      }
    } catch {
      // Ignore malformed proxy headers and use the request URL.
    }
  }

  return new URL(request.url).origin;
}

async function getNetworkKey(request: Request) {
  const source =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local";
  return hashKey(source);
}

async function hashKey(source: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

async function hashPin(salt: string, pin: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${salt}:${pin}`),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(first: string, second: string) {
  if (first.length !== second.length) return false;
  let result = 0;
  for (let index = 0; index < first.length; index += 1) {
    result |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }
  return result === 0;
}

function cleanName(value: unknown, label: string) {
  const cleaned = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!cleaned) throw new HttpError(400, `${label} is required.`);
  return cleaned.slice(0, 60);
}

function cleanFileName(value: string) {
  return value.replace(/[\r\n"\\/]/g, "-").slice(0, 120) || "proof.jpg";
}

function normalizeImageFileName(value: string, contentType: string) {
  const extension =
    contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const baseName = cleanFileName(value)
    .replace(/\.[A-Za-z0-9]{1,10}$/, "")
    .slice(0, 115);
  return `${baseName || "proof"}.${extension}`;
}

function decodeHeaderValue(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function safeHeaderValue(value: string) {
  return value.replace(/[^A-Za-z0-9._ -]/g, "_");
}

function isAllowedImageType(value: string) {
  return ["image/jpeg", "image/png", "image/webp"].includes(value);
}

function inspectImage(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const png = inspectPng(bytes);
  if (png) return { contentType: "image/png", ...png };
  const jpeg = inspectJpeg(bytes);
  if (jpeg) return { contentType: "image/jpeg", ...jpeg };
  const webp = inspectWebp(bytes);
  if (webp) return { contentType: "image/webp", ...webp };
  throw new HttpError(415, "Upload a valid JPG, PNG, or WebP proof photo.");
}

function inspectPng(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 24 ||
    !signature.every((value, index) => bytes[index] === value) ||
    ascii(bytes, 12, 16) !== "IHDR"
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function inspectJpeg(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const sofMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 1 >= bytes.length) break;
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (sofMarkers.has(marker) && segmentLength >= 7) {
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += segmentLength;
  }
  return null;
}

function inspectWebp(bytes: Uint8Array) {
  if (
    bytes.length < 30 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 12) !== "WEBP"
  ) {
    return null;
  }
  const chunk = ascii(bytes, 12, 16);
  if (chunk === "VP8X") {
    const width = 1 + littleUint24(bytes, 24);
    const height = 1 + littleUint24(bytes, 27);
    return { width, height };
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8);
    const height =
      1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10);
    return { width, height };
  }
  if (
    chunk === "VP8 " &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
    const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  return null;
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}

function littleUint24(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function proofKey(submissionId: string) {
  return `proof:${submissionId}`;
}

function requireGameId(room: StoredRoom, gameId: unknown) {
  if (gameId !== room.game.id) throw new HttpError(404, "Game not found.");
}

function requireHost(room: StoredRoom, sessionId: string) {
  const membership = room.memberships.find(
    (item) => item.userId === sessionId && item.role === "host",
  );
  if (!membership) throw new HttpError(403, "Host access required.");
  return membership;
}

function requirePlayer(room: StoredRoom, sessionId: string) {
  const membership = room.memberships.find(
    (item) => item.userId === sessionId && item.role === "player",
  );
  if (!membership) throw new HttpError(403, "Join a team first.");
  return membership;
}

function requirePlayerMembership(room: StoredRoom, membershipId: string) {
  const membership = room.memberships.find(
    (item) => item.id === membershipId && item.role === "player",
  );
  if (!membership) throw new HttpError(404, "Player not found.");
  return membership;
}

function getMembershipOwnerId(room: StoredRoom, membership: StoredMembership) {
  if (room.game.playMode === "individual") return membership.id;
  if (!membership.groupId) throw new HttpError(409, "Choose a team first.");
  return membership.groupId;
}

function publicMembership(membership: StoredMembership) {
  const { createdAt: _createdAt, userId: _userId, ...publicValue } = membership;
  return publicValue;
}

function publicSubmission(submission: StoredSubmission, room: StoredRoom, origin: string) {
  const submitter = room.memberships.find((item) => item.userId === submission.submittedBy);
  const submitterName = submitter?.displayName ?? submission.submittedByName;
  const imageUrl = `${origin}/api/games/${encodeURIComponent(room.game.code)}/proofs/${encodeURIComponent(submission.id)}`;
  return {
    id: submission.id,
    groupId: submission.groupId,
    taskId: submission.taskId,
    submittedBy: submitter?.id ?? "",
    submittedByName: submitterName,
    imageUrl,
    imagePath: submission.imagePath,
    imageName: submission.imageName,
    status: submission.status,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
  };
}

function createGroup(room: StoredRoom, desiredName: string, sortOrder: number): StoredGroup {
  const name = desiredName.trim().replace(/\s+/g, " ").slice(0, 40) || `Team ${sortOrder}`;
  const baseSlug = slugify(name) || `team-${sortOrder}`;
  let id = baseSlug;
  let suffix = 2;
  while (room.groups.some((item) => item.id === id)) {
    id = `${baseSlug.slice(0, 44)}-${suffix}`;
    suffix += 1;
  }
  return {
    id,
    name,
    shortName: name.slice(0, 24),
    colorKey: GROUP_COLOR_KEYS[(sortOrder - 1) % GROUP_COLOR_KEYS.length],
    sortOrder,
  };
}

function createTask(payload: Record<string, unknown>, existing: StoredTask[]): StoredTask {
  const id = slugify(stringValue(payload.slug));
  if (!id || existing.some((item) => item.id === id)) {
    throw new HttpError(409, "Task name must be unique.");
  }
  return {
    id,
    title: cleanName(payload.title, "Task title"),
    description: optionalString(payload.description)?.trim().slice(0, 300) ?? "",
    icon: optionalString(payload.icon)?.slice(0, 40) || "Camera",
    free: Boolean(payload.isFree),
    sortOrder: positiveInteger(payload.sortOrder, existing.length + 1),
  };
}

function applyTaskPatch(task: StoredTask, patch: Record<string, unknown>) {
  if (patch.title !== undefined) task.title = cleanName(patch.title, "Task title");
  if (patch.description !== undefined) {
    task.description = optionalString(patch.description)?.trim().slice(0, 300) ?? "";
  }
  if (patch.icon !== undefined) task.icon = stringValue(patch.icon).slice(0, 40);
  if (patch.free !== undefined) task.free = Boolean(patch.free);
  if (patch.sortOrder !== undefined) task.sortOrder = positiveInteger(patch.sortOrder, task.sortOrder);
}

function createStop(payload: Record<string, unknown>): StoredStop {
  return {
    id: crypto.randomUUID(),
    name: cleanName(payload.name, "Stop name"),
    detail: optionalString(payload.detail)?.trim().slice(0, 300) ?? "",
    arriveTime: cleanName(payload.arriveTime, "Arrival time").slice(0, 30),
    leaveTime: cleanName(payload.leaveTime, "Leave time").slice(0, 30),
    sortOrder: positiveInteger(payload.sortOrder, 1),
  };
}

function applyStopPatch(stop: StoredStop, patch: Record<string, unknown>) {
  if (patch.name !== undefined) stop.name = cleanName(patch.name, "Stop name");
  if (patch.detail !== undefined) {
    stop.detail = optionalString(patch.detail)?.trim().slice(0, 300) ?? "";
  }
  if (patch.arriveTime !== undefined) stop.arriveTime = stringValue(patch.arriveTime).slice(0, 30);
  if (patch.leaveTime !== undefined) stop.leaveTime = stringValue(patch.leaveTime).slice(0, 30);
}

function applyGamePatch(room: StoredRoom, patch: Record<string, unknown>) {
  if (patch.name !== undefined) room.game.name = cleanName(patch.name, "Game name");
  if (patch.activeStopId !== undefined) {
    const stopId = patch.activeStopId === null ? null : stringValue(patch.activeStopId);
    if (stopId && !room.stops.some((item) => item.id === stopId)) {
      throw new HttpError(400, "Active stop not found.");
    }
    room.game.activeStopId = stopId;
  }
  if (patch.phase !== undefined) {
    const phase = stringValue(patch.phase) as HuntPhase;
    if (!["live", "play", "review"].includes(phase)) {
      throw new HttpError(400, "Invalid hunt phase.");
    }
    room.game.phase = phase;
  }
  if (patch.timerRunning !== undefined) room.game.timerRunning = Boolean(patch.timerRunning);
  if (patch.timerStartedAt !== undefined) {
    const timestamp = new Date(stringValue(patch.timerStartedAt));
    if (Number.isNaN(timestamp.getTime())) throw new HttpError(400, "Invalid timer date.");
    room.game.timerStartedAt = timestamp.toISOString();
  }
  if (patch.timerSecondsTotal !== undefined) {
    room.game.timerSecondsTotal = Math.max(0, positiveInteger(patch.timerSecondsTotal, 0));
  }
  if (patch.boardHidden !== undefined) room.game.boardHidden = Boolean(patch.boardHidden);
  if (patch.setupComplete !== undefined) room.game.setupComplete = Boolean(patch.setupComplete);
  if (patch.lobbyOpen !== undefined) room.game.lobbyOpen = Boolean(patch.lobbyOpen);
  if (patch.teamsLocked !== undefined) room.game.teamsLocked = Boolean(patch.teamsLocked);
}

function applyGameConfiguration(room: StoredRoom, config: Record<string, unknown>) {
  if (config.name !== undefined) room.game.name = cleanName(config.name, "Game name");
  if (config.playMode !== undefined) {
    room.game.playMode = enumValue(config.playMode, ["teams", "individual"] as const, "play mode");
  }
  if (config.winCondition !== undefined) {
    room.game.winCondition = enumValue(
      config.winCondition,
      ["blackout", "bingo"] as const,
      "win condition",
    );
  }
  if (config.boardSize !== undefined) {
    const boardSize = Number(config.boardSize);
    if (![3, 4, 5].includes(boardSize)) throw new HttpError(400, "Choose a valid board size.");
    room.game.boardSize = boardSize as BoardSize;
  }
  if (config.boardMode !== undefined) {
    room.game.boardMode = enumValue(
      config.boardMode,
      ["shared", "randomized"] as const,
      "board style",
    );
  }
  if (config.freeSpace !== undefined) room.game.freeSpace = Boolean(config.freeSpace);
  if (config.proofMode !== undefined) {
    room.game.proofMode = enumValue(
      config.proofMode,
      ["required", "optional", "none"] as const,
      "proof mode",
    );
  }
  if (config.approvalMode !== undefined) {
    room.game.approvalMode = enumValue(
      config.approvalMode,
      ["host", "automatic"] as const,
      "approval mode",
    );
  }
  if (config.timerMode !== undefined) {
    room.game.timerMode = enumValue(
      config.timerMode,
      ["none", "duration", "schedule"] as const,
      "timer mode",
    );
  }
  if (config.timerDurationMinutes !== undefined) {
    room.game.timerDurationMinutes = Math.min(
      1440,
      Math.max(1, positiveInteger(config.timerDurationMinutes, 60)),
    );
    room.game.timerSecondsTotal = room.game.timerDurationMinutes * 60;
  }
  if (config.lobbyOpen !== undefined) room.game.lobbyOpen = Boolean(config.lobbyOpen);
  if (config.teamsLocked !== undefined) room.game.teamsLocked = Boolean(config.teamsLocked);
  if (config.setupComplete !== undefined) {
    room.game.setupComplete = Boolean(config.setupComplete);
  }

  if (room.game.playMode === "individual") {
    room.groups = [];
    room.memberships.forEach((membership) => {
      if (membership.role === "player") membership.groupId = membership.id;
    });
  }
  if (room.game.timerMode !== "schedule") {
    room.game.activeStopId = null;
  }
  if (room.game.timerMode === "none") {
    room.game.timerRunning = false;
    room.game.timerSecondsTotal = 0;
  }
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  options: T,
  label: string,
): T[number] {
  const parsed = stringValue(value);
  if (!options.includes(parsed)) {
    throw new HttpError(400, `Choose a valid ${label}.`);
  }
  return parsed as T[number];
}

function applyRoomTemplate(room: StoredRoom, template: string, startTime?: string) {
  const templateId = template.trim().toLowerCase();
  room.game.setupComplete = false;
  room.game.boardHidden = true;
  room.game.phase = "review";
  room.game.activeStopId = null;
  room.game.timerRunning = false;
  room.submissions = [];

  const gameKit = getGameKit(templateId);
  if (gameKit) {
    room.game.name = gameKit.gameName;
    room.game.playMode = gameKit.playMode;
    room.game.winCondition = gameKit.winCondition;
    room.game.boardSize = gameKit.boardSize;
    room.game.boardMode = gameKit.boardMode;
    room.game.freeSpace = gameKit.freeSpace;
    room.game.proofMode = gameKit.proofMode;
    room.game.approvalMode = gameKit.approvalMode;
    room.game.timerMode = gameKit.timerMode;
    room.game.timerDurationMinutes = gameKit.timerDurationMinutes;
    room.game.timerSecondsTotal = gameKit.timerDurationMinutes * 60;
    room.groups = Array.from({ length: gameKit.teamCount }, (_, index) =>
      createGroup(room, `Team ${index + 1}`, index + 1),
    );
    room.stops = [];
    room.tasks = markCatalogTasks(
      gameKit.tasks
        ? gameKit.tasks.map((task) => ({ ...task }))
        : createStarterTasks(),
    );
    return;
  }

  if (templateId === "classic") {
    room.game.playMode = "teams";
    room.game.winCondition = "blackout";
    room.game.boardSize = 5;
    room.game.boardMode = "randomized";
    room.game.freeSpace = true;
    room.game.proofMode = "required";
    room.game.approvalMode = "host";
    room.game.timerMode = "schedule";
    room.tasks = markCatalogTasks(createStarterTasks());
    room.groups = [
      createGroup(room, "Team 1", 1),
      createGroup(room, "Team 2", 2),
      createGroup(room, "Team 3", 3),
    ];
    room.stops = createClassicStops(startTime ?? "10:00 AM");
    return;
  }

  if (templateId === "quick") {
    room.game.playMode = "teams";
    room.game.winCondition = "bingo";
    room.game.boardSize = 3;
    room.game.boardMode = "shared";
    room.game.freeSpace = true;
    room.game.proofMode = "required";
    room.game.approvalMode = "automatic";
    room.game.timerMode = "duration";
    room.game.timerDurationMinutes = 30;
    room.game.timerSecondsTotal = 30 * 60;
    room.groups = [createGroup(room, "Team 1", 1), createGroup(room, "Team 2", 2)];
    room.stops = [];
    return;
  }

  if (templateId === "free-for-all") {
    room.game.playMode = "individual";
    room.game.winCondition = "bingo";
    room.game.boardSize = 4;
    room.game.boardMode = "randomized";
    room.game.freeSpace = false;
    room.game.proofMode = "optional";
    room.game.approvalMode = "automatic";
    room.game.timerMode = "duration";
    room.game.timerDurationMinutes = 45;
    room.game.timerSecondsTotal = 45 * 60;
    room.groups = [];
    room.stops = [];
    return;
  }

  if (templateId === "custom") {
    room.game.playMode = "teams";
    room.game.winCondition = "blackout";
    room.game.boardSize = 5;
    room.game.boardMode = "randomized";
    room.game.freeSpace = true;
    room.game.proofMode = "required";
    room.game.approvalMode = "host";
    room.game.timerMode = "none";
    room.game.timerDurationMinutes = 60;
    room.game.timerSecondsTotal = 0;
    room.tasks = [createFreeSpaceTask()];
    room.groups = [];
    room.stops = [];
    return;
  }

  throw new HttpError(400, "Choose a valid game template.");
}

function regenerateBoards(room: StoredRoom) {
  const owners = getBoardOwners(room);
  const taskCount = room.tasks.filter((task) => !task.free).length;
  const requiredTaskCount =
    room.game.boardSize * room.game.boardSize -
    (room.game.freeSpace && room.game.boardSize % 2 === 1 ? 1 : 0);
  if (taskCount < requiredTaskCount) {
    room.boardAssignments = [];
    room.game.boardsNeedShuffle = true;
    return;
  }
  room.boardAssignments = createBoards(
    owners,
    room.tasks,
    room.game.boardSize,
    room.game.boardMode,
    room.game.freeSpace,
  );
  room.game.boardsNeedShuffle = false;
}

function getTaskLimitMessage(game: StoredGame, limit: number) {
  return game.boardMode === "shared"
    ? `Shared boards can use up to ${limit} tasks with this setup.`
    : `Rooms can have up to ${MAX_PLAYABLE_TASKS_PER_ROOM} tasks.`;
}

function getBoardOwners(room: StoredRoom): StoredGroup[] {
  return room.game.playMode === "teams"
    ? room.groups
    : room.memberships
        .filter((item) => item.role === "player")
        .map((item, index) => ({
          id: item.id,
          name: item.displayName,
          shortName: item.displayName,
          colorKey: GROUP_COLOR_KEYS[index % GROUP_COLOR_KEYS.length],
          sortOrder: index + 1,
        }));
}

function markCatalogTasks(tasks: StoredTask[]) {
  return tasks.map((task) => ({
    ...task,
    ...(getCatalogTask(task.id) ? { catalogId: task.id } : {}),
  }));
}

function normalizePlayerOwnership(room: StoredRoom) {
  const players = room.memberships.filter((item) => item.role === "player");
  if (room.game.playMode === "individual") {
    players.forEach((player) => {
      player.groupId = player.id;
    });
    return;
  }

  const sortedGroups = [...room.groups].sort((a, b) => a.sortOrder - b.sortOrder);
  players.forEach((player, index) => {
    if (!sortedGroups.some((group) => group.id === player.groupId)) {
      player.groupId = sortedGroups[index % sortedGroups.length]?.id ?? null;
    }
  });
}

function createClassicStops(startTime: string): StoredStop[] {
  const normalizedStart = formatClockMinutes(parseClockMinutes(startTime) ?? 600);
  return [
    {
      id: crypto.randomUUID(),
      name: "Opening Stop",
      detail: "Regroup here before the first play window starts.",
      arriveTime: normalizedStart,
      leaveTime: addClockMinutes(normalizedStart, 30),
      sortOrder: 1,
    },
    {
      id: crypto.randomUUID(),
      name: "Midpoint Stop",
      detail: "Meet here before the next play window starts.",
      arriveTime: addClockMinutes(normalizedStart, 60),
      leaveTime: addClockMinutes(normalizedStart, 90),
      sortOrder: 2,
    },
    {
      id: crypto.randomUUID(),
      name: "Finish Stop",
      detail: "Gather here to review proof photos and wrap the game.",
      arriveTime: addClockMinutes(normalizedStart, 120),
      leaveTime: addClockMinutes(normalizedStart, 150),
      sortOrder: 3,
    },
  ];
}

function addClockMinutes(value: string, amount: number) {
  return formatClockMinutes((parseClockMinutes(value) ?? 0) + amount);
}

function parseClockMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  const minute = Number(match[2]);
  if (minute > 59) return null;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + minute;
}

function formatClockMinutes(totalMinutes: number) {
  const minutesInDay = ((totalMinutes % 1440) + 1440) % 1440;
  const hour24 = Math.floor(minutesInDay / 60);
  const minute = minutesInDay % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

async function deleteProofs(storage: DurableObjectStorage, submissions: StoredSubmission[]) {
  const keys = submissions.map((item) => proofKey(item.id));
  for (let index = 0; index < keys.length; index += 128) {
    await storage.delete(keys.slice(index, index + 128));
  }
}

async function deleteMembershipData(
  storage: DurableObjectStorage,
  room: StoredRoom,
  membership: StoredMembership,
) {
  const submissions = room.submissions.filter(
    (item) => item.submittedBy === membership.userId,
  );
  await deleteProofs(storage, submissions);
  const submissionIds = new Set(submissions.map((item) => item.id));
  room.submissions = room.submissions.filter((item) => !submissionIds.has(item.id));
  room.memberships = room.memberships.filter((item) => item.id !== membership.id);
  if (room.game.playMode === "individual") {
    room.boardAssignments = room.boardAssignments.filter(
      (item) => item.groupId !== membership.id,
    );
  }
  return {
    membership: publicMembership(membership),
    deletedSubmissions: submissions.length,
    deletedImages: submissions.filter((item) => Boolean(item.imagePath)).length,
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function stringValue(value: unknown) {
  if (typeof value !== "string") throw new HttpError(400, "A required value is missing.");
  return value;
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "A valid update is required.");
  }
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new HttpError(400, "A list is required.");
  return value;
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
