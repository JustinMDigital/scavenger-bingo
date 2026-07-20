export type SubmissionStatus = "pending" | "approved" | "retake";
export type HuntPhase = "live" | "play" | "review";

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
  status: SubmissionStatus;
  createdAt: number;
  updatedAt: number;
};

export type StoredRoom = {
  version: 1;
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
  const groups: StoredGroup[] = [
    group("team-1", "Team 1", "blue", 1),
    group("team-2", "Team 2", "green", 2),
    group("team-3", "Team 3", "gold", 3),
  ];
  const tasks = STARTER_TASKS.map((item) => ({ ...item }));

  return {
    version: 1,
    createdAt: now,
    expiresAt: now + 7 * 24 * 60 * 60 * 1000,
    pinSalt,
    pinHash,
    game: {
      id: gameId,
      code,
      name: `${code} Scavenger Hunt`,
      phase: "play",
      activeStopId: null,
      timerRunning: false,
      timerStartedAt: new Date(now).toISOString(),
      timerSecondsTotal: 0,
      boardHidden: true,
    },
    groups,
    tasks,
    boardAssignments: createBoards(groups, tasks),
    stops: [
      stop("opening-stop", "Opening Stop", "Regroup here before the first play window starts.", "10:30 AM", "11:00 AM", 1),
      stop("midpoint-stop", "Midpoint Stop", "Meet here before the next play window starts.", "11:30 AM", "12:15 PM", 2),
      stop("finish-stop", "Finish Stop", "Gather here to review proof photos and wrap the game.", "12:45 PM", "1:15 PM", 3),
    ],
    memberships: [],
    submissions: [],
  };
}

export function createBoards(
  groups: StoredGroup[],
  tasks: StoredTask[],
): StoredBoardAssignment[] {
  return groups.flatMap((item) => createBoardForGroup(item.id, tasks));
}

export function createBoardForGroup(
  groupId: string,
  tasks: StoredTask[],
): StoredBoardAssignment[] {
  const sorted = [...tasks].sort((a, b) => a.sortOrder - b.sortOrder);
  const centerTask = sorted.find((item) => item.free);
  const nonFree = sorted.filter((item) => !item.free);
  const shared = nonFree.slice(0, 4);
  const varied = nonFree
    .filter((item) => !shared.some((sharedTask) => sharedTask.id === item.id))
    .sort((a, b) => stableHash(`${groupId}:${a.id}`) - stableHash(`${groupId}:${b.id}`));
  const slots = Array.from({ length: 25 }, (_, index) => index + 1).filter(
    (slot) => slot > 4 && (slot !== 13 || !centerTask),
  );
  const assignments = shared.map((item, index) => ({
    groupId,
    taskId: item.id,
    slotOrder: index + 1,
  }));

  varied.slice(0, slots.length).forEach((item, index) => {
    assignments.push({ groupId, taskId: item.id, slotOrder: slots[index] });
  });

  if (centerTask) {
    assignments.push({ groupId, taskId: centerTask.id, slotOrder: 13 });
  }

  return assignments.sort((a, b) => a.slotOrder - b.slotOrder);
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
