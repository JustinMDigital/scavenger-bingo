import { describe, expect, it } from "vitest";
import {
  TASK_CATALOG,
  TASK_CATEGORIES,
  TASK_SETTINGS,
  getCatalogTask,
  searchTaskCatalog,
} from "./taskCatalog";

describe("task catalog", () => {
  it("contains 250 unique, complete, reviewed task definitions", () => {
    expect(TASK_CATALOG).toHaveLength(250);
    expect(new Set(TASK_CATALOG.map((task) => task.id)).size).toBe(250);

    for (const task of TASK_CATALOG) {
      expect(task.id).toMatch(/^[a-z0-9-]+$/);
      expect(task.title.trim()).not.toBe("");
      expect(task.description.trim()).not.toBe("");
      expect(task.icon.trim()).not.toBe("");
      expect(TASK_CATEGORIES).toContain(task.category);
      expect(task.settings.length).toBeGreaterThan(0);
      task.settings.forEach((setting) => expect(TASK_SETTINGS).toContain(setting));
      expect(task.tags.length).toBeGreaterThan(2);
      expect(getCatalogTask(task.id)).toBe(task);
    }
  });

  it("supports title, description, tag, setting, and category search", () => {
    expect(searchTaskCatalog({ query: "Group Selfie" }).map((task) => task.id))
      .toContain("group-selfie");
    expect(searchTaskCatalog({ query: "reflection" }).map((task) => task.id))
      .toContain("reflection");
    expect(searchTaskCatalog({ query: "school" }).length).toBeGreaterThan(0);

    const nature = searchTaskCatalog({ category: "Nature", query: "leaf" });
    expect(nature.length).toBeGreaterThan(0);
    expect(nature.every((task) => task.category === "Nature")).toBe(true);
    expect(searchTaskCatalog({ category: "All" })).toHaveLength(250);
  });

  it("provides 25 choices in every category", () => {
    for (const category of TASK_CATEGORIES) {
      expect(searchTaskCatalog({ category })).toHaveLength(25);
    }
  });
});
