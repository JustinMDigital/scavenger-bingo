import type PptxGenJS from "pptxgenjs";
import type { Game, Group, RosterMember, Submission, Task } from "./gameService";

const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";
const GOOGLE_SLIDES_MIME_TYPE = "application/vnd.google-apps.presentation";
const POWERPOINT_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const SLIDE_WIDTH = 13.333;
const SLIDE_HEIGHT = 7.5;
const COLORS = {
  accent: "5B4FC7",
  accentDark: "30296F",
  accentSoft: "EEECFF",
  background: "F7F8FC",
  border: "D9DCE8",
  danger: "B83A55",
  dangerSoft: "FDECF0",
  ink: "202235",
  muted: "686B7E",
  pending: "267357",
  pendingSoft: "E4F6EE",
  success: "267357",
  successSoft: "E4F6EE",
  white: "FFFFFF",
} as const;

export type PlayerSlidesExportInput = {
  game: Game;
  group: Group;
  roster: RosterMember[];
  submissions: Submission[];
  tasks: Task[];
  exportedAt?: Date;
};

export type PlayerSlidesExportItem = {
  task: Task;
  submission: Submission | null;
  status: "approved" | "pending" | "retake";
  noPhotoLabel: string | null;
};

export type PlayerSlidesNeedsWorkItem = {
  task: Task;
  reason: "Not started" | "Retake needed";
};

export type PlayerSlidesExportModel = {
  approvedCount: number;
  exportedAt: Date;
  fileName: string;
  gameName: string;
  groupName: string;
  itemSlides: PlayerSlidesExportItem[];
  members: string[];
  needsWork: PlayerSlidesNeedsWorkItem[];
  submittedCount: number;
  tasks: Task[];
  totalCount: number;
};

export type SlidesExportProgress = {
  completed?: number;
  label: string;
  total?: number;
};

export type PresentationArtifact = {
  blob: Blob;
  fileName: string;
  warnings: string[];
};

export type GoogleDrivePresentation = {
  id: string;
  name: string;
  webViewLink: string;
};

type LoadedSlideImage = {
  data: string;
  height: number;
  width: number;
};

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
};

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

type GoogleOAuth2 = {
  initTokenClient: (config: {
    callback: (response: GoogleTokenResponse) => void;
    client_id: string;
    error_callback?: (error: { message?: string; type?: string }) => void;
    scope: string;
  }) => GoogleTokenClient;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: GoogleOAuth2;
      };
    };
  }
}

let googleIdentityPromise: Promise<void> | null = null;
let cachedGoogleToken: { accessToken: string; expiresAt: number } | null = null;

export function buildPlayerSlidesExportModel({
  exportedAt = new Date(),
  game,
  group,
  roster,
  submissions,
  tasks,
}: PlayerSlidesExportInput): PlayerSlidesExportModel {
  const submissionsByTask = new Map(
    submissions
      .filter((submission) => submission.groupId === group.id)
      .map((submission) => [submission.taskId, submission]),
  );
  const members = roster
    .filter(
      (member) =>
        member.role === "player" &&
        (game.playMode === "individual"
          ? member.id === group.id || member.groupId === group.id
          : member.groupId === group.id),
    )
    .map((member) => member.displayName.trim())
    .filter(Boolean);
  const itemSlides: PlayerSlidesExportItem[] = [];
  const needsWork: PlayerSlidesNeedsWorkItem[] = [];
  let approvedCount = 0;
  let submittedCount = 0;

  for (const task of tasks) {
    const submission = submissionsByTask.get(task.id) ?? null;

    if (task.free) {
      approvedCount += 1;
      continue;
    }

    if (!submission) {
      needsWork.push({ reason: "Not started", task });
      continue;
    }

    submittedCount += 1;
    if (submission.status === "approved") {
      approvedCount += 1;
    }
    if (submission.status === "retake") {
      needsWork.push({ reason: "Retake needed", task });
    }

    itemSlides.push({
      noPhotoLabel: submission.imagePath ? null : "Completed without a photo",
      status: submission.status,
      submission,
      task,
    });
  }

  const groupName = group.shortName.trim() || group.name.trim() || "Player";
  const deckName = `${game.name.trim() || "Scavenger Hunt"} — ${groupName}`;

  return {
    approvedCount,
    exportedAt,
    fileName: `${getSafeFilename(deckName)}.pptx`,
    gameName: game.name.trim() || "Scavenger Hunt",
    groupName,
    itemSlides,
    members: members.length > 0 ? members : [groupName],
    needsWork,
    submittedCount,
    tasks,
    totalCount: tasks.length,
  };
}

export async function primeGoogleIdentity() {
  if (window.google?.accounts?.oauth2) {
    return;
  }

  if (!googleIdentityPromise) {
    googleIdentityPromise = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>(
        `script[src="${GOOGLE_IDENTITY_SCRIPT}"]`,
      );
      const script = existingScript ?? document.createElement("script");

      const handleLoad = () => {
        if (window.google?.accounts?.oauth2) {
          resolve();
        } else {
          googleIdentityPromise = null;
          reject(new Error("Google authorization did not finish loading."));
        }
      };
      const handleError = () => {
        googleIdentityPromise = null;
        reject(new Error("Google authorization could not be loaded."));
      };

      script.addEventListener("load", handleLoad, { once: true });
      script.addEventListener("error", handleError, { once: true });

      if (!existingScript) {
        script.async = true;
        script.defer = true;
        script.src = GOOGLE_IDENTITY_SCRIPT;
        document.head.appendChild(script);
      }
    });
  }

  return googleIdentityPromise;
}

export async function requestGoogleDriveAccessToken(clientId: string) {
  const cleanClientId = clientId.trim();

  if (!cleanClientId) {
    throw new Error("Google Slides export has not been configured.");
  }

  if (cachedGoogleToken && cachedGoogleToken.expiresAt > Date.now() + 60_000) {
    return cachedGoogleToken.accessToken;
  }

  await primeGoogleIdentity();
  const oauth2 = window.google?.accounts?.oauth2;

  if (!oauth2) {
    throw new Error("Google authorization is unavailable.");
  }

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const fail = (message: string) => {
      if (!settled) {
        settled = true;
        reject(new Error(message));
      }
    };
    const client = oauth2.initTokenClient({
      client_id: cleanClientId,
      scope: DRIVE_FILE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          fail(
            response.error_description ||
              (response.error === "access_denied"
                ? "Google Drive permission was not granted."
                : "Google authorization did not complete."),
          );
          return;
        }

        settled = true;
        const expiresInSeconds = Math.max(60, response.expires_in ?? 3600);
        cachedGoogleToken = {
          accessToken: response.access_token,
          expiresAt: Date.now() + expiresInSeconds * 1000,
        };
        resolve(response.access_token);
      },
      error_callback: (error) => {
        fail(
          error.type === "popup_closed"
            ? "The Google authorization window was closed."
            : error.message || "Google authorization could not open.",
        );
      },
    });

    client.requestAccessToken({ prompt: "" });
  });
}

export function clearCachedGoogleDriveToken() {
  cachedGoogleToken = null;
}

export async function createPlayerSlidesDeck({
  boardElement,
  model,
  onProgress,
}: {
  boardElement: HTMLElement | null;
  model: PlayerSlidesExportModel;
  onProgress?: (progress: SlidesExportProgress) => void;
}): Promise<PresentationArtifact> {
  const warnings: string[] = [];
  const photos = new Map<string, LoadedSlideImage>();
  const photoItems = model.itemSlides.filter(
    (item) => item.submission?.imagePath && item.submission.imageUrl,
  );
  let completedPhotos = 0;

  onProgress?.({
    completed: 0,
    label: photoItems.length > 0 ? "Preparing photos" : "Preparing presentation",
    total: photoItems.length,
  });

  // Decode one proof at a time so a full classroom board cannot make a
  // lower-memory Chromebook hold several large decoded images concurrently.
  for (const item of photoItems) {
    const submission = item.submission;

    if (!submission) {
      continue;
    }

    try {
      photos.set(submission.id, await loadSubmissionImage(submission));
    } catch {
      warnings.push(`${item.task.title}: photo unavailable`);
    } finally {
      completedPhotos += 1;
      onProgress?.({
        completed: completedPhotos,
        label: "Preparing photos",
        total: photoItems.length,
      });
    }
  }

  let boardImage: string | null = null;
  onProgress?.({ label: "Capturing board" });

  if (boardElement) {
    try {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      await waitForPaint();
      const { toPng } = await import("html-to-image");
      boardImage = await toPng(boardElement, {
        backgroundColor: "#f7f8fc",
        cacheBust: true,
        height: 900,
        pixelRatio: 1.5,
        skipFonts: true,
        width: 1600,
      });
    } catch {
      warnings.push("Board snapshot used a simplified layout");
    }
  }

  onProgress?.({ label: "Building presentation" });
  const { default: PptxGenJSClass } = await import("pptxgenjs");
  const pptx = new PptxGenJSClass();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Scavenger Bingo";
  pptx.company = "Scavenger Bingo";
  pptx.subject = `${model.groupName} game board export`;
  pptx.title = model.fileName.replace(/\.pptx$/i, "");
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
  };

  addTitleSlide(pptx, model);
  addBoardSlide(pptx, model, boardImage);

  for (const item of model.itemSlides) {
    const photo = item.submission ? photos.get(item.submission.id) ?? null : null;
    addItemSlide(pptx, item, photo);
  }

  addIncompleteSlide(pptx, model);
  const output = await pptx.write({ compression: true, outputType: "blob" });
  const blob =
    output instanceof Blob
      ? new Blob([output], { type: POWERPOINT_MIME_TYPE })
      : new Blob([output as BlobPart], { type: POWERPOINT_MIME_TYPE });

  return { blob, fileName: model.fileName, warnings };
}

export async function uploadPresentationToGoogleDrive({
  accessToken,
  artifact,
}: {
  accessToken: string;
  artifact: PresentationArtifact;
}): Promise<GoogleDrivePresentation> {
  const boundary = `scavenger_bingo_${crypto.randomUUID().replace(/-/g, "")}`;
  const googleName = artifact.fileName.replace(/\.pptx$/i, "");
  const metadata = JSON.stringify({
    mimeType: GOOGLE_SLIDES_MIME_TYPE,
    name: googleName,
  });
  const body = new Blob(
    [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      metadata,
      `\r\n--${boundary}\r\nContent-Type: ${POWERPOINT_MIME_TYPE}\r\n\r\n`,
      artifact.blob,
      `\r\n--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` },
  );
  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  if (!response.ok) {
    if (response.status === 401) {
      clearCachedGoogleDriveToken();
    }
    throw new Error(await getGoogleDriveError(response));
  }

  const result = (await response.json()) as {
    id?: string;
    name?: string;
    webViewLink?: string;
  };

  if (!result.id) {
    throw new Error("Google Drive created an unreadable presentation response.");
  }

  return {
    id: result.id,
    name: result.name || googleName,
    webViewLink:
      result.webViewLink ||
      `https://docs.google.com/presentation/d/${encodeURIComponent(result.id)}/edit`,
  };
}

export function downloadPresentation(artifact: PresentationArtifact) {
  const url = URL.createObjectURL(artifact.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = artifact.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function addTitleSlide(pptx: PptxGenJS, model: PlayerSlidesExportModel) {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.background };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.18,
    h: SLIDE_HEIGHT,
    fill: { color: COLORS.accent },
    line: { color: COLORS.accent },
  });
  slide.addText("SCAVENGER BINGO", {
    x: 0.72,
    y: 0.58,
    w: 4,
    h: 0.28,
    color: COLORS.accent,
    bold: true,
    charSpacing: 2,
    fontSize: 13,
    margin: 0,
  });
  slide.addText(model.gameName, {
    x: 0.72,
    y: 1.15,
    w: 8.7,
    h: 1.05,
    color: COLORS.ink,
    bold: true,
    breakLine: false,
    fit: "shrink",
    fontSize: 50,
    margin: 0,
    valign: "middle",
  });
  slide.addText(model.groupName, {
    x: 0.72,
    y: 2.35,
    w: 8.7,
    h: 0.65,
    color: COLORS.accentDark,
    bold: true,
    fit: "shrink",
    fontSize: 28,
    margin: 0,
  });
  slide.addText(`Members: ${model.members.join(", ")}`, {
    x: 0.72,
    y: 3.05,
    w: 8.7,
    h: 0.75,
    color: COLORS.muted,
    fit: "shrink",
    fontSize: 16,
    margin: 0,
    valign: "top",
  });

  const stats = [
    { label: "SUBMITTED", value: model.submittedCount, color: COLORS.accent },
    { label: "APPROVED", value: model.approvedCount, color: COLORS.success },
    { label: "NEEDS WORK", value: model.needsWork.length, color: COLORS.danger },
  ];

  stats.forEach((stat, index) => {
    const x = 0.72 + index * 2.78;
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 4.42,
      w: 2.5,
      h: 1.35,
      rectRadius: 0.08,
      fill: { color: COLORS.white },
      line: { color: COLORS.border, width: 1 },
    });
    slide.addText(String(stat.value), {
      x: x + 0.22,
      y: 4.65,
      w: 2.05,
      h: 0.48,
      align: "center",
      bold: true,
      color: stat.color,
      fontSize: 27,
      margin: 0,
    });
    slide.addText(stat.label, {
      x: x + 0.22,
      y: 5.2,
      w: 2.05,
      h: 0.25,
      align: "center",
      bold: true,
      charSpacing: 1.4,
      color: COLORS.muted,
      fontSize: 10,
      margin: 0,
    });
  });

  slide.addText(`${model.totalCount} board items`, {
    x: 9.65,
    y: 1.25,
    w: 2.75,
    h: 0.4,
    align: "right",
    color: COLORS.muted,
    fontSize: 15,
    margin: 0,
  });
  slide.addText(formatExportDate(model.exportedAt), {
    x: 8.7,
    y: 6.72,
    w: 3.7,
    h: 0.25,
    align: "right",
    color: COLORS.muted,
    fontSize: 11,
    margin: 0,
  });
}

function addBoardSlide(
  pptx: PptxGenJS,
  model: PlayerSlidesExportModel,
  boardImage: string | null,
) {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.background };

  if (boardImage) {
    slide.addImage({
      data: boardImage,
      x: 0,
      y: 0,
      w: SLIDE_WIDTH,
      h: SLIDE_HEIGHT,
      altText: `${model.groupName} board snapshot`,
    });
    return;
  }

  slide.addText("Board snapshot", {
    x: 0.6,
    y: 0.42,
    w: 5.6,
    h: 0.55,
    bold: true,
    color: COLORS.ink,
    fontSize: 35,
    margin: 0,
  });
  slide.addText(`${model.groupName} • ${model.approvedCount} approved`, {
    x: 7.1,
    y: 0.52,
    w: 5.55,
    h: 0.3,
    align: "right",
    color: COLORS.muted,
    fontSize: 14,
    margin: 0,
  });

  const size = Math.max(1, Math.round(Math.sqrt(model.tasks.length)));
  const gap = 0.09;
  const availableHeight = 5.95;
  const availableWidth = 11.55;
  const cellSize = Math.min(
    (availableWidth - gap * (size - 1)) / size,
    (availableHeight - gap * (size - 1)) / size,
  );
  const gridWidth = cellSize * size + gap * (size - 1);
  const startX = (SLIDE_WIDTH - gridWidth) / 2;
  const startY = 1.2;
  const itemByTask = new Map(model.itemSlides.map((item) => [item.task.id, item]));

  model.tasks.forEach((task, index) => {
    const column = index % size;
    const row = Math.floor(index / size);
    const item = itemByTask.get(task.id);
    const status = task.free ? "approved" : item?.status ?? "ready";
    const statusStyle = getStatusStyle(status);
    const x = startX + column * (cellSize + gap);
    const y = startY + row * (cellSize + gap);

    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w: cellSize,
      h: cellSize,
      rectRadius: 0.04,
      fill: { color: statusStyle.soft },
      line: { color: statusStyle.color, width: 1.3 },
    });
    slide.addText(task.title, {
      x: x + 0.12,
      y: y + 0.14,
      w: cellSize - 0.24,
      h: Math.max(0.35, cellSize - 0.56),
      align: "center",
      bold: true,
      color: COLORS.ink,
      fit: "shrink",
      fontSize: size >= 5 ? 13 : 18,
      margin: 0.02,
      valign: "middle",
    });
    slide.addText(getExportStatusLabel(status), {
      x: x + 0.12,
      y: y + cellSize - 0.32,
      w: cellSize - 0.24,
      h: 0.18,
      align: "center",
      bold: true,
      color: statusStyle.color,
      fontSize: 8,
      margin: 0,
    });
  });
}

function addItemSlide(
  pptx: PptxGenJS,
  item: PlayerSlidesExportItem,
  photo: LoadedSlideImage | null,
) {
  const slide = pptx.addSlide();
  const statusStyle = getStatusStyle(item.status);
  slide.background = { color: COLORS.background };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: SLIDE_WIDTH,
    h: 0.12,
    fill: { color: statusStyle.color },
    line: { color: statusStyle.color },
  });
  slide.addText(item.task.title, {
    x: 0.62,
    y: 0.42,
    w: 8.1,
    h: 0.7,
    bold: true,
    color: COLORS.ink,
    fit: "shrink",
    fontSize: 35,
    margin: 0,
    valign: "middle",
  });
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 10.45,
    y: 0.49,
    w: 2.25,
    h: 0.42,
    rectRadius: 0.04,
    fill: { color: statusStyle.soft },
    line: { color: statusStyle.color, width: 1 },
  });
  slide.addText(getExportStatusLabel(item.status), {
    x: 10.63,
    y: 0.6,
    w: 1.89,
    h: 0.16,
    align: "center",
    bold: true,
    color: statusStyle.color,
    fontSize: 10,
    margin: 0,
  });
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.62,
    y: 1.35,
    w: 7.65,
    h: 5.48,
    rectRadius: 0.05,
    fill: { color: COLORS.white },
    line: { color: COLORS.border, width: 1 },
  });

  if (photo) {
    slide.addImage({
      data: photo.data,
      x: 0.82,
      y: 1.55,
      w: 7.25,
      h: 5.08,
      sizing: { type: "contain", w: 7.25, h: 5.08 },
      altText: `Photo for ${item.task.title}`,
    });
  } else {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.95,
      y: 1.75,
      w: 6.99,
      h: 4.68,
      rectRadius: 0.05,
      fill: { color: "F0F1F6" },
      line: { color: COLORS.border, dashType: "dash", width: 1.4 },
    });
    slide.addText(
      item.noPhotoLabel ||
        (item.submission?.imagePath ? "Photo unavailable" : "No photo submitted"),
      {
        x: 1.45,
        y: 3.75,
        w: 5.99,
        h: 0.58,
        align: "center",
        bold: true,
        color: COLORS.muted,
        fit: "shrink",
        fontSize: 20,
        margin: 0,
      },
    );
  }

  slide.addText("PROMPT", {
    x: 8.72,
    y: 1.48,
    w: 3.9,
    h: 0.22,
    bold: true,
    charSpacing: 1.5,
    color: COLORS.accent,
    fontSize: 10,
    margin: 0,
  });
  slide.addText(item.task.description || item.task.title, {
    x: 8.72,
    y: 1.82,
    w: 3.9,
    h: 2.15,
    color: COLORS.ink,
    breakLine: false,
    fit: "shrink",
    fontSize: 20,
    margin: 0,
    valign: "top",
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 8.72,
    y: 4.32,
    w: 3.9,
    h: 0,
    line: { color: COLORS.border, width: 1 },
  });
  slide.addText(
    item.submission
      ? `Photo by ${getSubmitterName(item.submission)}`
      : "No photographer required",
    {
      x: 8.72,
      y: 4.64,
      w: 3.9,
      h: 0.45,
      bold: true,
      color: COLORS.ink,
      fit: "shrink",
      fontSize: 16,
      margin: 0,
    },
  );
  if (item.submission) {
    slide.addText(formatSubmissionDate(item.submission.createdAt), {
      x: 8.72,
      y: 5.2,
      w: 3.9,
      h: 0.26,
      color: COLORS.muted,
      fontSize: 11,
      margin: 0,
    });
  }
}

function addIncompleteSlide(pptx: PptxGenJS, model: PlayerSlidesExportModel) {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.background };
  slide.addText(
    model.needsWork.length > 0 ? "Incomplete items" : "Board complete",
    {
      x: 0.68,
      y: 0.48,
      w: 8.5,
      h: 0.68,
      bold: true,
      color: COLORS.ink,
      fontSize: 36,
      margin: 0,
    },
  );
  slide.addText(
    model.needsWork.length > 0
      ? `${model.needsWork.length} ${
          model.needsWork.length === 1 ? "item needs" : "items need"
        } more work.`
      : "Every board item has been completed.",
    {
      x: 0.68,
      y: 1.28,
      w: 7.6,
      h: 0.4,
      color: model.needsWork.length > 0 ? COLORS.danger : COLORS.success,
      fontSize: 16,
      margin: 0,
    },
  );

  if (model.needsWork.length === 0) {
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 5.42,
      y: 2.28,
      w: 2.5,
      h: 2.5,
      fill: { color: COLORS.successSoft },
      line: { color: COLORS.success, width: 2 },
    });
    slide.addText("✓", {
      x: 5.42,
      y: 2.75,
      w: 2.5,
      h: 1.2,
      align: "center",
      bold: true,
      color: COLORS.success,
      fontSize: 50,
      margin: 0,
    });
    return;
  }

  const rowCount = Math.ceil(model.needsWork.length / 2);
  const rowHeight = Math.min(0.42, 5.15 / Math.max(rowCount, 1));

  model.needsWork.forEach((item, index) => {
    const column = Math.floor(index / rowCount);
    const row = index % rowCount;
    const x = 0.68 + column * 6.2;
    const y = 1.95 + row * rowHeight;
    const color = item.reason === "Retake needed" ? COLORS.danger : COLORS.muted;

    slide.addShape(pptx.ShapeType.ellipse, {
      x,
      y: y + 0.06,
      w: 0.14,
      h: 0.14,
      fill: { color },
      line: { color },
    });
    slide.addText(item.task.title, {
      x: x + 0.28,
      y,
      w: 4.15,
      h: rowHeight,
      bold: true,
      color: COLORS.ink,
      fit: "shrink",
      fontSize: 13,
      margin: 0,
      valign: "middle",
    });
    slide.addText(item.reason, {
      x: x + 4.45,
      y,
      w: 1.42,
      h: rowHeight,
      align: "right",
      color,
      fit: "shrink",
      fontSize: 10,
      margin: 0,
      valign: "middle",
    });
  });
}

async function loadSubmissionImage(submission: Submission) {
  const url = new URL(submission.imageUrl, window.location.origin);

  if (url.origin !== window.location.origin) {
    throw new Error("Photo is outside the current game.");
  }

  const response = await fetch(url.toString(), {
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error("Photo could not be loaded.");
  }

  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("Proof response was not an image.");
  }

  return normalizeSlideImage(blob);
}

async function normalizeSlideImage(blob: Blob): Promise<LoadedSlideImage> {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Image conversion is unavailable.");
    }

    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    return {
      data: canvas.toDataURL("image/jpeg", 0.88),
      height,
      width,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Photo could not be decoded."));
    image.src = url;
  });
}

function waitForPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function getStatusStyle(status: "approved" | "pending" | "retake" | "ready") {
  if (status === "approved") {
    return { color: COLORS.success, soft: COLORS.successSoft };
  }
  if (status === "pending") {
    return { color: COLORS.pending, soft: COLORS.pendingSoft };
  }
  if (status === "retake") {
    return { color: COLORS.danger, soft: COLORS.dangerSoft };
  }
  return { color: COLORS.muted, soft: "F0F1F6" };
}

function getExportStatusLabel(status: "approved" | "pending" | "retake" | "ready") {
  if (status === "approved") return "Approved";
  if (status === "pending") return "Submitted";
  if (status === "retake") return "Retake needed";
  return "Not started";
}

function getSubmitterName(submission: Submission) {
  return submission.submittedByName?.trim() || "Unknown player";
}

function formatExportDate(date: Date) {
  return `Exported ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date)}`;
}

function formatSubmissionDate(timestamp: number) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Submission time unavailable";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getSafeFilename(value: string) {
  return (
    value
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "Scavenger Hunt"
  );
}

async function getGoogleDriveError(response: Response) {
  try {
    const result = (await response.json()) as {
      error?: { message?: string };
    };
    return result.error?.message || `Google Drive returned ${response.status}.`;
  } catch {
    return `Google Drive returned ${response.status}.`;
  }
}
