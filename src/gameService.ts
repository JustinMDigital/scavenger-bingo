export const DEFAULT_GAME_CODE = "";
export const PROOFS_BUCKET = "proofs";

export type SubmissionStatus = "pending" | "approved" | "retake";
export type TaskStatus = "ready" | "pending" | "approved" | "retake";
export type HuntPhase = "live" | "play" | "review";

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
};

export type Membership = {
  id: string;
  gameId: string;
  userId: string;
  role: "player" | "host";
  groupId: string | null;
  displayName: string;
};

export type RosterMember = {
  id: string;
  gameId: string;
  role: "player" | "host";
  groupId: string | null;
  displayName: string;
};

export type Submission = {
  id: string;
  groupId: string;
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
const REALTIME_RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];

export async function ensureAnonymousSession() {
  const response = await fetch("/api/health", { credentials: "same-origin" });
  if (!response.ok) throw new Error("The game service is unavailable.");
  return { id: "browser-session" };
}

export async function loadGameState(gameCode = DEFAULT_GAME_CODE): Promise<GameState> {
  const code = normalizeGameCode(gameCode);
  if (!code) throw new Error("Game code is required.");

  const state = await api<GameState>(`/api/games/${encodeURIComponent(code)}`);
  rememberState(state);
  return state;
}

export async function joinGame({
  gameId,
  groupId,
  displayName,
}: {
  gameId: string;
  groupId: string;
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
}: {
  gameCode: string;
  pin: string;
  displayName: string;
}) {
  const code = normalizeGameCode(gameCode);
  if (!code) throw new Error("Game code is required.");
  const membership = await apiData<Membership>(
    `/api/games/${encodeURIComponent(code)}/host`,
    {
      method: "POST",
      body: JSON.stringify({ pin, displayName: displayName.trim() }),
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
  return action<Membership>(requireCode(membershipId), "kickPlayer", {
    membershipId,
  });
}

export function addGroup({ gameId, name }: { gameId: string; name?: string }) {
  return action<Group>(requireCode(gameId), "addGroup", { gameId, name });
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

export function resetGameProofs(gameId: string) {
  return action<{ deletedImages: number; deletedSubmissions: number }>(
    requireCode(gameId),
    "resetGameProofs",
    { gameId },
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

export function updateTaskDetails(
  gameId: string,
  taskId: string,
  patch: Partial<Pick<Task, "title" | "description" | "icon" | "free" | "sortOrder">>,
) {
  return action<Task>(requireCode(gameId), "updateTask", { gameId, taskId, patch });
}

export function removeTask(gameId: string, taskId: string) {
  return action<void>(requireCode(gameId), "removeTask", { gameId, taskId });
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
  patch: Partial<{
    activeStopId: string | null;
    phase: HuntPhase;
    timerRunning: boolean;
    timerStartedAt: string;
    timerSecondsTotal: number;
    boardHidden: boolean;
  }>,
) {
  return action<Game>(requireCode(gameId), "updateGame", { gameId, patch });
}

export function subscribeToGameChanges(gameId: string, onChange: () => void) {
  const code = gameCodeById.get(gameId);
  if (!code || typeof window === "undefined" || !("WebSocket" in window)) {
    return () => undefined;
  }

  let socket: WebSocket | null = null;
  let reconnectTimer: number | undefined;
  let reconnectAttempt = 0;
  let stopped = false;

  const connect = () => {
    if (stopped || document.visibilityState === "hidden" || !navigator.onLine) return;
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(
      `${scheme}://${window.location.host}/api/games/${encodeURIComponent(code)}/ws`,
    );
    socket.addEventListener("open", () => {
      reconnectAttempt = 0;
      onChange();
    });
    socket.addEventListener("message", (event) => {
      if (event.data !== "pong") onChange();
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
    window.removeEventListener("online", resume);
    document.removeEventListener("visibilitychange", resume);
    socket?.close(1000, "View closed");
  };
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

function requireCode(resourceId: string) {
  const code = gameCodeById.get(resourceId) ?? resourceCodeById.get(resourceId);
  if (!code) throw new Error("Reload the room and try again.");
  return code;
}

function normalizeGameCode(value: string) {
  return value.trim().toUpperCase();
}
