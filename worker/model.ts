export type SubmissionStatus = "pending" | "approved" | "retake";
export type HuntPhase = "live" | "play" | "review";
export type PlayMode = "teams" | "individual";
export type WinCondition = "blackout" | "bingo";
export type BoardMode = "shared" | "randomized";
export type ProofMode = "required" | "optional" | "none";
export type ApprovalMode = "host" | "automatic";
export type PlayerExportMode = "host-only" | "team-after-review";
export type TimerMode = "none" | "duration" | "schedule";
export type BoardSize = 3 | 4 | 5;
export const MAX_PLAYABLE_TASKS_PER_ROOM = 100;

export type StoredGame = {
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
  playerExportMode: PlayerExportMode;
  timerMode: TimerMode;
  timerDurationMinutes: number;
  lobbyOpen: boolean;
  teamsLocked: boolean;
};

export type StoredGroup = {
  id: string;
  name: string;
  shortName: string;
  colorKey: string;
  sortOrder: number;
};

export type StoredTask = {
  id: string;
  catalogId?: string;
  title: string;
  description: string;
  icon: string;
  free?: boolean;
  sortOrder: number;
};

export type StoredBoardAssignment = {
  groupId: string;
  taskId: string;
  slotOrder: number;
};

export type StoredStop = {
  id: string;
  name: string;
  detail: string;
  arriveTime: string;
  leaveTime: string;
  sortOrder: number;
};

export type StoredMembership = {
  id: string;
  gameId: string;
  userId: string;
  role: "player" | "host";
  groupId: string | null;
  displayName: string;
  createdAt: number;
  isOwner?: boolean;
};

export type StoredSubmission = {
  id: string;
  groupId: string;
  taskId: string;
  submittedBy: string;
  submittedByName: string | null;
  imagePath: string;
  imageName: string;
  contentType: string;
  byteLength?: number;
  status: SubmissionStatus;
  createdAt: number;
  updatedAt: number;
};

export type StoredRoom = {
  version: 2;
  revision: number;
  createdAt: number;
  expiresAt: number;
  pinSalt: string;
  pinHash: string;
  game: StoredGame;
  groups: StoredGroup[];
  tasks: StoredTask[];
  boardAssignments: StoredBoardAssignment[];
  stops: StoredStop[];
  memberships: StoredMembership[];
  submissions: StoredSubmission[];
};

export const GROUP_COLOR_KEYS = [
  "purple",
  "maroon",
  "orange",
  "blue",
  "green",
  "teal",
  "pink",
  "gold",
] as const;

const STARTER_TASKS: StoredTask[] = [
  task("group-selfie", "Group Selfie", "Take one photo with everyone in your group visible.", "Camera", 1),
  task("something-red", "Something Red", "Find something red and take a clear photo.", "Badge", 2),
  task("helpful-sign", "Helpful Sign", "Find a sign that helps people navigate.", "Signpost", 3),
  task("interesting-seat", "Interesting Seat", "Find a bench, chair, or place to sit.", "Armchair", 4),
  task("water-break", "Water Break", "Take a photo of a water bottle or drink stop.", "Droplets", 5),
  task("plant-detail", "Plant Detail", "Take a close photo of a plant, leaf, or flower.", "Leaf", 6),
  task("something-round", "Something Round", "Find something round and snap a photo.", "Circle", 7),
  task("team-pose", "Team Pose", "Create a team pose and take a photo.", "Users", 8),
  task("cool-hat", "Cool Hat", "Find the best hat nearby.", "HardHat", 9),
  task("reflection", "Reflection", "Take a photo of a reflection.", "Glasses", 10),
  task("snack", "Snack", "Find a snack and take a photo.", "Cookie", 11),
  task("wheels", "Wheels", "Find a bike, scooter, cart, or anything with wheels.", "Bike", 12),
  task("free", "FREE", "Free space. This one is already yours.", "Star", 13, true),
  task("public-clock", "Clock Or Timer", "Find a clock, timer, or schedule sign.", "Clock", 14),
  task("interesting-texture", "Interesting Texture", "Find a texture that looks good up close.", "Gem", 15),
  task("tiny-thing", "Tiny Thing", "Find the smallest interesting thing nearby.", "Bug", 16),
  task("tall-thing", "Tall Thing", "Find the tallest thing you can see from here.", "TreePine", 17),
  task("trash-can", "Trash Can", "Find a trash can and take a clean photo of it.", "Trash2", 18),
  task("animal", "Animal", "Find an animal, animal sign, or animal-themed item.", "Dog", 19),
  task("food-place", "Food Place", "Find a place that serves or sells food.", "Utensils", 20),
  task("drink-place", "Drink Place", "Find a place to get a drink.", "CupSoda", 21),
  task("something-blue", "Something Blue", "Find something blue and take a photo.", "Waves", 22),
  task("group-shadow", "Group Shadow", "Take a photo of your group shadow.", "Cloud", 23),
  task("kindness", "Kindness", "Do something helpful and take an appropriate photo.", "HeartHandshake", 24),
  task("team-jump", "Team Jump", "Take a mid-air team jump photo.", "Triangle", 25),
  task("local-landmark", "Local Landmark", "Find a recognizable landmark or entrance sign.", "Landmark", 26),
  task("ticket-or-receipt", "Ticket Or Receipt", "Find a ticket, receipt, or posted price.", "Ticket", 27),
  task("mail-or-message", "Mail Or Message", "Find a mailbox, posted note, or message board.", "Mailbox", 28),
  task("pattern", "Pattern", "Find a repeated pattern.", "Grid3X3", 29),
  task("something-shiny", "Something Shiny", "Find something shiny or reflective.", "Gem", 30),
  task("team-wave", "Team Wave", "Take a photo of everyone waving.", "Users", 31),
  task("weather-detail", "Weather Detail", "Take a photo that shows today's weather.", "Umbrella", 32),
  task("sport-or-game", "Sport Or Game", "Find sports gear, a game, or a play area.", "Goal", 33),
  task("public-art", "Public Art", "Find art, decoration, or a creative display.", "Image", 34),
  task("transportation", "Transportation", "Find a vehicle, transit sign, or route marker.", "Bus", 35),
  task("team-initials", "Team Initials", "Find or make your team initials.", "Flag", 36),
  task("number-7", "Number 7", "Find the number 7.", "Hash", 37),
  task("someone-laughing", "Someone Laughing", "Capture a real laugh from your group.", "Smile", 38),
  task("opposite-colors", "Opposite Colors", "Find two very different colors side by side.", "Palette", 39),
  task("something-heavy", "Something Heavy", "Find something that looks heavy.", "Truck", 40),
  task("something-light", "Something Light", "Find something light, airy, or floating.", "Bird", 41),
  task("final-group-shot", "Final Group Shot", "Take one strong group photo for the end of the game.", "Trophy", 42),
];

export function createStarterRoom({
  code,
  pinSalt,
  pinHash,
  now = Date.now(),
}: {
  code: string;
  pinSalt: string;
  pinHash: string;
  now?: number;
}): StoredRoom {
  const gameId = crypto.randomUUID();
  const groups: StoredGroup[] = [];
  const tasks = [createFreeSpaceTask()];

  return {
    version: 2,
    revision: 0,
    createdAt: now,
    expiresAt: now + 7 * 24 * 60 * 60 * 1000,
    pinSalt,
    pinHash,
    game: {
      id: gameId,
      code,
      name: `${code} Scavenger Hunt`,
      phase: "review",
      activeStopId: null,
      timerRunning: false,
      timerStartedAt: new Date(now).toISOString(),
      timerSecondsTotal: 0,
      boardHidden: true,
      setupComplete: false,
      playMode: "teams",
      winCondition: "blackout",
      boardSize: 5,
      boardMode: "randomized",
      freeSpace: true,
      boardsNeedShuffle: true,
      proofMode: "none",
      approvalMode: "host",
      playerExportMode: "host-only",
      timerMode: "none",
      timerDurationMinutes: 60,
      lobbyOpen: true,
      teamsLocked: false,
    },
    groups,
    tasks,
    boardAssignments: [],
    stops: [],
    memberships: [],
    submissions: [],
  };
}

export function createStarterTasks(): StoredTask[] {
  return STARTER_TASKS.map((item) => ({ ...item }));
}

export function createFreeSpaceTask(): StoredTask {
  return { ...STARTER_TASKS.find((item) => item.free)! };
}

export function getTaskSelectionLimit(
  game: Pick<StoredGame, "boardMode" | "boardSize" | "freeSpace">,
) {
  if (game.boardMode === "randomized") return MAX_PLAYABLE_TASKS_PER_ROOM;
  return (
    game.boardSize * game.boardSize -
    (game.freeSpace && game.boardSize % 2 === 1 ? 1 : 0)
  );
}

export function createBoards(
  groups: StoredGroup[],
  tasks: StoredTask[],
  boardSize: BoardSize = 5,
  boardMode: BoardMode = "randomized",
  includeFreeSpace = true,
  shuffleSeed = "initial",
): StoredBoardAssignment[] {
  if (groups.length === 0) return [];

  const layout = getBoardLayout(tasks, boardSize, includeFreeSpace);
  const shuffledPool = stableShuffle(layout.nonFreeTasks, `${shuffleSeed}:pool`);
  const sharedTasks = stableShuffle(
    shuffledPool.slice(0, layout.playableSlots.length),
    `${shuffleSeed}:shared:positions`,
  );

  return groups.flatMap((groupValue, groupIndex) => {
    const selectedTasks = boardMode === "shared"
      ? sharedTasks
      : Array.from(
          { length: Math.min(layout.playableSlots.length, shuffledPool.length) },
          (_, index) =>
            shuffledPool[(groupIndex * layout.playableSlots.length + index) % shuffledPool.length],
        );
    const orderedTasks = boardMode === "shared"
      ? selectedTasks
      : stableShuffle(selectedTasks, `${shuffleSeed}:${groupValue.id}:positions`);

    return assignmentsForTasks(
      groupValue.id,
      orderedTasks,
      layout.playableSlots,
      layout.centerTask,
      layout.centerSlot,
    );
  });
}

export function createBoardForGroup(
  groupId: string,
  tasks: StoredTask[],
  boardSize: BoardSize = 5,
  boardMode: BoardMode = "randomized",
  includeFreeSpace = true,
  existingAssignments: StoredBoardAssignment[] = [],
  shuffleSeed = groupId,
): StoredBoardAssignment[] {
  const layout = getBoardLayout(tasks, boardSize, includeFreeSpace);

  if (boardMode === "shared" && existingAssignments.length > 0) {
    const sourceGroupId = existingAssignments[0].groupId;
    return existingAssignments
      .filter((assignment) => assignment.groupId === sourceGroupId)
      .map((assignment) => ({ ...assignment, groupId }));
  }

  const usageCounts = new Map<string, number>();
  existingAssignments.forEach((assignment) => {
    const task = tasks.find((item) => item.id === assignment.taskId);
    if (task && !task.free) {
      usageCounts.set(task.id, (usageCounts.get(task.id) ?? 0) + 1);
    }
  });
  const selectedTasks = [...layout.nonFreeTasks]
    .sort(
      (first, second) =>
        (usageCounts.get(first.id) ?? 0) - (usageCounts.get(second.id) ?? 0) ||
        stableHash(`${shuffleSeed}:${first.id}`) - stableHash(`${shuffleSeed}:${second.id}`),
    )
    .slice(0, layout.playableSlots.length);
  const orderedTasks = stableShuffle(selectedTasks, `${shuffleSeed}:${groupId}:positions`);

  return assignmentsForTasks(
    groupId,
    orderedTasks,
    layout.playableSlots,
    layout.centerTask,
    layout.centerSlot,
  );
}

export function upgradeRoom(storedRoom: StoredRoom | Record<string, unknown>): StoredRoom {
  const room = storedRoom as StoredRoom;
  const legacyGame = room.game as StoredGame & Partial<StoredGame>;
  const isLegacy = Number((storedRoom as { version?: number }).version ?? 1) < 2;

  room.version = 2;
  room.revision = normalizeRoomRevision(
    (storedRoom as { revision?: unknown }).revision,
  );
  room.game = {
    ...legacyGame,
    setupComplete: legacyGame.setupComplete ?? isLegacy,
    playMode: legacyGame.playMode ?? "teams",
    winCondition: legacyGame.winCondition ?? "blackout",
    boardSize: legacyGame.boardSize ?? 5,
    boardMode: legacyGame.boardMode ?? "randomized",
    freeSpace: legacyGame.freeSpace ?? true,
    boardsNeedShuffle:
      legacyGame.boardsNeedShuffle ?? room.boardAssignments.length === 0,
    proofMode: legacyGame.proofMode ?? "required",
    approvalMode: legacyGame.approvalMode ?? "host",
    playerExportMode: legacyGame.playerExportMode ?? "host-only",
    timerMode: legacyGame.timerMode ?? (room.stops.length > 0 ? "schedule" : "none"),
    timerDurationMinutes: legacyGame.timerDurationMinutes ?? 60,
    lobbyOpen: legacyGame.lobbyOpen ?? true,
    teamsLocked: legacyGame.teamsLocked ?? false,
  };
  room.memberships = room.memberships.map((membership, index) => ({
    ...membership,
    ...(membership.role === "host" && membership.isOwner === undefined
      ? { isOwner: index === room.memberships.findIndex((item) => item.role === "host") }
      : {}),
  }));
  return room;
}

function normalizeRoomRevision(value: unknown) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

export function toPublicGroup(groupValue: StoredGroup) {
  return {
    id: groupValue.id,
    name: groupValue.name,
    shortName: groupValue.shortName,
    color: `var(--group-${groupValue.colorKey})`,
    dark: `var(--group-${groupValue.colorKey}-dark)`,
    soft: `var(--group-${groupValue.colorKey}-soft)`,
  };
}

function task(
  id: string,
  title: string,
  description: string,
  icon: string,
  sortOrder: number,
  free = false,
): StoredTask {
  return { id, title, description, icon, sortOrder, ...(free ? { free } : {}) };
}

function group(id: string, name: string, colorKey: string, sortOrder: number): StoredGroup {
  return { id, name, shortName: name, colorKey, sortOrder };
}

function stop(
  id: string,
  name: string,
  detail: string,
  arriveTime: string,
  leaveTime: string,
  sortOrder: number,
): StoredStop {
  return { id, name, detail, arriveTime, leaveTime, sortOrder };
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getBoardLayout(
  tasks: StoredTask[],
  boardSize: BoardSize,
  includeFreeSpace: boolean,
) {
  const sorted = [...tasks].sort((a, b) => a.sortOrder - b.sortOrder);
  const slotCount = boardSize * boardSize;
  const centerSlot = Math.floor(slotCount / 2) + 1;
  const centerTask = includeFreeSpace && boardSize % 2 === 1
    ? sorted.find((item) => item.free)
    : undefined;
  const playableSlots = Array.from({ length: slotCount }, (_, index) => index + 1).filter(
    (slot) => slot !== centerSlot || !centerTask,
  );

  return {
    centerSlot,
    centerTask,
    nonFreeTasks: sorted.filter((item) => !item.free),
    playableSlots,
  };
}

function assignmentsForTasks(
  groupId: string,
  tasks: StoredTask[],
  playableSlots: number[],
  centerTask: StoredTask | undefined,
  centerSlot: number,
) {
  const assignments = tasks.map((taskValue, index) => ({
    groupId,
    taskId: taskValue.id,
    slotOrder: playableSlots[index],
  }));

  if (centerTask) {
    assignments.push({ groupId, taskId: centerTask.id, slotOrder: centerSlot });
  }

  return assignments.sort((first, second) => first.slotOrder - second.slotOrder);
}

function stableShuffle<T extends { id: string }>(values: T[], seed: string) {
  return [...values].sort(
    (first, second) =>
      stableHash(`${seed}:${first.id}`) - stableHash(`${seed}:${second.id}`),
  );
}
