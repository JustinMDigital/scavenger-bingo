import { describe, expect, it } from "vitest";
import {
  createBoardForGroup,
  createBoards,
  createFreeSpaceTask,
  getTaskSelectionLimit,
  type BoardSize,
  type StoredGroup,
  type StoredTask,
} from "./model";

const GROUPS: StoredGroup[] = [
  { id: "alpha", name: "Alpha", shortName: "Alpha", colorKey: "purple", sortOrder: 1 },
  { id: "bravo", name: "Bravo", shortName: "Bravo", colorKey: "blue", sortOrder: 2 },
  { id: "charlie", name: "Charlie", shortName: "Charlie", colorKey: "green", sortOrder: 3 },
];

describe("board assignment", () => {
  it("caps shared pools at one board and randomized pools at 100 tasks", () => {
    expect(
      getTaskSelectionLimit({
        boardMode: "shared",
        boardSize: 3,
        freeSpace: true,
      }),
    ).toBe(8);
    expect(
      getTaskSelectionLimit({
        boardMode: "shared",
        boardSize: 4,
        freeSpace: false,
      }),
    ).toBe(16);
    expect(
      getTaskSelectionLimit({
        boardMode: "randomized",
        boardSize: 3,
        freeSpace: true,
      }),
    ).toBe(100);
  });

  it("makes shared boards identical in both tasks and positions", () => {
    const boards = createBoards(GROUPS, tasks(30), 5, "shared", true, "shared-one");
    const first = boardFor(boards, "alpha");

    expect(boardFor(boards, "bravo")).toEqual(
      first.map((assignment) => ({ ...assignment, groupId: "bravo" })),
    );
    expect(boardFor(boards, "charlie")).toEqual(
      first.map((assignment) => ({ ...assignment, groupId: "charlie" })),
    );
  });

  it("reduces overlap naturally as the selected pool grows", () => {
    const oneBoardPool = createBoards(GROUPS.slice(0, 2), tasks(8), 3, "randomized", true, "small");
    const alphaSmall = playableIds(oneBoardPool, "alpha");
    const bravoSmall = playableIds(oneBoardPool, "bravo");
    expect(new Set(alphaSmall)).toEqual(new Set(bravoSmall));
    expect(alphaSmall).not.toEqual(bravoSmall);

    const twoBoardPool = createBoards(GROUPS.slice(0, 2), tasks(16), 3, "randomized", true, "large");
    const alphaLarge = new Set(playableIds(twoBoardPool, "alpha"));
    const bravoLarge = new Set(playableIds(twoBoardPool, "bravo"));
    expect([...alphaLarge].filter((id) => bravoLarge.has(id))).toHaveLength(0);
  });

  it("uses every selected task when total board capacity can hold the pool", () => {
    const boards = createBoards(GROUPS.slice(0, 2), tasks(12), 3, "randomized", true, "coverage");
    const used = new Set(
      boards.filter((assignment) => assignment.taskId !== "free").map((assignment) => assignment.taskId),
    );
    expect(used.size).toBe(12);

    for (const group of GROUPS.slice(0, 2)) {
      const ids = playableIds(boards, group.id);
      expect(ids).toHaveLength(8);
      expect(new Set(ids).size).toBe(8);
    }
  });

  it("creates a genuinely different arrangement for a new shuffle seed", () => {
    const first = createBoards(GROUPS, tasks(40), 5, "randomized", true, "shuffle-one");
    const second = createBoards(GROUPS, tasks(40), 5, "randomized", true, "shuffle-two");
    expect(second).not.toEqual(first);
  });

  it("handles every board size and only adds a free center to odd boards", () => {
    for (const size of [3, 4, 5] as BoardSize[]) {
      for (const includeFree of [false, true]) {
        const boards = createBoards(GROUPS.slice(0, 1), tasks(100), size, "randomized", includeFree, `${size}-${includeFree}`);
        expect(boards).toHaveLength(size * size);
        const free = boards.find((assignment) => assignment.taskId === "free");
        if (includeFree && size % 2 === 1) {
          expect(free?.slotOrder).toBe(Math.floor((size * size) / 2) + 1);
        } else {
          expect(free).toBeUndefined();
        }
      }
    }
  });

  it("balances a late individual board against tasks already in use", () => {
    const pool = tasks(24);
    const existing = createBoards(GROUPS.slice(0, 2), pool, 3, "randomized", true, "existing");
    const late = createBoardForGroup(
      "late-player",
      pool,
      3,
      "randomized",
      true,
      existing,
      "late",
    );
    const used = new Set(
      [...existing, ...late]
        .filter((assignment) => assignment.taskId !== "free")
        .map((assignment) => assignment.taskId),
    );
    expect(used.size).toBe(24);
    expect(new Set(playableIds(late, "late-player")).size).toBe(8);
  });
});

function tasks(count: number): StoredTask[] {
  return [
    ...Array.from({ length: count }, (_, index) => ({
      id: `task-${index + 1}`,
      title: `Task ${index + 1}`,
      description: `Instructions ${index + 1}`,
      icon: "Camera",
      sortOrder: index + 1,
    })),
    createFreeSpaceTask(),
  ];
}

function boardFor(
  assignments: ReturnType<typeof createBoards>,
  groupId: string,
) {
  return assignments.filter((assignment) => assignment.groupId === groupId);
}

function playableIds(
  assignments: ReturnType<typeof createBoards>,
  groupId: string,
) {
  return boardFor(assignments, groupId)
    .filter((assignment) => assignment.taskId !== "free")
    .map((assignment) => assignment.taskId);
}
