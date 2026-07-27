// @vitest-environment jsdom

import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  createPendingProofUpload,
  deletePendingProofUploadsForMembership,
  readPendingProofUploads,
  savePendingProofUpload,
} from "./pendingProofStore";

describe("pending proof shared-device isolation", () => {
  it("separates memberships, deletes one student's rows, and purges expired photos", async () => {
    const first = createPendingProofUpload({
      file: new File(["first"], "first.jpg", { type: "image/jpeg" }),
      gameCode: "CLASS-ROOM",
      gameId: "game-1",
      membershipId: "student-1",
      groupId: "team-1",
      taskId: "task-1",
    });
    const second = createPendingProofUpload({
      file: new File(["second"], "second.jpg", { type: "image/jpeg" }),
      gameCode: "CLASS-ROOM",
      gameId: "game-1",
      membershipId: "student-2",
      groupId: "team-1",
      taskId: "task-1",
    });

    expect(first.id).not.toBe(second.id);
    await savePendingProofUpload(first);
    await savePendingProofUpload(second);
    expect(
      (await readPendingProofUploads()).map((upload) => upload.membershipId).sort(),
    ).toEqual(["student-1", "student-2"]);

    await deletePendingProofUploadsForMembership("game-1", "student-1");
    expect(
      (await readPendingProofUploads()).map((upload) => upload.membershipId),
    ).toEqual(["student-2"]);

    await savePendingProofUpload({
      ...second,
      updatedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
    });
    expect(await readPendingProofUploads()).toEqual([]);
  });
});

