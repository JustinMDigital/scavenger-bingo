import {
  Armchair,
  Badge,
  Bike,
  Bird,
  Bug,
  Camera,
  Check,
  ChevronDown,
  Circle,
  Clock,
  Cloud,
  Cookie,
  Dog,
  Droplets,
  Flag,
  Flower2,
  Gem,
  Glasses,
  Grid3X3,
  HardHat,
  Image,
  IceCreamBowl,
  Leaf,
  List,
  Mailbox,
  Pause,
  Play,
  Plus,
  Route,
  Sailboat,
  Send,
  Signpost,
  Shuffle,
  Star,
  TimerReset,
  Trash2,
  TreePine,
  Trees,
  Upload,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type React from "react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addStop as createStop,
  addTask as createTask,
  claimHost,
  joinGame,
  loadGameState,
  removeStop as deleteStop,
  removeTask as deleteTask,
  resetGameProofs,
  saveTaskProof,
  setGroupBoardTasks,
  subscribeToGameChanges,
  updateGameTimer,
  updateStopDetails,
  updateTaskDetails,
  updateSubmissionStatus,
} from "./gameService";
import type {
  BoardAssignment,
  Game,
  GameState,
  Group,
  HuntPhase,
  HuntStop,
  Submission,
  SubmissionStatus,
  Task,
  TaskStatus,
} from "./gameService";
import { isSupabaseConfigured } from "./supabaseClient";

type BoardView = "grid" | "list";

type RouteDisplay = {
  label: string;
  title: string;
  detail: string;
  timeLabel: string;
  timerSmall: string;
};

type TimerDisplay = {
  label: string;
  caption: string;
  state: "countdown" | "idle" | "finished";
  isWarning?: boolean;
};

type StoredPlayer = {
  name: string;
  groupId: string;
};

type JoinRequest = {
  name: string;
  groupId: string;
  gameCode: string;
};

type HostClaimRequest = {
  displayName: string;
  gameCode: string;
  pin: string;
};

type LocalGamePatch = Partial<
  Pick<
    Game,
    "activeStopId" | "phase" | "timerRunning" | "timerStartedAt" | "timerSecondsTotal"
  >
>;

type LocalStopPatch = Partial<
  Pick<HuntStop, "name" | "detail" | "arriveTime" | "leaveTime">
>;

const STORAGE_PLAYER_KEY = "scavenger-blackout-player";
const STORAGE_GAME_CODE_KEY = "scavenger-blackout-game-code";
const STORAGE_ONBOARDING_DISMISSED_KEY = "scavenger-blackout-onboarding-dismissed";
const DEFAULT_PLAY_WINDOW_MINUTES = 30;
const DEFAULT_STOP_WINDOW_MINUTES = 30;
const BOARD_SLOT_COUNT = 25;
const BOARD_CENTER_SLOT = 13;
const SHARED_GENERATED_TASK_COUNT = 4;
const MAX_PROOF_FILE_BYTES = 20 * 1024 * 1024;

const ICONS: Record<string, LucideIcon> = {
  Armchair,
  Badge,
  Bike,
  Bird,
  Bug,
  Camera,
  Circle,
  Cloud,
  Cookie,
  Dog,
  Droplets,
  Flower2,
  Gem,
  Glasses,
  HardHat,
  IceCreamBowl,
  Leaf,
  Mailbox,
  Route,
  Sailboat,
  Signpost,
  Star,
  Trash2,
  TreePine,
  Trees,
};

const TASK_ICON_OPTIONS = Object.keys(ICONS).sort((first, second) =>
  first.localeCompare(second),
);

export default function App() {
  const storedPlayer = useMemo(() => readStoredPlayer(), []);
  const initialGameCode = useMemo(() => readStoredGameCode(), []);
  const [path, setPath] = useState(() => window.location.pathname);
  const isHostRoute = path === "/host";
  const [gameCode, setGameCode] = useState(initialGameCode);
  const [isOnboardingDismissed, setIsOnboardingDismissed] = useState(() =>
    readOnboardingDismissed(),
  );
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isLoading, setIsLoading] = useState(
    isSupabaseConfigured && initialGameCode.length > 0,
  );
  const [error, setError] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [boardView, setBoardView] = useState<BoardView>("grid");
  const [showStopDetails, setShowStopDetails] = useState(false);
  const [expandedStopId, setExpandedStopId] = useState("");
  const [selectedHostGroupId, setSelectedHostGroupId] = useState(
    storedPlayer?.groupId ?? "",
  );
  const [toast, setToast] = useState("");
  const [timerTick, setTimerTick] = useState(Date.now());
  const [uploadingTaskId, setUploadingTaskId] = useState("");

  const refreshGameState = useCallback(
    async (code = gameCode, options?: { silent?: boolean }) => {
      if (!isSupabaseConfigured) {
        setIsLoading(false);
        return null;
      }

      const requestedCode = code.trim().toUpperCase();

      if (!requestedCode) {
        setGameState(null);
        setIsLoading(false);
        return null;
      }

      if (!options?.silent) {
        setIsLoading(true);
      }

      try {
        const nextState = await loadGameState(requestedCode);
        setGameState(nextState);
        setGameCode(nextState.game.code);
        storeGameCode(nextState.game.code);
        setError("");
        return nextState;
      } catch (caughtError) {
        if (!options?.silent) {
          setGameState(null);
        }
        setError(getErrorMessage(caughtError));
        return null;
      } finally {
        if (!options?.silent) {
          setIsLoading(false);
        }
      }
    },
    [gameCode],
  );

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!gameCode.trim()) {
      setIsLoading(false);
      return;
    }

    void refreshGameState(gameCode);
  }, [gameCode, refreshGameState]);

  useEffect(() => {
    const loadedGameId = gameState?.game.id;
    const loadedGameCode = gameState?.game.code;

    if (!loadedGameId || !loadedGameCode) {
      return undefined;
    }

    return subscribeToGameChanges(loadedGameId, () => {
      void refreshGameState(loadedGameCode, { silent: true });
    });
  }, [gameState?.game.code, gameState?.game.id, refreshGameState]);

  useEffect(() => {
    if (!gameState?.game.timerRunning || gameState.game.phase === "review") {
      return undefined;
    }

    const interval = window.setInterval(() => setTimerTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [gameState?.game.phase, gameState?.game.timerRunning]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const groups = gameState?.groups ?? [];
  const tasks = gameState?.tasks ?? [];
  const boardAssignments = gameState?.boardAssignments ?? [];
  const stops = gameState?.stops ?? [];
  const submissions = gameState?.submissions ?? [];
  const membership = gameState?.membership ?? null;
  const currentGroup =
    membership?.role === "player"
      ? groups.find((group) => group.id === membership.groupId) ?? null
      : null;
  const currentGroupTasks = useMemo(
    () =>
      currentGroup
        ? getGroupBoardTasks(currentGroup.id, tasks, boardAssignments)
        : tasks,
    [boardAssignments, currentGroup, tasks],
  );
  const selectedTask =
    currentGroupTasks.find((task) => task.id === selectedTaskId) ??
    (currentGroup
      ? getDefaultSelectedTask(currentGroup.id, currentGroupTasks, submissions)
      : currentGroupTasks[0]) ??
    null;
  const activeStopIndex =
    gameState?.game.phase === "play" && gameState.game.activeStopId === null
      ? -1
      : Math.max(
          0,
          stops.findIndex((stop) => stop.id === gameState?.game.activeStopId),
        );
  const activeStop = stops[activeStopIndex] ?? stops[0] ?? null;
  const timerSeconds = useMemo(() => {
    void timerTick;
    return gameState ? getGameRemainingSeconds(gameState.game) : 0;
  }, [gameState, timerTick]);

  useEffect(() => {
    if (
      currentGroup &&
      currentGroupTasks.length > 0 &&
      !currentGroupTasks.some((task) => task.id === selectedTaskId)
    ) {
      setSelectedTaskId(
        getDefaultSelectedTask(currentGroup.id, currentGroupTasks, submissions)?.id ??
          currentGroupTasks[0].id,
      );
    }
  }, [currentGroup, currentGroupTasks, selectedTaskId, submissions]);

  useEffect(() => {
    if (
      selectedHostGroupId &&
      !groups.some((group) => group.id === selectedHostGroupId)
    ) {
      setSelectedHostGroupId("");
    }
  }, [groups, selectedHostGroupId]);

  const applyLocalGamePatch = useCallback((patch: LocalGamePatch) => {
    setTimerTick(Date.now());
    setGameState((currentState) => {
      if (!currentState) {
        return currentState;
      }

      return {
        ...currentState,
        game: {
          ...currentState.game,
          ...(patch.activeStopId !== undefined
            ? { activeStopId: patch.activeStopId }
            : {}),
          ...(patch.phase !== undefined ? { phase: patch.phase } : {}),
          ...(patch.timerRunning !== undefined
            ? { timerRunning: patch.timerRunning }
            : {}),
          ...(patch.timerStartedAt !== undefined
            ? { timerStartedAt: patch.timerStartedAt }
            : {}),
          ...(patch.timerSecondsTotal !== undefined
            ? { timerSecondsTotal: patch.timerSecondsTotal }
            : {}),
        },
      };
    });
  }, []);

  const applyLocalStopPatch = useCallback((stopId: string, patch: LocalStopPatch) => {
    setGameState((currentState) => {
      if (!currentState) {
        return currentState;
      }

      return {
        ...currentState,
        stops: currentState.stops.map((stop) =>
          stop.id === stopId ? { ...stop, ...patch } : stop,
        ),
      };
    });
  }, []);

  async function syncGameTimer(
    patch: LocalGamePatch,
    options?: { successToast?: string; failureToast?: string },
  ) {
    if (!gameState) {
      return false;
    }

    applyLocalGamePatch(patch);
    setError("");

    try {
      await updateGameTimer(gameState.game.id, patch);
      await refreshGameState(gameState.game.code, { silent: true });
      if (options?.successToast) {
        setToast(options.successToast);
      }
      return true;
    } catch (caughtError) {
      console.warn(
        `Timer sync failed; keeping local host timer state: ${getErrorMessage(
          caughtError,
        )}`,
        caughtError,
      );
      setToast(options?.failureToast ?? "Timer changed locally");
      return false;
    }
  }

  async function handleJoin(request: JoinRequest) {
    setIsLoading(true);
    try {
      const loadedState = await loadGameState(request.gameCode);
      const group =
        loadedState.groups.find((item) => item.id === request.groupId) ??
        loadedState.groups[0];

      if (!group) {
        throw new Error("This game does not have any groups yet.");
      }

      await joinGame({
        gameId: loadedState.game.id,
        groupId: group.id,
        displayName: request.name,
      });

      storePlayer({ name: request.name.trim(), groupId: group.id });
      storeGameCode(loadedState.game.code);
      setGameCode(loadedState.game.code);
      await refreshGameState(loadedState.game.code, { silent: true });
      setToast(`Playing as ${request.name.trim()}`);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Join failed");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLoadGameCode(nextGameCode: string) {
    const loadedState = await refreshGameState(nextGameCode);

    if (loadedState) {
      setToast(`Loaded ${loadedState.game.code}`);
    } else {
      setToast("Game not found");
    }
  }

  async function handleClaimHost(request: HostClaimRequest) {
    setIsLoading(true);
    try {
      await claimHost(request);
      const nextState = await refreshGameState(request.gameCode, { silent: true });
      if (nextState) {
        storeGameCode(nextState.game.code);
        setGameCode(nextState.game.code);
      }
      setToast("Host claimed");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Host claim failed");
    } finally {
      setIsLoading(false);
    }
  }

  function handleDismissOnboarding() {
    setIsOnboardingDismissed(true);
    storeOnboardingDismissed();
  }

  async function handleSubmitProof(taskId: string, file: File) {
    if (!gameState || membership?.role !== "player" || !membership.groupId) {
      setToast("Join a group first");
      return;
    }

    if (file.type && !file.type.startsWith("image/")) {
      setToast("Choose an image file");
      return;
    }

    if (file.size > MAX_PROOF_FILE_BYTES) {
      setToast("Photo must be under 20 MB");
      return;
    }

    setUploadingTaskId(taskId);
    try {
      await saveTaskProof({
        gameId: gameState.game.id,
        groupId: membership.groupId,
        taskId,
        file,
      });
      await refreshGameState(gameState.game.code, { silent: true });
      setToast("Photo sent");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Upload failed");
    } finally {
      setUploadingTaskId("");
    }
  }

  async function handleSubmissionStatus(
    submissionId: string,
    status: SubmissionStatus,
  ) {
    if (!gameState) return;

    try {
      await updateSubmissionStatus(submissionId, status);
      await refreshGameState(gameState.game.code, { silent: true });
      setToast(status === "approved" ? "Approved" : "Retake requested");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Review update failed");
    }
  }

  async function handleResetGameProofs() {
    if (!gameState || membership?.role !== "host") return;

    const confirmed = window.confirm(
      "Reset the game? This deletes all submitted photos and approvals, then returns the hunt to Stop 1.",
    );

    if (!confirmed) {
      return;
    }

    const firstStop = stops[0];

    setIsLoading(true);
    try {
      const resetResult = await resetGameProofs(gameState.game.id);
      await updateGameTimer(gameState.game.id, {
        activeStopId: firstStop?.id ?? null,
        phase: "live",
        timerRunning: false,
        timerStartedAt: new Date().toISOString(),
        timerSecondsTotal: firstStop ? getStopCountdownSeconds(stops, 0) : 0,
      });
      await refreshGameState(gameState.game.code, { silent: true });
      setExpandedStopId(firstStop?.id ?? "");
      setSelectedHostGroupId("");
      setToast(`Reset ${resetResult.deletedSubmissions} proofs`);
    } catch (caughtError) {
      const message = getErrorMessage(caughtError);
      setError(message);
      setToast(`Reset failed: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUpdateStop(
    stopId: string,
    patch: Partial<Pick<HuntStop, "name" | "detail" | "arriveTime" | "leaveTime">>,
  ) {
    if (!gameState) return;

    try {
      await updateStopDetails(stopId, patch);
      await refreshGameState(gameState.game.code, { silent: true });
      setToast("Stop updated");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Stop update failed");
    }
  }

  async function handleRemoveStop(stopId: string) {
    if (!gameState || stops.length <= 1) return;

    const remainingStops = stops.filter((stop) => stop.id !== stopId);
    const nextActiveStopId =
      gameState.game.activeStopId === stopId
        ? remainingStops[0]?.id ?? null
        : gameState.game.activeStopId;

    try {
      await deleteStop(stopId);
      if (nextActiveStopId !== gameState.game.activeStopId) {
        await updateGameTimer(gameState.game.id, { activeStopId: nextActiveStopId });
      }
      setExpandedStopId(remainingStops[0]?.id ?? "");
      await refreshGameState(gameState.game.code, { silent: true });
      setToast("Stop removed");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Remove failed");
    }
  }

  async function handleAddStop() {
    if (!gameState) return;

    const previousStop = stops[stops.length - 1];
    const arriveTime = previousStop
      ? addMinutesToClockTime(previousStop.leaveTime, DEFAULT_PLAY_WINDOW_MINUTES)
      : "10:30 AM";

    try {
      const nextStop = await createStop({
        gameId: gameState.game.id,
        name: `Stop ${stops.length + 1}`,
        detail: "Add the stop location and instructions.",
        arriveTime,
        leaveTime: addMinutesToClockTime(arriveTime, DEFAULT_STOP_WINDOW_MINUTES),
        sortOrder:
          stops.reduce((highest, stop) => Math.max(highest, stop.sortOrder), 0) + 1,
      });

      setExpandedStopId(nextStop.id);
      await refreshGameState(gameState.game.code, { silent: true });
      setToast("Stop added");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Add stop failed");
    }
  }

  async function handleAddTask() {
    if (!gameState) return;

    const title = `Task ${tasks.length + 1}`;
    const sortOrder =
      tasks.reduce((highest, task) => Math.max(highest, task.sortOrder), 0) + 1;

    try {
      await createTask({
        gameId: gameState.game.id,
        slug: createTaskSlug(title, tasks.map((task) => task.id)),
        title,
        description: "Add the scavenger task details.",
        icon: "Camera",
        isFree: false,
        sortOrder,
      });
      await refreshGameState(gameState.game.code, { silent: true });
      setToast("Task added");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Add task failed");
    }
  }

  async function handleUpdateTask(
    taskId: string,
    patch: Partial<Pick<Task, "title" | "description" | "icon" | "free">>,
  ) {
    if (!gameState) return;

    const title = patch.title?.trim();
    const description = patch.description?.trim();

    if (patch.title !== undefined && !title) {
      setToast("Task title is required");
      return;
    }

    try {
      await updateTaskDetails(gameState.game.id, taskId, {
        ...patch,
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
      });
      await refreshGameState(gameState.game.code, { silent: true });
      setToast("Task updated");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Task update failed");
    }
  }

  async function handleRemoveTask(taskId: string) {
    if (!gameState) return;

    const isAssigned = boardAssignments.some(
      (assignment) => assignment.taskId === taskId,
    );
    const hasProof = gameState.submissions.some(
      (submission) => submission.taskId === taskId,
    );

    if (isAssigned || hasProof) {
      setToast("Remove it from boards first");
      return;
    }

    try {
      await deleteTask(gameState.game.id, taskId);
      await refreshGameState(gameState.game.code, { silent: true });
      setToast("Task removed");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Remove task failed");
    }
  }

  async function handleSaveGroupBoard(groupId: string, taskIds: string[]) {
    if (!gameState) return;

    if (gameState.submissions.length > 0) {
      setToast("Boards lock after proofs arrive");
      return;
    }

    const cleanedTaskIds = taskIds.slice(0, BOARD_SLOT_COUNT);
    const assignedTaskIds = cleanedTaskIds.filter(Boolean);
    const uniqueTaskIds = new Set(assignedTaskIds);

    if (uniqueTaskIds.size !== assignedTaskIds.length) {
      setToast("Each board slot needs a unique task");
      return;
    }

    try {
      await setGroupBoardTasks({
        gameId: gameState.game.id,
        groupId,
        taskIds: cleanedTaskIds,
      });
      await refreshGameState(gameState.game.code, { silent: true });
      setToast("Board saved");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Board save failed");
    }
  }

  async function handleGenerateBoards() {
    if (!gameState) return;

    if (gameState.submissions.length > 0) {
      setToast("Boards lock after proofs arrive");
      return;
    }

    try {
      const generatedBoards = generateGroupBoards(groups, tasks);

      for (const group of groups) {
        await setGroupBoardTasks({
          gameId: gameState.game.id,
          groupId: group.id,
          taskIds: generatedBoards[group.id] ?? [],
        });
      }

      await refreshGameState(gameState.game.code, { silent: true });
      setToast("Boards generated");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Board generation failed");
    }
  }

  async function handleToggleTimer() {
    if (!gameState) return;

    await syncGameTimer(
      gameState.game.timerRunning
        ? {
            timerRunning: false,
            timerSecondsTotal: timerSeconds,
          }
        : {
            timerRunning: true,
            timerStartedAt: new Date().toISOString(),
          },
      {
        failureToast: gameState.game.timerRunning
          ? "Timer paused locally"
          : "Timer running locally",
      },
    );
  }

  async function handleAddFiveMinutes() {
    if (!gameState || !activeStop) return;

    const timerPatch: LocalGamePatch = {
      timerSecondsTotal: timerSeconds + 5 * 60,
      timerStartedAt: gameState.game.timerRunning ? new Date().toISOString() : undefined,
    };

    if (gameState.game.phase === "play") {
      await syncGameTimer(timerPatch, {
        successToast: "Added 5 minutes",
        failureToast: "Added 5 minutes locally",
      });
      return;
    }

    const nextLeaveTime = addMinutesToClockTime(activeStop.leaveTime, 5);
    applyLocalStopPatch(activeStop.id, { leaveTime: nextLeaveTime });
    applyLocalGamePatch(timerPatch);
    setError("");

    try {
      await updateStopDetails(activeStop.id, {
        leaveTime: nextLeaveTime,
      });
      await updateGameTimer(gameState.game.id, timerPatch);
      await refreshGameState(gameState.game.code, { silent: true });
      setToast("Added 5 minutes");
    } catch (caughtError) {
      console.warn(
        `Timer sync failed; keeping local host timer state: ${getErrorMessage(
          caughtError,
        )}`,
        caughtError,
      );
      setToast("Added 5 minutes locally");
    }
  }

  async function handlePlayTime(afterStopIndex: number) {
    if (!gameState) return;

    const afterStop = stops[afterStopIndex];
    const nextStop = stops[afterStopIndex + 1];

    if (!nextStop) {
      return;
    }

    const earlySeconds =
      afterStop &&
      gameState.game.phase === "live" &&
      afterStop.id === gameState.game.activeStopId
        ? timerSeconds
        : 0;

    await syncGameTimer(
      {
        activeStopId: afterStop?.id ?? null,
        phase: "play",
        timerRunning: true,
        timerStartedAt: new Date().toISOString(),
        timerSecondsTotal:
          getPlayCountdownSeconds(stops, afterStopIndex) + earlySeconds,
      },
      { failureToast: "Play time running locally" },
    );
    setExpandedStopId("");
  }

  async function handleStartStop(stopIndex: number) {
    if (!gameState) return;

    const stop = stops[stopIndex];

    if (!stop) {
      return;
    }

    await syncGameTimer(
      {
        activeStopId: stop.id,
        phase: "live",
        timerRunning: true,
        timerStartedAt: new Date().toISOString(),
        timerSecondsTotal: getStopCountdownSeconds(stops, stopIndex),
      },
      { failureToast: "Stop timer running locally" },
    );
    setExpandedStopId(stop.id);
  }

  async function handleNextStop() {
    await handleStartStop(Math.min(activeStopIndex + 1, stops.length - 1));
  }

  async function handleSetPhase(phase: HuntPhase) {
    if (!gameState) return;

    await syncGameTimer(
      {
        phase,
        timerRunning: phase === "live",
        timerStartedAt: phase === "live" ? new Date().toISOString() : undefined,
        timerSecondsTotal: phase === "review" ? timerSeconds : undefined,
      },
      {
        failureToast:
          phase === "review" ? "Review mode set locally" : "Timer running locally",
      },
    );
  }

  if (!isSupabaseConfigured) {
    return <SetupNotice />;
  }

  if (isLoading && !gameState) {
    return <LoadingView />;
  }

  if (!gameState) {
    if (isHostRoute) {
      return (
        <HostSetupView
          defaultDisplayName={storedPlayer?.name ?? ""}
          defaultGameCode={gameCode}
          error={error}
          isBusy={isLoading}
          onClaim={handleClaimHost}
        />
      );
    }

    return (
      <GameCodeGate
        defaultGameCode={gameCode}
        error={error}
        isBusy={isLoading}
        onLoad={handleLoadGameCode}
      />
    );
  }

  if (!activeStop) {
    return (
      <ErrorView
        error={error || "Game could not be loaded."}
        onRetry={() => void refreshGameState(gameCode)}
      />
    );
  }

  const routeDisplay = getRouteDisplay(stops, activeStopIndex, gameState.game.phase);
  const timerDisplay = getTimerDisplay(
    gameState.game,
    stops,
    activeStopIndex,
    timerSeconds,
    routeDisplay.timerSmall,
  );

  const cssVars = {
    "--primary": isHostRoute ? "oklch(0.49 0.22 262)" : currentGroup?.color,
    "--primary-dark": isHostRoute
      ? "oklch(0.38 0.18 262)"
      : currentGroup?.dark,
    "--primary-soft": isHostRoute
      ? "oklch(0.94 0.035 262)"
      : currentGroup?.soft,
    "--group-color": currentGroup?.color,
  } as React.CSSProperties;

  return (
    <div
      className={isHostRoute ? "site-shell is-host-shell" : "site-shell"}
      style={cssVars}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <SiteHeader
        currentGroup={isHostRoute ? null : currentGroup}
        isHostRoute={isHostRoute}
        routeTitle={routeDisplay.title}
        showStopDetails={showStopDetails}
        timerDisplay={timerDisplay}
        onTimerClick={() => setShowStopDetails((shown) => !shown)}
      />

      <main id="main-content" className="main-content">
        {error && (
          <div className="toast-region error-message" role="alert">
            {error}
          </div>
        )}

        {showStopDetails && (
          <StopDetailsPanel
            routeDisplay={routeDisplay}
            onClose={() => setShowStopDetails(false)}
          />
        )}

        {isHostRoute ? (
          membership?.role === "host" ? (
            <HostView
              activeStopIndex={activeStopIndex}
              addFiveMinutes={handleAddFiveMinutes}
              addStop={handleAddStop}
              addTask={handleAddTask}
              boardAssignments={boardAssignments}
              expandedStopId={expandedStopId}
              generateBoards={handleGenerateBoards}
              game={gameState.game}
              goToPlayTime={handlePlayTime}
              goToNextStop={handleNextStop}
              groups={groups}
              removeTask={handleRemoveTask}
              removeStop={handleRemoveStop}
              saveGroupBoard={handleSaveGroupBoard}
              selectedHostGroupId={selectedHostGroupId}
              setExpandedStopId={setExpandedStopId}
              setHuntPhase={handleSetPhase}
              resetGameProofs={handleResetGameProofs}
              setSelectedHostGroupId={setSelectedHostGroupId}
              setSubmissionStatus={handleSubmissionStatus}
              stops={stops}
              submissions={submissions}
              tasks={tasks}
              timerDisplay={timerDisplay}
              routeDisplay={routeDisplay}
              toggleTimer={handleToggleTimer}
              updateStop={handleUpdateStop}
              updateTask={handleUpdateTask}
            />
          ) : (
            <HostGate
              defaultDisplayName={storedPlayer?.name ?? ""}
              defaultGameCode={gameCode}
              isBusy={isLoading}
              onClaim={handleClaimHost}
            />
          )
        ) : membership?.role === "player" && currentGroup ? (
          <GroupView
            boardView={boardView}
            group={currentGroup}
            isOnboardingDismissed={isOnboardingDismissed}
            playerUserId={membership.userId}
            onOnboardingDismiss={handleDismissOnboarding}
            onBoardViewChange={setBoardView}
            onSubmitProof={handleSubmitProof}
            onTaskSelect={setSelectedTaskId}
            selectedTask={selectedTask}
            submissions={submissions}
            tasks={currentGroupTasks}
            uploadingTaskId={uploadingTaskId}
          />
        ) : (
          <JoinView
            defaultGameCode={gameCode}
            defaultGroupId={storedPlayer?.groupId ?? groups[0]?.id ?? ""}
            defaultName={storedPlayer?.name ?? ""}
            groups={groups}
            isBusy={isLoading}
            onJoin={handleJoin}
          />
        )}
      </main>

      <div className="toast-region" role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

function SetupNotice() {
  return (
    <main className="main-content">
      <section className="welcome-card" aria-labelledby="setup-title">
        <div>
          <p className="label">Supabase setup</p>
          <h1 id="setup-title">Backend env vars are missing.</h1>
          <p>
            Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to
            .env.local, then restart Vite.
          </p>
        </div>
      </section>
    </main>
  );
}

function LoadingView() {
  return (
    <main className="main-content">
      <section className="welcome-card" aria-label="Loading game">
        <div>
          <p className="label">Scavenger Blackout</p>
          <h1>Loading game...</h1>
        </div>
      </section>
    </main>
  );
}

function HostSetupView({
  defaultDisplayName,
  defaultGameCode,
  error,
  isBusy,
  onClaim,
}: {
  defaultDisplayName: string;
  defaultGameCode: string;
  error: string;
  isBusy: boolean;
  onClaim: (request: HostClaimRequest) => void;
}) {
  return (
    <main className="main-content">
      {error && (
        <div className="toast-region error-message" role="alert">
          {error}
        </div>
      )}
      <HostGate
        defaultDisplayName={defaultDisplayName}
        defaultGameCode={defaultGameCode}
        isBusy={isBusy}
        onClaim={onClaim}
      />
    </main>
  );
}

function GameCodeGate({
  defaultGameCode,
  error,
  isBusy,
  onLoad,
}: {
  defaultGameCode: string;
  error: string;
  isBusy: boolean;
  onLoad: (gameCode: string) => void;
}) {
  const [gameCode, setGameCode] = useState(defaultGameCode);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanGameCode = gameCode.trim();

    if (!cleanGameCode) {
      return;
    }

    onLoad(cleanGameCode);
  }

  return (
    <main className="main-content">
      {error && (
        <div className="toast-region error-message" role="alert">
          {error}
        </div>
      )}
      <section className="welcome-card" aria-labelledby="game-code-title">
        <div>
          <p className="label">Join game</p>
          <h1 id="game-code-title">Enter the game code from your host.</h1>
          <p>The code loads the right teams and board for this event.</p>
        </div>

        <form className="join-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Game code</span>
            <input
              autoCapitalize="characters"
              autoComplete="off"
              value={gameCode}
              onChange={(event) => setGameCode(event.target.value.toUpperCase())}
              placeholder="FAMILY-2026"
            />
          </label>
          <button
            className="join-submit"
            disabled={!gameCode.trim() || isBusy}
            type="submit"
          >
            {isBusy ? "Loading..." : "Load game"}
          </button>
        </form>
      </section>
    </main>
  );
}

function ErrorView({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <main className="main-content">
      <section className="welcome-card" aria-labelledby="error-title">
        <div>
          <p className="label">Backend unavailable</p>
          <h1 id="error-title">Game could not load.</h1>
          <p>{error}</p>
        </div>
        <button className="join-submit" type="button" onClick={onRetry}>
          Try again
        </button>
      </section>
    </main>
  );
}

function SiteHeader({
  currentGroup,
  isHostRoute,
  routeTitle,
  showStopDetails,
  timerDisplay,
  onTimerClick,
}: {
  currentGroup: Group | null;
  isHostRoute: boolean;
  routeTitle: string;
  showStopDetails: boolean;
  timerDisplay: TimerDisplay;
  onTimerClick: () => void;
}) {
  const timerClassName = [
    "timer-pill",
    timerDisplay.state !== "countdown" ? `is-${timerDisplay.state}` : "",
    timerDisplay.isWarning ? "is-warning" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const TimerIcon = timerDisplay.state === "finished" ? Check : Clock;

  return (
    <header className="site-header">
      <div>
        <p className="site-kicker">
          {isHostRoute ? (
            <span className="host-kicker">
              <Flag aria-hidden="true" />
              Host
            </span>
          ) : currentGroup ? (
            <span className="team-kicker">
              <span className="team-dot" aria-hidden="true" />
              {currentGroup.shortName}
            </span>
          ) : (
            "Join game"
          )}
          <span>{routeTitle}</span>
        </p>
        <h1>Scavenger Blackout</h1>
      </div>
      <button
        aria-expanded={showStopDetails}
        aria-label="Show route details"
        className={timerClassName}
        type="button"
        onClick={onTimerClick}
      >
        <TimerIcon aria-hidden="true" />
        {timerDisplay.label}
      </button>
    </header>
  );
}

function StopDetailsPanel({
  routeDisplay,
  onClose,
}: {
  routeDisplay: RouteDisplay;
  onClose: () => void;
}) {
  return (
    <section className="stop-details-panel" aria-label="Current route details">
      <div>
        <p className="label">{routeDisplay.label}</p>
        <h2>{routeDisplay.title}</h2>
        <p>{routeDisplay.detail}</p>
        <p className="stop-details-time">{routeDisplay.timeLabel}</p>
      </div>
      <button type="button" onClick={onClose}>
        Hide
      </button>
    </section>
  );
}

function JoinView({
  defaultGameCode,
  defaultGroupId,
  defaultName,
  groups,
  isBusy,
  onJoin,
}: {
  defaultGameCode: string;
  defaultGroupId: string;
  defaultName: string;
  groups: Group[];
  isBusy: boolean;
  onJoin: (request: JoinRequest) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [gameCode, setGameCode] = useState(defaultGameCode);
  const [groupId, setGroupId] = useState(defaultGroupId || groups[0]?.id || "");
  const hasGroups = groups.length > 0;
  const selectedGroup = groups.find((group) => group.id === groupId) ?? groups[0];

  useEffect(() => {
    if (!groups.some((group) => group.id === groupId)) {
      setGroupId(groups[0]?.id ?? "");
    }
  }, [groupId, groups]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanGameCode = gameCode.trim();

    if (!cleanName || !groupId || !cleanGameCode || !hasGroups) {
      return;
    }

    onJoin({ name: cleanName, groupId, gameCode: cleanGameCode });
  }

  return (
    <section className="welcome-card" aria-labelledby="join-title">
      <div>
        <p className="label">Family party hunt</p>
        <h2 id="join-title">Join your group, then start filling the board.</h2>
        <p>
          Your next screen shows the blackout card and one current task. Send
          photos from the bottom card as you go.
        </p>
      </div>

      <div className="join-steps" aria-label="How the hunt works">
        <span>
          <Grid3X3 aria-hidden="true" />
          Pick a ready square
        </span>
        <span>
          <Camera aria-hidden="true" />
          Send photo proof
        </span>
        <span>
          <Check aria-hidden="true" />
          Keep going to blackout
        </span>
      </div>

      <form className="join-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Game code</span>
          <input
            autoCapitalize="characters"
            autoComplete="off"
            value={gameCode}
            onChange={(event) => setGameCode(event.target.value.toUpperCase())}
            placeholder="FAMILY-2026"
          />
        </label>

        <label className="field">
          <span>Name</span>
          <input
            autoComplete="given-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
          />
        </label>

        <fieldset className="group-field">
          <legend>Group</legend>
          {hasGroups ? (
            <div className="join-group-options">
              {groups.map((group) => (
                <button
                  key={group.id}
                  className={group.id === groupId ? "is-active" : ""}
                  style={{ "--group-color": group.color } as React.CSSProperties}
                  type="button"
                  onClick={() => setGroupId(group.id)}
                >
                  <Users aria-hidden="true" />
                  {group.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="join-empty" role="status">
              <Users aria-hidden="true" />
              <div>
                <strong>No groups are ready yet</strong>
                <p>Ask the host to add groups before players join.</p>
              </div>
            </div>
          )}
        </fieldset>

        <button
          className="join-submit"
          disabled={!name.trim() || !groupId || !gameCode.trim() || !hasGroups || isBusy}
          style={
            {
              "--primary": selectedGroup?.color,
              "--primary-dark": selectedGroup?.dark,
            } as React.CSSProperties
          }
          type="submit"
        >
          {isBusy ? "Joining..." : hasGroups ? "Open board" : "Waiting for groups"}
        </button>
      </form>
    </section>
  );
}

function HostGate({
  defaultDisplayName,
  defaultGameCode,
  isBusy,
  onClaim,
}: {
  defaultDisplayName: string;
  defaultGameCode: string;
  isBusy: boolean;
  onClaim: (request: HostClaimRequest) => void;
}) {
  const [displayName, setDisplayName] = useState(defaultDisplayName || "Host");
  const [gameCode, setGameCode] = useState(defaultGameCode);
  const [pin, setPin] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = displayName.trim();
    const cleanGameCode = gameCode.trim();

    if (!cleanName || !cleanGameCode || !pin.trim()) {
      return;
    }

    onClaim({ displayName: cleanName, gameCode: cleanGameCode, pin });
  }

  return (
    <section className="welcome-card" aria-labelledby="host-title">
      <div>
        <p className="label">Host access</p>
        <h2 id="host-title">Set the game code and open the host view.</h2>
        <p>This is the code players enter before joining a group.</p>
      </div>

      <form className="join-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Game code for players</span>
          <input
            autoCapitalize="characters"
            autoComplete="off"
            value={gameCode}
            onChange={(event) => setGameCode(event.target.value.toUpperCase())}
            placeholder="FAMILY-2026"
          />
        </label>
        <label className="field">
          <span>Host name</span>
          <input
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Host"
          />
        </label>
        <label className="field">
          <span>PIN</span>
          <input
            autoComplete="one-time-code"
            inputMode="numeric"
            type="password"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            placeholder="PIN"
          />
        </label>
        <button
          className="join-submit"
          disabled={!displayName.trim() || !gameCode.trim() || !pin.trim() || isBusy}
          type="submit"
        >
          {isBusy ? "Checking..." : "Set code and open host"}
        </button>
      </form>
    </section>
  );
}

function GroupView({
  boardView,
  group,
  isOnboardingDismissed,
  playerUserId,
  onOnboardingDismiss,
  onBoardViewChange,
  onSubmitProof,
  onTaskSelect,
  selectedTask,
  submissions,
  tasks,
  uploadingTaskId,
}: {
  boardView: BoardView;
  group: Group;
  isOnboardingDismissed: boolean;
  playerUserId: string;
  onOnboardingDismiss: () => void;
  onBoardViewChange: (view: BoardView) => void;
  onSubmitProof: (taskId: string, file: File) => void;
  onTaskSelect: (taskId: string) => void;
  selectedTask: Task | null;
  submissions: Submission[];
  tasks: Task[];
  uploadingTaskId: string;
}) {
  const groupSubmissions = useMemo(
    () => submissions.filter((submission) => submission.groupId === group.id),
    [group.id, submissions],
  );
  const completedCount = tasks.filter(
    (task) => task.free || getTaskStatus(task, group.id, submissions) !== "ready",
  ).length;
  const approvedCount = tasks.filter(
    (task) => task.free || getTaskStatus(task, group.id, submissions) === "approved",
  ).length;
  const hasTasks = tasks.length > 0;
  const hasSubmittedProofs = groupSubmissions.some(
    (submission) => submission.submittedBy === playerUserId,
  );
  const isBlackout = hasTasks && approvedCount === tasks.length;
  const showOnboardingHint =
    hasTasks && !hasSubmittedProofs && !isOnboardingDismissed;

  return (
    <div className="view-stack group-view">
      {showOnboardingHint && (
        <PlayerOnboardingHint onDismiss={onOnboardingDismiss} />
      )}

      {isBlackout && (
        <section className="blackout-banner">
          <Check aria-hidden="true" />
          <div>
            <strong>Blackout complete</strong>
            <span>Every square has been approved.</span>
          </div>
        </section>
      )}

      <section aria-labelledby="board-heading">
        <div className="section-heading">
          <div>
            <p className="label">Blackout card</p>
            <h2 id="board-heading">
              {hasTasks ? `${completedCount} of ${tasks.length} sent` : "Board not ready"}
            </h2>
          </div>
          <span>{hasTasks ? `${approvedCount} approved` : "Ask host"}</span>
        </div>

        {hasTasks ? (
          <>
            <div className="board-view-toggle" aria-label="Choose board view">
              <button
                className={boardView === "grid" ? "is-active" : ""}
                type="button"
                onClick={() => onBoardViewChange("grid")}
              >
                <Grid3X3 aria-hidden="true" />
                Board
              </button>
              <button
                className={boardView === "list" ? "is-active" : ""}
                type="button"
                onClick={() => onBoardViewChange("list")}
              >
                <List aria-hidden="true" />
                List
              </button>
            </div>

            {boardView === "grid" ? (
              <TaskBoard
                groupId={group.id}
                onTaskSelect={onTaskSelect}
                selectedTaskId={selectedTask?.id ?? ""}
                submissions={submissions}
                tasks={tasks}
              />
            ) : (
              <TaskList
                groupId={group.id}
                onTaskSelect={onTaskSelect}
                selectedTaskId={selectedTask?.id ?? ""}
                submissions={submissions}
                tasks={tasks}
              />
            )}
          </>
        ) : (
          <div className="empty-state player-board-empty">
            <Grid3X3 aria-hidden="true" />
            <strong>Waiting for the board</strong>
            <p>The host still needs to add tasks or generate boards for your group.</p>
          </div>
        )}
      </section>

      {selectedTask && (
        <SelectedTaskCard
          groupId={group.id}
          isUploading={uploadingTaskId === selectedTask.id}
          onSubmitProof={onSubmitProof}
          submission={groupSubmissions.find(
            (submission) => submission.taskId === selectedTask.id,
          )}
          task={selectedTask}
        />
      )}
    </div>
  );
}

function PlayerOnboardingHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section className="onboarding-hint" aria-labelledby="onboarding-title">
      <div className="onboarding-icon">
        <Camera aria-hidden="true" />
      </div>
      <div>
        <p className="label">First move</p>
        <h2 id="onboarding-title">Send one proof photo.</h2>
        <p>
          Pick any Ready square, then use the current task card to take or choose
          a photo. Host review happens after you send it.
        </p>
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss first move tip">
        <X aria-hidden="true" />
      </button>
    </section>
  );
}

function HostView({
  activeStopIndex,
  addFiveMinutes,
  addStop,
  addTask,
  boardAssignments,
  expandedStopId,
  generateBoards,
  game,
  goToPlayTime,
  goToNextStop,
  groups,
  removeTask,
  removeStop,
  resetGameProofs,
  saveGroupBoard,
  selectedHostGroupId,
  setExpandedStopId,
  setHuntPhase,
  setSelectedHostGroupId,
  setSubmissionStatus,
  stops,
  submissions,
  tasks,
  timerDisplay,
  routeDisplay,
  toggleTimer,
  updateStop,
  updateTask,
}: {
  activeStopIndex: number;
  addFiveMinutes: () => void;
  addStop: () => void;
  addTask: () => void;
  boardAssignments: BoardAssignment[];
  expandedStopId: string;
  generateBoards: () => void;
  game: Game;
  goToPlayTime: (afterStopIndex: number) => void;
  goToNextStop: () => void;
  groups: Group[];
  removeTask: (taskId: string) => void;
  removeStop: (stopId: string) => void;
  resetGameProofs: () => void;
  saveGroupBoard: (groupId: string, taskIds: string[]) => void;
  selectedHostGroupId: string;
  setExpandedStopId: (stopId: string) => void;
  setHuntPhase: (phase: HuntPhase) => void;
  setSelectedHostGroupId: (groupId: string) => void;
  setSubmissionStatus: (submissionId: string, status: Submission["status"]) => void;
  stops: HuntStop[];
  submissions: Submission[];
  tasks: Task[];
  timerDisplay: TimerDisplay;
  routeDisplay: RouteDisplay;
  toggleTimer: () => void;
  updateStop: (
    stopId: string,
    patch: Partial<Pick<HuntStop, "name" | "detail" | "arriveTime" | "leaveTime">>,
  ) => void;
  updateTask: (
    taskId: string,
    patch: Partial<Pick<Task, "title" | "description" | "icon" | "free">>,
  ) => void;
}) {
  const isOpeningPlay = game.phase === "play" && activeStopIndex < 0;
  const pendingCount = submissions.filter(
    (submission) => submission.status === "pending",
  ).length;
  const selectedGroup =
    groups.find((group) => group.id === selectedHostGroupId) ?? null;
  const boardsLocked = submissions.length > 0;

  return (
    <div className="view-stack host-view">
      <section className="stop-card host-stop" aria-label="Host controls">
        <div>
          <p className="label">Host controls</p>
          <h2>{routeDisplay.title}</h2>
          <p>{routeDisplay.detail}</p>
        </div>
        <div
          className={
            timerDisplay.state === "countdown"
              ? "timer-block"
              : "timer-block is-status"
          }
        >
          <span>{timerDisplay.label}</span>
          <small>{timerDisplay.caption}</small>
        </div>

        <div className="host-controls">
          {game.phase === "review" ? (
            <>
              <button
                className="control-button primary"
                type="button"
                onClick={() => setHuntPhase("live")}
              >
                <Play aria-hidden="true" />
                Resume hunt
              </button>
              <button
                className="control-button danger"
                type="button"
                onClick={resetGameProofs}
              >
                <Trash2 aria-hidden="true" />
                Reset game
              </button>
            </>
          ) : (
            <>
              <button className="control-button" type="button" onClick={toggleTimer}>
                {game.timerRunning ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                {game.timerRunning ? "Pause" : "Resume"}
              </button>
              <button className="control-button" type="button" onClick={addFiveMinutes}>
                <Clock aria-hidden="true" />
                +5 min
              </button>
              <button
                className="control-button"
                disabled={activeStopIndex >= stops.length - 1}
                type="button"
                onClick={() =>
                  game.phase === "play"
                    ? goToNextStop()
                    : goToPlayTime(activeStopIndex)
                }
              >
                {game.phase === "play" ? (
                  <Flag aria-hidden="true" />
                ) : (
                  <Play aria-hidden="true" />
                )}
                {isOpeningPlay
                  ? "Start Stop 1"
                  : game.phase === "play"
                    ? "Start next stop"
                    : "Play time"}
              </button>
              <button
                className="control-button primary"
                type="button"
                onClick={() => setHuntPhase("review")}
              >
                <Check aria-hidden="true" />
                End hunt
              </button>
              <button
                className="control-button danger"
                type="button"
                onClick={resetGameProofs}
              >
                <Trash2 aria-hidden="true" />
                Reset game
              </button>
            </>
          )}
        </div>
      </section>

      <section className="host-stops" aria-labelledby="stops-heading">
        <div className="section-heading">
          <div>
            <p className="label">Route</p>
            <h2 id="stops-heading">Stops and time</h2>
          </div>
          <span>{stops.length} stops</span>
        </div>

        <div className="stop-editor-list">
          {stops[0] && (
            <PlayTimeRow
              afterStopIndex={-1}
              isActive={game.phase === "play" && activeStopIndex === -1}
              nextStop={stops[0]}
              onStart={() => goToPlayTime(-1)}
            />
          )}
          {stops.map((stop, index) => (
            <Fragment key={stop.id}>
              <StopEditor
                canRemove={stops.length > 1}
                index={index}
                isActive={game.phase === "live" && index === activeStopIndex}
                isExpanded={expandedStopId === stop.id}
                onRemove={() => removeStop(stop.id)}
                onSave={() => setExpandedStopId("")}
                onToggle={() =>
                  setExpandedStopId(expandedStopId === stop.id ? "" : stop.id)
                }
                stop={stop}
                stopCount={stops.length}
                updateStop={updateStop}
              />
              {stops[index + 1] && (
                <PlayTimeRow
                  afterStop={stop}
                  afterStopIndex={index}
                  isActive={game.phase === "play" && index === activeStopIndex}
                  nextStop={stops[index + 1]}
                  onStart={() => goToPlayTime(index)}
                />
              )}
            </Fragment>
          ))}
        </div>

        <button className="add-stop-button" type="button" onClick={addStop}>
          <Plus aria-hidden="true" />
          Add stop
        </button>
      </section>

      <BoardEditor
        boardAssignments={boardAssignments}
        boardsLocked={boardsLocked}
        groups={groups}
        onAddTask={addTask}
        onGenerateBoards={generateBoards}
        onRemoveTask={removeTask}
        onSaveGroupBoard={saveGroupBoard}
        onUpdateTask={updateTask}
        submissions={submissions}
        tasks={tasks}
      />

      <section className="host-groups" aria-labelledby="teams-heading">
        <div className="section-heading">
          <div>
            <p className="label">Teams</p>
            <h2 id="teams-heading">Progress check</h2>
          </div>
          <span>{pendingCount} pending</span>
        </div>

        <div className="team-cards">
          {groups.map((group) => (
            <TeamCard
              key={group.id}
              group={group}
              isSelected={selectedHostGroupId === group.id}
              onSelect={() => setSelectedHostGroupId(group.id)}
              submissions={submissions}
              tasks={getGroupBoardTasks(group.id, tasks, boardAssignments)}
            />
          ))}
        </div>
      </section>

      {selectedGroup && (
        <HostLiveBoard
          group={selectedGroup}
          onClose={() => setSelectedHostGroupId("")}
          setSubmissionStatus={setSubmissionStatus}
          submissions={submissions}
          tasks={getGroupBoardTasks(selectedGroup.id, tasks, boardAssignments)}
        />
      )}

      <section aria-labelledby="submission-heading">
        <div className="section-heading">
          <div>
            <p className="label">Submission log</p>
            <h2 id="submission-heading">Photos received</h2>
          </div>
          <span>{game.phase === "review" ? "Review mode" : "Newest first"}</span>
        </div>

        <ProofList
          groups={groups}
          huntPhase={game.phase}
          setSubmissionStatus={setSubmissionStatus}
          submissions={submissions}
          tasks={tasks}
        />
      </section>
    </div>
  );
}

function BoardEditor({
  boardAssignments,
  boardsLocked,
  groups,
  onAddTask,
  onGenerateBoards,
  onRemoveTask,
  onSaveGroupBoard,
  onUpdateTask,
  submissions,
  tasks,
}: {
  boardAssignments: BoardAssignment[];
  boardsLocked: boolean;
  groups: Group[];
  onAddTask: () => void;
  onGenerateBoards: () => void;
  onRemoveTask: (taskId: string) => void;
  onSaveGroupBoard: (groupId: string, taskIds: string[]) => void;
  onUpdateTask: (
    taskId: string,
    patch: Partial<Pick<Task, "title" | "description" | "icon" | "free">>,
  ) => void;
  submissions: Submission[];
  tasks: Task[];
}) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id ?? "");
  const sortedTasks = useMemo(() => getSortedTasks(tasks), [tasks]);
  const assignedCounts = useMemo(() => {
    const counts = new Map<string, number>();

    boardAssignments.forEach((assignment) => {
      counts.set(assignment.taskId, (counts.get(assignment.taskId) ?? 0) + 1);
    });

    return counts;
  }, [boardAssignments]);
  const proofCounts = useMemo(() => {
    const counts = new Map<string, number>();

    submissions.forEach((submission) => {
      counts.set(submission.taskId, (counts.get(submission.taskId) ?? 0) + 1);
    });

    return counts;
  }, [submissions]);

  useEffect(() => {
    if (groups.length > 0 && !groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ?? groups[0] ?? null;

  return (
    <section
      className={isCollapsed ? "host-board-editor is-collapsed" : "host-board-editor"}
      aria-labelledby="board-editor-heading"
    >
      <div className="section-heading">
        <div>
          <p className="label">Board editor</p>
          <h2 id="board-editor-heading">Task pool and group boards</h2>
        </div>
        <div className="board-editor-heading-actions">
          <span>
            {boardsLocked ? "Assignments locked" : `${tasks.length} pool tasks`}
          </span>
          <button
            aria-controls="board-editor-body"
            aria-expanded={!isCollapsed}
            className="board-editor-toggle"
            type="button"
            onClick={() => setIsCollapsed((collapsed) => !collapsed)}
          >
            <ChevronDown aria-hidden="true" />
            {isCollapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div id="board-editor-body" className="board-editor-body">
          {boardsLocked && (
            <p className="editor-warning">
              Board assignments lock after the first proof arrives. Task wording can
              still be edited.
            </p>
          )}

          <div className="board-editor-toolbar">
            <button
              className="primary-action"
              disabled={boardsLocked || tasks.length === 0 || groups.length === 0}
              type="button"
              onClick={onGenerateBoards}
            >
              <Shuffle aria-hidden="true" />
              Generate boards
            </button>
            <button className="secondary-action" type="button" onClick={onAddTask}>
              <Plus aria-hidden="true" />
              Add task
            </button>
          </div>

          <div className="board-editor-layout">
            <div className="task-pool-panel">
              <div className="editor-panel-heading">
                <strong>Task pool</strong>
                <span>{sortedTasks.length} total</span>
              </div>

              <div className="task-pool-list">
                {sortedTasks.map((task) => (
                  <TaskPoolRow
                    key={task.id}
                    assignedCount={assignedCounts.get(task.id) ?? 0}
                    onRemove={() => onRemoveTask(task.id)}
                    onUpdate={(patch) => onUpdateTask(task.id, patch)}
                    proofCount={proofCounts.get(task.id) ?? 0}
                    task={task}
                  />
                ))}
              </div>
            </div>

            <div className="group-board-panel">
              <div className="editor-panel-heading">
                <strong>Group boards</strong>
                <span>{BOARD_SLOT_COUNT} slots each</span>
              </div>

              <div className="group-board-tabs" aria-label="Choose group board">
                {groups.map((group) => (
                  <button
                    key={group.id}
                    className={
                      selectedGroup?.id === group.id
                        ? "group-board-tab is-active"
                        : "group-board-tab"
                    }
                    style={{ "--group-color": group.color } as React.CSSProperties}
                    type="button"
                    onClick={() => setSelectedGroupId(group.id)}
                  >
                    {group.shortName}
                  </button>
                ))}
              </div>

              {selectedGroup ? (
                <GroupBoardSlotEditor
                  assignments={boardAssignments}
                  boardsLocked={boardsLocked}
                  group={selectedGroup}
                  onSave={(taskIds) => onSaveGroupBoard(selectedGroup.id, taskIds)}
                  tasks={sortedTasks}
                />
              ) : (
                <div className="empty-state">
                  <Users aria-hidden="true" />
                  <strong>No groups yet</strong>
                  <p>Add groups before building varied boards.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function TaskPoolRow({
  assignedCount,
  onRemove,
  onUpdate,
  proofCount,
  task,
}: {
  assignedCount: number;
  onRemove: () => void;
  onUpdate: (
    patch: Partial<Pick<Task, "title" | "description" | "icon" | "free">>,
  ) => void;
  proofCount: number;
  task: Task;
}) {
  const [draft, setDraft] = useState({
    title: task.title,
    description: task.description,
    icon: task.icon,
    free: Boolean(task.free),
  });
  const Icon = ICONS[draft.icon] ?? Circle;
  const isRemoveDisabled = assignedCount > 0 || proofCount > 0;
  const hasChanges =
    draft.title !== task.title ||
    draft.description !== task.description ||
    draft.icon !== task.icon ||
    draft.free !== Boolean(task.free);

  useEffect(() => {
    setDraft({
      title: task.title,
      description: task.description,
      icon: task.icon,
      free: Boolean(task.free),
    });
  }, [task]);

  return (
    <article className="task-pool-row">
      <div className="task-pool-icon">
        <Icon aria-hidden="true" />
      </div>

      <div className="task-pool-fields">
        <label className="stop-field">
          <span>Title</span>
          <input
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </label>

        <label className="stop-field">
          <span>Description</span>
          <textarea
            value={draft.description}
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value })
            }
          />
        </label>

        <div className="task-pool-meta">
          <label className="stop-field">
            <span>Icon</span>
            <select
              value={draft.icon}
              onChange={(event) => setDraft({ ...draft, icon: event.target.value })}
            >
              {TASK_ICON_OPTIONS.map((icon) => (
                <option key={icon} value={icon}>
                  {icon}
                </option>
              ))}
            </select>
          </label>

          <label className="task-free-toggle">
            <input
              checked={draft.free}
              type="checkbox"
              onChange={(event) =>
                setDraft({ ...draft, free: event.target.checked })
              }
            />
            Free square
          </label>
        </div>

        <div className="task-pool-actions">
          <span>
            {assignedCount} boards
            {proofCount > 0 ? `, ${proofCount} proofs` : ""}
          </span>
          <div>
            <button
              className="secondary-action remove-stop-button"
              disabled={isRemoveDisabled}
              type="button"
              onClick={onRemove}
            >
              <Trash2 aria-hidden="true" />
              Remove
            </button>
            <button
              className="primary-action"
              disabled={!hasChanges || !draft.title.trim()}
              type="button"
              onClick={() => onUpdate(draft)}
            >
              <Check aria-hidden="true" />
              Apply
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function GroupBoardSlotEditor({
  assignments,
  boardsLocked,
  group,
  onSave,
  tasks,
}: {
  assignments: BoardAssignment[];
  boardsLocked: boolean;
  group: Group;
  onSave: (taskIds: string[]) => void;
  tasks: Task[];
}) {
  const boardTaskIds = useMemo(
    () => getGroupBoardSlotTaskIds(group.id, tasks, assignments),
    [assignments, group.id, tasks],
  );
  const [draftTaskIds, setDraftTaskIds] = useState(boardTaskIds);
  const selectedTaskIds = draftTaskIds.filter(Boolean);
  const duplicateTaskIds = selectedTaskIds.filter(
    (taskId, index) => selectedTaskIds.indexOf(taskId) !== index,
  );
  const duplicateTaskSet = new Set(duplicateTaskIds);
  const hasChanges = draftTaskIds.join("|") !== boardTaskIds.join("|");

  useEffect(() => {
    setDraftTaskIds(boardTaskIds);
  }, [boardTaskIds]);

  function updateSlot(slotIndex: number, taskId: string) {
    setDraftTaskIds((currentTaskIds) => {
      const nextTaskIds = [...currentTaskIds];
      nextTaskIds[slotIndex] = taskId;
      return nextTaskIds;
    });
  }

  return (
    <div
      className="group-board-editor"
      style={{ "--group-color": group.color } as React.CSSProperties}
    >
      <div className="group-board-summary">
        <strong>{group.name}</strong>
        <span>
          {selectedTaskIds.length} of {BOARD_SLOT_COUNT} slots filled
        </span>
      </div>

      <div className="board-slot-grid">
        {Array.from({ length: BOARD_SLOT_COUNT }, (_, index) => {
          const slotNumber = index + 1;
          const selectedTaskId = draftTaskIds[index] ?? "";
          const isCenterSlot = slotNumber === BOARD_CENTER_SLOT;

          return (
            <label
              key={slotNumber}
              className={isCenterSlot ? "board-slot-field is-center" : "board-slot-field"}
            >
              <span>{slotNumber}</span>
              <select
                disabled={boardsLocked}
                value={selectedTaskId}
                onChange={(event) => updateSlot(index, event.target.value)}
              >
                <option value="">Empty</option>
                {tasks.map((task) => {
                  const isSelectedElsewhere =
                    selectedTaskId !== task.id && selectedTaskIds.includes(task.id);

                  return (
                    <option
                      key={task.id}
                      disabled={isSelectedElsewhere}
                      value={task.id}
                    >
                      {task.title}
                    </option>
                  );
                })}
              </select>
            </label>
          );
        })}
      </div>

      {duplicateTaskSet.size > 0 && (
        <p className="editor-warning">Each task can only appear once per board.</p>
      )}

      <button
        className="primary-action board-save-button"
        disabled={boardsLocked || duplicateTaskSet.size > 0 || !hasChanges}
        type="button"
        onClick={() => onSave(draftTaskIds)}
      >
        <Check aria-hidden="true" />
        Save {group.shortName} board
      </button>
    </div>
  );
}

function StopEditor({
  canRemove,
  index,
  isActive,
  isExpanded,
  onRemove,
  onSave,
  onToggle,
  stop,
  stopCount,
  updateStop,
}: {
  canRemove: boolean;
  index: number;
  isActive: boolean;
  isExpanded: boolean;
  onRemove: () => void;
  onSave: () => void;
  onToggle: () => void;
  stop: HuntStop;
  stopCount: number;
  updateStop: (
    stopId: string,
    patch: Partial<Pick<HuntStop, "name" | "detail" | "arriveTime" | "leaveTime">>,
  ) => void;
}) {
  const [draft, setDraft] = useState(stop);

  useEffect(() => {
    setDraft(stop);
  }, [stop]);

  function saveDraft() {
    updateStop(stop.id, {
      name: draft.name,
      detail: draft.detail,
      arriveTime: normalizeClockTime(draft.arriveTime),
      leaveTime: normalizeClockTime(draft.leaveTime),
    });
    onSave();
  }

  return (
    <article
      className={[
        "stop-editor",
        isActive ? "is-active" : "",
        isExpanded ? "is-expanded" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        aria-expanded={isExpanded}
        className="stop-editor-summary"
        type="button"
        onClick={onToggle}
      >
        <span className="stop-summary-copy">
          <span className="stop-summary-kicker">
            <span className="stop-number">
              Stop {index + 1} of {stopCount}
            </span>
            {isActive && <span className="active-stop-pill">Current</span>}
          </span>
          <strong>{stop.name}</strong>
          <span className="stop-schedule">
            <Clock aria-hidden="true" />
            {formatStopSchedule(stop)}
          </span>
        </span>
        <ChevronDown className="collapse-icon" aria-hidden="true" />
      </button>

      {isExpanded && (
        <div className="stop-editor-body">
          <label className="stop-field">
            <span>Stop name</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label className="stop-field">
            <span>Stop instructions</span>
            <textarea
              value={draft.detail}
              onChange={(event) => setDraft({ ...draft, detail: event.target.value })}
            />
          </label>
          <div className="stop-time-grid">
            <label className="stop-field">
              <span>Arrive at</span>
              <input
                value={draft.arriveTime}
                onBlur={() =>
                  setDraft({
                    ...draft,
                    arriveTime: normalizeClockTime(draft.arriveTime),
                  })
                }
                onChange={(event) =>
                  setDraft({ ...draft, arriveTime: event.target.value })
                }
              />
            </label>
            <label className="stop-field">
              <span>Leave at</span>
              <input
                value={draft.leaveTime}
                onBlur={() =>
                  setDraft({
                    ...draft,
                    leaveTime: normalizeClockTime(draft.leaveTime),
                  })
                }
                onChange={(event) =>
                  setDraft({ ...draft, leaveTime: event.target.value })
                }
              />
            </label>
          </div>
          <div className="stop-action-row">
            <button
              className="secondary-action remove-stop-button"
              disabled={!canRemove}
              type="button"
              onClick={onRemove}
            >
              <Trash2 aria-hidden="true" />
              Remove
            </button>
            <button className="primary-action" type="button" onClick={saveDraft}>
              <Check aria-hidden="true" />
              Apply
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function PlayTimeRow({
  afterStop,
  afterStopIndex,
  isActive,
  nextStop,
  onStart,
}: {
  afterStop?: HuntStop;
  afterStopIndex: number;
  isActive: boolean;
  nextStop: HuntStop;
  onStart: () => void;
}) {
  const isOpeningPlay = afterStopIndex < 0;

  return (
    <article className={isActive ? "play-time-row is-active" : "play-time-row"}>
      <button className="play-time-button" type="button" onClick={onStart}>
        <span className="stop-summary-copy">
          <span className="stop-summary-kicker">
            <span className="stop-number">
              {isOpeningPlay ? "Before stop 1" : `After stop ${afterStopIndex + 1}`}
            </span>
            {isActive && <span className="active-stop-pill">Current</span>}
          </span>
          <strong>Play Time</strong>
          <span className="stop-schedule">
            <Clock aria-hidden="true" />
            {formatPlaySchedule(afterStop, nextStop)}
          </span>
        </span>
        <span
          className={
            isOpeningPlay ? "play-time-next is-start-action" : "play-time-next"
          }
        >
          {isOpeningPlay ? <Play aria-hidden="true" /> : <Flag aria-hidden="true" />}
          {isOpeningPlay ? "Start hunt" : nextStop.name}
        </span>
      </button>
    </article>
  );
}

function TaskBoard({
  groupId,
  onTaskSelect,
  selectedTaskId,
  submissions,
  tasks,
}: {
  groupId: string;
  onTaskSelect: (taskId: string) => void;
  selectedTaskId: string;
  submissions: Submission[];
  tasks: Task[];
}) {
  return (
    <div className="blackout-board" role="list" aria-label="Blackout board">
      {tasks.map((task) => (
        <TaskTile
          key={task.id}
          groupId={groupId}
          isSelected={task.id === selectedTaskId}
          onTaskSelect={onTaskSelect}
          submissions={submissions}
          task={task}
        />
      ))}
    </div>
  );
}

function TaskTile({
  groupId,
  isSelected,
  onTaskSelect,
  submissions,
  task,
}: {
  groupId: string;
  isSelected?: boolean;
  onTaskSelect?: (taskId: string) => void;
  submissions: Submission[];
  task: Task;
}) {
  const status = getTaskStatus(task, groupId, submissions);
  const Icon = ICONS[task.icon] ?? Circle;

  return (
    <button
      className={[
        "task-tile",
        isSelected ? "is-selected" : "",
        status !== "ready" ? `is-${status}` : "",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={!onTaskSelect}
      role="listitem"
      type="button"
      onClick={() => onTaskSelect?.(task.id)}
    >
      <Icon className="task-icon" aria-hidden="true" />
      <span className="task-title">{task.title}</span>
      {status !== "ready" && (
        <span className="tile-state" aria-label={getStatusLabel(status)}>
          {status === "approved" ? <Check aria-hidden="true" /> : <Send aria-hidden="true" />}
        </span>
      )}
    </button>
  );
}

function TaskList({
  groupId,
  onTaskSelect,
  selectedTaskId,
  submissions,
  tasks,
}: {
  groupId: string;
  onTaskSelect: (taskId: string) => void;
  selectedTaskId: string;
  submissions: Submission[];
  tasks: Task[];
}) {
  return (
    <div className="task-list" aria-label="Task list">
      {tasks.map((task) => {
        const status = getTaskStatus(task, groupId, submissions);
        const Icon = ICONS[task.icon] ?? Circle;

        return (
          <button
            key={task.id}
            className={[
              "task-list-item",
              selectedTaskId === task.id ? "is-selected" : "",
              status !== "ready" ? `is-${status}` : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            onClick={() => onTaskSelect(task.id)}
          >
            <span className="task-list-icon">
              <Icon aria-hidden="true" />
            </span>
            <span className="task-list-copy">
              <span className="task-list-top">
                <span className="task-list-title">{task.title}</span>
                <StatusBadge status={status} />
              </span>
              <span className="task-list-description">{task.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SelectedTaskCard({
  groupId,
  isUploading,
  onSubmitProof,
  submission,
  task,
}: {
  groupId: string;
  isUploading: boolean;
  onSubmitProof: (taskId: string, file: File) => void;
  submission?: Submission;
  task: Task;
}) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [isReplacingProof, setIsReplacingProof] = useState(false);
  const Icon = ICONS[task.icon] ?? Circle;
  const status = getTaskStatus(task, groupId, submission ? [submission] : []);
  const inputId = `${groupId}-${task.id}`;
  const proofNote = getProofStateNote(status, task.free, isReplacingProof);
  const canSubmitProof =
    !task.free && (status === "ready" || status === "retake" || isReplacingProof);
  const canReplaceProof =
    !task.free && Boolean(submission) && status !== "retake" && !isReplacingProof;
  const primaryPhotoLabel =
    status === "retake"
      ? "Retake photo"
      : isReplacingProof
        ? "Take replacement"
        : "Take photo";
  const secondaryPhotoLabel = isReplacingProof ? "Choose replacement" : "Choose photo";

  useEffect(() => {
    setIsReplacingProof(false);
  }, [submission?.id, submission?.status, task.id]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      onSubmitProof(task.id, file);
    }

    event.target.value = "";
  }

  return (
    <section className="selected-task" aria-label="Current task">
      <div className="selected-task-main">
        <div className="selected-icon">
          <Icon aria-hidden="true" />
        </div>
        <div>
          <p className="label">Current task</p>
          <h2>{task.title}</h2>
          <p>{task.description}</p>
          <StatusBadge status={status} />
        </div>
      </div>

      {submission && (
        <figure
          className={
            submission.status === "retake"
              ? "proof-preview is-retake"
              : "proof-preview"
          }
        >
          <img src={submission.imageUrl} alt="" />
          <figcaption>{submission.imageName}</figcaption>
        </figure>
      )}

      {proofNote && (
        <p className={status === "ready" ? "proof-state-note" : `proof-state-note is-${status}`}>
          {proofNote}
        </p>
      )}

      {canReplaceProof && (
        <button
          className={
            status === "approved"
              ? "secondary-action proof-replace-action is-approved"
              : "secondary-action proof-replace-action"
          }
          disabled={isUploading}
          type="button"
          onClick={() => setIsReplacingProof(true)}
        >
          <Upload aria-hidden="true" />
          {status === "approved" ? "Replace approved photo" : "Replace photo"}
        </button>
      )}

      {!task.free && canSubmitProof && (
        <div className={isReplacingProof ? "photo-actions is-replacing" : "photo-actions"}>
          <input
            ref={cameraInputRef}
            className="file-input-hidden"
            id={`${inputId}-camera`}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
          />
          <input
            ref={uploadInputRef}
            className="file-input-hidden"
            id={`${inputId}-upload`}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
          />
          <button
            className="primary-action"
            disabled={isUploading}
            type="button"
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera aria-hidden="true" />
            {isUploading ? "Sending..." : primaryPhotoLabel}
          </button>
          <button
            className="secondary-action"
            disabled={isUploading}
            type="button"
            onClick={() => uploadInputRef.current?.click()}
          >
            <Upload aria-hidden="true" />
            {secondaryPhotoLabel}
          </button>
          {isReplacingProof && (
            <button
              className="secondary-action proof-cancel-action"
              disabled={isUploading}
              type="button"
              onClick={() => setIsReplacingProof(false)}
            >
              Cancel replacement
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function TeamCard({
  group,
  isSelected,
  onSelect,
  submissions,
  tasks,
}: {
  group: Group;
  isSelected: boolean;
  onSelect: () => void;
  submissions: Submission[];
  tasks: Task[];
}) {
  const sentCount = tasks.filter(
    (task) => task.free || getTaskStatus(task, group.id, submissions) !== "ready",
  ).length;
  const submittedCount = submissions.filter(
    (submission) => submission.groupId === group.id,
  ).length;

  return (
    <button
      className={isSelected ? "team-card is-selected" : "team-card"}
      style={{ "--group-color": group.color } as React.CSSProperties}
      type="button"
      onClick={onSelect}
    >
      <span className="team-card-top">
        <Users aria-hidden="true" />
        <strong>{group.shortName}</strong>
      </span>
      <span className="team-score">
        {sentCount}
        <span>/{tasks.length}</span>
      </span>
      <span className="progress-track" aria-hidden="true">
        <span style={{ width: `${tasks.length ? (sentCount / tasks.length) * 100 : 0}%` }} />
      </span>
      <p>{submittedCount} submitted</p>
    </button>
  );
}

function HostLiveBoard({
  group,
  onClose,
  setSubmissionStatus,
  submissions,
  tasks,
}: {
  group: Group;
  onClose: () => void;
  setSubmissionStatus: (submissionId: string, status: Submission["status"]) => void;
  submissions: Submission[];
  tasks: Task[];
}) {
  const [lightboxSubmissionId, setLightboxSubmissionId] = useState<string | null>(
    null,
  );
  const groupSubmissions = useMemo(
    () => submissions.filter((submission) => submission.groupId === group.id),
    [group.id, submissions],
  );
  const lightboxSubmission =
    groupSubmissions.find((submission) => submission.id === lightboxSubmissionId) ??
    null;
  const lightboxTask = lightboxSubmission
    ? tasks.find((task) => task.id === lightboxSubmission.taskId) ?? null
    : null;
  const sentCount = tasks.filter(
    (task) => task.free || getTaskStatus(task, group.id, submissions) !== "ready",
  ).length;
  const approvedCount = tasks.filter(
    (task) => task.free || getTaskStatus(task, group.id, submissions) === "approved",
  ).length;
  const pendingCount = groupSubmissions.filter(
    (submission) => submission.status === "pending",
  ).length;

  useEffect(() => {
    if (
      lightboxSubmissionId &&
      !groupSubmissions.some((submission) => submission.id === lightboxSubmissionId)
    ) {
      setLightboxSubmissionId(null);
    }
  }, [groupSubmissions, lightboxSubmissionId]);

  return (
    <>
      <section
        className="host-live-board"
        style={{ "--group-color": group.color } as React.CSSProperties}
        aria-label={`${group.shortName} live board`}
      >
        <div className="host-board-header">
          <div>
            <p className="label">Live board</p>
            <h3>{group.name}</h3>
          </div>
          <button className="host-board-close" type="button" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="host-board-metrics">
          <span>
            <strong>{sentCount}</strong>
            sent
          </span>
          <span>
            <strong>{approvedCount}</strong>
            approved
          </span>
          <span>
            <strong>{pendingCount}</strong>
            pending
          </span>
        </div>
        <div className="blackout-board host-board-grid">
          {tasks.map((task) => {
            const taskSubmission = groupSubmissions.find(
              (submission) => submission.taskId === task.id,
            );

            return (
              <TaskTile
                key={task.id}
                groupId={group.id}
                onTaskSelect={
                  taskSubmission
                    ? () => setLightboxSubmissionId(taskSubmission.id)
                    : undefined
                }
                submissions={submissions}
                task={task}
              />
            );
          })}
        </div>
      </section>

      {lightboxSubmission && lightboxTask && (
        <ProofLightbox
          group={group}
          onClose={() => setLightboxSubmissionId(null)}
          onApprove={() => setSubmissionStatus(lightboxSubmission.id, "approved")}
          submission={lightboxSubmission}
          task={lightboxTask}
        />
      )}
    </>
  );
}

function ProofList({
  groups,
  huntPhase,
  setSubmissionStatus,
  submissions,
  tasks,
}: {
  groups: Group[];
  huntPhase: HuntPhase;
  setSubmissionStatus: (submissionId: string, status: Submission["status"]) => void;
  submissions: Submission[];
  tasks: Task[];
}) {
  const [lightboxSubmissionId, setLightboxSubmissionId] = useState<string | null>(
    null,
  );
  const sortedSubmissions = useMemo(
    () => [...submissions].sort((a, b) => b.createdAt - a.createdAt),
    [submissions],
  );
  const lightboxSubmission =
    sortedSubmissions.find((submission) => submission.id === lightboxSubmissionId) ??
    null;
  const lightboxGroup = lightboxSubmission
    ? groups.find((group) => group.id === lightboxSubmission.groupId) ?? null
    : null;
  const lightboxTask = lightboxSubmission
    ? tasks.find((task) => task.id === lightboxSubmission.taskId) ?? null
    : null;

  useEffect(() => {
    if (
      lightboxSubmissionId &&
      !submissions.some((submission) => submission.id === lightboxSubmissionId)
    ) {
      setLightboxSubmissionId(null);
    }
  }, [lightboxSubmissionId, submissions]);

  if (sortedSubmissions.length === 0) {
    return (
      <div className="empty-state">
        <Image aria-hidden="true" />
        <strong>No proofs yet</strong>
        <p>Photos will appear here as groups submit tasks from the board.</p>
      </div>
    );
  }

  return (
    <>
      <div className="proof-list">
        {sortedSubmissions.map((submission) => {
          const group =
            groups.find((item) => item.id === submission.groupId) ?? groups[0];
          const task = tasks.find((item) => item.id === submission.taskId) ?? tasks[0];

          if (!group || !task) {
            return null;
          }

          return (
            <article
              key={submission.id}
              className={[
                "proof-item",
                submission.status === "approved" ? "is-approved" : "",
                submission.status === "retake" ? "is-retake" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ "--group-color": group.color } as React.CSSProperties}
            >
              <button
                aria-label={`Open proof photo for ${task.title}`}
                className="proof-image-button"
                type="button"
                onClick={() => setLightboxSubmissionId(submission.id)}
              >
                <img src={submission.imageUrl} alt="" />
              </button>
              <div className="proof-copy">
                <strong>{task.title}</strong>
                <span>{group.shortName}</span>
                <small className="proof-byline">
                  {formatSubmissionByline(submission)}
                </small>
                <small>{submission.imageName}</small>
              </div>
              {huntPhase === "review" ? (
                <div className="proof-actions">
                  <button
                    className="approve-button"
                    disabled={submission.status === "approved"}
                    type="button"
                    onClick={() => setSubmissionStatus(submission.id, "approved")}
                  >
                    <Check aria-hidden="true" />
                    Approve
                  </button>
                  <button
                    className="retake-button"
                    disabled={submission.status === "retake"}
                    type="button"
                    onClick={() => setSubmissionStatus(submission.id, "retake")}
                  >
                    <TimerReset aria-hidden="true" />
                    Retake
                  </button>
                </div>
              ) : (
                <span className="received-pill">
                  <Image aria-hidden="true" />
                  Received
                </span>
              )}
            </article>
          );
        })}
      </div>

      {lightboxSubmission && lightboxGroup && lightboxTask && (
        <ProofLightbox
          group={lightboxGroup}
          onClose={() => setLightboxSubmissionId(null)}
          onApprove={() => setSubmissionStatus(lightboxSubmission.id, "approved")}
          submission={lightboxSubmission}
          task={lightboxTask}
        />
      )}
    </>
  );
}

function ProofLightbox({
  group,
  onClose,
  onApprove,
  submission,
  task,
}: {
  group: Group;
  onClose: () => void;
  onApprove?: () => void;
  submission: Submission;
  task: Task;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div
      aria-labelledby="proof-lightbox-title"
      aria-modal="true"
      className="proof-lightbox"
      role="dialog"
    >
      <button
        aria-label="Close proof photo"
        className="proof-lightbox-backdrop"
        type="button"
        onClick={onClose}
      />
      <div
        className="proof-lightbox-panel"
        style={{ "--group-color": group.color } as React.CSSProperties}
      >
        <div className="proof-lightbox-header">
          <div>
            <p className="label">{group.shortName}</p>
            <h3 id="proof-lightbox-title">{task.title}</h3>
            <span className="proof-lightbox-meta">
              {formatSubmissionByline(submission)}
            </span>
            <span>{submission.imageName}</span>
          </div>
          <button
            aria-label="Close proof photo"
            className="proof-lightbox-close"
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <img
          src={submission.imageUrl}
          alt={`${task.title} proof from ${group.shortName}`}
        />
        {onApprove && (
          <button
            className="approve-button proof-lightbox-approve"
            disabled={submission.status === "approved"}
            type="button"
            onClick={onApprove}
          >
            <Check aria-hidden="true" />
            {submission.status === "approved" ? "Approved" : "Approve photo"}
          </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const icon =
    status === "approved" ? (
      <Check aria-hidden="true" />
    ) : status === "ready" ? (
      <Camera aria-hidden="true" />
    ) : (
      <Send aria-hidden="true" />
    );

  return (
    <span className={status === "ready" ? "status-badge" : `status-badge is-${status}`}>
      {icon}
      {getStatusLabel(status)}
    </span>
  );
}

function getSortedTasks(tasks: Task[]) {
  return [...tasks].sort((first, second) => {
    if (first.sortOrder !== second.sortOrder) {
      return first.sortOrder - second.sortOrder;
    }

    return first.title.localeCompare(second.title);
  });
}

function getGroupBoardSlotTaskIds(
  groupId: string,
  tasks: Task[],
  assignments: BoardAssignment[],
) {
  const taskIds = new Set(tasks.map((task) => task.id));
  const slotTaskIds = Array.from({ length: BOARD_SLOT_COUNT }, () => "");
  const groupAssignments = assignments
    .filter((assignment) => assignment.groupId === groupId)
    .sort((first, second) => first.slotOrder - second.slotOrder);

  if (groupAssignments.length === 0) {
    getSortedTasks(tasks)
      .slice(0, BOARD_SLOT_COUNT)
      .forEach((task, index) => {
        slotTaskIds[index] = task.id;
      });
    return slotTaskIds;
  }

  groupAssignments.forEach((assignment) => {
    if (
      assignment.slotOrder >= 1 &&
      assignment.slotOrder <= BOARD_SLOT_COUNT &&
      taskIds.has(assignment.taskId)
    ) {
      slotTaskIds[assignment.slotOrder - 1] = assignment.taskId;
    }
  });

  return slotTaskIds;
}

function getGroupBoardTasks(
  groupId: string,
  tasks: Task[],
  assignments: BoardAssignment[],
) {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));

  return getGroupBoardSlotTaskIds(groupId, tasks, assignments)
    .map((taskId) => taskMap.get(taskId))
    .filter((task): task is Task => Boolean(task));
}

function formatSubmissionByline(submission: Submission) {
  return `Submitted by ${getSubmitterName(submission)} at ${formatSubmissionTime(
    submission.createdAt,
  )}`;
}

function getSubmitterName(submission: Submission) {
  return submission.submittedByName?.trim() || "Unknown player";
}

function formatSubmissionTime(timestamp: number) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "time unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function createTaskSlug(title: string, existingTaskIds: string[]) {
  const baseSlug =
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "task";
  const existingIds = new Set(existingTaskIds);

  if (!existingIds.has(baseSlug)) {
    return baseSlug;
  }

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${baseSlug}-${index}`;

    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }

  return `${baseSlug}-${Date.now()}`;
}

function generateGroupBoards(groups: Group[], tasks: Task[]) {
  const sortedTasks = getSortedTasks(tasks);
  const freeTask = sortedTasks.find((task) => task.free) ?? null;
  const nonFreeTasks = sortedTasks.filter((task) => !task.free);
  const sharedTasks = nonFreeTasks.slice(
    0,
    Math.min(SHARED_GENERATED_TASK_COUNT, nonFreeTasks.length),
  );
  const variedPool = nonFreeTasks.filter(
    (task) => !sharedTasks.some((sharedTask) => sharedTask.id === task.id),
  );

  return groups.reduce<Record<string, string[]>>((boards, group) => {
    const boardTaskIds = Array.from({ length: BOARD_SLOT_COUNT }, () => "");
    const shuffledTasks = stableShuffleTasks(variedPool, group.id);
    const taskIds = [
      ...sharedTasks.map((task) => task.id),
      ...shuffledTasks.map((task) => task.id),
      ...nonFreeTasks
        .filter(
          (task) =>
            !sharedTasks.some((sharedTask) => sharedTask.id === task.id) &&
            !shuffledTasks.some((shuffledTask) => shuffledTask.id === task.id),
        )
        .map((task) => task.id),
    ];
    let taskIndex = 0;

    boardTaskIds.forEach((_, index) => {
      const slotNumber = index + 1;

      if (freeTask && slotNumber === BOARD_CENTER_SLOT) {
        boardTaskIds[index] = freeTask.id;
        return;
      }

      const nextTaskId = taskIds[taskIndex];

      if (nextTaskId) {
        boardTaskIds[index] = nextTaskId;
        taskIndex += 1;
      }
    });

    boards[group.id] = boardTaskIds;
    return boards;
  }, {});
}

function stableShuffleTasks(tasks: Task[], seed: string) {
  return [...tasks].sort(
    (first, second) =>
      hashString(`${seed}:${first.id}`) - hashString(`${seed}:${second.id}`),
  );
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getTaskStatus(
  task: Task,
  groupId: string,
  submissions: Submission[],
): TaskStatus {
  if (task.free) {
    return "approved";
  }

  const submission = submissions.find(
    (item) => item.groupId === groupId && item.taskId === task.id,
  );

  return submission?.status ?? "ready";
}

function getDefaultSelectedTask(
  groupId: string,
  tasks: Task[],
  submissions: Submission[],
) {
  return (
    tasks.find((task) => {
      const status = getTaskStatus(task, groupId, submissions);
      return !task.free && (status === "ready" || status === "retake");
    }) ??
    tasks.find((task) => !task.free) ??
    tasks[0] ??
    null
  );
}

function getStatusLabel(status: TaskStatus) {
  if (status === "approved") return "Approved";
  if (status === "pending") return "Sent";
  if (status === "retake") return "Retake";
  return "Ready";
}

function getProofStateNote(
  status: TaskStatus,
  isFreeTask: boolean | undefined,
  isReplacingProof: boolean,
) {
  if (isFreeTask) {
    return "Free square. No photo needed.";
  }

  if (isReplacingProof) {
    return "Replacement photos go back to the host for review.";
  }

  if (status === "pending") {
    return "Photo sent. Waiting for host review.";
  }

  if (status === "approved") {
    return "Approved. Replacing it will send this square back to review.";
  }

  if (status === "retake") {
    return "Host requested a new proof.";
  }

  return "";
}

function getGameRemainingSeconds(game: Game) {
  if (!game.timerRunning) {
    return Math.max(0, game.timerSecondsTotal);
  }

  const startedAt = new Date(game.timerStartedAt).getTime();
  const elapsedSeconds = Number.isFinite(startedAt)
    ? Math.floor((Date.now() - startedAt) / 1000)
    : 0;

  return Math.max(0, game.timerSecondsTotal - elapsedSeconds);
}

function formatTimer(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;

  if (minutes >= 100) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (remainingMinutes === 0) {
      return `${hours}h`;
    }

    return `${hours}h ${remainingMinutes}m`;
  }

  return `${minutes.toString().padStart(2, "0")}:${remainder
    .toString()
    .padStart(2, "0")}`;
}

function getTimerDisplay(
  game: Game,
  stops: HuntStop[],
  activeStopIndex: number,
  timerSeconds: number,
  countdownCaption: string,
): TimerDisplay {
  if (game.phase === "review") {
    return {
      label: "Done",
      caption: "finished",
      state: "finished",
    };
  }

  if (isBeforeHuntStart(game, stops, activeStopIndex, timerSeconds)) {
    return {
      label: "Ready",
      caption: "not started",
      state: "idle",
    };
  }

  return {
    label: formatTimer(timerSeconds),
    caption: countdownCaption,
    state: "countdown",
    isWarning: timerSeconds <= 5 * 60,
  };
}

function isBeforeHuntStart(
  game: Game,
  stops: HuntStop[],
  activeStopIndex: number,
  timerSeconds: number,
) {
  if (game.phase === "play" && activeStopIndex < 0 && !game.timerRunning) {
    return true;
  }

  if (game.phase !== "live" || activeStopIndex !== 0 || game.timerRunning) {
    return false;
  }

  const firstStopSeconds = getStopCountdownSeconds(stops, 0);

  return firstStopSeconds > 0 && timerSeconds >= firstStopSeconds;
}

function getStopCountdownSeconds(stops: HuntStop[], stopIndex: number) {
  const stop = stops[stopIndex];

  if (!stop) {
    return 0;
  }

  return getClockDurationSeconds(stop.arriveTime, stop.leaveTime);
}

function getPlayCountdownSeconds(stops: HuntStop[], afterStopIndex: number) {
  if (afterStopIndex < 0) {
    return stops[0] ? getSecondsUntilTodayClockTime(stops[0].arriveTime) : 0;
  }

  const afterStop = stops[afterStopIndex];
  const nextStop = stops[afterStopIndex + 1];

  if (!afterStop || !nextStop) {
    return 0;
  }

  return getClockDurationSeconds(afterStop.leaveTime, nextStop.arriveTime);
}

function getSecondsUntilTodayClockTime(targetTime: string) {
  const targetMinutes = getClockMinutes(targetTime);

  if (targetMinutes === null) {
    return 0;
  }

  const now = new Date();
  const target = new Date(now);

  target.setHours(Math.floor(targetMinutes / 60), targetMinutes % 60, 0, 0);

  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 1000));
}

function getClockDurationSeconds(startTime: string, endTime: string) {
  const startMinutes = getClockMinutes(startTime);
  const endMinutes = getClockMinutes(endTime);

  if (startMinutes === null || endMinutes === null) {
    return 0;
  }

  const adjustedEndMinutes =
    endMinutes <= startMinutes ? endMinutes + 24 * 60 : endMinutes;

  return Math.max(0, adjustedEndMinutes - startMinutes) * 60;
}

function formatStopSchedule(stop: HuntStop) {
  return `Arrive ${formatClockTime(stop.arriveTime)} - Leave ${formatClockTime(
    stop.leaveTime,
  )}`;
}

function formatPlaySchedule(afterStop: HuntStop | undefined, nextStop: HuntStop) {
  if (!afterStop) {
    return `Start now - Arrive ${formatClockTime(nextStop.arriveTime)}`;
  }

  return `Leave ${formatClockTime(afterStop.leaveTime)} - Arrive ${formatClockTime(
    nextStop.arriveTime,
  )}`;
}

function getRouteDisplay(
  stops: HuntStop[],
  activeStopIndex: number,
  phase: HuntPhase,
): RouteDisplay {
  const activeStop = stops[activeStopIndex] ?? stops[0];
  const nextStop = stops[activeStopIndex + 1];

  if (!activeStop) {
    return {
      label: "Current route",
      title: "Scavenger Blackout",
      detail: "The route is not set yet.",
      timeLabel: "",
      timerSmall: "not set",
    };
  }

  if (phase === "play" && activeStopIndex < 0 && activeStop) {
    return {
      label: "Current phase",
      title: "Play Time",
      detail: `Start the hunt. Head toward ${activeStop.name}.`,
      timeLabel: formatPlaySchedule(undefined, activeStop),
      timerSmall: `arrive ${formatClockTime(activeStop.arriveTime)}`,
    };
  }

  if (phase === "play" && nextStop) {
    return {
      label: "Current phase",
      title: "Play Time",
      detail: `Head toward ${nextStop.name}. Regroup when play time ends.`,
      timeLabel: formatPlaySchedule(activeStop, nextStop),
      timerSmall: `arrive ${formatClockTime(nextStop.arriveTime)}`,
    };
  }

  return {
    label: phase === "review" ? "Review phase" : "Current stop",
    title: activeStop.name,
    detail: activeStop.detail,
    timeLabel: formatStopSchedule(activeStop),
    timerSmall: phase === "review" ? "review" : `leave ${formatClockTime(activeStop.leaveTime)}`,
  };
}

function normalizeClockTime(value: string) {
  const minutes = getClockMinutes(value);

  if (minutes === null) {
    return value.trim();
  }

  return minutesToClockTime(minutes);
}

function formatClockTime(value: string) {
  return normalizeClockTime(value);
}

function addMinutesToClockTime(value: string, minutesToAdd: number) {
  const minutes = getClockMinutes(value);

  if (minutes === null) {
    return value;
  }

  return minutesToClockTime(minutes + minutesToAdd);
}

function getClockMinutes(value: string) {
  const trimmed = value.trim().toLowerCase().replace(/\s+/g, "");
  const match = trimmed.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)$/);

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3];

  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return null;
  }

  const normalizedHour = (hour % 12) + (meridiem === "pm" ? 12 : 0);
  return normalizedHour * 60 + minute;
}

function minutesToClockTime(value: number) {
  const normalizedMinutes = ((value % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour24 = Math.floor(normalizedMinutes / 60);
  const minute = normalizedMinutes % 60;
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  return `${hour12}:${minute.toString().padStart(2, "0")} ${meridiem}`;
}

function readStoredPlayer(): StoredPlayer | null {
  try {
    const storedPlayer = window.localStorage.getItem(STORAGE_PLAYER_KEY);

    if (!storedPlayer) {
      return null;
    }

    const parsed = JSON.parse(storedPlayer) as StoredPlayer;

    if (!parsed.name || !parsed.groupId) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function storePlayer(player: StoredPlayer) {
  try {
    window.localStorage.setItem(STORAGE_PLAYER_KEY, JSON.stringify(player));
  } catch {
    // Local storage can be unavailable in private contexts.
  }
}

function readOnboardingDismissed() {
  try {
    return window.localStorage.getItem(STORAGE_ONBOARDING_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function storeOnboardingDismissed() {
  try {
    window.localStorage.setItem(STORAGE_ONBOARDING_DISMISSED_KEY, "true");
  } catch {
    // Local storage can be unavailable in private contexts.
  }
}

function readStoredGameCode() {
  try {
    return (
      window.localStorage.getItem(STORAGE_GAME_CODE_KEY)?.trim().toUpperCase() || ""
    );
  } catch {
    return "";
  }
}

function storeGameCode(code: string) {
  try {
    window.localStorage.setItem(STORAGE_GAME_CODE_KEY, code.trim().toUpperCase());
  } catch {
    // Local storage can be unavailable in private contexts.
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unexpected backend error.";
}
