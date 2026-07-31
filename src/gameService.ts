import type { GameKitId } from "./gameKits";

export const DEFAULT_GAME_CODE = "";
export const PROOFS_BUCKET = "proofs";

export type SubmissionStatus = "pending" | "approved" | "retake";
export type TaskStatus = "ready" | "pending" | "approved" | "retake";
export type HuntPhase = "live" | "play" | "review";
export type PlayMode = "teams" | "individual";
export type WinCondition = "blackout" | "bingo";
export type BoardMode = "shared" | "randomized";
export type ProofMode = "required" | "optional" | "none";
export type ApprovalMode = "host" | "automatic";
export type PlayerExportMode = "host-only" | "team-after-review";
export type TimerMode = "none" | "duration" | "schedule";
export type BoardSize = 3 | 4 | 5;

export type Group = {
  id: string;
  name: string;
  shortName: string;
  color: string;
  dark: string;
  soft: string;
};

export type Task = {
  id: string;
  catalogId?: string;
  title: string;
  description: string;
  icon: string;
  free?: boolean;
  sortOrder: number;
};

export type BoardAssignment = {
  groupId: string;
  taskId: string;
  slotOrder: number;
};

export type HuntStop = {
  id: string;
  name: string;
  detail: string;
  arriveTime: string;
  leaveTime: string;
  sortOrder: number;
};

export type Game = {
  id: string;
  code: string;
  name: string;
  phase: HuntPhase;
  activeStopId: string | null;
  timerRunning: boolean;
  timerStartedAt: string;
  timerSecondsTotal: number;
  boardHidden: boolean;
  setupComplete: boolean;
  playMode: PlayMode;
  winCondition: WinCondition;
  boardSize: BoardSize;
  boardMode: BoardMode;
  freeSpace: boolean;
  boardsNeedShuffle: boolean;
  proofMode: ProofMode;
  approvalMode: ApprovalMode;
  playerExportMode?: PlayerExportMode;
  timerMode: TimerMode;
  timerDurationMinutes: number;
  lobbyOpen: boolean;
  teamsLocked: boolean;
};

export type GameTimerPatch = Partial<
  Pick<
    Game,
    | "activeStopId"
    | "phase"
    | "timerRunning"
    | "timerStartedAt"
    | "timerSecondsTotal"
    | "boardHidden"
    | "name"
    | "setupComplete"
    | "lobbyOpen"
    | "teamsLocked"
  >
>;

export type GameResetPatch = Partial<
  Pick<
    Game,
    | "activeStopId"
    | "phase"
    | "timerRunning"
    | "timerStartedAt"
    | "timerSecondsTotal"
    | "boardHidden"
  >
>;

export type Membership = {
  id: string;
  gameId: string;
  role: "player" | "host";
  groupId: string | null;
  displayName: string;
  isOwner?: boolean;
};

export type RosterMember = {
  id: string;
  gameId: string;
  role: "player" | "host";
  groupId: string | null;
  displayName: string;
  isOwner?: boolean;
};

export type Submission = {
  id: string;
  groupId?: string;
  taskId: string;
  submittedBy: string;
  submittedByName: string | null;
  imageUrl: string;
  imagePath: string;
  imageName: string;
  status: SubmissionStatus;
  createdAt: number;
  updatedAt: number;
};

export type GameState = {
  revision?: number;
  game: Game;
  groups: Group[];
  tasks: Task[];
  boardAssignments: BoardAssignment[];
  stops: HuntStop[];
  membership: Membership | null;
  memberships: Membership[];
  roster: RosterMember[];
  submissions: Submission[];
  expiresAt?: number;
};

type ApiEnvelope<T> = { data: T };

const gameCodeById = new Map<string, string>();
const resourceCodeById = new Map<string, string>();
const latestStateByGameId = new Map<string, GameState>();
const latestRevisionByGameId = new Map<string, number>();
const REALTIME_RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];
const REALTIME_REFRESH_COALESCE_MS = 25;
const REALTIME_REFRESH_RETRY_DELAYS_MS = [250, 1000, 3000, 5000];

export async function ensureAnonymousSession() {
  const response = await fetch("/api/health", { credentials: "same-origin" });
  if (!response.ok) throw new Error("The game service is unavailable.");
  return { id: "browser-session" };
}

export async function loadGameState(gameCode = DEFAULT_GAME_CODE): Promise<GameState> {
  const code = normalizeGameCode(gameCode);
  if (!code) throw new Error("Game code is required.");

  const receivedState = await api<GameState>(`/api/games/${encodeURIComponent(code)}`);
  const state = retainFreshestState(receivedState);
  rememberState(state);
  return state;
}

export async function joinGame({
  gameId,
  groupId,
  displayName,
}: {
  gameId: string;
  groupId?: string;
  displayName: string;
}) {
  const code = requireCode(gameId);
  return apiData<Membership>(`/api/games/${encodeURIComponent(code)}/join`, {
    method: "POST",
    body: JSON.stringify({ gameId, groupId, displayName: displayName.trim() }),
  });
}

export async function claimHost({
  gameCode,
  pin,
  displayName,
  templateId,
}: {
  gameCode: string;
  pin: string;
  displayName: string;
  templateId?: GameKitId;
}) {
  const code = normalizeGameCode(gameCode);
  if (!code) throw new Error("Game code is required.");
  const membership = await apiData<Membership>(
    `/api/games/${encodeURIComponent(code)}/host`,
    {
      method: "POST",
      body: JSON.stringify({
        pin,
        displayName: displayName.trim(),
        ...(templateId ? { templateId } : {}),
      }),
    },
  );
  gameCodeById.set(membership.gameId, code);
  resourceCodeById.set(membership.id, code);
  return membership;
}

export function movePlayerMembership({
  membershipId,
  groupId,
}: {
  membershipId: string;
  groupId: string;
}) {
  return action<Membership>(requireCode(membershipId), "movePlayer", {
    membershipId,
    groupId,
  });
}

export function kickPlayerMembership(membershipId: string) {
  return action<{
    membership: Membership;
    deletedSubmissions: number;
    deletedImages: number;
  }>(requireCode(membershipId), "kickPlayer", {
    membershipId,
  });
}

export function deletePlayerMembershipData(membershipId: string) {
  return action<{
    membership: Membership;
    deletedSubmissions: number;
    deletedImages: number;
  }>(requireCode(membershipId), "deletePlayerData", { membershipId });
}

export function leaveGame(gameId: string) {
  return action<{
    membership: Membership;
    deletedSubmissions: number;
    deletedImages: number;
  }>(requireCode(gameId), "leaveGame", { gameId });
}

export function addGroup({ gameId, name }: { gameId: string; name?: string }) {
  return action<Group>(requireCode(gameId), "addGroup", { gameId, name });
}

export function updateGroupDetails(
  gameId: string,
  groupId: string,
  patch: Partial<Pick<Group, "name">> & { colorKey?: string; sortOrder?: number },
) {
  return action<Group>(requireCode(gameId), "updateGroup", { gameId, groupId, patch });
}

export function removeGroup(gameId: string, groupId: string) {
  return action<void>(requireCode(gameId), "removeGroup", { gameId, groupId });
}

export function promotePlayerMembership(membershipId: string) {
  return action<Membership>(requireCode(membershipId), "promotePlayer", { membershipId });
}

export function removeCohostMembership(membershipId: string) {
  return action<Membership>(requireCode(membershipId), "removeCohost", { membershipId });
}

export function transferHostOwnership(membershipId: string) {
  return action<Membership>(requireCode(membershipId), "transferHost", { membershipId });
}

export function configureGame({
  gameId,
  template,
  startTime,
  config,
}: {
  gameId: string;
  template?: GameKitId;
  startTime?: string;
  config?: Partial<Pick<Game,
    | "name"
    | "playMode"
    | "winCondition"
    | "boardSize"
    | "boardMode"
    | "freeSpace"
    | "proofMode"
    | "approvalMode"
    | "playerExportMode"
    | "timerMode"
    | "timerDurationMinutes"
    | "lobbyOpen"
    | "teamsLocked"
    | "setupComplete"
  >>;
}) {
  return action<Game>(requireCode(gameId), "configureGame", {
    gameId,
    template,
    startTime,
    config,
  });
}

export async function saveTaskProof({
  gameId,
  groupId,
  taskId,
  file,
}: {
  gameId: string;
  groupId: string;
  taskId: string;
  file: File;
}) {
  const code = requireCode(gameId);
  const submission = await apiData<Submission>(
    `/api/games/${encodeURIComponent(code)}/proofs`,
    {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-file-name": encodeURIComponent(file.name || "proof.jpg"),
        "x-game-id": gameId,
        "x-group-id": groupId,
        "x-task-id": taskId,
      },
      body: file,
    },
  );
  resourceCodeById.set(submission.id, code);
  return submission;
}

export function completeTask({
  gameId,
  taskId,
}: {
  gameId: string;
  taskId: string;
}) {
  return action<Submission | { removed: true }>(requireCode(gameId), "completeTask", {
    gameId,
    taskId,
  });
}

export function updateSubmissionStatus(
  submissionId: string,
  status: SubmissionStatus,
) {
  return action<Submission>(requireCode(submissionId), "updateSubmissionStatus", {
    submissionId,
    status,
  });
}

export async function createProofDownloadUrl(
  imagePath: string,
  _expiresInSeconds = 60 * 10,
) {
  const [code, submissionId] = imagePath.split("/");
  if (!code || !submissionId) throw new Error("Proof photo could not be opened.");
  return `/api/games/${encodeURIComponent(code)}/proofs/${encodeURIComponent(submissionId)}`;
}

export function resetGameProofs(gameId: string, patch?: GameResetPatch) {
  return action<{ deletedImages: number; deletedSubmissions: number }>(
    requireCode(gameId),
    "resetGameProofs",
    { gameId, ...(patch ? { patch } : {}) },
  );
}

export function abandonGameLobby(gameId: string) {
  return action<{
    deletedImages: number;
    deletedSubmissions: number;
    removedMemberships: number;
  }>(requireCode(gameId), "abandonGameLobby", { gameId });
}

export function addTask({
  gameId,
  slug,
  title,
  description,
  icon,
  isFree,
  sortOrder,
}: {
  gameId: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  isFree: boolean;
  sortOrder: number;
}) {
  return action<Task>(requireCode(gameId), "addTask", {
    gameId,
    slug,
    title,
    description,
    icon,
    isFree,
    sortOrder,
  });
}

export function addCatalogTask(gameId: string, catalogTaskId: string) {
  return action<Task>(requireCode(gameId), "addCatalogTask", {
    gameId,
    catalogTaskId,
  });
}

export function updateTaskDetails(
  gameId: string,
  taskId: string,
  patch: Partial<Pick<Task, "title" | "description" | "icon" | "free" | "sortOrder">>,
) {
  return action<Task>(requireCode(gameId), "updateTask", { gameId, taskId, patch });
}

export function resetCatalogTask(gameId: string, taskId: string) {
  return action<Task>(requireCode(gameId), "resetCatalogTask", { gameId, taskId });
}

export function removeTask(gameId: string, taskId: string) {
  return action<void>(requireCode(gameId), "removeTask", { gameId, taskId });
}

export function updateBoardSetup({
  gameId,
  boardSize,
  boardMode,
  freeSpace,
}: {
  gameId: string;
  boardSize: BoardSize;
  boardMode: BoardMode;
  freeSpace: boolean;
}) {
  return action<Game>(requireCode(gameId), "updateBoardSetup", {
    gameId,
    boardSize,
    boardMode,
    freeSpace,
  });
}

export function shuffleBoards(gameId: string) {
  return action<BoardAssignment[]>(requireCode(gameId), "shuffleBoards", { gameId });
}

export function setGroupBoardTasks({
  gameId,
  groupId,
  taskIds,
}: {
  gameId: string;
  groupId: string;
  taskIds: Array<string | null | undefined>;
}) {
  return action<BoardAssignment[]>(requireCode(gameId), "setGroupBoardTasks", {
    gameId,
    groupId,
    taskIds,
  });
}

export function updateStopDetails(
  stopId: string,
  patch: Partial<Pick<HuntStop, "name" | "detail" | "arriveTime" | "leaveTime">>,
) {
  return action<HuntStop>(requireCode(stopId), "updateStop", { stopId, patch });
}

export function addStop({
  gameId,
  name,
  detail,
  arriveTime,
  leaveTime,
  sortOrder,
}: {
  gameId: string;
  name: string;
  detail: string;
  arriveTime: string;
  leaveTime: string;
  sortOrder: number;
}) {
  return action<HuntStop>(requireCode(gameId), "addStop", {
    gameId,
    name,
    detail,
    arriveTime,
    leaveTime,
    sortOrder,
  });
}

export function removeStop(stopId: string) {
  return action<void>(requireCode(stopId), "removeStop", { stopId });
}

export function updateGameTimer(
  gameId: string,
  patch: GameTimerPatch,
) {
  return action<Game>(requireCode(gameId), "updateGame", { gameId, patch });
}

export function subscribeToGameChanges(
  gameId: string,
  onChange: (
    revision?: number,
  ) => boolean | void | Promise<boolean | void>,
) {
  const code = gameCodeById.get(gameId);
  if (!code || typeof window === "undefined" || !("WebSocket" in window)) {
    return () => undefined;
  }

  let socket: WebSocket | null = null;
  let reconnectTimer: number | undefined;
  let refreshTimer: number | undefined;
  let reconnectAttempt = 0;
  let refreshRetryAttempt = 0;
  let refreshInFlight = false;
  let stopped = false;
  let acknowledgedRevision = latestRevisionByGameId.get(gameId) ?? -1;
  let queuedRevision: number | undefined;
  let queuedLegacyRefresh = false;

  const armRefresh = (delay = REALTIME_REFRESH_COALESCE_MS) => {
    if (stopped || refreshInFlight || refreshTimer !== undefined) return;
    refreshTimer = window.setTimeout(() => {
      void runRefresh();
    }, delay);
  };

  const runRefresh = async () => {
    refreshTimer = undefined;
    if (stopped || refreshInFlight) return;

    const revisionToRefresh = queuedRevision;
    const shouldRefreshLegacy = queuedLegacyRefresh;
    queuedRevision = undefined;
    queuedLegacyRefresh = false;
    if (revisionToRefresh === undefined && !shouldRefreshLegacy) return;

    refreshInFlight = true;
    let callbackAcknowledged = false;
    try {
      callbackAcknowledged = (await onChange(revisionToRefresh)) !== false;
    } catch {
      callbackAcknowledged = false;
    } finally {
      refreshInFlight = false;
    }
    if (stopped) return;

    if (revisionToRefresh !== undefined) {
      const latestLoadedRevision = latestRevisionByGameId.get(gameId) ?? -1;
      if (
        callbackAcknowledged ||
        latestLoadedRevision >= revisionToRefresh
      ) {
        acknowledgedRevision = Math.max(
          acknowledgedRevision,
          latestLoadedRevision,
          revisionToRefresh,
        );
        refreshRetryAttempt = 0;
        if (
          queuedRevision !== undefined &&
          queuedRevision <= acknowledgedRevision
        ) {
          queuedRevision = undefined;
        }
      } else {
        queuedRevision = Math.max(
          queuedRevision ?? -1,
          revisionToRefresh,
        );
        const delay =
          REALTIME_REFRESH_RETRY_DELAYS_MS[
            Math.min(
              refreshRetryAttempt,
              REALTIME_REFRESH_RETRY_DELAYS_MS.length - 1,
            )
          ];
        refreshRetryAttempt += 1;
        armRefresh(delay);
        return;
      }
    } else if (callbackAcknowledged) {
      refreshRetryAttempt = 0;
    } else {
      queuedLegacyRefresh = true;
      const delay =
        REALTIME_REFRESH_RETRY_DELAYS_MS[
          Math.min(
            refreshRetryAttempt,
            REALTIME_REFRESH_RETRY_DELAYS_MS.length - 1,
          )
        ];
      refreshRetryAttempt += 1;
      armRefresh(delay);
      return;
    }

    if (queuedRevision !== undefined || queuedLegacyRefresh) {
      armRefresh();
    }
  };

  const scheduleRefresh = (revision?: number) => {
    if (stopped) return;

    if (revision !== undefined) {
      const latestLoadedRevision = latestRevisionByGameId.get(gameId) ?? -1;
      acknowledgedRevision = Math.max(
        acknowledgedRevision,
        latestLoadedRevision,
      );
      if (revision <= acknowledgedRevision) return;
      queuedRevision = Math.max(queuedRevision ?? -1, revision);
    } else {
      queuedLegacyRefresh = true;
    }

    armRefresh();
  };

  const connect = () => {
    if (stopped || document.visibilityState === "hidden" || !navigator.onLine) return;
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(
      `${scheme}://${window.location.host}/api/games/${encodeURIComponent(code)}/ws`,
    );
    socket.addEventListener("open", () => {
      reconnectAttempt = 0;
      scheduleRefresh();
    });
    socket.addEventListener("message", (event) => {
      if (event.data === "pong") return;
      scheduleRefresh(readRoomChangeRevision(event.data));
    });
    socket.addEventListener("close", () => {
      socket = null;
      scheduleReconnect();
    });
    socket.addEventListener("error", () => socket?.close());
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer !== undefined) return;
    const delay = REALTIME_RECONNECT_DELAYS_MS[
      Math.min(reconnectAttempt, REALTIME_RECONNECT_DELAYS_MS.length - 1)
    ];
    reconnectAttempt += 1;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, delay);
  };

  const resume = () => {
    if (document.visibilityState !== "hidden" && navigator.onLine && !socket) connect();
  };

  window.addEventListener("online", resume);
  document.addEventListener("visibilitychange", resume);
  connect();

  return () => {
    stopped = true;
    if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
    if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    window.removeEventListener("online", resume);
    document.removeEventListener("visibilitychange", resume);
    socket?.close(1000, "View closed");
  };
}

function readRoomChangeRevision(value: unknown) {
  if (typeof value !== "string") return undefined;

  try {
    const message = JSON.parse(value) as {
      type?: unknown;
      revision?: unknown;
    };
    const revision = Number(message.revision);
    return message.type === "room-change" &&
        Number.isSafeInteger(revision) &&
        revision >= 0
      ? revision
      : undefined;
  } catch {
    return undefined;
  }
}

async function action<T>(
  code: string,
  actionName: string,
  payload: Record<string, unknown>,
) {
  return apiData<T>(`/api/games/${encodeURIComponent(code)}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: actionName, payload }),
  });
}

async function apiData<T>(path: string, init?: RequestInit) {
  const envelope = await api<ApiEnvelope<T>>(path, init);
  return envelope.data;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && typeof init.body === "string" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  const contentType = response.headers.get("content-type") ?? "";
  const result = contentType.includes("application/json")
    ? ((await response.json()) as T & { error?: string })
    : null;

  if (!response.ok) {
    const message = result?.error || `The game service returned ${response.status}.`;
    throw new Error(message === "Game not found." ? "No active game found for that code." : message);
  }
  if (!result) throw new Error("The game service returned an unreadable response.");
  return result;
}

function rememberState(state: GameState) {
  const code = state.game.code;
  gameCodeById.set(state.game.id, code);
  for (const item of [
    ...state.groups,
    ...state.tasks,
    ...state.stops,
    ...state.memberships,
    ...state.roster,
    ...state.submissions,
  ]) {
    resourceCodeById.set(item.id, code);
  }
}

function retainFreshestState(state: GameState) {
  const revision = normalizeRevision(state.revision);
  const latestState = latestStateByGameId.get(state.game.id);
  const latestRevision = latestState
    ? normalizeRevision(latestState.revision)
    : undefined;

  if (
    revision !== undefined &&
    latestRevision !== undefined &&
    revision < latestRevision
  ) {
    return latestState!;
  }

  latestStateByGameId.set(state.game.id, state);
  if (revision !== undefined) {
    latestRevisionByGameId.set(state.game.id, revision);
  }
  return state;
}

function normalizeRevision(value: unknown) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : undefined;
}

function requireCode(resourceId: string) {
  const code = gameCodeById.get(resourceId) ?? resourceCodeById.get(resourceId);
  if (!code) throw new Error("Reload the room and try again.");
  return code;
}

function normalizeGameCode(value: string) {
  return value.trim().toUpperCase();
}
