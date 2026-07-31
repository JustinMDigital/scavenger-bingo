import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  FileSliders,
  LoaderCircle,
} from "lucide-react";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import type { Game, Group, RosterMember, Submission, Task } from "./gameService";
import {
  buildPlayerSlidesExportModel,
  createPlayerSlidesDeck,
  downloadPresentation,
  requestGoogleDriveAccessToken,
  uploadPresentationToGoogleDrive,
} from "./slidesExport";
import type {
  GoogleDrivePresentation,
  PresentationArtifact,
  SlidesExportProgress,
} from "./slidesExport";

export function PlayerSlidesExport({
  audience = "player",
  game,
  group,
  roster,
  submissions,
  tasks,
}: {
  audience?: "host" | "player";
  game: Game;
  group: Group;
  roster: RosterMember[];
  submissions: Submission[];
  tasks: Task[];
}) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [artifact, setArtifact] = useState<PresentationArtifact | null>(null);
  const [createdPresentation, setCreatedPresentation] =
    useState<GoogleDrivePresentation | null>(null);
  const [downloadedFileName, setDownloadedFileName] = useState("");
  const [error, setError] = useState("");
  const [copyAcknowledged, setCopyAcknowledged] = useState(false);
  const [workingAction, setWorkingAction] = useState<
    "google-slides" | "download" | null
  >(null);
  const [progress, setProgress] = useState<SlidesExportProgress | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";
  const isWorking = workingAction !== null;
  const model = useMemo(
    () =>
      buildPlayerSlidesExportModel({
        game,
        group,
        roster,
        submissions,
        tasks,
      }),
    [game, group, roster, submissions, tasks],
  );

  useEffect(() => {
    setArtifact(null);
    setCreatedPresentation(null);
    setDownloadedFileName("");
    setError("");
    setWarnings([]);
    setCopyAcknowledged(false);
  }, [model]);
  const requiresAcknowledgment = audience === "player";
  const canExport = !requiresAcknowledgment || copyAcknowledged;

  async function prepareDeck() {
    if (artifact) {
      return artifact;
    }

    const nextArtifact = await createPlayerSlidesDeck({
      boardElement: boardRef.current,
      model,
      onProgress: setProgress,
    });
    setArtifact(nextArtifact);
    setWarnings(nextArtifact.warnings);
    return nextArtifact;
  }

  async function handleCreateGoogleSlides() {
    if (isWorking || !googleClientId) return;

    setCreatedPresentation(null);
    setDownloadedFileName("");
    setError("");
    setWorkingAction("google-slides");
    setProgress({ label: "Connecting to Google Drive" });

    try {
      const accessToken = await requestGoogleDriveAccessToken(googleClientId);
      const nextArtifact = await prepareDeck();
      setProgress({ label: "Creating Google Slides" });
      const presentation = await uploadPresentationToGoogleDrive({
        accessToken,
        artifact: nextArtifact,
      });
      setCreatedPresentation(presentation);
      setProgress(null);

      const opened = window.open(presentation.webViewLink, "_blank");
      if (opened) {
        opened.opener = null;
      }
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setProgress(null);
    } finally {
      setWorkingAction(null);
    }
  }

  async function handleDownloadPresentation() {
    if (isWorking) return;

    setError("");
    setWorkingAction("download");

    try {
      const nextArtifact = await prepareDeck();
      downloadPresentation(nextArtifact);
      setDownloadedFileName(nextArtifact.fileName);
      setProgress(null);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setProgress(null);
    } finally {
      setWorkingAction(null);
    }
  }

  return (
    <>
      <section
        aria-busy={isWorking}
        aria-labelledby="slides-export-title"
        className="player-slides-export"
      >
        <div className="player-slides-export-icon">
          <FileSliders aria-hidden="true" />
        </div>
        <div className="player-slides-export-copy">
          <p className="label">Finished hunt</p>
          <h2 id="slides-export-title">Turn your board into Google Slides</h2>
          <p>
            Create a presentation with your team, completed prompts, photos,
            credits, and the items that still need work.
          </p>
          <p className="slides-export-privacy-note">
            Google loads only after you choose the Google action, and you choose an
            account every time. The exported copy stays in Google Drive or Downloads
            until its owner deletes it.{" "}
            <a href="/privacy">Privacy details</a>
          </p>
          {requiresAcknowledgment && (
            <label className="task-free-toggle slides-export-copy-confirmation">
              <input
                checked={copyAcknowledged}
                type="checkbox"
                onChange={(event) => setCopyAcknowledged(event.target.checked)}
              />
              I understand this creates a separate copy with my team’s names and
              photos in the Google account or Downloads on this device. It will not
              be deleted when I leave or when the room expires.
            </label>
          )}
          <div className="player-slides-export-summary" aria-label="Export summary">
            <span>
              <strong>{model.submittedCount}</strong> submitted
            </span>
            <span>
              <strong>{model.approvedCount}</strong> approved
            </span>
            <span>
              <strong>{model.needsWork.length}</strong> need work
            </span>
          </div>

          {progress && (
            <p className="slides-export-progress" role="status">
              <LoaderCircle className="is-spinning" aria-hidden="true" />
              {progress.label}
              {progress.total
                ? ` ${progress.completed ?? 0}/${progress.total}`
                : ""}
            </p>
          )}

          {createdPresentation && (
            <div className="slides-export-success" role="status">
              <Check aria-hidden="true" />
              <span>Presentation created.</span>
              <a
                href={createdPresentation.webViewLink}
                rel="noreferrer"
                target="_blank"
              >
                Open Google Slides
                <ExternalLink aria-hidden="true" />
              </a>
            </div>
          )}

          {downloadedFileName && (
            <div className="slides-export-success" role="status">
              <Check aria-hidden="true" />
              <span>{downloadedFileName} downloaded.</span>
            </div>
          )}

          {warnings.length > 0 && (
            <p className="slides-export-warning" role="status">
              <AlertTriangle aria-hidden="true" />
              The presentation was created with {warnings.length}{" "}
              {warnings.length === 1 ? "note" : "notes"}: {warnings.join(", ")}.
            </p>
          )}

          {error && (
            <p className="slides-export-error" role="alert">
              <AlertTriangle aria-hidden="true" />
              {error}
            </p>
          )}

          {!googleClientId && (
            <p className="slides-export-setup-note">
              Google Slides creation needs a Google client ID. You can still
              download the presentation.
            </p>
          )}

          <div className="player-slides-export-actions">
            <button
              className="primary-action slides-export-primary"
              disabled={!googleClientId || !canExport || isWorking}
              type="button"
              onClick={() => void handleCreateGoogleSlides()}
            >
              {workingAction === "google-slides" ? (
                <LoaderCircle className="is-spinning" aria-hidden="true" />
              ) : (
                <FileSliders aria-hidden="true" />
              )}
              {workingAction === "google-slides"
                ? "Preparing Google Slides..."
                : "Choose Google account and create"}
            </button>
            <button
              className="secondary-action"
              disabled={!canExport || isWorking}
              type="button"
              onClick={() => void handleDownloadPresentation()}
            >
              {workingAction === "download" ? (
                <LoaderCircle className="is-spinning" aria-hidden="true" />
              ) : (
                <Download aria-hidden="true" />
              )}
              {workingAction === "download"
                ? "Preparing download..."
                : "Download presentation"}
            </button>
          </div>
        </div>
      </section>

      <ExportBoardSnapshot
        ref={boardRef}
        game={game}
        group={group}
        model={model}
        submissions={submissions}
        tasks={tasks}
      />
    </>
  );
}

const ExportBoardSnapshot = forwardRef<HTMLDivElement, {
  game: Game;
  group: Group;
  model: ReturnType<typeof buildPlayerSlidesExportModel>;
  submissions: Submission[];
  tasks: Task[];
}>(function ExportBoardSnapshot(
  { game, group, model, submissions, tasks },
  ref,
) {
  const submissionsByTask = new Map(
    submissions
      .filter((submission) => submission.groupId === group.id)
      .map((submission) => [submission.taskId, submission]),
  );

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="export-board-snapshot"
      style={
        {
          "--board-size": game.boardSize,
          "--export-group-color": group.color,
        } as React.CSSProperties
      }
    >
      <div className="export-board-header">
        <div>
          <span>SCAVENGER BINGO</span>
          <h2>{game.name}</h2>
          <p>{group.shortName}</p>
        </div>
        <div className="export-board-progress">
          <strong>
            {model.approvedCount}/{model.totalCount}
          </strong>
          <span>approved</span>
        </div>
      </div>
      <div className="export-board-grid">
        {tasks.map((task) => {
          const submission = submissionsByTask.get(task.id);
          const status = task.free ? "approved" : submission?.status ?? "ready";

          return (
            <div
              key={task.id}
              className={`export-board-tile is-${status}`}
            >
              <strong>{task.title}</strong>
              <span>{getBoardStatusLabel(status)}</span>
            </div>
          );
        })}
      </div>
      <div className="export-board-footer">
        <span>{model.submittedCount} submitted</span>
        <span>{model.approvedCount} approved</span>
        <span>{model.needsWork.length} need work</span>
      </div>
    </div>
  );
});

function getBoardStatusLabel(status: Submission["status"] | "ready") {
  if (status === "approved") return "✓ Approved";
  if (status === "pending") return "✓ Submitted";
  if (status === "retake") return "↻ Retake";
  return "Not started";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The presentation could not be created.";
}
