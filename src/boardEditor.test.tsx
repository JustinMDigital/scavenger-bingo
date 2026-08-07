// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardEditor } from "./App";
import type { Group, Task } from "./gameService";
import { TASK_CATALOG } from "./taskCatalog";

const GROUPS: Group[] = [
  {
    id: "blue",
    name: "Blue Team",
    shortName: "Blue Team",
    color: "var(--group-blue)",
    dark: "var(--group-blue-dark)",
    soft: "var(--group-blue-soft)",
  },
];

const TASKS: Task[] = [
  {
    id: "free",
    title: "FREE",
    description: "Free square.",
    icon: "Star",
    free: true,
    sortOrder: 1,
  },
  ...TASK_CATALOG.slice(0, 8).map((task, index) => ({
    id: task.id,
    catalogId: task.id,
    title: task.title,
    description: task.description,
    icon: task.icon,
    sortOrder: index + 2,
  })),
];

afterEach(cleanup);

describe("catalog board editor", () => {
  it("supports search, importing, editing, reset, custom tasks, and count announcements", () => {
    const onAddCatalogTask = vi.fn();
    const onAddTask = vi.fn();
    const onResetCatalogTask = vi.fn();
    const onUpdateTask = vi.fn();

    renderEditor({
      onAddCatalogTask,
      onAddTask,
      onResetCatalogTask,
      onUpdateTask,
    });

    expect(screen.getByText("8 selected · 8 minimum")).toBeTruthy();
    expect(screen.getByText(/the next shuffle will use 8 selected tasks/i)).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Search task catalog" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Load more tasks" })).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search task catalog" }), {
      target: { value: "giant perspective" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to boards" }));
    expect(onAddCatalogTask).toHaveBeenCalledWith("giant-perspective");

    fireEvent.click(screen.getAllByText("Group Selfie", { exact: true })[1]);
    const title = screen.getAllByRole("textbox", { name: "Title" })[0];
    fireEvent.change(title, { target: { value: "Our Group Selfie" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Apply" })[0]);
    expect(onUpdateTask).toHaveBeenCalledWith(
      "group-selfie",
      expect.objectContaining({ title: "Our Group Selfie" }),
    );

    cleanup();
    renderEditor({
      tasks: TASKS.map((task) =>
        task.id === "group-selfie"
          ? { ...task, title: "Our Group Selfie" }
          : task,
      ),
      onAddCatalogTask,
      onAddTask,
      onResetCatalogTask,
      onUpdateTask,
    });
    expect(screen.getByText("Edited")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onResetCatalogTask).toHaveBeenCalledWith("group-selfie");

    fireEvent.click(screen.getByRole("button", { name: "Create custom task" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Task title" }), {
      target: { value: "Custom Color Find" },
    });
    fireEvent.change(screen.getAllByRole("textbox", { name: "Instructions" })[0], {
      target: { value: "Find two matching colors." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add custom task" }));
    expect(onAddTask).toHaveBeenCalledWith({
      title: "Custom Color Find",
      description: "Find two matching colors.",
      icon: "Camera",
    });
  });

  it("has no automated accessibility violations", async () => {
    renderEditor();
    const result = await axe.run(document.body, {
      rules: {
        "color-contrast": { enabled: false },
      },
    });

    expect(
      result.violations.map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => node.target),
      })),
    ).toEqual([]);
  });

  it("shows a sample board before the editor is expanded", () => {
    renderEditor({ openByDefault: false, showHeading: true });

    expect(screen.getByRole("heading", { name: "Sample board" })).toBeTruthy();
    expect(screen.getByText("Blue Team")).toBeTruthy();
    expect(screen.queryByRole("searchbox", { name: "Search task catalog" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Group Selfie" }));
    expect(screen.getByRole("heading", { name: "Group Selfie" })).toBeTruthy();
    expect(screen.getByText(TASK_CATALOG[0].description)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Group Selfie" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Close challenge preview" }));
    expect(screen.queryByRole("heading", { name: "Group Selfie" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));

    expect(screen.queryByRole("heading", { name: "Sample board" })).toBeNull();
    expect(screen.getByRole("searchbox", { name: "Search task catalog" })).toBeTruthy();
  });

  it("prioritizes selected tasks when editing a template", () => {
    renderEditor({ prioritizeSelectedTasks: true });

    expect(screen.getByText("Selected tasks")).toBeTruthy();
    expect(screen.getByText("8 selected")).toBeTruthy();
    expect(screen.queryByRole("searchbox", { name: "Search task catalog" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add tasks" }));
    expect(screen.getByRole("searchbox", { name: "Search task catalog" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide task library" })).toBeTruthy();
  });

  it("keeps template task scrolling on the page and reveals the full list on request", () => {
    const templateTasks: Task[] = [
      TASKS[0],
      ...TASK_CATALOG.slice(0, 12).map((task, index) => ({
        id: task.id,
        catalogId: task.id,
        title: task.title,
        description: task.description,
        icon: task.icon,
        sortOrder: index + 2,
      })),
    ];

    renderEditor({ prioritizeSelectedTasks: true, tasks: templateTasks });

    expect(document.querySelectorAll(".selected-task-row")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "Show all 12 tasks" }));
    expect(document.querySelectorAll(".selected-task-row")).toHaveLength(12);
    expect(screen.getByRole("button", { name: "Show fewer tasks" })).toBeTruthy();
  });
});

function renderEditor({
  tasks = TASKS,
  onAddCatalogTask = vi.fn(),
  onAddTask = vi.fn(),
  onResetCatalogTask = vi.fn(),
  onUpdateTask = vi.fn(),
  openByDefault = true,
  prioritizeSelectedTasks = false,
  showHeading = false,
}: {
  tasks?: Task[];
  onAddCatalogTask?: (catalogTaskId: string) => void;
  onAddTask?: (task: { title?: string; description?: string; icon?: string }) => void;
  onResetCatalogTask?: (taskId: string) => void;
  onUpdateTask?: (
    taskId: string,
    patch: Partial<Pick<Task, "title" | "description" | "icon">>,
  ) => void;
  openByDefault?: boolean;
  prioritizeSelectedTasks?: boolean;
  showHeading?: boolean;
} = {}) {
  return render(
    <BoardEditor
      boardAssignments={[]}
      boardMode="randomized"
      boardSize={3}
      boardsLocked={false}
      boardsNeedShuffle
      freeSpace
      groups={GROUPS}
      onAddCatalogTask={onAddCatalogTask}
      onAddTask={onAddTask}
      onGenerateBoards={vi.fn()}
      onRemoveTask={vi.fn()}
      onResetCatalogTask={onResetCatalogTask}
      onSaveGroupBoard={vi.fn()}
      onUpdateBoardSetup={vi.fn()}
      onUpdateTask={onUpdateTask}
      openByDefault={openByDefault}
      playMode="teams"
      prioritizeSelectedTasks={prioritizeSelectedTasks}
      showHeading={showHeading}
      submissions={[]}
      tasks={tasks}
    />,
  );
}
