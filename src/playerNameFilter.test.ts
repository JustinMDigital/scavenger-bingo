import { describe, expect, it } from "vitest";
import { isAllowedPlayerName } from "./playerNameFilter";

describe("player name filter", () => {
  it.each([
    "Avery",
    "Dick",
    "Dickens",
    "Scunthorpe",
    "Class Hole",
    "Crackerjack",
    "Japanese Fan",
    "Monkey Team",
    "Pakistani Player",
    "Riley-42",
  ])("allows an ordinary nickname: %s", (name) => {
    expect(isAllowedPlayerName(name)).toBe(true);
  });

  it.each([
    "shit",
    "Sh1t",
    "f.u.c.k",
    "f u c k",
    "Sam Fuck",
    "fuuuck",
  ])("rejects an obvious blocked nickname: %s", (name) => {
    expect(isAllowedPlayerName(name)).toBe(false);
  });

  it.each([
    "sp1c",
    "w.e.t.b.a.c.k",
    "Sam porch monkey",
    "ching chong",
    "Team n i g g e r",
  ])("rejects a racial slur or simple disguise: %s", (name) => {
    expect(isAllowedPlayerName(name)).toBe(false);
  });
});
