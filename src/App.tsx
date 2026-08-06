import {
  ArrowLeft,
  ArrowRight,
  Armchair,
  Badge,
  Bike,
  Bird,
  Bug,
  Bus,
  Camera,
  Candy,
  Check,
  ChevronDown,
  Circle,
  Clock,
  Cloud,
  Coins,
  Cookie,
  CupSoda,
  Dices,
  Dog,
  Download,
  Droplets,
  Eye,
  EyeOff,
  FerrisWheel,
  Fish,
  Flag,
  Flame,
  Flower2,
  Gem,
  Glasses,
  Goal,
  Grid3X3,
  HardHat,
  Hash,
  HeartHandshake,
  Image,
  IceCreamBowl,
  Landmark,
  Leaf,
  List,
  Lock,
  Mailbox,
  Martini,
  Palette,
  Play,
  Plus,
  Pizza,
  Route,
  Sailboat,
  School,
  Search,
  Send,
  Settings2,
  Ship,
  Shirt,
  Signpost,
  Smile,
  Shuffle,
  Star,
  TimerReset,
  Ticket,
  Toilet,
  Trash2,
  TreePine,
  Trees,
  Triangle,
  Trophy,
  Truck,
  Umbrella,
  Upload,
  UserMinus,
  Users,
  Utensils,
  UtensilsCrossed,
  Volleyball,
  Waves,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toCanvas } from "qrcode";
import type React from "react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GAME_KITS, getGameKit } from "./gameKits";
import type { GameKit, GameKitId } from "./gameKits";
import {
  abandonGameLobby,
  addCatalogTask as createCatalogTask,
  addGroup as createGroup,
  addStop as createStop,
  addTask as createTask,
  claimHost,
  completeTask,
  configureGame,
  createProofDownloadUrl,
  joinGame,
  kickPlayerMembership,
  leaveGame,
  loadGameState,
  movePlayerMembership,
  promotePlayerMembership,
  removeCohostMembership,
  removeGroup as deleteGroup,
  removeStop as deleteStop,
  removeTask as deleteTask,
  resetCatalogTask,
  resetGameProofs,
  saveTaskProof,
  setGroupBoardTasks,
  shuffleBoards,
  subscribeToGameChanges,
  transferHostOwnership,
  updateGroupDetails,
  updateGameTimer,
  updateBoardSetup,
  updateStopDetails,
  updateTaskDetails,
  updateSubmissionStatus,
} from "./gameService";
import {
  TASK_CATALOG,
  TASK_CATEGORIES,
  getCatalogTask,
  searchTaskCatalog,
} from "./taskCatalog";
import type { CatalogCategory, CatalogTask } from "./taskCatalog";
import {
  createPendingProofUpload,
  deletePendingProofUpload,
  deletePendingProofUploadsForMembership,
  readPendingProofUploads,
  savePendingProofUpload,
} from "./pendingProofStore";
import type {
  BoardAssignment,
  BoardSize,
  Game,
  GameState,
  Group,
  HuntPhase,
  HuntStop,
  Membership,
  RosterMember,
  Submission,
  SubmissionStatus,
  Task,
  TaskStatus,
  TimerMode,
} from "./gameService";
import type { PendingProofUpload } from "./pendingProofStore";
import { PlayerSlidesExport } from "./PlayerSlidesExport";

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

type TimerTarget = {
  targetTime: string;
  referenceTime?: string;
};

type StoredPlayer = {
  name: string;
  groupId: string;
  gameId?: string;
  membershipId?: string;
};

type JoinRequest = {
  name: string;
  groupId?: string;
  gameCode: string;
};

type HostClaimRequest = {
  displayName: string;
  gameCode: string;
  pin: string;
  templateId?: GameKit["id"];
};

type TemplateRoute = {
  scope: "public" | "host";
  templateId?: string;
};

type LocalGamePatch = Partial<
  Pick<
    Game,
    | "activeStopId"
    | "phase"
    | "timerRunning"
    | "timerStartedAt"
    | "timerSecondsTotal"
    | "boardHidden"
    | "name"
    | "setupComplete"
    | "lobbyOpen"
    | "teamsLocked"
    | "playerExportMode"
  >
>;

type LocalStopPatch = Partial<
  Pick<HuntStop, "name" | "detail" | "arriveTime" | "leaveTime">
>;

const STORAGE_PLAYER_KEY = "scavenger-blackout-player";
const STORAGE_GAME_CODE_KEY = "scavenger-blackout-game-code";
const DEFAULT_PLAY_WINDOW_MINUTES = 30;
const DEFAULT_STOP_WINDOW_MINUTES = 30;
const DEFAULT_SHARED_BOARD_TASK_COUNT = 4;
const MAX_PROOF_FILE_BYTES = 500 * 1024;
const PROOF_MAX_FILE_LABEL = "500 KB";
const PROOF_IMAGE_EXTENSIONS = new Set(["heic", "heif", "jpeg", "jpg", "png", "webp"]);
const PROOF_IMAGE_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function RallyMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7 24.5c0-3.7 2.8-5.1 6-6.2 3.6-1.2 6-2.7 6-7.3"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="7" cy="24.5" r="2.5" fill="currentColor" />
      <path d="M19 5v15" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M20.5 6h7l-2.1 3.5 2.1 3.5h-7V6Z" fill="currentColor" />
    </svg>
  );
}
const PROOF_IMAGE_ACCEPT =
  "image/heic,image/heif,image/jpeg,image/png,image/webp,.heic,.heif,.jpeg,.jpg,.png,.webp";
const PROOF_RESIZED_IMAGE_TYPE = "image/jpeg";
const PROOF_RESIZED_IMAGE_EXTENSION = "jpg";
const PROOF_MAX_IMAGE_EDGE = 1280;
const PROOF_COMPRESSION_QUALITIES = [0.78, 0.68, 0.58, 0.48, 0.38];
const GAME_CODE_PATTERN = /^[A-Z0-9-]{3,24}$/;
const GAME_CODE_ERROR = "Game code must be 3-24 letters, numbers, or hyphens.";
const CONFIGURED_SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL?.trim() ?? "";
const SUPPORT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(CONFIGURED_SUPPORT_EMAIL)
  ? CONFIGURED_SUPPORT_EMAIL
  : "";

const ICONS: Record<string, LucideIcon> = {
  Armchair,
  Badge,
  Bike,
  Bird,
  Bug,
  Bus,
  Camera,
  Candy,
  Circle,
  Cloud,
  Coins,
  Cookie,
  CupSoda,
  Dog,
  Droplets,
  Eye,
  FerrisWheel,
  Fish,
  Flag,
  Flame,
  Flower2,
  Gem,
  Glasses,
  Goal,
  Grid3X3,
  HardHat,
  Hash,
  HeartHandshake,
  IceCreamBowl,
  Image,
  Landmark,
  Leaf,
  Mailbox,
  Martini,
  Palette,
  Pizza,
  Route,
  Sailboat,
  School,
  Ship,
  Shirt,
  Signpost,
  Smile,
  Star,
  Ticket,
  Toilet,
  Trash2,
  TreePine,
  Trees,
  Triangle,
  Trophy,
  Truck,
  Umbrella,
  Utensils,
  UtensilsCrossed,
  Volleyball,
  Waves,
};

const TASK_ICON_OPTIONS = Object.keys(ICONS).sort((first, second) =>
  first.localeCompare(second),
);

export default function App() {
  const [storedPlayer, setStoredPlayer] = useState<StoredPlayer | null>(
    () => readStoredPlayer(),
  );
  const initialGameCode = useMemo(() => readInitialGameCode(), []);
  const [path, setPath] = useState(() => window.location.pathname);
  const isHostRoute = path === "/host" || path.startsWith("/host/");
  const templateRoute = getTemplateRoute(path);
  const selectedCreationTemplate = getGameKit(readTemplateIdFromUrl());
  const [gameCode, setGameCode] = useState(initialGameCode);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const [isLoading, setIsLoading] = useState(initialGameCode.length > 0);
  const [error, setError] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [isTaskCardDismissed, setIsTaskCardDismissed] = useState(false);
  const [boardView, setBoardView] = useState<BoardView>("grid");
  const [showStopDetails, setShowStopDetails] = useState(false);
  const [expandedStopId, setExpandedStopId] = useState("");
  const [selectedHostGroupId, setSelectedHostGroupId] = useState(
    storedPlayer?.groupId ?? "",
  );
  const [toast, setToast] = useState("");
  const [timerTick, setTimerTick] = useState(Date.now());
  const [uploadingTaskId, setUploadingTaskId] = useState("");
  const [retryingProofId, setRetryingProofId] = useState("");
  const [pendingProofs, setPendingProofs] = useState<PendingProofUpload[]>([]);
  const [movingMembershipId, setMovingMembershipId] = useState("");
  const [kickingMembershipId, setKickingMembershipId] = useState("");
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [isAbandonDialogOpen, setIsAbandonDialogOpen] = useState(false);
  const [isAbandoningGame, setIsAbandoningGame] = useState(false);

  const refreshGameState = useCallback(
    async (code = gameCode, options?: { silent?: boolean }) => {
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
        const previousState = gameStateRef.current;
        const previousMembership =
          previousState?.membership?.role === "player" &&
          !nextState.membership &&
          previousState.game.id === nextState.game.id
            ? previousState.membership
            : null;
        const savedPlayer = readStoredPlayer();
        const savedMembershipId =
          !nextState.membership && savedPlayer?.gameId === nextState.game.id
            ? savedPlayer.membershipId
            : undefined;
        const removedMembershipId = previousMembership?.id ?? savedMembershipId;
        let queuedProofCleanupFailed = false;

        if (!nextState.membership && savedPlayer) {
          clearStoredPlayer();
          setStoredPlayer(null);
        }
        if (removedMembershipId) {
          setPendingProofs((proofs) =>
            proofs.filter(
              (proof) =>
                proof.gameId !== nextState.game.id ||
                proof.membershipId !== removedMembershipId,
            ),
          );
          try {
            await deletePendingProofUploadsForMembership(
              nextState.game.id,
              removedMembershipId,
            );
          } catch (caughtError) {
            queuedProofCleanupFailed = true;
            console.warn("Could not clear saved proof photos after removal.", caughtError);
          }

          const entryPath = window.location.pathname.startsWith("/host")
            ? "/host"
            : "/";
          clearStoredGameCode();
          setGameCode("");
          gameStateRef.current = null;
          setGameState(null);
          setSelectedTaskId("");
          window.history.replaceState({}, "", entryPath);
          setPath(entryPath);
          setError("");
          setToast(
            queuedProofCleanupFailed
              ? "You were removed. Saved queued photos could not be removed from this device."
              : "You were removed from the lobby and this device was cleared",
          );
          return null;
        }

        gameStateRef.current = nextState;
        setGameState(nextState);
        setGameCode(nextState.game.code);
        storeGameCode(nextState.game.code);
        syncGameCodeToUrl(nextState.game.code);
        setError("");
        return nextState;
      } catch (caughtError) {
        const message = getErrorMessage(caughtError);
        const activeState = gameStateRef.current;
        const activeRoomEnded =
          message === "No active game found for that code." &&
          activeState?.game.code === requestedCode;

        if (activeRoomEnded && activeState) {
          const endedMembership =
            activeState.membership?.role === "player"
              ? activeState.membership
              : null;
          const savedPlayer = readStoredPlayer();
          const endedMembershipId =
            endedMembership?.id ??
            (savedPlayer?.gameId === activeState.game.id
              ? savedPlayer.membershipId
              : undefined);
          const entryPath = window.location.pathname.startsWith("/host")
            ? "/host"
            : "/";

          if (endedMembershipId) {
            setPendingProofs((proofs) =>
              proofs.filter(
                (proof) =>
                  proof.gameId !== activeState.game.id ||
                  proof.membershipId !== endedMembershipId,
              ),
            );
          }
          clearStoredPlayer();
          setStoredPlayer(null);
          clearStoredGameCode();
          setGameCode("");
          gameStateRef.current = null;
          setGameState(null);
          setSelectedTaskId("");
          window.history.replaceState({}, "", entryPath);
          setPath(entryPath);
          setError("");
          setToast("This room has ended. This device was cleared.");

          if (endedMembershipId) {
            try {
              await deletePendingProofUploadsForMembership(
                activeState.game.id,
                endedMembershipId,
              );
            } catch (cleanupError) {
              console.warn(
                "Room ended, but saved proof photos could not be cleared.",
                cleanupError,
              );
              setToast(
                "Room ended. Saved queued photos could not be removed from this device.",
              );
            }
          }
          return null;
        }

        if (!options?.silent) {
          setGameState(null);
        }
        setError(message);
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
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    const onPopState = () => {
      setPath(window.location.pathname);
      const urlGameCode = readGameCodeFromUrl();

      if (urlGameCode) {
        setGameCode(urlGameCode);
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function goToHostView() {
    window.history.pushState({}, "", getPathWithGameCode("/host", gameCode));
    setPath("/host");
  }

  function navigateTo(href: string) {
    window.history.pushState({}, "", href);
    setPath(new URL(href, window.location.href).pathname);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    let isMounted = true;

    readPendingProofUploads()
      .then((proofs) => {
        if (isMounted) {
          setPendingProofs(proofs);
        }
      })
      .catch((caughtError) => {
        console.warn("Could not load saved proof photos.", caughtError);
      });

    return () => {
      isMounted = false;
    };
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
    const loadedMembershipId = gameState?.membership?.id;

    if (!loadedGameId || !loadedGameCode || !loadedMembershipId) {
      return undefined;
    }

    return subscribeToGameChanges(loadedGameId, async (revision) => {
      if (gameStateRef.current?.game.id !== loadedGameId) {
        return true;
      }
      const refreshedState = await refreshGameState(loadedGameCode, {
        silent: true,
      });
      if (revision === undefined) {
        return refreshedState !== null || gameStateRef.current === null;
      }
      if (refreshedState === null && gameStateRef.current === null) {
        return true;
      }
      return (
        typeof refreshedState?.revision === "number" &&
        refreshedState.revision >= revision
      );
    });
  }, [
    gameState?.game.code,
    gameState?.game.id,
    gameState?.membership?.id,
    refreshGameState,
  ]);

  useEffect(() => {
    if (!gameState || gameState.game.phase === "review") {
      return undefined;
    }

    const interval = window.setInterval(() => setTimerTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [gameState]);

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
  const memberships = gameState?.memberships ?? [];
  const roster = gameState?.roster ?? [];
  const membership = gameState?.membership ?? null;
  const scoreGroups = useMemo(
    () =>
      gameState?.game.playMode === "individual"
        ? roster
            .filter((member) => member.role === "player")
            .map((member, index) => createPlayerGroup(member, index))
        : groups,
    [gameState?.game.playMode, groups, roster],
  );
  const currentGroup =
    membership?.role === "player"
      ? gameState?.game.playMode === "individual"
        ? createPlayerGroup(membership, 0)
        : groups.find((group) => group.id === membership.groupId) ?? null
      : null;
  const currentGroupTasks = useMemo(
    () =>
      currentGroup
        ? getGroupBoardTasks(currentGroup.id, tasks, boardAssignments)
        : tasks,
    [boardAssignments, currentGroup, tasks],
  );
  const currentPendingProofs = useMemo(() => {
    if (!gameState || membership?.role !== "player" || !membership.groupId) {
      return [];
    }

    const currentTaskIds = new Set(currentGroupTasks.map((task) => task.id));

    return pendingProofs.filter(
      (proof) =>
        proof.gameId === gameState.game.id &&
        proof.membershipId === membership.id &&
        proof.groupId === membership.groupId &&
        currentTaskIds.has(proof.taskId),
    );
  }, [
    currentGroupTasks,
    gameState,
    membership?.groupId,
    membership?.id,
    membership?.role,
    pendingProofs,
  ]);
  const selectedTask =
    currentGroupTasks.find((task) => task.id === selectedTaskId) ?? null;
  const activeStopIndex =
    stops.length === 0
      ? -1
      : gameState?.game.phase === "play" && gameState.game.activeStopId === null
      ? -1
      : Math.max(
          0,
          stops.findIndex((stop) => stop.id === gameState?.game.activeStopId),
        );
  const activeStop = stops[activeStopIndex] ?? stops[0] ?? null;
  const timerSeconds = useMemo(() => {
    void timerTick;
    return gameState
      ? getGameRemainingSeconds(gameState.game, stops, activeStopIndex)
      : 0;
  }, [activeStopIndex, gameState, stops, timerTick]);

  useEffect(() => {
    if (
      selectedTaskId &&
      !currentGroupTasks.some((task) => task.id === selectedTaskId)
    ) {
      setIsTaskCardDismissed(false);
      setSelectedTaskId("");
    }
  }, [currentGroupTasks, selectedTaskId]);

  function handleTaskSelect(taskId: string) {
    setSelectedTaskId(taskId);
    setIsTaskCardDismissed(false);
  }

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
          ...patch,
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

    const previousState = gameState;
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
      const message = getErrorMessage(caughtError);
      console.warn(
        `Timer sync failed; restoring the saved room state: ${message}`,
        caughtError,
      );
      const refreshedState = await refreshGameState(
        previousState.game.code,
        { silent: true },
      );
      const currentState = gameStateRef.current;

      if (
        !refreshedState &&
        currentState?.game.id === previousState.game.id &&
        (currentState.revision ?? 0) <= (previousState.revision ?? 0)
      ) {
        const rollbackPatch: LocalGamePatch = {};
        const rollbackValues = rollbackPatch as Record<string, unknown>;
        const previousGame = previousState.game as unknown as Record<
          string,
          unknown
        >;

        for (const key of Object.keys(patch)) {
          rollbackValues[key] = previousGame[key];
        }
        applyLocalGamePatch(rollbackPatch);
      }

      if (gameStateRef.current?.game.id === previousState.game.id) {
        setError(message);
        setToast(options?.failureToast ?? "Change not saved. Room state restored.");
      }
      return false;
    }
  }

  async function handleJoin(request: JoinRequest) {
    const cleanGameCode = normalizeGameCodeInput(request.gameCode);

    if (!isValidGameCode(cleanGameCode)) {
      setError(GAME_CODE_ERROR);
      setToast("Check game code");
      return;
    }

    setIsLoading(true);
    try {
      const loadedState = await loadGameState(cleanGameCode);

      if (loadedState.membership?.role === "host") {
        throw new Error(
          "This browser is already the host for this room. Use another browser or private window to join as a player.",
        );
      }

      const group = loadedState.game.playMode === "teams"
        ? loadedState.groups.find((item) => item.id === request.groupId) ??
          loadedState.groups[0]
        : null;

      if (loadedState.game.playMode === "teams" && !group) {
        throw new Error("This game does not have any groups yet.");
      }

      const joinedMembership = await joinGame({
        gameId: loadedState.game.id,
        groupId: group?.id,
        displayName: request.name,
      });

      const nextStoredPlayer: StoredPlayer = {
        name: request.name.trim(),
        groupId: joinedMembership.groupId ?? joinedMembership.id,
        gameId: loadedState.game.id,
        membershipId: joinedMembership.id,
      };
      storePlayer(nextStoredPlayer);
      setStoredPlayer(nextStoredPlayer);
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
    const cleanGameCode = normalizeGameCodeInput(nextGameCode);

    if (!isValidGameCode(cleanGameCode)) {
      setError(GAME_CODE_ERROR);
      setToast("Check game code");
      return;
    }

    const loadedState = await refreshGameState(cleanGameCode);

    if (loadedState) {
      setToast(`Loaded ${loadedState.game.code}`);
    } else {
      setToast("Game not found");
    }
  }

  async function handleClaimHost(request: HostClaimRequest) {
    const cleanGameCode = normalizeGameCodeInput(request.gameCode);

    if (!isValidGameCode(cleanGameCode)) {
      setError(GAME_CODE_ERROR);
      setToast("Check game code");
      return;
    }

    setIsLoading(true);
    try {
      await claimHost({ ...request, gameCode: cleanGameCode });
      const nextState = await refreshGameState(cleanGameCode, { silent: true });
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

  async function clearPendingProof(proofId: string) {
    setPendingProofs((currentProofs) =>
      currentProofs.filter((proof) => proof.id !== proofId),
    );

    try {
      await deletePendingProofUpload(proofId);
    } catch (caughtError) {
      console.warn("Could not clear saved proof photo.", caughtError);
    }
  }

  async function handleLeaveGame() {
    if (!gameState || membership?.role !== "player") return;
    if (
      !window.confirm(
        "Leave this room and delete your submissions, proof photos, saved nickname, and queued photos from this device?",
      )
    ) {
      return;
    }

    setIsLoading(true);
    const leavingGameId = gameState.game.id;
    const leavingMembership = membership;
    let result: Awaited<ReturnType<typeof leaveGame>>;

    try {
      result = await leaveGame(leavingGameId);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Could not leave the room");
      setIsLoading(false);
      return;
    }

    setPendingProofs((current) =>
      current.filter(
        (proof) =>
          proof.gameId !== leavingGameId ||
          proof.membershipId !== leavingMembership.id,
      ),
    );

    let queuedPhotoCleanupFailed = false;
    try {
      await deletePendingProofUploadsForMembership(
        leavingGameId,
        leavingMembership.id,
      );
    } catch (caughtError) {
      queuedPhotoCleanupFailed = true;
      console.warn(
        "Left room, but saved proof photos could not be cleared.",
        caughtError,
      );
    }

    clearStoredPlayer();
    setStoredPlayer(null);
    clearStoredGameCode();
    setGameCode("");
    gameStateRef.current = null;
    setGameState(null);
    setSelectedTaskId("");
    setError("");
    try {
      window.history.pushState({}, "", "/");
    } catch (caughtError) {
      console.warn("Left room, but the page address could not be reset.", caughtError);
    }
    setPath("/");
    setToast(
      queuedPhotoCleanupFailed
        ? "Left room. Saved queued photos could not be removed from this device."
        : result.deletedSubmissions > 0
          ? `Left room and deleted ${result.deletedSubmissions} submissions`
          : "Left room and cleared this device",
    );
    setIsLoading(false);
  }

  async function updateFailedPendingProof(
    proof: PendingProofUpload,
    message: string,
  ) {
    const failedProof: PendingProofUpload = {
      ...proof,
      updatedAt: Date.now(),
      retryCount: proof.retryCount + 1,
      lastError: message,
    };
    let wasStored = false;

    try {
      await savePendingProofUpload(failedProof);
      wasStored = true;
    } catch (caughtError) {
      console.warn("Could not update saved proof photo.", caughtError);
    }

    setPendingProofs((currentProofs) =>
      upsertPendingProof(currentProofs, failedProof),
    );

    return wasStored;
  }

  async function handleSubmitProof(taskId: string, file: File) {
    if (!gameState || membership?.role !== "player" || !membership.groupId) {
      setToast("Join a group first");
      return;
    }

    if (gameState.game.boardHidden) {
      setToast("Board is hidden until the host starts the hunt");
      return;
    }

    const boardTask = currentGroupTasks.find((task) => task.id === taskId) ?? null;

    if (!boardTask) {
      setToast("Task is no longer on your board");
      return;
    }

    if (boardTask.free) {
      setToast("Free squares do not need photos");
      return;
    }

    if (!isAllowedProofImageFile(file)) {
      setToast("Choose a JPG, PNG, WebP, HEIC, or HEIF image");
      return;
    }

    if (file.size <= 0) {
      setToast("Choose a non-empty image");
      return;
    }

    const pendingProof = createPendingProofUpload({
      file,
      gameCode: gameState.game.code,
      gameId: gameState.game.id,
      membershipId: membership.id,
      groupId: membership.groupId,
      taskId,
    });
    let hasStoredPendingProof = false;

    setSelectedTaskId(taskId);
    setIsTaskCardDismissed(false);
    setPendingProofs((currentProofs) =>
      upsertPendingProof(currentProofs, pendingProof),
    );
    try {
      await savePendingProofUpload(pendingProof);
      hasStoredPendingProof = true;
    } catch (caughtError) {
      console.warn("Could not save proof photo for retry.", caughtError);
    }

    setUploadingTaskId(taskId);
    try {
      if (file.size > MAX_PROOF_FILE_BYTES) {
        setToast("Compressing photo...");
      }

      const proofFile = await prepareProofImageFile(file);

      await saveTaskProof({
        gameId: gameState.game.id,
        groupId: membership.groupId,
        taskId,
        file: proofFile,
      });

      await clearPendingProof(pendingProof.id);

      try {
        await refreshGameState(gameState.game.code, { silent: true });
      } catch (caughtError) {
        setError(getErrorMessage(caughtError));
        setToast("Photo sent. Refresh if it does not show.");
        return;
      }

      setToast(proofFile === file ? "Photo sent" : "Photo compressed and sent");
    } catch (caughtError) {
      const message = getErrorMessage(caughtError);
      const isPreparationError = isProofPreparationError(message);
      setError(message);

      const wasStoredAfterFailure = await updateFailedPendingProof(pendingProof, message);

      if (isPreparationError) {
        setToast("Photo is too large");
      } else if (hasStoredPendingProof || wasStoredAfterFailure) {
        setToast("Upload failed. Photo saved for retry");
      } else {
        setToast("Upload failed. Retry before closing this tab");
      }
    } finally {
      setUploadingTaskId("");
    }
  }

  async function handleRetryPendingProof(proofId: string) {
    const pendingProof = pendingProofs.find((proof) => proof.id === proofId);

    if (!pendingProof) {
      setToast("Saved photo was not found");
      return;
    }
    if (
      !gameState ||
      membership?.role !== "player" ||
      pendingProof.gameId !== gameState.game.id ||
      pendingProof.membershipId !== membership.id
    ) {
      await clearPendingProof(pendingProof.id);
      setToast("Saved photo belonged to a different player and was cleared");
      return;
    }

    setRetryingProofId(proofId);
    setUploadingTaskId(pendingProof.taskId);

    try {
      if (!isAllowedProofImageFile(pendingProof.file)) {
        setToast("Choose a JPG, PNG, WebP, HEIC, or HEIF image");
        return;
      }

      if (pendingProof.file.size <= 0) {
        setToast("Choose a non-empty image");
        return;
      }

      if (pendingProof.file.size > MAX_PROOF_FILE_BYTES) {
        setToast("Compressing saved photo...");
      }

      const proofFile = await prepareProofImageFile(pendingProof.file);

      await saveTaskProof({
        gameId: pendingProof.gameId,
        groupId: pendingProof.groupId,
        taskId: pendingProof.taskId,
        file: proofFile,
      });
      await clearPendingProof(pendingProof.id);

      if (gameState?.game.code === pendingProof.gameCode) {
        try {
          await refreshGameState(pendingProof.gameCode, { silent: true });
        } catch (caughtError) {
          setError(getErrorMessage(caughtError));
          setToast("Photo sent. Refresh if it does not show.");
          return;
        }
      }

      setToast(proofFile === pendingProof.file ? "Photo sent" : "Photo compressed and sent");
    } catch (caughtError) {
      const message = getErrorMessage(caughtError);
      setError(message);
      await updateFailedPendingProof(pendingProof, message);
      setToast(
        isProofPreparationError(message)
          ? "Saved photo is too large"
          : "Retry failed. Photo still saved",
      );
    } finally {
      setRetryingProofId("");
      setUploadingTaskId((currentTaskId) =>
        currentTaskId === pendingProof.taskId ? "" : currentTaskId,
      );
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
      setToast(
        status === "approved"
          ? "Marked approved"
          : status === "pending"
            ? "Marked submitted"
            : "Retake requested",
      );
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Review update failed");
    }
  }

  async function handleMovePlayerMembership(membershipId: string, groupId: string) {
    if (!gameState || membership?.role !== "host") return;

    setMovingMembershipId(membershipId);
    try {
      const movedMembership = await movePlayerMembership({ membershipId, groupId });
      setGameState((currentState) =>
        currentState ? replaceMembership(currentState, movedMembership) : currentState,
      );
      await refreshGameState(gameState.game.code, { silent: true });
      setToast("Player moved");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Move failed");
    } finally {
      setMovingMembershipId("");
    }
  }

  async function handleKickPlayerMembership(membershipId: string) {
    if (!gameState || membership?.role !== "host") return;

    setKickingMembershipId(membershipId);
    try {
      const result = await kickPlayerMembership(membershipId);
      setGameState((currentState) =>
        currentState
          ? removeMembership(currentState, result.membership.id)
          : currentState,
      );
      await refreshGameState(gameState.game.code, { silent: true });
      setToast(
        result.deletedSubmissions > 0
          ? `Player and ${result.deletedSubmissions} submissions deleted`
          : "Player data deleted",
      );
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Kick failed");
    } finally {
      setKickingMembershipId("");
    }
  }

  async function handleHostMembershipAction(
    action: "promote" | "remove" | "transfer",
    membershipId: string,
  ) {
    if (!gameState || membership?.role !== "host") return;
    try {
      if (action === "promote") await promotePlayerMembership(membershipId);
      if (action === "remove") await removeCohostMembership(membershipId);
      if (action === "transfer") await transferHostOwnership(membershipId);
      await refreshGameState(gameState.game.code, { silent: true });
      setToast(
        action === "promote"
          ? "Co-host added"
          : action === "transfer"
            ? "Host ownership transferred"
            : "Co-host removed",
      );
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Host change failed");
    }
  }

  async function handleAddGroup(groupName: string) {
    if (!gameState || membership?.role !== "host") return false;

    setIsAddingGroup(true);
    try {
      const group = await createGroup({
        gameId: gameState.game.id,
        name: groupName,
      });
      setGameState((currentState) =>
        currentState ? upsertGroup(currentState, group) : currentState,
      );
      setSelectedHostGroupId(group.id);
      await refreshGameState(gameState.game.code, { silent: true });
      setToast(`${group.shortName} added`);
      return true;
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Add team failed");
      return false;
    } finally {
      setIsAddingGroup(false);
    }
  }

  async function handleConfigureGame(
    template?: GameKitId,
    config?: Parameters<typeof configureGame>[0]["config"],
    startTime?: string,
  ) {
    if (!gameState || membership?.role !== "host") return false;

    setIsLoading(true);
    try {
      await configureGame({ gameId: gameState.game.id, template, config, startTime });
      await refreshGameState(gameState.game.code, { silent: true });
      setSelectedHostGroupId("");
      setToast(template ? "Game style applied" : "Game settings saved");
      return true;
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Settings could not be saved");
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUpdateGroup(
    groupId: string,
    patch: Parameters<typeof updateGroupDetails>[2],
  ) {
    if (!gameState || membership?.role !== "host") return;
    try {
      await updateGroupDetails(gameState.game.id, groupId, patch);
      await refreshGameState(gameState.game.code, { silent: true });
      setToast("Team updated");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Team update failed");
    }
  }

  async function handleRemoveGroup(groupId: string) {
    if (!gameState || membership?.role !== "host") return;
    try {
      await deleteGroup(gameState.game.id, groupId);
      await refreshGameState(gameState.game.code, { silent: true });
      setToast("Team removed");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Team could not be removed");
    }
  }

  async function handleCompleteTask(taskId: string) {
    if (!gameState || membership?.role !== "player") return;
    try {
      await completeTask({ gameId: gameState.game.id, taskId });
      await refreshGameState(gameState.game.code, { silent: true });
      setToast("Board updated");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Task could not be updated");
    }
  }

  async function handleStartGame() {
    if (!gameState) return;
    const timerStartedAt = new Date().toISOString();
    await syncGameTimer(
      {
        setupComplete: true,
        boardHidden: false,
        phase: gameState.game.timerMode === "schedule" ? "play" : "live",
        activeStopId: null,
        timerRunning: gameState.game.timerMode !== "none",
        timerStartedAt,
        timerSecondsTotal:
          gameState.game.timerMode === "duration"
            ? gameState.game.timerDurationMinutes * 60
            : gameState.game.timerSecondsTotal,
      },
      { successToast: "Game started", failureToast: "Game start was not saved" },
    );
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
      const resetResult = await resetGameProofs(gameState.game.id, {
        activeStopId: null,
        phase: "play",
        timerRunning: false,
        timerStartedAt: new Date().toISOString(),
        timerSecondsTotal: 0,
        boardHidden: true,
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

  function handleAbandonGame() {
    if (!gameState || membership?.role !== "host") return;

    setError("");
    setIsAbandonDialogOpen(true);
  }

  async function handleConfirmAbandonGame() {
    if (!gameState || membership?.role !== "host") return;

    const abandoningState = gameState;
    gameStateRef.current = null;
    setIsAbandoningGame(true);
    setIsLoading(true);
    try {
      const abandonResult = await abandonGameLobby(gameState.game.id);
      clearStoredGameCode();
      clearStoredPlayer();
      setStoredPlayer(null);
      setIsAbandonDialogOpen(false);
      setGameCode("");
      setGameState(null);
      setSelectedTaskId("");
      setSelectedHostGroupId("");
      setExpandedStopId("");
      setError("");
      window.history.replaceState({}, "", "/host");
      setPath("/host");
      setToast(
        `Abandoned lobby and removed ${abandonResult.removedMemberships} members`,
      );
    } catch (caughtError) {
      gameStateRef.current = abandoningState;
      const message = getErrorMessage(caughtError);
      setError(message);
      setToast(`Abandon failed: ${message}`);
    } finally {
      setIsAbandoningGame(false);
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

  async function handleAddTask({
    title: requestedTitle,
    description = "Add the scavenger task details.",
    icon = "Camera",
  }: {
    title?: string;
    description?: string;
    icon?: string;
  } = {}) {
    if (!gameState) return;

    const title = requestedTitle?.trim() || `Task ${tasks.filter((task) => !task.free).length + 1}`;
    const sortOrder =
      tasks.reduce((highest, task) => Math.max(highest, task.sortOrder), 0) + 1;

    try {
      await createTask({
        gameId: gameState.game.id,
        slug: createTaskSlug(title, tasks.map((task) => task.id)),
        title,
        description: description.trim(),
        icon,
        isFree: false,
        sortOrder,
      });
      await refreshGameState(gameState.game.code, { silent: true });
      setToast("Custom task added");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Add task failed");
    }
  }

  async function handleAddCatalogTask(catalogTaskId: string) {
    if (!gameState) return;

    try {
      await createCatalogTask(gameState.game.id, catalogTaskId);
      await refreshGameState(gameState.game.code, { silent: true });
      setToast("Task added to boards");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Add task failed");
    }
  }

  async function handleResetCatalogTask(taskId: string) {
    if (!gameState) return;

    try {
      await resetCatalogTask(gameState.game.id, taskId);
      await refreshGameState(gameState.game.code, { silent: true });
      setToast("Original task restored");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Reset task failed");
    }
  }

  async function handleUpdateBoardSetup({
    boardSize,
    boardMode,
    freeSpace,
  }: Pick<Game, "boardSize" | "boardMode" | "freeSpace">) {
    if (!gameState) return;

    try {
      await updateBoardSetup({
        gameId: gameState.game.id,
        boardSize,
        boardMode,
        freeSpace,
      });
      await refreshGameState(gameState.game.code, { silent: true });
      setToast("Board setup updated");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Board setup failed");
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

    const hasProof = gameState.submissions.some(
      (submission) => submission.taskId === taskId,
    );

    if (hasProof) {
      setToast("A proof still uses that task");
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

    const cleanedTaskIds = taskIds.slice(0, getBoardSlotCount(gameState.game.boardSize));
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
      await shuffleBoards(gameState.game.id);
      await refreshGameState(gameState.game.code, { silent: true });
      setToast("Boards shuffled");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setToast("Board generation failed");
    }
  }

  async function handleAddFiveMinutes() {
    if (!gameState) return;

    if (gameState.game.timerMode === "duration") {
      await syncGameTimer(
        { timerSecondsTotal: gameState.game.timerSecondsTotal + 300 },
        { successToast: "Added 5 minutes", failureToast: "Extra time was not saved" },
      );
      return;
    }

    const targetStop =
      gameState.game.phase === "play"
        ? activeStopIndex < 0
          ? stops[0] ?? null
          : stops[activeStopIndex + 1] ?? null
        : activeStop;

    if (!targetStop) {
      return;
    }

    const stopPatch: LocalStopPatch =
      gameState.game.phase === "play"
        ? { arriveTime: addMinutesToClockTime(targetStop.arriveTime, 5) }
        : { leaveTime: addMinutesToClockTime(targetStop.leaveTime, 5) };
    const previousState = gameState;

    applyLocalStopPatch(targetStop.id, stopPatch);
    setError("");

    try {
      await updateStopDetails(targetStop.id, stopPatch);
      await refreshGameState(gameState.game.code, { silent: true });
      setToast(
        gameState.game.phase === "play"
          ? "Arrival pushed 5 minutes"
          : "Added 5 minutes",
      );
    } catch (caughtError) {
      const message = getErrorMessage(caughtError);
      console.warn(
        `Stop time sync failed; restoring the saved room state: ${message}`,
        caughtError,
      );
      const refreshedState = await refreshGameState(
        previousState.game.code,
        { silent: true },
      );
      const currentState = gameStateRef.current;

      if (
        !refreshedState &&
        currentState?.game.id === previousState.game.id &&
        (currentState.revision ?? 0) <= (previousState.revision ?? 0)
      ) {
        const rollbackPatch: LocalStopPatch = {};
        const rollbackValues = rollbackPatch as Record<string, unknown>;
        const previousStop = targetStop as unknown as Record<string, unknown>;

        for (const key of Object.keys(stopPatch)) {
          rollbackValues[key] = previousStop[key];
        }
        applyLocalStopPatch(targetStop.id, rollbackPatch);
      }

      if (gameStateRef.current?.game.id === previousState.game.id) {
        setError(message);
        setToast("Time change was not saved");
      }
    }
  }

  async function handleToggleDurationTimer() {
    if (!gameState || gameState.game.timerMode !== "duration") return;
    await syncGameTimer(
      gameState.game.timerRunning
        ? { timerRunning: false, timerSecondsTotal: timerSeconds }
        : { timerRunning: true, timerStartedAt: new Date().toISOString() },
      {
        successToast: gameState.game.timerRunning ? "Timer paused" : "Timer resumed",
        failureToast: "Timer change was not saved",
      },
    );
  }

  async function handlePlayTime(afterStopIndex: number) {
    if (!gameState) return;

    const afterStop = stops[afterStopIndex];
    const nextStop = stops[afterStopIndex + 1];

    if (!nextStop) {
      return;
    }

    await syncGameTimer(
      {
        activeStopId: afterStop?.id ?? null,
        phase: "play",
        timerRunning: true,
        timerStartedAt: new Date().toISOString(),
      },
      { failureToast: "Play phase was not saved" },
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
        ...(gameState.game.boardHidden ? { boardHidden: false } : {}),
      },
      { failureToast: "Stop phase was not saved" },
    );
    setExpandedStopId(stop.id);
  }

  async function handleSetBoardHidden(boardHidden: boolean) {
    await syncGameTimer(
      { boardHidden },
      {
        successToast: boardHidden ? "Board hidden" : "Board visible",
        failureToast: boardHidden
          ? "Board hide was not saved"
          : "Board reveal was not saved",
      },
    );
  }

  async function handleNextStop() {
    await handleStartStop(Math.min(activeStopIndex + 1, stops.length - 1));
  }

  async function handleSetPhase(phase: HuntPhase) {
    if (!gameState) return;

    await syncGameTimer(
      {
        phase,
        timerRunning: phase !== "review",
        timerStartedAt: phase !== "review" ? new Date().toISOString() : undefined,
      },
      {
        failureToast:
          phase === "review"
            ? "Review mode was not saved"
            : "Schedule phase was not saved",
      },
    );
  }

  async function handleUseRoomTemplate(templateId: GameKit["id"]) {
    if (!gameState || membership?.role !== "host") {
      return;
    }

    const confirmed = window.confirm(
      "Replace this room’s current rules, teams, tasks, and boards with this template? This cannot be undone.",
    );
    if (!confirmed) {
      return;
    }

    const applied = await handleConfigureGame(templateId);
    if (applied) {
      navigateTo(getPathWithGameCode("/host", gameState.game.code));
    }
  }

  if (path === "/privacy" || path === "/terms" || path === "/support") {
    const kind = path.slice(1) as InformationPageKind;
    return <InformationPage kind={kind} />;
  }

  if (templateRoute?.scope === "public") {
    return (
      <TemplateLibraryPage
        route={templateRoute}
      />
    );
  }

  if (isLoading && !gameState) {
    return (
      <LoadingView
        gameCode={gameCode}
        onEnterCode={() => {
          setIsLoading(false);
          setError("");
        }}
        onRetry={() => void refreshGameState(gameCode)}
      />
    );
  }

  if (!gameState) {
    if (isHostRoute) {
      return (
        <HostSetupView
          defaultDisplayName={storedPlayer?.name ?? ""}
          defaultGameCode={gameCode}
          error={error}
          isBusy={isLoading}
          selectedTemplate={selectedCreationTemplate}
          statusMessage={toast}
          onClaim={handleClaimHost}
        />
      );
    }

    return (
      <GameCodeGate
        defaultGameCode={gameCode}
        error={error}
        isBusy={isLoading}
        statusMessage={toast}
        onLoad={handleLoadGameCode}
      />
    );
  }

  const routeDisplay = gameState.game.timerMode === "schedule"
    ? getRouteDisplay(stops, activeStopIndex, gameState.game.phase)
    : {
        label: gameState.game.phase === "review" ? "Game finished" : "Current game",
        title: gameState.game.name,
        detail:
          gameState.game.timerMode === "duration"
            ? `${gameState.game.timerDurationMinutes}-minute ${gameState.game.winCondition} game.`
            : "Untimed game. The host decides when play ends.",
        timeLabel:
          gameState.game.timerMode === "duration"
            ? `${gameState.game.timerDurationMinutes} minute countdown`
            : "No timer",
        timerSmall:
          gameState.game.timerMode === "duration" ? "remaining" : "no timer",
      };
  const timerDisplay = getTimerDisplay(
    gameState.game,
    stops,
    activeStopIndex,
    timerSeconds,
    routeDisplay.timerSmall,
  );

  if (
    templateRoute?.scope === "host" &&
    membership?.role === "host"
  ) {
    return (
      <TemplateLibraryPage
        context={{
          canApply: !gameState.game.setupComplete && gameState.game.phase === "review",
          gameCode: gameState.game.code,
          onApply: handleUseRoomTemplate,
        }}
        route={templateRoute}
      />
    );
  }

  const cssVars = {
    "--primary": isHostRoute ? "oklch(0.5 0.18 34)" : currentGroup?.color,
    "--primary-dark": isHostRoute
      ? "oklch(0.37 0.135 31)"
      : currentGroup?.dark,
    "--primary-soft": isHostRoute
      ? "oklch(0.94 0.05 48)"
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
        roomCode={gameState.game.code}
        showStopDetails={showStopDetails}
        timerDisplay={timerDisplay}
        onTimerClick={() => setShowStopDetails((shown) => !shown)}
      />

      <main id="main-content" className="main-content" tabIndex={-1}>
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
              addGroup={handleAddGroup}
              addCatalogTask={handleAddCatalogTask}
              addStop={handleAddStop}
              addTask={handleAddTask}
              abandonGame={handleAbandonGame}
              boardAssignments={boardAssignments}
              configure={handleConfigureGame}
              expandedStopId={expandedStopId}
              generateBoards={handleGenerateBoards}
              game={gameState.game}
              expiresAt={gameState.expiresAt}
              goToPlayTime={handlePlayTime}
              goToNextStop={handleNextStop}
              groups={groups}
              scoreGroups={scoreGroups}
              hostMembership={membership}
              isAddingGroup={isAddingGroup}
              kickingMembershipId={kickingMembershipId}
              kickPlayer={handleKickPlayerMembership}
              memberships={memberships}
              movingMembershipId={movingMembershipId}
              movePlayer={handleMovePlayerMembership}
              promotePlayer={(id) => handleHostMembershipAction("promote", id)}
              removeCohost={(id) => handleHostMembershipAction("remove", id)}
              transferHost={(id) => handleHostMembershipAction("transfer", id)}
              removeGroup={handleRemoveGroup}
              removeTask={handleRemoveTask}
              resetCatalogTask={handleResetCatalogTask}
              removeStop={handleRemoveStop}
              saveGroupBoard={handleSaveGroupBoard}
              selectedHostGroupId={selectedHostGroupId}
              setExpandedStopId={setExpandedStopId}
              setHuntPhase={handleSetPhase}
              resetGameProofs={handleResetGameProofs}
              setSelectedHostGroupId={setSelectedHostGroupId}
              setSubmissionStatus={handleSubmissionStatus}
              setBoardHidden={handleSetBoardHidden}
              startGame={handleStartGame}
              stops={stops}
              submissions={submissions}
              tasks={tasks}
              timerDisplay={timerDisplay}
              toggleDurationTimer={handleToggleDurationTimer}
              routeDisplay={routeDisplay}
              updateStop={handleUpdateStop}
              updateGroup={handleUpdateGroup}
              updateBoardSetup={handleUpdateBoardSetup}
              updateRoom={(patch) => void syncGameTimer(patch, { successToast: "Room updated" })}
              updateTask={handleUpdateTask}
            />
          ) : (
            <HostGate
              defaultDisplayName={storedPlayer?.name ?? ""}
              defaultGameCode={gameCode}
              isExistingRoom
              isBusy={isLoading}
              onClaim={handleClaimHost}
            />
          )
        ) : membership?.role === "host" ? (
          <HostSessionNotice
            roomCode={gameState.game.code}
            onOpenHost={goToHostView}
          />
        ) : membership?.role === "player" && currentGroup ? (
          <GroupView
            boardView={boardView}
            group={currentGroup}
            groups={groups}
            isBoardHidden={gameState.game.boardHidden}
            game={gameState.game}
            isTaskCardDismissed={isTaskCardDismissed}
            onDismissTaskCard={() => setIsTaskCardDismissed(true)}
            onDiscardPendingProof={(proofId) => void clearPendingProof(proofId)}
            onBoardViewChange={setBoardView}
            onLeave={() => void handleLeaveGame()}
            onRetryPendingProof={handleRetryPendingProof}
            onSubmitProof={handleSubmitProof}
            onCompleteTask={handleCompleteTask}
            onTaskSelect={handleTaskSelect}
            pendingProofs={currentPendingProofs}
            roster={roster}
            retryingProofId={retryingProofId}
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
            game={gameState.game}
            isBusy={isLoading}
            onJoin={handleJoin}
          />
        )}
      </main>
      <SiteFooter />

      {isAbandonDialogOpen && membership?.role === "host" && gameState && (
        <AbandonGameDialog
          gameCode={gameState.game.code}
          isBusy={isAbandoningGame}
          onCancel={() => setIsAbandonDialogOpen(false)}
          onConfirm={() => void handleConfirmAbandonGame()}
        />
      )}

      <div className="toast-region" role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

function useModalAccessibility({
  closeDisabled = false,
  containerRef,
  initialFocusRef,
  onClose,
}: {
  closeDisabled?: boolean;
  containerRef: React.RefObject<HTMLElement>;
  initialFocusRef: React.RefObject<HTMLElement>;
  onClose: () => void;
}) {
  const closeDisabledRef = useRef(closeDisabled);
  const onCloseRef = useRef(onClose);
  closeDisabledRef.current = closeDisabled;
  onCloseRef.current = onClose;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const modalContainer: HTMLElement = container;

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblingStates = Array.from(modalContainer.parentElement?.children ?? [])
      .filter((element) => element !== modalContainer)
      .map((element) => ({
        element,
        wasInert: element.hasAttribute("inert"),
      }));
    siblingStates.forEach(({ element }) => element.setAttribute("inert", ""));

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      initialFocusRef.current?.focus();
    });

    function getFocusableElements() {
      return Array.from(
        modalContainer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          !element.hasAttribute("hidden") &&
          element.getAttribute("aria-hidden") !== "true",
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !closeDisabledRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements();
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (!first || !last) {
        event.preventDefault();
        return;
      }

      const activeElement = document.activeElement;
      if (
        event.shiftKey &&
        (activeElement === first || !modalContainer.contains(activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (activeElement === last || !modalContainer.contains(activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      siblingStates.forEach(({ element, wasInert }) => {
        if (!wasInert) element.removeAttribute("inert");
      });
      previousFocus?.focus();
    };
  }, [containerRef, initialFocusRef]);
}

function HostSessionNotice({
  roomCode,
  onOpenHost,
}: {
  roomCode: string;
  onOpenHost: () => void;
}) {
  return (
    <section className="welcome-card" aria-labelledby="host-session-title">
      <div>
        <p className="label">Host session</p>
        <h2 id="host-session-title">This browser is hosting {roomCode}.</h2>
        <p>
          Open the host view here, or use another browser/private window to join
          this room as a player.
        </p>
      </div>

      <button className="join-submit" type="button" onClick={onOpenHost}>
        Open host view
      </button>
    </section>
  );
}

function AbandonGameDialog({
  gameCode,
  isBusy,
  onCancel,
  onConfirm,
}: {
  gameCode: string;
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const canAbandon = confirmation === "ABANDON" && !isBusy;

  useModalAccessibility({
    closeDisabled: isBusy,
    containerRef: dialogRef,
    initialFocusRef: inputRef,
    onClose: onCancel,
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (canAbandon) {
      onConfirm();
    }
  }

  return (
    <div
      ref={dialogRef}
      aria-describedby="abandon-game-description"
      aria-labelledby="abandon-game-title"
      aria-modal="true"
      className="confirmation-dialog"
      role="dialog"
    >
      <div
        aria-hidden="true"
        className="confirmation-dialog-backdrop"
        onClick={isBusy ? undefined : onCancel}
      />
      <div className="confirmation-dialog-panel is-danger">
        <div className="confirmation-dialog-header">
          <div className="confirmation-dialog-icon">
            <Trash2 aria-hidden="true" />
          </div>
          <div>
            <p className="label">Destructive action</p>
            <h2 id="abandon-game-title">Abandon {gameCode}</h2>
            <p id="abandon-game-description">
              This removes every player and host, deletes submitted proofs,
              closes this game code, and returns you to host setup.
            </p>
          </div>
        </div>

        <form className="confirmation-dialog-form" onSubmit={handleSubmit}>
          <label className="confirmation-field">
            <span>Type ABANDON to confirm</span>
            <input
              ref={inputRef}
              autoCapitalize="characters"
              autoComplete="off"
              disabled={isBusy}
              spellCheck={false}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>

          <div className="confirmation-dialog-actions">
            <button
              className="secondary-action"
              disabled={isBusy}
              type="button"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="control-button danger is-critical"
              disabled={!canAbandon}
              type="submit"
            >
              <X aria-hidden="true" />
              {isBusy ? "Abandoning..." : "Abandon Game"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LoadingView({
  gameCode,
  onEnterCode,
  onRetry,
}: {
  gameCode: string;
  onEnterCode: () => void;
  onRetry: () => void;
}) {
  const [isSlowLoad, setIsSlowLoad] = useState(false);
  const roomCode = normalizeGameCodeInput(gameCode);

  useEffect(() => {
    setIsSlowLoad(false);

    const timeoutId = window.setTimeout(() => setIsSlowLoad(true), 6000);
    return () => window.clearTimeout(timeoutId);
  }, [roomCode]);

  return (
    <main className="main-content">
      <section className="welcome-card" aria-label="Loading game">
        <div>
          <p className="label">Rally Hunt</p>
          <h1>{roomCode ? `Loading ${roomCode}...` : "Loading game..."}</h1>
          <p>
            {isSlowLoad
              ? "Still trying. If service is spotty, retry or enter the room code again."
              : "Connecting to the room."}
          </p>
        </div>

        {isSlowLoad && (
          <div className="loading-actions">
            <button className="join-submit" type="button" onClick={onRetry}>
              Retry
            </button>
            <button className="secondary-action" type="button" onClick={onEnterCode}>
              Enter code
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

function HostSetupView({
  defaultDisplayName,
  defaultGameCode,
  error,
  isBusy,
  selectedTemplate,
  statusMessage,
  onClaim,
}: {
  defaultDisplayName: string;
  defaultGameCode: string;
  error: string;
  isBusy: boolean;
  selectedTemplate?: GameKit;
  statusMessage: string;
  onClaim: (request: HostClaimRequest) => void;
}) {
  return (
    <main className="entry-page host-entry-page">
      <a className="entry-brand" href="/" aria-label="Rally Hunt home">
        <span className="entry-brand-mark" aria-hidden="true">
          <RallyMark />
        </span>
        <span>Rally Hunt</span>
      </a>
      {statusMessage && (
        <div className="toast-region" role="status" aria-live="polite">
          {statusMessage}
        </div>
      )}
      <HostGate
        defaultDisplayName={defaultDisplayName}
        defaultGameCode={defaultGameCode}
        error={error}
        isBusy={isBusy}
        selectedTemplate={selectedTemplate}
        onClaim={onClaim}
      />
      <a className="entry-back-link" href="/">
        Joining someone else? Enter a room code
      </a>
      <SiteFooter />
    </main>
  );
}

function GameCodeGate({
  defaultGameCode,
  error,
  isBusy,
  statusMessage,
  onLoad,
}: {
  defaultGameCode: string;
  error: string;
  isBusy: boolean;
  statusMessage: string;
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
    <main className="landing-page">
      <a className="landing-brand" href="/" aria-label="Rally Hunt home">
        <span className="landing-brand-mark" aria-hidden="true">
          <RallyMark />
        </span>
        <span>Rally Hunt</span>
      </a>

      <section className="landing-hero" aria-labelledby="game-code-title">
        <div className="landing-copy">
          <h1 id="game-code-title">Join a scavenger hunt</h1>
          <p>Enter the room code from your host to find your team and board.</p>
        </div>

        <form className="landing-join-form" onSubmit={handleSubmit}>
          <label htmlFor="landing-room-code">Room code</label>
          <input
            id="landing-room-code"
            autoCapitalize="characters"
            autoComplete="off"
            autoFocus
            maxLength={24}
            value={gameCode}
            onChange={(event) => setGameCode(event.target.value.toUpperCase())}
            placeholder="ENTER CODE"
          />
          <button disabled={!gameCode.trim() || isBusy} type="submit">
            {isBusy ? "Finding room..." : "Join room"}
          </button>
          {error && (
            <p className="landing-form-message is-error" role="alert">
              {error}
            </p>
          )}
          {statusMessage && !error && (
            <p className="landing-form-message" role="status" aria-live="polite">
              {statusMessage}
            </p>
          )}
        </form>
      </section>

      <section className="landing-host" aria-labelledby="host-callout-title">
        <div>
          <h2 id="host-callout-title">Want to run the hunt?</h2>
          <p>
            Anyone can host. Choose a ready-made game or build your own, then share
            the room code with friends, family, a class, or any other group.
          </p>
          <p>
            After the hunt, hosts can make a presentation for a team. A host can
            also choose before play begins to let players make a separate copy of
            only their own team’s finished board.
          </p>
        </div>
        <div className="landing-host-actions">
          <a className="landing-template-link" href="/templates">
            <Grid3X3 aria-hidden="true" />
            Choose a ready-made game
          </a>
          <a className="landing-host-link" href="/host">
            <Plus aria-hidden="true" />
            Build from scratch
          </a>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/support">Support</a>
      <span>Temporary rooms automatically expire after seven days.</span>
    </footer>
  );
}

type TemplateLibraryContext = {
  canApply: boolean;
  gameCode: string;
  onApply: (templateId: GameKit["id"]) => void;
};

type TemplateFilterId =
  | "all"
  | "quick"
  | "kids"
  | "celebration"
  | "work"
  | "outdoors"
  | "solo";

const TEMPLATE_FILTERS: ReadonlyArray<{
  id: TemplateFilterId;
  label: string;
  matches: (template: GameKit) => boolean;
}> = [
  { id: "all", label: "All games", matches: () => true },
  {
    id: "quick",
    label: "Quick & easy",
    matches: (template) =>
      template.durationLabel === "30 min" ||
      template.searchTags.some((tag) => tag === "quick" || tag === "easy"),
  },
  {
    id: "kids",
    label: "Kids & family",
    matches: (template) =>
      template.category === "Family" ||
      template.category === "Schools" ||
      template.ageLabel === "Kids and families",
  },
  {
    id: "celebration",
    label: "Celebrations",
    matches: (template) => template.category === "Celebration",
  },
  {
    id: "work",
    label: "Work groups",
    matches: (template) => template.category === "Work",
  },
  {
    id: "outdoors",
    label: "Outdoors",
    matches: (template) => template.category === "Outdoors",
  },
  {
    id: "solo",
    label: "Solo play",
    matches: (template) => template.playMode === "individual",
  },
];

const TEMPLATE_RECOMMENDATIONS: Record<TemplateFilterId, GameKit["id"]> = {
  all: "quick",
  quick: "quick",
  kids: "kids-indoor",
  celebration: "birthday-party",
  work: "new-team-welcome",
  outdoors: "park-playground",
  solo: "solo-photo-walk",
};

function getTemplateBrowsePath(
  path: string,
  query: string,
  activeFilter: TemplateFilterId,
) {
  const url = new URL(path, window.location.origin);
  const cleanQuery = query.trim();

  if (cleanQuery) url.searchParams.set("q", cleanQuery);
  else url.searchParams.delete("q");

  if (activeFilter !== "all") url.searchParams.set("filter", activeFilter);
  else url.searchParams.delete("filter");

  return `${url.pathname}${url.search}`;
}

function getTemplateDetailPath(
  catalogPath: string,
  templateId: GameKit["id"],
  query: string,
  activeFilter: TemplateFilterId,
) {
  const url = new URL(catalogPath, window.location.origin);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/${templateId}`;
  return getTemplateBrowsePath(`${url.pathname}${url.search}`, query, activeFilter);
}

function readTemplateFilterFromUrl(): TemplateFilterId {
  const value = new URLSearchParams(window.location.search).get("filter");
  return TEMPLATE_FILTERS.some((filter) => filter.id === value)
    ? value as TemplateFilterId
    : "all";
}

const TEMPLATE_ICONS: Record<GameKit["id"], LucideIcon> = {
  classroom: School,
  quick: Dices,
  "at-home-adventure": Armchair,
  "free-for-all": Trophy,
  "birthday-party": Ticket,
  "holiday-dinner": UtensilsCrossed,
  "city-explorer": Landmark,
  "neighborhood-stroll": Route,
  "park-playground": Trees,
  "office-team-building": HeartHandshake,
  "new-team-welcome": Users,
  "kids-indoor": Smile,
  "solo-photo-walk": Camera,
};

const HOST_STARTER_TEMPLATES = ["quick", "classroom", "birthday-party"]
  .map((templateId) => getGameKit(templateId))
  .filter((template): template is GameKit => Boolean(template));

function getTemplateProofLabel(template: GameKit) {
  if (template.proofMode === "none") return "No photos";
  if (template.proofMode === "optional") return "Photos optional";
  return template.approvalMode === "host" ? "Host reviews photos" : "Photo proof";
}

function getTemplatePhotoDetail(template: GameKit) {
  if (template.proofMode === "none") return "No uploads";
  if (template.proofMode === "optional") {
    return template.approvalMode === "host"
      ? "Optional · host review"
      : "Optional · automatic";
  }
  return template.approvalMode === "host"
    ? "Required · host review"
    : "Required · automatic";
}

function TemplateStartAction({
  className,
  context,
  template,
}: {
  className: string;
  context?: TemplateLibraryContext;
  template: GameKit;
}) {
  if (context?.canApply) {
    return (
      <button
        aria-label={`Use ${template.name} in this room`}
        className={className}
        type="button"
        onClick={() => context.onApply(template.id)}
      >
        <Play aria-hidden="true" />
        Use in this room
      </button>
    );
  }

  return (
    <a
      aria-label={`Start ${template.name}${context ? " in a new room" : ""}`}
      className={className}
      href={`/host?template=${encodeURIComponent(template.id)}`}
    >
      <Play aria-hidden="true" />
      {context ? "Start in a new room" : "Start this game"}
    </a>
  );
}

function TemplateCatalogCard({
  activeFilter,
  catalogPath,
  context,
  query,
  template,
}: {
  activeFilter: TemplateFilterId;
  catalogPath: string;
  context?: TemplateLibraryContext;
  query: string;
  template: GameKit;
}) {
  const Icon = TEMPLATE_ICONS[template.id];
  const detailPath = getTemplateDetailPath(
    catalogPath,
    template.id,
    query,
    activeFilter,
  );

  return (
    <article
      className="template-catalog-card"
      data-template={template.id}
      aria-labelledby={`template-${template.id}-title`}
    >
      <div className="template-card-visual" aria-hidden="true">
        <span><Icon /></span>
        <small>{template.setting}</small>
      </div>
      <div className="template-card-copy">
        <div className="template-card-topline">
          <span>{template.category}</span>
          {template.featured && <em>Featured</em>}
        </div>
        <h2 id={`template-${template.id}-title`}>{template.name}</h2>
        <p>{template.summary}</p>
        <div className="template-card-facts" aria-label="At a glance">
          <span>{template.playMode === "individual" ? "Solo boards" : template.playerLabel}</span>
          <span>{template.durationLabel}</span>
          <span>{template.boardSize}×{template.boardSize} {template.winCondition}</span>
          <span>{getTemplateProofLabel(template)}</span>
        </div>
        <div className="template-card-actions">
          <TemplateStartAction
            className="template-card-use"
            context={context}
            template={template}
          />
          <a
            aria-label={`See what is inside ${template.name}`}
            className="template-card-preview"
            href={detailPath}
          >
            See what’s inside
          </a>
        </div>
      </div>
    </article>
  );
}

type InformationPageKind = "privacy" | "terms" | "support";

function InformationPage({ kind }: { kind: InformationPageKind }) {
  const pageTitle = {
    privacy: "Privacy",
    terms: "Terms",
    support: "Support",
  }[kind];

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${pageTitle} | Rally Hunt`;
    return () => {
      document.title = previousTitle;
    };
  }, [pageTitle]);

  return (
    <main className="information-page">
      <a className="entry-brand" href="/" aria-label="Rally Hunt home">
        <span className="entry-brand-mark" aria-hidden="true"><RallyMark /></span>
        <span>Rally Hunt</span>
      </a>
      {kind === "privacy" ? (
        <article aria-labelledby="privacy-title">
          <p className="label">Plain-language notice</p>
          <h1 id="privacy-title">Privacy</h1>
          <p>
            Rally Hunt is a temporary scavenger-hunt game for friends,
            families, classrooms, workplaces, and other groups. It has no advertising,
            behavioral analytics, permanent player accounts, or sale of personal
            information.
          </p>
          <p><strong>Last updated:</strong> July 27, 2026</p>
          <h2>What the game uses</h2>
          <ul>
            <li>A first name or nickname, room membership, team, task progress, and submission status.</li>
            <li>An HttpOnly session cookie so the browser can return to the correct room role.</li>
            <li>Optional proof photos only when a host deliberately enables photo uploads.</li>
            <li>One-way browser and network identifiers to limit abusive creation and PIN attempts.</li>
          </ul>
          <h2>Where data goes</h2>
          <p>
            Cloudflare runs the service and stores each temporary room and its proof
            photos. When a host or authorized player deliberately creates Google Slides,
            the presentation is sent directly from that person’s browser to Google Drive.
            The presentation can contain the game and team names, current team members,
            board progress, prompts, proof photos, and the name of each photo’s submitter.
          </p>
          <h2>Google Drive access</h2>
          <p>
            Google is loaded and authorization is requested only after a person selects{" "}
            <strong>Choose Google account and create</strong>. The person chooses an
            account for every export. The game requests the narrow{" "}
            <code>drive.file</code> permission to create and access files made through
            this export. It does not list or read the person’s other Drive files.
          </p>
          <p>
            The short-lived Google access token is kept only in the browser’s memory. It
            is not saved in browser storage or sent to this service’s server. The game
            uses the token only to create the presentation the player requested and does
            not sell, transfer, or use Google user data for advertising or profiling.
          </p>
          <p>
            Use and transfer of information received from Google APIs follows the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              rel="noreferrer"
              target="_blank"
            >
              Google API Services User Data Policy
            </a>
            , including its Limited Use requirements.
          </p>
          <h2>How long it stays</h2>
          <p>
            Room data and proof images automatically expire within seven days. A failed
            photo upload may be saved only in that browser for retry, is separated by
            player membership, and is removed after seven days or when the player
            discards it or leaves.
          </p>
          <p>
            A presentation created in Google Drive is a separate copy. It remains in the
            selected account after the room expires or is deleted, until the account
            owner or their Google Workspace administrator deletes it. A downloaded
            PowerPoint is also a separate copy on that device. Room deletion cannot
            recall either kind of copy.
          </p>
          <h2>Who can make copies</h2>
          <p>
            Presentation exports are host-only by default. Before play begins, a host
            may authorize players to export only their current team or personal board
            after the hunt ends and the board is visible. Players must confirm each
            separate copy. Full rosters, other teams, and the room’s proof ZIP remain
            host-only.
          </p>
          <h2>Choices and deletion</h2>
          <p>
            Players can leave and clear the device. Hosts can delete one player’s room
            data, reset every proof, or abandon the room immediately. Ask the host who
            supplied the room code about a deletion or access request.
          </p>
          {SUPPORT_EMAIL && (
            <p>
              The service contact for privacy, access, and deletion requests is{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
            </p>
          )}
          <h2>Schools and children</h2>
          <p>
            The classroom starter uses no photos. A school or supervising organization
            must decide whether its approval and family notice requirements allow any
            optional photo activity. This page is product information, not legal advice.
          </p>
        </article>
      ) : kind === "terms" ? (
        <article aria-labelledby="terms-title">
          <p className="label">Rules for using the service</p>
          <h1 id="terms-title">Terms</h1>
          <p><strong>Last updated:</strong> July 27, 2026</p>
          <p>
            These terms apply when you use this temporary scavenger-hunt service. If a
            friend, family member, school, employer, or event organizer supplied the
            room, their rules and policies also apply. Children should use the service
            only with the direction of the responsible adult or organization.
          </p>
          <h2>Using the game responsibly</h2>
          <p>
            Hosts are responsible for choosing suitable prompts, supervising the
            activity, obtaining any required participant or family approval, and deciding
            whether photos are appropriate. Do not request or submit unsafe, unlawful, or
            harmful material, or private information such as documents, exact locations,
            or recognizable faces without appropriate permission.
          </p>
          <p>
            Do not interfere with the service, attempt to enter rooms without permission,
            bypass its limits, or use another person’s name, photos, or work deceptively.
          </p>
          <h2>Your submissions</h2>
          <p>
            You keep ownership of content you submit. You give the service only the
            limited permission needed to temporarily receive, store, display, review, and
            export that content as part of the game. You confirm that you have permission
            to submit and export it.
          </p>
          <h2>Temporary rooms and exported copies</h2>
          <p>
            Rooms, progress, and proof photos are temporary and normally expire within
            seven days. The service is not an archive. Presentations are host-only by
            default. A host may authorize players before play begins to make a copy of
            only their own team’s finished board after the hunt. Every Google Slides or
            PowerPoint presentation is a separate copy governed by the destination
            account or device. The person creating it is responsible for sharing,
            retaining, and deleting it; deleting the room does not recall it.
          </p>
          <h2>Availability</h2>
          <p>
            The service may change, experience interruptions, or stop operating. To the
            extent permitted by law, it is provided without guarantees that every room,
            upload, or export will always be available or recoverable. A PowerPoint
            download is offered when Google authorization or upload is unavailable, but
            successful recovery is not guaranteed.
          </p>
          <h2>Questions</h2>
          <p>
            {SUPPORT_EMAIL ? (
              <>
                Contact <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with
                questions about these terms.
              </>
            ) : (
              <>
                Contact the person who supplied the game link. A monitored public
                contact is required before broad self-service release.
              </>
            )}
          </p>
          <p>
            These terms are general product information and should be reviewed for the
            requirements of the people, organizations, and jurisdiction using the game.
          </p>
        </article>
      ) : (
        <article aria-labelledby="support-title">
          <p className="label">Help and incidents</p>
          <h1 id="support-title">Support</h1>
          <h2>During a game</h2>
          <ol>
            <li>If a safety or privacy issue occurs, stop the activity and close the lobby.</li>
            <li>Keep the room code and host PIN private except for the intended group.</li>
            <li>If a player cannot join, confirm that the lobby is open and reload once.</li>
            <li>If a photo fails, retry it or discard the saved photo; do not repeatedly select new copies.</li>
            <li>If the room code was shared outside the group, close the lobby and create a new room.</li>
          </ol>
          <h2>Privacy requests</h2>
          <p>
            The host can use <strong>Delete data</strong> beside one player, and players
            can use <strong>Leave and clear this device</strong>. Abandoning a room removes
            all room data immediately.
          </p>
          <h2>Report a problem</h2>
          <p>
            {SUPPORT_EMAIL ? (
              <>
                Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and include
                the room code, approximate time, device/browser, and what happened.
              </>
            ) : (
              <>
                For a pilot, contact the person who supplied the Rally Hunt link
                and include the room code, approximate time, device/browser, and what
                happened. A monitored public support address is required before broad
                self-service release.
              </>
            )}{" "}
            Do not send a host PIN or private photo.
          </p>
          <h2>Accessibility</h2>
          <p>
            Include the device, browser, assistive technology, and the step that was
            blocked. The game is designed for keyboard use, zoom, reduced motion, and
            screen-reader labels.
          </p>
        </article>
      )}
      <SiteFooter />
    </main>
  );
}

function TemplateLibraryPage({
  context,
  route,
}: {
  context?: TemplateLibraryContext;
  route: TemplateRoute;
}) {
  const [query, setQuery] = useState(
    () => new URLSearchParams(window.location.search).get("q") ?? "",
  );
  const [activeFilter, setActiveFilter] = useState<TemplateFilterId>(
    readTemplateFilterFromUrl,
  );
  const catalogPath = context
    ? getPathWithGameCode("/host/templates", context.gameCode)
    : "/templates";
  const backPath = context
    ? getPathWithGameCode("/host", context.gameCode)
    : "/";
  const selectedTemplate = route.templateId
    ? getGameKit(route.templateId)
    : undefined;
  const catalogBrowsePath = getTemplateBrowsePath(catalogPath, query, activeFilter);

  function updateBrowseState(nextQuery: string, nextFilter: TemplateFilterId) {
    const nextPath = getTemplateBrowsePath(
      window.location.pathname,
      nextQuery,
      nextFilter,
    );
    window.history.replaceState(window.history.state, "", nextPath);
  }

  if (route.templateId) {
    return (
      <TemplateDetailPage
        catalogPath={catalogBrowsePath}
        context={context}
        template={selectedTemplate}
      />
    );
  }

  const normalizedQuery = query.trim().toLowerCase();
  const selectedFilter =
    TEMPLATE_FILTERS.find((filter) => filter.id === activeFilter) ?? TEMPLATE_FILTERS[0];
  const filteredTemplates = GAME_KITS.filter((kit) => {
    const searchableText = [
      kit.name,
      kit.gameName,
      kit.category,
      kit.setting,
      kit.ageLabel,
      kit.summary,
      kit.detail,
      ...kit.searchTags,
    ]
      .join(" ")
      .toLowerCase();

    return (
      selectedFilter.matches(kit) &&
      (!normalizedQuery || searchableText.includes(normalizedQuery))
    );
  });
  const preferredRecommendation = getGameKit(
    TEMPLATE_RECOMMENDATIONS[activeFilter],
  );
  const recommendedTemplate = normalizedQuery
    ? filteredTemplates[0]
    : preferredRecommendation && filteredTemplates.some(
        (template) => template.id === preferredRecommendation.id,
      )
      ? preferredRecommendation
      : filteredTemplates[0];
  const RecommendedIcon = recommendedTemplate
    ? TEMPLATE_ICONS[recommendedTemplate.id]
    : Dices;
  const catalogTemplates = recommendedTemplate
    ? filteredTemplates.filter((template) => template.id !== recommendedTemplate.id)
    : [];
  const recommendationLabel = normalizedQuery
    ? "Best search match"
    : activeFilter === "all"
      ? "Best place to start"
      : `Best match for ${selectedFilter.label.toLowerCase()}`;

  return (
    <main className="template-library-page">
      <header className="template-library-header">
        <a className="template-back-link" href={backPath}>
          <ArrowLeft aria-hidden="true" />
          {context ? `Back to room ${context.gameCode}` : "Back home"}
        </a>
        <a className="template-library-brand" href="/">
          <span aria-hidden="true"><RallyMark /></span>
          Rally Hunt
        </a>
      </header>

      <section className="template-library-hero" aria-labelledby="template-library-title">
        <p className="label">{context ? "Choose for this room" : "Ready-made games"}</p>
        <h1 id="template-library-title">Start with a game that already fits.</h1>
        <p>
          Choose what sounds right, start it in a few clicks, and change anything
          you want before people join.
        </p>
      </section>

      <section className="template-library-tools" aria-label="Find a template">
        <div className="template-tool-heading">
          <strong>What are you planning?</strong>
          <span>Pick a shortcut or search the whole library.</span>
        </div>
        <div className="template-categories" aria-label="Browse by type">
          {TEMPLATE_FILTERS.map((filter) => (
            <button
              key={filter.id}
              aria-pressed={activeFilter === filter.id}
              className={activeFilter === filter.id ? "is-active" : ""}
              type="button"
              onClick={() => {
                setActiveFilter(filter.id);
                updateBrowseState(query, filter.id);
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <label className="template-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Search templates</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);
              updateBrowseState(nextQuery, activeFilter);
            }}
            placeholder="Search by occasion, place, or group"
          />
        </label>
      </section>

      {recommendedTemplate && (
        <section
          className="template-recommendation"
          data-template={recommendedTemplate.id}
          aria-labelledby="template-recommendation-title"
        >
          <div className="template-recommendation-visual" aria-hidden="true">
            <RecommendedIcon />
            <span>{recommendedTemplate.boardSize}×{recommendedTemplate.boardSize}</span>
          </div>
          <div className="template-recommendation-copy">
            <p className="label">{recommendationLabel}</p>
            <h2 id="template-recommendation-title">{recommendedTemplate.name}</h2>
            <p>{recommendedTemplate.summary}</p>
            <div
              className="template-recommendation-facts"
              aria-label={`${recommendedTemplate.name} at a glance`}
            >
              <span>
                {recommendedTemplate.playMode === "individual"
                  ? "Solo boards"
                  : recommendedTemplate.playerLabel}
              </span>
              <span>{recommendedTemplate.durationLabel}</span>
              <span>
                {recommendedTemplate.boardSize}×{recommendedTemplate.boardSize}{" "}
                {recommendedTemplate.winCondition}
              </span>
              <span>{getTemplateProofLabel(recommendedTemplate)}</span>
            </div>
            <div className="template-recommendation-actions">
              <TemplateStartAction
                className="template-recommendation-use"
                context={context}
                template={recommendedTemplate}
              />
              <a
                aria-label={`See what is inside ${recommendedTemplate.name}`}
                href={getTemplateDetailPath(
                  catalogPath,
                  recommendedTemplate.id,
                  query,
                  activeFilter,
                )}
              >
                See what’s inside
              </a>
            </div>
          </div>
        </section>
      )}

      <section aria-label="Template results">
        <div className="template-results-heading">
          <div>
            <span className="label">
              {activeFilter === "all" && !normalizedQuery
                ? "More ways to play"
                : "Other good fits"}
            </span>
            <strong>
              {activeFilter === "all" && !normalizedQuery
                ? "More ready-made games"
                : selectedFilter.label}
            </strong>
          </div>
          <span aria-atomic="true" aria-live="polite" role="status">
            {filteredTemplates.length === 1
              ? "1 match"
              : `${filteredTemplates.length} matches`}
          </span>
        </div>

        {catalogTemplates.length > 0 ? (
          <div className="template-catalog-grid">
            {catalogTemplates.map((template) => (
              <TemplateCatalogCard
                activeFilter={activeFilter}
                catalogPath={catalogPath}
                context={context}
                key={template.id}
                query={query}
                template={template}
              />
            ))}
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="template-empty-state">
            <Search aria-hidden="true" />
            <strong>No templates match that search.</strong>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setActiveFilter("all");
                updateBrowseState("", "all");
              }}
            >
              Clear filters
            </button>
          </div>
        ) : null}
      </section>

      <section className="template-build-own" aria-label="Create a custom game">
        <div>
          <strong>
            {context ? "Keep your current setup" : "Need something different?"}
          </strong>
          <span>
            {context
              ? "Go back without replacing this room’s rules, teams, or tasks."
              : "Start blank and choose every rule, team, and challenge yourself."}
          </span>
        </div>
        <a href={context ? backPath : "/host"}>
          {context ? `Back to room ${context.gameCode}` : "Build your own game"}
          <ArrowRight aria-hidden="true" />
        </a>
      </section>
    </main>
  );
}

function TemplateDetailPage({
  catalogPath,
  context,
  template,
}: {
  catalogPath: string;
  context?: {
    canApply: boolean;
    gameCode: string;
    onApply: (templateId: GameKit["id"]) => void;
  };
  template?: GameKit;
}) {
  const [showAllTasks, setShowAllTasks] = useState(false);

  useEffect(() => {
    setShowAllTasks(false);
  }, [template?.id]);

  if (!template) {
    return (
      <main className="template-library-page">
        <header className="template-library-header">
          <a className="template-back-link" href={catalogPath}>
            <ArrowLeft aria-hidden="true" />
            All templates
          </a>
        </header>
        <section className="template-empty-state is-page">
          <Grid3X3 aria-hidden="true" />
          <h1>Template not found.</h1>
          <p>This template may have moved or is not part of the curated library.</p>
          <a href={catalogPath}>Browse all templates</a>
        </section>
      </main>
    );
  }

  const taskCount = template.tasks?.length ?? 42;
  const creationHref = `/host?template=${encodeURIComponent(template.id)}`;
  const visibleTasks = template.tasks?.slice(
    0,
    showAllTasks ? template.tasks.length : 12,
  );

  return (
    <main className="template-library-page template-detail-page">
      <header className="template-library-header">
        <a className="template-back-link" href={catalogPath}>
          <ArrowLeft aria-hidden="true" />
          All templates
        </a>
        <a className="template-library-brand" href="/">
          <span aria-hidden="true"><RallyMark /></span>
          Rally Hunt
        </a>
      </header>

      <section className="template-detail-hero">
        <div className="template-detail-copy">
          <p className="label">{template.category}</p>
          <h1>{template.name}</h1>
          <p className="template-detail-summary">{template.summary}</p>
          <p>{template.detail}</p>
          <div className="template-detail-actions">
            {context?.canApply ? (
              <button
                className="primary-action"
                type="button"
                onClick={() => context.onApply(template.id)}
              >
                <Play aria-hidden="true" />
                Use in room {context.gameCode}
              </button>
            ) : (
              <a className="primary-action" href={creationHref}>
                <Play aria-hidden="true" />
                {context ? "Start in a new room" : "Start with this template"}
              </a>
            )}
            <a className="secondary-action" href={catalogPath}>
              Keep browsing
            </a>
          </div>
          {context && (
            <p className={context.canApply ? "template-replace-note" : "template-replace-note is-locked"}>
              {context.canApply
                ? "Using this will replace the room’s current rules, teams, tasks, and boards after confirmation."
                : "This hunt has already started. Its setup is protected, so this template must use a new room."}
            </p>
          )}
        </div>

        <div
          className="template-detail-board"
          aria-label={`${template.boardSize} by ${template.boardSize} board preview`}
          style={{ "--template-board-size": template.boardSize } as React.CSSProperties}
        >
          {Array.from(
            { length: template.boardSize * template.boardSize },
            (_, index) => {
              const task = template.tasks?.[index];
              const Icon = task ? ICONS[task.icon] ?? Grid3X3 : index === Math.floor((template.boardSize * template.boardSize) / 2) ? Star : Grid3X3;
              return (
                <span key={task?.id ?? index}>
                  <Icon aria-hidden="true" />
                  <small>{task?.title ?? (index === 0 ? "Your tasks" : "")}</small>
                </span>
              );
            },
          )}
        </div>
      </section>

      <section className="template-fact-grid" aria-label="Template details">
        <div><span>Players</span><strong>{template.playerLabel}</strong></div>
        <div><span>Time</span><strong>{template.durationLabel}</strong></div>
        <div><span>Setting</span><strong>{template.setting}</strong></div>
        <div><span>Best for</span><strong>{template.ageLabel}</strong></div>
        <div><span>Board</span><strong>{template.boardSize}×{template.boardSize} {template.winCondition}</strong></div>
        <div><span>Photos</span><strong>{getTemplatePhotoDetail(template)}</strong></div>
        <div><span>Task pool</span><strong>{taskCount} editable tasks</strong></div>
      </section>

      <section className="template-task-section" aria-labelledby="template-tasks-title">
        <div>
          <p className="label">Inside the template</p>
          <h2 id="template-tasks-title">Preview the challenges.</h2>
          <p>
            {template.tasks
              ? "These prompts are copied into your room, where you can rewrite, remove, or add anything."
              : "This flexible template starts with the full 42-task general challenge pool, ready to edit in room setup."}
          </p>
        </div>
        {visibleTasks ? (
          <div className="template-task-list-wrap">
            <div className="template-task-list">
            {visibleTasks.map((task) => {
              const Icon = ICONS[task.icon] ?? Grid3X3;
              return (
                <article key={task.id}>
                  <span aria-hidden="true"><Icon /></span>
                  <div>
                    <strong>{task.title}</strong>
                    <p>{task.description}</p>
                  </div>
                  {task.free && <em>Free</em>}
                </article>
              );
            })}
            </div>
            {template.tasks && template.tasks.length > 12 && (
              <button
                className="template-task-toggle"
                type="button"
                onClick={() => setShowAllTasks((current) => !current)}
              >
                {showAllTasks
                  ? "Show fewer tasks"
                  : `Show all ${template.tasks.length} tasks`}
              </button>
            )}
          </div>
        ) : (
          <div className="template-generic-pool">
            <Grid3X3 aria-hidden="true" />
            <strong>42 general challenges</strong>
            <span>Photo prompts, observation tasks, team moments, and a free space where the board allows it.</span>
          </div>
        )}
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
  roomCode,
  showStopDetails,
  timerDisplay,
  onTimerClick,
}: {
  currentGroup: Group | null;
  isHostRoute: boolean;
  roomCode: string;
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
          <span className="room-code-kicker">Room {roomCode}</span>
        </p>
        <h1>Rally Hunt</h1>
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
  game,
  isBusy,
  onJoin,
}: {
  defaultGameCode: string;
  defaultGroupId: string;
  defaultName: string;
  groups: Group[];
  game: Game;
  isBusy: boolean;
  onJoin: (request: JoinRequest) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [gameCode, setGameCode] = useState(defaultGameCode);
  const [groupId, setGroupId] = useState(defaultGroupId || groups[0]?.id || "");
  const isIndividual = game.playMode === "individual";
  const isAutoAssign = !isIndividual && game.teamsLocked;
  const hasGroups = isIndividual || groups.length > 0;
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

    if (!cleanName || (!isIndividual && !isAutoAssign && !groupId) || !cleanGameCode || !hasGroups) {
      return;
    }

    onJoin({ name: cleanName, groupId: isIndividual || isAutoAssign ? undefined : groupId, gameCode: cleanGameCode });
  }

  function chooseRandomGroup() {
    if (!hasGroups) {
      return;
    }

    const candidateGroups =
      groups.length > 1 ? groups.filter((group) => group.id !== groupId) : groups;
    const randomGroup =
      candidateGroups[Math.floor(Math.random() * candidateGroups.length)];

    if (randomGroup) {
      setGroupId(randomGroup.id);
    }
  }

  return (
    <section className="welcome-card" aria-labelledby="join-title">
      <div>
        <p className="label">{isIndividual ? "Free-for-all" : "Team game"}</p>
        <h2 id="join-title">
          {isIndividual ? "Join and get your own board." : "Join your team, then start filling the board."}
        </h2>
        <p>
          Your next screen shows your {game.boardSize} by {game.boardSize} card.
          {game.proofMode === "required" ? " Send photo proof as you go." : " Complete squares as you go."}
        </p>
        {game.playerExportMode === "team-after-review" && (
          <p className="join-export-notice">
            This host allows players to make a separate presentation of their own
            team’s board after the hunt. You will see exactly what is included and
            confirm before creating a copy.
          </p>
        )}
      </div>

      <div className="join-steps" aria-label="How the game works">
        <span>
          <Grid3X3 aria-hidden="true" />
          Pick a ready square
        </span>
        <span>
          <Camera aria-hidden="true" />
          {game.proofMode === "required" ? "Send photo proof" : "Complete the task"}
        </span>
        <span>
          <Check aria-hidden="true" />
          {game.winCondition === "bingo" ? "Complete a bingo line" : "Fill every square"}
        </span>
      </div>

      <form className="join-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Game code</span>
          <input
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={24}
            value={gameCode}
            onChange={(event) => setGameCode(event.target.value.toUpperCase())}
            placeholder="EVENT-2026"
          />
        </label>

        <label className="field">
          <span>First name or nickname</span>
          <input
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="First name or nickname"
          />
          <small>Avoid entering a full legal name.</small>
        </label>

        {!isIndividual && !isAutoAssign && <fieldset className="group-field">
          <legend className="visually-hidden">Group</legend>
          <div className="group-field-header">
            <span>Group</span>
            {hasGroups && (
              <button
                className="random-team-button"
                type="button"
                onClick={chooseRandomGroup}
              >
                <Dices aria-hidden="true" />
                Random team
              </button>
            )}
          </div>
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
        </fieldset>}

        {isIndividual && (
          <div className="join-empty" role="status">
            <Grid3X3 aria-hidden="true" />
            <div>
              <strong>Your own randomized board</strong>
              <p>Your score is tracked separately from every other player.</p>
            </div>
          </div>
        )}

        {isAutoAssign && (
          <div className="join-empty" role="status">
            <Users aria-hidden="true" />
            <div><strong>Teams are balanced automatically</strong><p>The game will place you on the team with the fewest players.</p></div>
          </div>
        )}

        <button
          className="join-submit"
          disabled={!name.trim() || (!isIndividual && !isAutoAssign && !groupId) || !gameCode.trim() || !hasGroups || isBusy || !game.lobbyOpen}
          style={
            {
              "--primary": selectedGroup?.color,
              "--primary-dark": selectedGroup?.dark,
            } as React.CSSProperties
          }
          type="submit"
        >
          {isBusy
            ? "Joining..."
            : !game.lobbyOpen
              ? "Lobby closed"
              : hasGroups
                ? "Open board"
                : "Waiting for teams"}
        </button>
      </form>
    </section>
  );
}

export function HostGate({
  defaultDisplayName,
  defaultGameCode,
  error,
  isBusy,
  selectedTemplate,
  isExistingRoom = false,
  onClaim,
}: {
  defaultDisplayName: string;
  defaultGameCode: string;
  error?: string;
  isBusy: boolean;
  selectedTemplate?: GameKit;
  isExistingRoom?: boolean;
  onClaim: (request: HostClaimRequest) => void;
}) {
  const [displayName, setDisplayName] = useState(defaultDisplayName || "Host");
  const [gameCode, setGameCode] = useState(
    defaultGameCode || (isExistingRoom ? "" : generateRoomCode()),
  );
  const [pin, setPin] = useState(isExistingRoom ? "" : generateHostPin());
  const [isPinVisible, setIsPinVisible] = useState(false);
  const [pinCopyStatus, setPinCopyStatus] = useState("");
  const minimumPinLength = isExistingRoom ? 4 : 8;

  async function handleCopyPin() {
    if (!pin.trim()) {
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }

      await navigator.clipboard.writeText(pin);
      setPinCopyStatus("PIN copied.");
    } catch {
      setIsPinVisible(true);
      setPinCopyStatus("Copy is unavailable here. The PIN is now visible so you can copy it.");
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = displayName.trim();
    const cleanGameCode = gameCode.trim();

    if (
      !cleanName ||
      !isValidGameCode(normalizeGameCodeInput(cleanGameCode)) ||
      pin.trim().length < minimumPinLength
    ) {
      return;
    }

    onClaim({
      displayName: cleanName,
      gameCode: cleanGameCode,
      pin,
      ...(selectedTemplate ? { templateId: selectedTemplate.id } : {}),
    });
  }

  return (
    <section className="welcome-card host-gate" aria-labelledby="host-title">
      <div>
        <p className="label">
          {selectedTemplate ? "Start from a template" : "Host a hunt"}
        </p>
        <h1 id="host-title">
          {selectedTemplate ? `Create ${selectedTemplate.name}.` : "Create or reopen a hunt."}
        </h1>
        <p>
          {isExistingRoom
            ? "Enter the private PIN created with this room."
            : selectedTemplate
            ? "Choose a new room code and private host PIN. You can review and edit everything before players join."
            : "Use the generated room code and private host PIN, or replace them before creating the room."}
        </p>
      </div>

      {selectedTemplate && (
        <div className="selected-template-summary">
          <div className="selected-template-copy">
            <strong>{selectedTemplate.name}</strong>
            <span>{selectedTemplate.summary}</span>
          </div>
          <div className="selected-template-facts" aria-label="Template at a glance">
            <span>
              {selectedTemplate.boardSize}×{selectedTemplate.boardSize} {selectedTemplate.winCondition}
            </span>
            <span>{selectedTemplate.durationLabel}</span>
            <span>{getTemplateProofLabel(selectedTemplate)}</span>
          </div>
        </div>
      )}

      <form className="join-form" onSubmit={handleSubmit}>
        {error && (
          <p className="entry-form-message is-error" role="alert">
            {error}
          </p>
        )}
        <label className="field">
          <span>Room code</span>
          <input
            autoCapitalize="characters"
            autoComplete="off"
            aria-describedby="host-room-code-help"
            maxLength={24}
            value={gameCode}
            onChange={(event) => setGameCode(event.target.value.toUpperCase())}
            placeholder="FRIDAY-NIGHT"
          />
          <small id="host-room-code-help">3–24 letters, numbers, or dashes.</small>
          {!isExistingRoom && (
            <button
              className="text-button"
              type="button"
              onClick={() => setGameCode(generateRoomCode())}
            >
              Generate another code
            </button>
          )}
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
        <div className="field host-pin-field">
          <label htmlFor="host-pin">PIN</label>
          <input
            id="host-pin"
            autoComplete="one-time-code"
            aria-describedby="host-pin-help"
            inputMode="numeric"
            minLength={minimumPinLength}
            maxLength={32}
            type={isPinVisible ? "text" : "password"}
            value={pin}
            onChange={(event) => {
              setPin(event.target.value);
              setPinCopyStatus("");
            }}
            placeholder={isExistingRoom ? "Existing PIN" : "8-digit PIN"}
          />
          <small id="host-pin-help">
            {isExistingRoom
              ? "Use the PIN saved when this room was created."
              : "Save this 8-digit PIN—you’ll need it to host again."}
          </small>
          <div className="host-pin-actions">
            <button
              aria-controls="host-pin"
              aria-pressed={isPinVisible}
              className="text-button"
              type="button"
              onClick={() => setIsPinVisible((visible) => !visible)}
            >
              {isPinVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              {isPinVisible ? "Hide PIN" : "Show PIN"}
            </button>
            <button
              className="text-button"
              disabled={!pin.trim()}
              type="button"
              onClick={() => void handleCopyPin()}
            >
              Copy PIN
            </button>
            {!isExistingRoom && (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setPin(generateHostPin());
                  setPinCopyStatus("");
                }}
              >
                Generate another PIN
              </button>
            )}
          </div>
          {pinCopyStatus && (
            <small className="host-pin-copy-status" role="status">
              {pinCopyStatus}
            </small>
          )}
        </div>
        <button
          className="join-submit"
          disabled={
            !displayName.trim() ||
            !isValidGameCode(normalizeGameCodeInput(gameCode)) ||
            pin.trim().length < minimumPinLength ||
            isBusy
          }
          type="submit"
        >
          {isBusy
            ? "Opening hunt..."
            : selectedTemplate
              ? "Create game from template"
              : isExistingRoom
                ? "Open host controls"
                : "Create hunt"}
        </button>
      </form>
    </section>
  );
}

export function GroupView({
  boardView,
  group,
  game,
  groups,
  isBoardHidden,
  isTaskCardDismissed,
  onDismissTaskCard,
  onDiscardPendingProof,
  onBoardViewChange,
  onLeave,
  onRetryPendingProof,
  onSubmitProof,
  onCompleteTask,
  onTaskSelect,
  pendingProofs,
  roster,
  retryingProofId,
  selectedTask,
  submissions,
  tasks,
  uploadingTaskId,
}: {
  boardView: BoardView;
  group: Group;
  game: Game;
  groups: Group[];
  isBoardHidden: boolean;
  isTaskCardDismissed: boolean;
  onDismissTaskCard: () => void;
  onDiscardPendingProof: (proofId: string) => void;
  onBoardViewChange: (view: BoardView) => void;
  onLeave: () => void;
  onRetryPendingProof: (proofId: string) => void;
  onSubmitProof: (taskId: string, file: File) => void;
  onCompleteTask: (taskId: string) => void;
  onTaskSelect: (taskId: string) => void;
  pendingProofs: PendingProofUpload[];
  roster: RosterMember[];
  retryingProofId: string;
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
  const pendingProofsByTask = useMemo(
    () => new Map(pendingProofs.map((proof) => [proof.taskId, proof])),
    [pendingProofs],
  );
  const pendingProofTaskIds = useMemo(
    () => new Set(pendingProofs.map((proof) => proof.taskId)),
    [pendingProofs],
  );
  const hasWon = hasTasks && (game.winCondition === "blackout"
    ? approvedCount === tasks.length
    : hasCompletedBingo(tasks, group.id, submissions, game.boardSize));
  const taskPanelRef = useRef<HTMLElement>(null);
  const taskTriggerRef = useRef<HTMLButtonElement | null>(null);
  const taskPanelWasOpenRef = useRef(false);
  const taskPanelId = "player-task-panel";
  const isTaskPanelOpen = Boolean(selectedTask && !isTaskCardDismissed);

  useEffect(() => {
    if (isTaskPanelOpen) {
      taskPanelWasOpenRef.current = true;
      taskPanelRef.current?.focus();
      return;
    }

    if (taskPanelWasOpenRef.current) {
      taskPanelWasOpenRef.current = false;
      taskTriggerRef.current?.focus();
    }
  }, [isTaskPanelOpen, selectedTask?.id]);

  function handleTaskPanelSelect(
    taskId: string,
    trigger: HTMLButtonElement,
  ) {
    taskTriggerRef.current = trigger;
    onTaskSelect(taskId);
  }

  return (
    <div className="view-stack group-view">
      {!isBoardHidden && hasWon && (
        <section className="blackout-banner">
          <Check aria-hidden="true" />
          <div>
            <strong>{game.winCondition === "bingo" ? "Bingo complete" : "Blackout complete"}</strong>
            <span>{game.winCondition === "bingo" ? "You completed a full line." : "Every square has been approved."}</span>
          </div>
        </section>
      )}

      {!isBoardHidden && pendingProofs.length > 0 && (
        <PendingProofNotice
          onRetryPendingProof={onRetryPendingProof}
          pendingProofs={pendingProofs}
          retryingProofId={retryingProofId}
          tasks={tasks}
          uploadingTaskId={uploadingTaskId}
        />
      )}

      {isBoardHidden ? (
        <BoardHiddenRoster groups={groups} playMode={game.playMode} roster={roster} />
      ) : (
        <section aria-labelledby="board-heading">
          <div className="section-heading">
            <div>
              <p className="label">{game.winCondition === "bingo" ? "Bingo card" : "Blackout card"}</p>
              <h2 id="board-heading">
                {hasTasks
                  ? `${completedCount} of ${tasks.length} sent`
                  : "Board not ready"}
              </h2>
            </div>
            <span>
              {pendingProofs.length > 0
                ? `${pendingProofs.length} saved to retry`
                : hasTasks
                  ? `${approvedCount} approved`
                  : "Ask host"}
            </span>
          </div>

          {hasTasks ? (
            <>
              <div className="board-view-toggle" aria-label="Choose board view">
                <button
                  aria-pressed={boardView === "grid"}
                  className={boardView === "grid" ? "is-active" : ""}
                  type="button"
                  onClick={() => onBoardViewChange("grid")}
                >
                  <Grid3X3 aria-hidden="true" />
                  Board
                </button>
                <button
                  aria-pressed={boardView === "list"}
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
                  boardSize={game.boardSize}
                  groupId={group.id}
                  onTaskSelect={handleTaskPanelSelect}
                  pendingProofTaskIds={pendingProofTaskIds}
                  selectedTaskId={isTaskPanelOpen ? selectedTask?.id ?? "" : ""}
                  submissions={submissions}
                  taskPanelId={taskPanelId}
                  tasks={tasks}
                />
              ) : (
                <TaskList
                  groupId={group.id}
                  onTaskSelect={handleTaskPanelSelect}
                  pendingProofTaskIds={pendingProofTaskIds}
                  selectedTaskId={isTaskPanelOpen ? selectedTask?.id ?? "" : ""}
                  submissions={submissions}
                  taskPanelId={taskPanelId}
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
      )}

      {!isBoardHidden &&
        game.setupComplete &&
        game.phase === "review" &&
        game.playerExportMode === "team-after-review" &&
        hasTasks && (
        <PlayerSlidesExport
          audience="player"
          game={game}
          group={group}
          roster={roster}
          submissions={submissions}
          tasks={tasks}
        />
      )}

      {!isBoardHidden && selectedTask && !isTaskCardDismissed && (
        <SelectedTaskCard
          key={selectedTask.id}
          groupId={group.id}
          isUploading={uploadingTaskId === selectedTask.id}
          isRetryingProof={pendingProofsByTask.get(selectedTask.id)?.id === retryingProofId}
          onDismiss={onDismissTaskCard}
          onDiscardPendingProof={onDiscardPendingProof}
          onRetryPendingProof={onRetryPendingProof}
          onSubmitProof={onSubmitProof}
          onCompleteTask={onCompleteTask}
          panelId={taskPanelId}
          panelRef={taskPanelRef}
          pendingProof={pendingProofsByTask.get(selectedTask.id)}
          submission={groupSubmissions.find(
            (submission) => submission.taskId === selectedTask.id,
          )}
          task={selectedTask}
          proofMode={game.proofMode}
        />
      )}
      <section className="player-privacy-actions" aria-label="Shared device controls">
        <h2>Finished on this device?</h2>
        <p>Leave the room and delete your submissions, photos, nickname, and saved retries.</p>
        <button className="secondary-action" type="button" onClick={onLeave}>
          Leave and clear this device
        </button>
      </section>
    </div>
  );
}

function BoardHiddenRoster({
  groups,
  playMode,
  roster,
}: {
  groups: Group[];
  playMode: Game["playMode"];
  roster: RosterMember[];
}) {
  const visibleGroups = useMemo(
    () => playMode === "individual"
      ? roster.filter((member) => member.role === "player").map((member, index) => createPlayerGroup(member, index))
      : groups,
    [groups, playMode, roster],
  );
  const playersByGroup = useMemo(() => {
    const groupedRoster = new Map<string, RosterMember[]>();

    visibleGroups.forEach((group) => {
      groupedRoster.set(group.id, []);
    });

    roster.forEach((member) => {
      if (member.role !== "player" || !member.groupId) {
        return;
      }

      groupedRoster.get(member.groupId)?.push(member);
    });

    return groupedRoster;
  }, [roster, visibleGroups]);
  const playerCount = roster.filter((member) => member.role === "player").length;

  return (
    <section className="board-hidden-panel" aria-labelledby="board-hidden-title">
      <div className="board-hidden-header">
        <Lock aria-hidden="true" />
        <div>
          <p className="label">{playMode === "individual" ? "Players waiting" : "Teams waiting"}</p>
          <h2 id="board-hidden-title">Waiting for the host</h2>
          <p>
            {playerCount === 1
              ? "1 player is checked in."
              : `${playerCount} players are checked in.`}
          </p>
        </div>
      </div>

      <div className="waiting-team-list">
        {visibleGroups.map((group) => {
          const players = playersByGroup.get(group.id) ?? [];

          return (
            <article
              key={group.id}
              className="waiting-team-row"
              style={{ "--group-color": group.color } as React.CSSProperties}
            >
              <span className="waiting-team-mark" aria-hidden="true" />
              <div>
                <strong>{group.shortName}</strong>
                <span className={players.length === 0 ? "is-empty" : ""}>
                  {players.length > 0
                    ? players.map((player) => player.displayName).join(", ")
                    : "No one joined yet"}
                </span>
              </div>
              <em>{players.length}</em>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PendingProofNotice({
  onRetryPendingProof,
  pendingProofs,
  retryingProofId,
  tasks,
  uploadingTaskId,
}: {
  onRetryPendingProof: (proofId: string) => void;
  pendingProofs: PendingProofUpload[];
  retryingProofId: string;
  tasks: Task[];
  uploadingTaskId: string;
}) {
  const [firstProof, ...remainingProofs] = pendingProofs;
  const firstTask = tasks.find((task) => task.id === firstProof.taskId) ?? null;
  const isRetrying = firstProof.id === retryingProofId;
  const isUploading = firstProof.taskId === uploadingTaskId;

  return (
    <section className="pending-proof-notice" aria-labelledby="pending-proof-title">
      <div className="pending-proof-notice-main">
        <Upload aria-hidden="true" />
        <div>
          <strong id="pending-proof-title">
            {pendingProofs.length === 1
              ? "Photo waiting to send"
              : `${pendingProofs.length} photos waiting to send`}
          </strong>
          <span>
            {firstTask ? firstTask.title : "Proof photo"} is ready to retry.
            Keep this page open until it sends.
          </span>
          {remainingProofs.length > 0 && (
            <small>{remainingProofs.length} more waiting.</small>
          )}
        </div>
      </div>
      <button
        className="primary-action pending-proof-notice-action"
        disabled={isRetrying || isUploading}
        type="button"
        onClick={() => onRetryPendingProof(firstProof.id)}
      >
        <Upload aria-hidden="true" />
        {isRetrying ? "Retrying..." : "Retry upload"}
      </button>
    </section>
  );
}

function HostView({
  activeStopIndex,
  addFiveMinutes,
  addGroup,
  addCatalogTask,
  addStop,
  addTask,
  abandonGame,
  boardAssignments,
  configure,
  expandedStopId,
  generateBoards,
  game,
  expiresAt,
  goToPlayTime,
  goToNextStop,
  groups,
  scoreGroups,
  hostMembership,
  isAddingGroup,
  kickingMembershipId,
  kickPlayer,
  memberships,
  movingMembershipId,
  movePlayer,
  promotePlayer,
  removeCohost,
  transferHost,
  removeGroup,
  removeTask,
  resetCatalogTask,
  removeStop,
  resetGameProofs,
  saveGroupBoard,
  selectedHostGroupId,
  setExpandedStopId,
  setBoardHidden,
  startGame,
  setHuntPhase,
  setSelectedHostGroupId,
  setSubmissionStatus,
  stops,
  submissions,
  tasks,
  timerDisplay,
  toggleDurationTimer,
  routeDisplay,
  updateStop,
  updateGroup,
  updateBoardSetup,
  updateRoom,
  updateTask,
}: {
  activeStopIndex: number;
  addFiveMinutes: () => void;
  addGroup: (groupName: string) => Promise<boolean>;
  addCatalogTask: (catalogTaskId: string) => void;
  addStop: () => void;
  addTask: (task: { title?: string; description?: string; icon?: string }) => void;
  abandonGame: () => void;
  boardAssignments: BoardAssignment[];
  configure: (
    template?: GameKitId,
    config?: Parameters<typeof configureGame>[0]["config"],
    startTime?: string,
  ) => Promise<boolean>;
  expandedStopId: string;
  generateBoards: () => void;
  game: Game;
  expiresAt?: number;
  goToPlayTime: (afterStopIndex: number) => void;
  goToNextStop: () => void;
  groups: Group[];
  scoreGroups: Group[];
  hostMembership: Membership;
  isAddingGroup: boolean;
  kickingMembershipId: string;
  kickPlayer: (membershipId: string) => void;
  memberships: Membership[];
  movingMembershipId: string;
  movePlayer: (membershipId: string, groupId: string) => void;
  promotePlayer: (membershipId: string) => void;
  removeCohost: (membershipId: string) => void;
  transferHost: (membershipId: string) => void;
  removeGroup: (groupId: string) => void;
  removeTask: (taskId: string) => void;
  resetCatalogTask: (taskId: string) => void;
  removeStop: (stopId: string) => void;
  resetGameProofs: () => void;
  saveGroupBoard: (groupId: string, taskIds: string[]) => void;
  selectedHostGroupId: string;
  setExpandedStopId: (stopId: string) => void;
  setBoardHidden: (boardHidden: boolean) => void;
  startGame: () => void;
  setHuntPhase: (phase: HuntPhase) => void;
  setSelectedHostGroupId: (groupId: string) => void;
  setSubmissionStatus: (submissionId: string, status: Submission["status"]) => void;
  stops: HuntStop[];
  submissions: Submission[];
  tasks: Task[];
  timerDisplay: TimerDisplay;
  toggleDurationTimer: () => void;
  routeDisplay: RouteDisplay;
  updateStop: (
    stopId: string,
    patch: Partial<Pick<HuntStop, "name" | "detail" | "arriveTime" | "leaveTime">>,
  ) => void;
  updateGroup: (
    groupId: string,
    patch: Parameters<typeof updateGroupDetails>[2],
  ) => void;
  updateBoardSetup: (
    setup: Pick<Game, "boardSize" | "boardMode" | "freeSpace">,
  ) => void;
  updateRoom: (patch: LocalGamePatch) => void;
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
    scoreGroups.find((group) => group.id === selectedHostGroupId) ?? null;
  const boardsLocked = submissions.length > 0;
  const [hostArea, setHostArea] = useState<"lobby" | "setup" | "run" | "manage">(
    game.setupComplete ? "run" : "setup",
  );
  const [setupStep, setSetupStep] = useState<"game" | "teams" | "boards" | "route">(
    "game",
  );
  const boardSlotCount = getBoardSlotCount(game.boardSize);
  const playableTaskCount = tasks.filter((task) => !task.free).length;
  const requiredTaskCount = getRequiredPlayableTaskCount(
    game.boardSize,
    game.freeSpace,
  );
  const boardOwners = game.playMode === "teams" ? groups : scoreGroups;
  const boardsReady =
    !game.boardsNeedShuffle &&
    (game.playMode === "individual" || boardOwners.length > 0) &&
    playableTaskCount >= requiredTaskCount &&
    (boardOwners.length === 0 ||
      boardOwners.every(
        (group) =>
          getGroupBoardTasks(group.id, tasks, boardAssignments).length ===
          boardSlotCount,
      ));
  const setupReady =
    boardsReady &&
    (game.playMode === "individual" || groups.length > 0) &&
    (game.timerMode !== "schedule" || stops.length > 0);

  useEffect(() => {
    if (game.setupComplete) {
      setHostArea("run");
    }
  }, [game.setupComplete]);

  const setupSteps = [
    {
      id: "game" as const,
      label: "Game",
      detail: `${game.playMode === "individual" ? "Free-for-all" : "Teams"} · ${game.winCondition === "bingo" ? "Bingo" : "Blackout"}`,
      complete: true,
    },
    {
      id: "teams" as const,
      label: game.playMode === "individual" ? "Players" : "Teams",
      detail: game.playMode === "individual"
        ? scoreGroups.length === 1 ? "1 player joined" : `${scoreGroups.length} players joined`
        : groups.length === 1 ? "1 team ready" : `${groups.length} teams ready`,
      complete: game.playMode === "individual" || groups.length > 0,
    },
    {
      id: "boards" as const,
      label: "Boards",
      detail: boardsReady
        ? "Boards are ready"
        : `${playableTaskCount} tasks selected`,
      complete: boardsReady,
    },
    {
      id: "route" as const,
      label: game.timerMode === "schedule" ? "Route" : "Timing",
      detail: game.timerMode === "none"
        ? "No timer"
        : game.timerMode === "duration"
          ? `${game.timerDurationMinutes} minutes`
          : stops.length === 1 ? "1 stop planned" : `${stops.length} stops planned`,
      complete: game.timerMode !== "schedule" || stops.length > 0,
    },
  ];

  return (
    <div className="view-stack host-view">
      <nav className="host-area-nav" aria-label="Host workspace">
        <button
          aria-current={hostArea === "setup" ? "page" : undefined}
          className={hostArea === "setup" ? "is-active" : ""}
          type="button"
          onClick={() => setHostArea("setup")}
        >
          <Grid3X3 aria-hidden="true" />
          <span>Setup</span>
        </button>
        <button
          aria-current={hostArea === "lobby" ? "page" : undefined}
          className={hostArea === "lobby" ? "is-active" : ""}
          type="button"
          onClick={() => setHostArea("lobby")}
        >
          <Users aria-hidden="true" />
          <span>Invite</span>
        </button>
        <button
          aria-current={hostArea === "run" ? "page" : undefined}
          className={hostArea === "run" ? "is-active" : ""}
          disabled={!game.setupComplete}
          title={game.setupComplete ? undefined : "Start the game from Invite before opening live controls"}
          type="button"
          onClick={() => setHostArea("run")}
        >
          <Play aria-hidden="true" />
          <span>Live</span>
        </button>
        <button
          aria-current={hostArea === "manage" ? "page" : undefined}
          className={hostArea === "manage" ? "is-active" : ""}
          type="button"
          onClick={() => setHostArea("manage")}
        >
          <Settings2 aria-hidden="true" />
          <span>Room</span>
        </button>
      </nav>

      {hostArea === "lobby" && (
        <HostLobbyScreen
          canStart={
            memberships.some((item) => item.role === "player") &&
            setupReady
          }
          game={game}
          groups={groups}
          isConfigured={setupReady}
          memberships={memberships}
          onOpenRun={() => setHostArea("run")}
          onOpenSetup={() => setHostArea("setup")}
          onStartGame={startGame}
          onToggleLobby={(lobbyOpen) => updateRoom({ lobbyOpen })}
        />
      )}

      {hostArea === "setup" && (
        <>
          <section className="host-setup-intro" aria-labelledby="setup-heading">
            <div>
              <p className="label">Before players begin</p>
              <h2 id="setup-heading">Build the hunt one step at a time.</h2>
              <p>Choose how people play, prepare the boards, set the timing, then open the lobby.</p>
            </div>
            <ol className="host-setup-steps">
              {setupSteps.map((step, index) => (
                <li key={step.id}>
                  <button
                    aria-current={setupStep === step.id ? "step" : undefined}
                    className={[
                      setupStep === step.id ? "is-active" : "",
                      step.complete ? "is-complete" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    type="button"
                    onClick={() => setSetupStep(step.id)}
                  >
                    <span>{step.complete ? <Check aria-hidden="true" /> : index + 1}</span>
                    <span>
                      <strong>{step.label}</strong>
                      <small>{step.detail}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>

          {setupStep === "game" && (
            <GameSettingsPanel
              game={game}
              boardsLocked={boardsLocked}
              browseTemplatesHref={getPathWithGameCode("/host/templates", game.code)}
              hasExistingSetup={
                tasks.length > 1 || groups.length > 0 || boardAssignments.length > 0
              }
              onConfigure={configure}
              onNext={() => setSetupStep(game.playMode === "teams" ? "teams" : "boards")}
            />
          )}

          {setupStep === "teams" && (
            <section className="host-step-panel" aria-labelledby="setup-teams-heading">
              <div className="host-step-heading">
                <div>
                  <p className="label">Step 2</p>
                  <h2 id="setup-teams-heading">Name your teams</h2>
                  <p>Add or rename teams now. Players will choose from this list.</p>
                </div>
                <span>{groups.length === 1 ? "1 team" : `${groups.length} teams`}</span>
              </div>
              <TeamManagementPanel
                isAddingGroup={isAddingGroup}
                groups={groups}
                kickingMembershipId={kickingMembershipId}
                memberships={memberships}
                onAddGroup={addGroup}
                movingMembershipId={movingMembershipId}
                onKickPlayer={kickPlayer}
                onMovePlayer={movePlayer}
                onPromotePlayer={promotePlayer}
                onRemoveCohost={removeCohost}
                onTransferHost={transferHost}
                onRemoveGroup={removeGroup}
                onUpdateGroup={updateGroup}
                currentHost={hostMembership}
                playMode={game.playMode}
                showHeading={false}
                submissions={submissions}
              />
              <div className="host-step-actions">
                <button
                  className="primary-action"
                  type="button"
                  onClick={() => setSetupStep("boards")}
                >
                  Next: make the boards
                </button>
              </div>
            </section>
          )}

          {setupStep === "boards" && (
            <section className="host-step-panel" aria-labelledby="setup-boards-heading">
              <div className="host-step-heading">
                <div>
                  <p className="label">Step 3</p>
                  <h2 id="setup-boards-heading">Make the boards</h2>
                  <p>Choose tasks from the catalog, make any edits, then shuffle the boards.</p>
                </div>
                <span>{boardsReady ? "Ready" : "In progress"}</span>
              </div>
              <BoardEditor
                boardAssignments={boardAssignments}
                boardSize={game.boardSize}
                boardMode={game.boardMode}
                boardsLocked={boardsLocked}
                boardsNeedShuffle={game.boardsNeedShuffle}
                freeSpace={game.freeSpace}
                groups={boardOwners}
                onAddCatalogTask={addCatalogTask}
                onAddTask={addTask}
                onGenerateBoards={generateBoards}
                onRemoveTask={removeTask}
                onResetCatalogTask={resetCatalogTask}
                onSaveGroupBoard={saveGroupBoard}
                onUpdateBoardSetup={updateBoardSetup}
                onUpdateTask={updateTask}
                openByDefault
                playMode={game.playMode}
                showHeading={false}
                submissions={submissions}
                tasks={tasks}
              />
              <div className="host-step-actions">
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => setSetupStep(game.playMode === "teams" ? "teams" : "game")}
                >
                  Back
                </button>
                <button
                  className="primary-action"
                  type="button"
                  onClick={() => setSetupStep("route")}
                >
                  {game.timerMode === "schedule" ? "Next: plan the route" : "Next: confirm timing"}
                </button>
              </div>
            </section>
          )}

          {setupStep === "route" && (
            <section className="host-step-panel" aria-labelledby="setup-route-heading">
              <div className="host-step-heading">
                <div>
                  <p className="label">Step 4</p>
                  <h2 id="setup-route-heading">
                    {game.timerMode === "schedule" ? "Plan the route" : "Ready for players"}
                  </h2>
                  <p>
                    {game.timerMode === "schedule"
                      ? "Set each stop and its timing. You can still edit this later."
                      : game.timerMode === "duration"
                        ? `The game will run for ${game.timerDurationMinutes} minutes.`
                        : "This game has no countdown. The host decides when it ends."}
                  </p>
                </div>
                <span>
                  {game.timerMode === "none"
                    ? "No timer"
                    : game.timerMode === "duration"
                      ? `${game.timerDurationMinutes} minutes`
                      : stops.length === 1
                        ? "1 stop"
                        : `${stops.length} stops`}
                </span>
              </div>
              {game.timerMode === "schedule" && <div className="stop-editor-list">
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
                  </Fragment>
                ))}
              </div>}
              {game.timerMode === "schedule" && <button className="add-stop-button" type="button" onClick={addStop}>
                <Plus aria-hidden="true" />
                Add stop
              </button>}
              <div className="host-step-actions">
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => setSetupStep("boards")}
                >
                  Back
                </button>
                <button
                  className="primary-action"
                  type="button"
                  disabled={!boardsReady || (game.playMode === "teams" && groups.length === 0) || (game.timerMode === "schedule" && stops.length === 0)}
                  onClick={() => {
                    updateRoom({ lobbyOpen: true });
                    setHostArea("lobby");
                  }}
                >
                  <Users aria-hidden="true" />
                  Open the join screen
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {hostArea === "run" && (
        <>
          <section className="host-command-deck" aria-labelledby="run-heading">
            <div className="host-command-summary">
              <div>
                <p className="label">Hunt control</p>
                <h2 id="run-heading">{routeDisplay.title}</h2>
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
            </div>
            <div className="host-command-actions">
              {game.phase === "review" ? (
                <button
                  className="primary-action"
                  type="button"
                  onClick={startGame}
                >
                  <Play aria-hidden="true" />
                  Resume game
                </button>
              ) : game.timerMode === "schedule" ? (
                <button
                  className="primary-action"
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
                      : "Start play time"}
                </button>
              ) : null}
              {game.phase !== "review" && game.timerMode !== "none" && (
                <button className="control-button" type="button" onClick={addFiveMinutes}>
                  <Clock aria-hidden="true" />
                  Add 5 min
                </button>
              )}
              {game.phase !== "review" && game.timerMode === "duration" && (
                <button className="control-button" type="button" onClick={toggleDurationTimer}>
                  {game.timerRunning ? <Clock aria-hidden="true" /> : <Play aria-hidden="true" />}
                  {game.timerRunning ? "Pause timer" : "Resume timer"}
                </button>
              )}
              <button
                aria-pressed={!game.boardHidden}
                className="control-button"
                type="button"
                onClick={() => setBoardHidden(!game.boardHidden)}
              >
                {game.boardHidden ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
                {game.boardHidden ? "Show board" : "Hide board"}
              </button>
              {game.phase !== "review" && (
                <button
                  className="control-button end-hunt-action"
                  type="button"
                  onClick={() => setHuntPhase("review")}
                >
                  <Check aria-hidden="true" />
                  End hunt
                </button>
              )}
            </div>
          </section>

          <section className="host-groups" aria-labelledby="teams-heading">
            <div className="section-heading">
              <div>
                <p className="label">Live progress</p>
                <h2 id="teams-heading">Check in on teams</h2>
              </div>
              <span>{pendingCount} submitted</span>
            </div>
            <div className="team-cards">
              {scoreGroups.map((group) => (
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
            <>
              <HostLiveBoard
                boardSize={game.boardSize}
                group={selectedGroup}
                onClose={() => setSelectedHostGroupId("")}
                setSubmissionStatus={setSubmissionStatus}
                submissions={submissions}
                tasks={getGroupBoardTasks(selectedGroup.id, tasks, boardAssignments)}
              />
              {game.phase === "review" && (
                <PlayerSlidesExport
                  audience="host"
                  game={game}
                  group={selectedGroup}
                  roster={memberships}
                  submissions={submissions}
                  tasks={getGroupBoardTasks(
                    selectedGroup.id,
                    tasks,
                    boardAssignments,
                  )}
                />
              )}
            </>
          )}

          <section aria-labelledby="submission-heading">
            <div className="section-heading">
              <div>
                <p className="label">Photos</p>
                <h2 id="submission-heading">Review submissions</h2>
              </div>
              <span>{game.phase === "review" ? "Review mode" : "Newest first"}</span>
            </div>
            <ProofList
              groups={scoreGroups}
              huntPhase={game.phase}
              setSubmissionStatus={setSubmissionStatus}
              submissions={submissions}
              tasks={tasks}
            />
          </section>
        </>
      )}

      {hostArea === "manage" && (
        <section className="host-manage-panel" aria-labelledby="manage-heading">
          <div>
            <p className="label">Less-frequent controls</p>
            <h2 id="manage-heading">Edit or reset the hunt</h2>
            <p>Return to any setup step to adjust the teams, boards, or route.</p>
          </div>
          <div className="room-management-grid">
            <PlayerInviteCard gameCode={game.code} />
            <div className="room-management-card">
              <p className="label">Lobby</p>
              <label className="task-free-toggle"><input checked={game.lobbyOpen} type="checkbox" onChange={(event) => updateRoom({ lobbyOpen: event.target.checked })} />Allow new players to join</label>
              {game.playMode === "teams" && <label className="task-free-toggle"><input checked={game.teamsLocked} type="checkbox" onChange={(event) => updateRoom({ teamsLocked: event.target.checked })} />Assign new players to balanced teams</label>}
              {expiresAt && <small>Room expires {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(expiresAt))}</small>}
            </div>
            <div className="room-management-card">
              <p className="label">Player presentations</p>
              {game.playerExportMode === "team-after-review" ? (
                <>
                  <label className="task-free-toggle player-export-toggle">
                    <input
                      checked
                      type="checkbox"
                      onChange={(event) => {
                        if (!event.target.checked) {
                          updateRoom({ playerExportMode: "host-only" });
                        }
                      }}
                    />
                    Let players export their own team after the hunt
                  </label>
                  <small>
                    You can turn this off now, but copies already created cannot be
                    recalled or deleted from here.
                  </small>
                </>
              ) : (
                <small>
                  Off. Player copies can be authorized only in Game setup before
                  play begins. Hosts can still export a selected team in review.
                </small>
              )}
            </div>
          </div>
          <TeamManagementPanel
            currentHost={hostMembership}
            groups={groups}
            isAddingGroup={isAddingGroup}
            kickingMembershipId={kickingMembershipId}
            memberships={memberships}
            movingMembershipId={movingMembershipId}
            onAddGroup={addGroup}
            onKickPlayer={kickPlayer}
            onMovePlayer={movePlayer}
            onPromotePlayer={promotePlayer}
            onRemoveCohost={removeCohost}
            onRemoveGroup={removeGroup}
            onTransferHost={transferHost}
            onUpdateGroup={updateGroup}
            playMode={game.playMode}
            submissions={submissions}
          />
          <div className="host-manage-links">
            {setupSteps.map((step) => (
              <button
                key={step.id}
                className="control-button"
                type="button"
                onClick={() => {
                  setSetupStep(step.id);
                  setHostArea("setup");
                }}
              >
                {step.label}
                <span>{step.detail}</span>
              </button>
            ))}
          </div>
          <div className="host-danger-zone">
            <div>
              <strong>Start over or close the room</strong>
              <span>These actions affect the whole hunt and cannot be undone.</span>
            </div>
            <div>
              <button className="control-button danger" type="button" onClick={resetGameProofs}>
                <Trash2 aria-hidden="true" />
                Reset game
              </button>
              <button
                className="control-button danger is-critical"
                disabled={!hostMembership.isOwner}
                title={hostMembership.isOwner ? undefined : "Only the primary host can abandon the room"}
                type="button"
                onClick={abandonGame}
              >
                <X aria-hidden="true" />
                Abandon game
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function HostLobbyScreen({
  canStart,
  game,
  groups,
  isConfigured,
  memberships,
  onOpenRun,
  onOpenSetup,
  onStartGame,
  onToggleLobby,
}: {
  canStart: boolean;
  game: Game;
  groups: Group[];
  isConfigured: boolean;
  memberships: Membership[];
  onOpenRun: () => void;
  onOpenSetup: () => void;
  onStartGame: () => void;
  onToggleLobby: (lobbyOpen: boolean) => void;
}) {
  const players = memberships.filter((item) => item.role === "player");
  const playerUrl = getPlayerJoinUrl(game.code);

  return (
    <section className="host-lobby-screen" aria-labelledby="host-lobby-title">
      <div className="host-lobby-join-panel">
        <div className="host-lobby-heading">
          <h2 id="host-lobby-title">Join the game</h2>
          <p>Scan the QR code or enter the room code on your phone.</p>
        </div>

        <div className="host-lobby-join-grid">
          <JoinQrCode gameCode={game.code} size={280} />
          <div className="host-lobby-code-block">
            <span>Room code</span>
            <strong>{game.code}</strong>
            <small>{window.location.host}</small>
            <button
              className="host-lobby-copy"
              type="button"
              onClick={() => void navigator.clipboard.writeText(playerUrl)}
            >
              Copy join link
            </button>
          </div>
        </div>
      </div>

      <div className="host-lobby-roster-panel">
        <div className="host-lobby-roster-heading">
          <div>
            <h3>{players.length === 0 ? "Waiting for players" : `${players.length} ${players.length === 1 ? "player" : "players"} joined`}</h3>
            <p>Names appear here automatically as people join.</p>
          </div>
          <span className={game.lobbyOpen ? "lobby-status is-open" : "lobby-status"}>
            {game.lobbyOpen ? "Lobby open" : "Lobby closed"}
          </span>
        </div>

        {players.length > 0 ? (
          <div className="host-lobby-player-grid" aria-live="polite">
            {players.map((player, index) => {
              const group = groups.find((item) => item.id === player.groupId) ?? null;
              return (
                <div
                  className="host-lobby-player"
                  key={player.id}
                  style={{
                    "--group-color": group?.color ?? createPlayerGroup(player, index).color,
                    "--join-index": index,
                  } as React.CSSProperties}
                >
                  <span aria-hidden="true">{player.displayName.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <strong>{player.displayName}</strong>
                    {group && <small>{group.shortName}</small>}
                  </div>
                  <Check aria-label="Joined" />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="host-lobby-empty">
            <Users aria-hidden="true" />
            <strong>No one has joined yet</strong>
            <span>Keep this screen visible while everyone checks in.</span>
          </div>
        )}

        <div className="host-lobby-actions">
          <button className="secondary-action" type="button" onClick={() => onToggleLobby(!game.lobbyOpen)}>
            {game.lobbyOpen ? <Lock aria-hidden="true" /> : <Users aria-hidden="true" />}
            {game.lobbyOpen ? "Close lobby" : "Open lobby"}
          </button>
          {game.setupComplete ? (
            <button className="primary-action" type="button" onClick={onOpenRun}>
              <Play aria-hidden="true" />
              Open game controls
            </button>
          ) : canStart ? (
            <button className="primary-action" type="button" onClick={onStartGame}>
              <Play aria-hidden="true" />
              Start game
            </button>
          ) : isConfigured ? (
            <button className="primary-action" disabled type="button">
              Waiting for players
            </button>
          ) : (
            <button className="primary-action" type="button" onClick={onOpenSetup}>
              Continue setup
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function JoinQrCode({ gameCode, size }: { gameCode: string; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerUrl = getPlayerJoinUrl(gameCode);

  useEffect(() => {
    if (!canvasRef.current) return;
    void toCanvas(canvasRef.current, playerUrl, {
      width: size,
      margin: 1,
      color: { dark: "#15171c", light: "#ffffff" },
    });
  }, [playerUrl, size]);

  return <canvas className="join-qr-code" ref={canvasRef} aria-label={`QR code to join room ${gameCode}`} />;
}

function PlayerInviteCard({ gameCode }: { gameCode: string }) {
  const playerUrl = getPlayerJoinUrl(gameCode);

  return (
    <div className="room-management-card invite-card">
      <div>
        <p className="label">Invite players</p>
        <strong>Room {gameCode}</strong>
        <span>{playerUrl}</span>
        <button className="secondary-action" type="button" onClick={() => void navigator.clipboard.writeText(playerUrl)}>Copy player link</button>
      </div>
      <JoinQrCode gameCode={gameCode} size={148} />
    </div>
  );
}

export function GameSettingsPanel({
  game,
  boardsLocked,
  browseTemplatesHref,
  hasExistingSetup,
  onConfigure,
  onNext,
}: {
  game: Game;
  boardsLocked: boolean;
  browseTemplatesHref: string;
  hasExistingSetup: boolean;
  onConfigure: (
    template?: GameKitId,
    config?: Parameters<typeof configureGame>[0]["config"],
    startTime?: string,
  ) => Promise<boolean>;
  onNext: () => void;
}) {
  const [draft, setDraft] = useState({
    name: game.name,
    playMode: game.playMode,
    winCondition: game.winCondition,
    proofMode: game.proofMode,
    approvalMode: game.approvalMode,
    playerExportMode: game.playerExportMode ?? "host-only",
    timerMode: game.timerMode,
    timerDurationMinutes: game.timerDurationMinutes,
  });
  const [startTime, setStartTime] = useState("10:00 AM");
  const [isSaving, setIsSaving] = useState(false);
  const [applyingTemplateId, setApplyingTemplateId] = useState<GameKit["id"] | null>(null);
  const [photoApprovalAcknowledged, setPhotoApprovalAcknowledged] = useState(false);
  const [playerExportApprovalAcknowledged, setPlayerExportApprovalAcknowledged] =
    useState(false);

  useEffect(() => {
    setDraft({
      name: game.name,
      playMode: game.playMode,
      winCondition: game.winCondition,
      proofMode: game.proofMode,
      approvalMode: game.approvalMode,
      playerExportMode: game.playerExportMode ?? "host-only",
      timerMode: game.timerMode,
      timerDurationMinutes: game.timerDurationMinutes,
    });
    setPhotoApprovalAcknowledged(false);
    setPlayerExportApprovalAcknowledged(false);
  }, [game]);

  async function saveCustom() {
    setIsSaving(true);
    const saved = await onConfigure(undefined, draft);
    setIsSaving(false);
    if (saved) onNext();
  }

  async function applyStarterTemplate(templateId: GameKit["id"]) {
    if (
      hasExistingSetup &&
      !window.confirm(
        "Replace this room’s current rules, teams, tasks, and boards with this template? This cannot be undone.",
      )
    ) {
      return;
    }

    setApplyingTemplateId(templateId);
    const saved = await onConfigure(templateId);
    setApplyingTemplateId(null);
    if (saved) onNext();
  }

  return (
    <section className="host-step-panel game-settings-panel" aria-labelledby="setup-game-heading">
      <div className="host-step-heading">
        <div>
          <p className="label">Step 1</p>
          <h2 id="setup-game-heading">Choose your game</h2>
          <p>Start ready-made in one tap, or build the setup yourself.</p>
        </div>
        <span>{boardsLocked ? "Format locked" : "Flexible setup"}</span>
      </div>

      {boardsLocked || game.setupComplete ? (
        <div className="template-library-entry">
          <div>
            <span aria-hidden="true"><Grid3X3 /></span>
            <div>
              <strong>Ready-made games</strong>
              <p>This room’s setup is already locked in.</p>
            </div>
          </div>
          <span className="template-library-entry-status">Start a new room to change templates</span>
        </div>
      ) : (
        <div className="host-template-starters">
          <div className="host-template-starters-heading">
            <div>
              <p className="label">Fastest setup</p>
              <strong>Start with a ready-made game</strong>
              <span>Rules, tasks, teams, and boards are included. You can edit them next.</span>
            </div>
            <a href={browseTemplatesHref}>See all templates</a>
          </div>
          <div className="host-template-starter-grid">
            {HOST_STARTER_TEMPLATES.map((template) => {
              const Icon = TEMPLATE_ICONS[template.id];
              const isApplying = applyingTemplateId === template.id;
              return (
                <button
                  key={template.id}
                  className="host-template-starter"
                  data-template={template.id}
                  disabled={applyingTemplateId !== null}
                  type="button"
                  onClick={() => void applyStarterTemplate(template.id)}
                >
                  <span className="host-template-starter-icon" aria-hidden="true"><Icon /></span>
                  <span className="host-template-starter-copy">
                    <strong>{template.name}</strong>
                    <small>
                      {template.durationLabel} · {template.playerLabel} · {getTemplateProofLabel(template)}
                    </small>
                  </span>
                  <span className="host-template-starter-action">
                    {isApplying ? "Applying…" : "Use"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="custom-settings-heading">
        <p className="label">Build your own</p>
        <strong>Set every option yourself</strong>
        <span>You can still use the full task catalog when you reach the board step.</span>
      </div>
      <div className="game-settings-grid">
        <label className="field game-name-field"><span>Game name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label className="field"><span>Players</span><select value={draft.playMode} onChange={(event) => setDraft({ ...draft, playMode: event.target.value as Game["playMode"] })}><option value="teams">Teams</option><option value="individual">Free-for-all</option></select></label>
        <label className="field"><span>Winning</span><select value={draft.winCondition} onChange={(event) => setDraft({ ...draft, winCondition: event.target.value as Game["winCondition"] })}><option value="blackout">Blackout — every square</option><option value="bingo">Bingo — one full line</option></select></label>
        <label className="field"><span>Photo proof</span><select value={draft.proofMode} onChange={(event) => { const proofMode = event.target.value as Game["proofMode"]; setDraft({ ...draft, proofMode }); if (proofMode === "none") setPhotoApprovalAcknowledged(false); }}><option value="required">Required</option><option value="optional">Optional</option><option value="none">No photo uploads</option></select><small>{draft.proofMode === "none" ? "A simple choice for any group that does not need pictures. Players complete tasks without uploading images." : "Uploaded photos stay in the temporary room for up to seven days."}</small></label>
        <label className="field"><span>Approval</span><select value={draft.approvalMode} disabled={draft.proofMode === "none"} onChange={(event) => setDraft({ ...draft, approvalMode: event.target.value as Game["approvalMode"] })}><option value="host">Host approves</option><option value="automatic">Automatic</option></select></label>
        <label className="field"><span>Timer</span><select value={draft.timerMode} onChange={(event) => setDraft({ ...draft, timerMode: event.target.value as TimerMode })}><option value="none">No timer</option><option value="duration">Countdown</option><option value="schedule">Scheduled stops</option></select></label>
        {draft.timerMode === "duration" && <label className="field"><span>Minutes</span><input min={1} max={1440} type="number" value={draft.timerDurationMinutes} onChange={(event) => setDraft({ ...draft, timerDurationMinutes: Number(event.target.value) })} /></label>}
        {draft.timerMode === "schedule" && <label className="field"><span>First start time</span><input value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>}
        {draft.proofMode !== "none" && (
          <label className="task-free-toggle photo-approval-toggle">
            <input
              checked={photoApprovalAcknowledged}
              type="checkbox"
              onChange={(event) => setPhotoApprovalAcknowledged(event.target.checked)}
            />
            I have participant approval and any additional approval my group requires
            to collect photos. I will avoid faces, private documents, and exact locations
            unless specifically approved.
          </label>
        )}
        <label className="task-free-toggle player-export-toggle">
          <input
            checked={draft.playerExportMode === "team-after-review"}
            disabled={
              game.setupComplete &&
              draft.playerExportMode !== "team-after-review"
            }
            type="checkbox"
            onChange={(event) => {
              const enabled = event.target.checked;
              setDraft({
                ...draft,
                playerExportMode: enabled ? "team-after-review" : "host-only",
              });
              if (!enabled) setPlayerExportApprovalAcknowledged(false);
            }}
          />
          Let players export their own team after the hunt
        </label>
        {game.setupComplete &&
          draft.playerExportMode !== "team-after-review" && (
          <small className="player-export-locked-note">
            Player presentation sharing cannot be newly enabled after play begins.
          </small>
        )}
        {draft.playerExportMode === "team-after-review" && (
          <label className="task-free-toggle player-export-approval-toggle">
            <input
              checked={playerExportApprovalAcknowledged}
              type="checkbox"
              onChange={(event) =>
                setPlayerExportApprovalAcknowledged(event.target.checked)
              }
            />
            I have approval to let players make and keep separate copies of their
            team’s names, board, proof photos, and photographer credits. I understand
            deleting the room will not delete those copies.
          </label>
        )}
      </div>

      <div className="host-step-actions">
        <button className="primary-action" disabled={isSaving || boardsLocked || !draft.name.trim() || (draft.proofMode !== "none" && !photoApprovalAcknowledged) || (draft.playerExportMode === "team-after-review" && !playerExportApprovalAcknowledged)} type="button" onClick={saveCustom}>
          {isSaving ? "Saving..." : "Save and continue"}
        </button>
      </div>
    </section>
  );
}

function TeamManagementPanel({
  groups,
  isAddingGroup,
  kickingMembershipId,
  memberships,
  movingMembershipId,
  onAddGroup,
  onKickPlayer,
  onMovePlayer,
  onPromotePlayer,
  onRemoveCohost,
  onTransferHost,
  onRemoveGroup,
  onUpdateGroup,
  currentHost,
  playMode,
  showHeading = true,
  submissions,
}: {
  groups: Group[];
  isAddingGroup: boolean;
  kickingMembershipId: string;
  memberships: Membership[];
  movingMembershipId: string;
  onAddGroup: (groupName: string) => Promise<boolean>;
  onKickPlayer: (membershipId: string) => void;
  onMovePlayer: (membershipId: string, groupId: string) => void;
  onPromotePlayer: (membershipId: string) => void;
  onRemoveCohost: (membershipId: string) => void;
  onTransferHost: (membershipId: string) => void;
  onRemoveGroup: (groupId: string) => void;
  onUpdateGroup: (groupId: string, patch: Parameters<typeof updateGroupDetails>[2]) => void;
  currentHost: Membership;
  playMode: Game["playMode"];
  showHeading?: boolean;
  submissions: Submission[];
}) {
  const nextGroupName = `Team ${groups.length + 1}`;
  const [newGroupName, setNewGroupName] = useState("");
  const players = useMemo(
    () => memberships.filter((membership) => membership.role === "player"),
    [memberships],
  );
  const hosts = useMemo(
    () => memberships.filter((membership) => membership.role === "host"),
    [memberships],
  );
  const submissionsByPlayer = useMemo(() => {
    const counts = new Map<string, number>();

    submissions.forEach((submission) => {
      counts.set(submission.submittedBy, (counts.get(submission.submittedBy) ?? 0) + 1);
    });

    return counts;
  }, [submissions]);
  const playersByGroup = useMemo(() => {
    const groupedPlayers = new Map<string, Membership[]>();

    groups.forEach((group) => groupedPlayers.set(group.id, []));
    players.forEach((player) => {
      if (!player.groupId) {
        return;
      }

      groupedPlayers.get(player.groupId)?.push(player);
    });
    groupedPlayers.forEach((groupPlayers) => {
      groupPlayers.sort((first, second) =>
        first.displayName.localeCompare(second.displayName),
      );
    });

    return groupedPlayers;
  }, [groups, players]);

  function handleMove(player: Membership, nextGroupId: string) {
    if (!nextGroupId || nextGroupId === player.groupId) {
      return;
    }

    const proofCount = submissionsByPlayer.get(player.id) ?? 0;

    if (
      proofCount > 0 &&
      !window.confirm(
        `${player.displayName} has ${getProofCountLabel(
          proofCount,
        )}. Move them anyway? Existing photos stay with their original team.`,
      )
    ) {
      return;
    }

    onMovePlayer(player.id, nextGroupId);
  }

  function handleKick(player: Membership) {
    const proofCount = submissionsByPlayer.get(player.id) ?? 0;
    const proofNote =
      proofCount > 0
        ? ` This permanently deletes ${getProofCountLabel(proofCount)} and their photos.`
        : " Their saved room identity will be removed.";

    if (
      !window.confirm(
        `Delete ${player.displayName}'s room data?${proofNote}`,
      )
    ) {
      return;
    }

    onKickPlayer(player.id);
  }

  async function handleAddGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const didAddGroup = await onAddGroup(newGroupName.trim() || nextGroupName);

    if (didAddGroup) {
      setNewGroupName("");
    }
  }

  return (
    <section
      className="host-roster"
      aria-label={showHeading ? undefined : "Team setup"}
      aria-labelledby={showHeading ? "roster-heading" : undefined}
    >
      {showHeading && (
        <div className="section-heading">
          <div>
            <p className="label">Players</p>
            <h2 id="roster-heading">
              {playMode === "individual" ? "Player management" : "Team management"}
            </h2>
          </div>
          <span>{players.length === 1 ? "1 player" : `${players.length} players`}</span>
        </div>
      )}

      {playMode === "teams" && <form className="add-team-form" onSubmit={handleAddGroup}>
        <label className="visually-hidden" htmlFor="new-team-name">
          New team name
        </label>
        <input
          id="new-team-name"
          maxLength={40}
          placeholder={nextGroupName}
          value={newGroupName}
          disabled={isAddingGroup}
          onChange={(event) => setNewGroupName(event.target.value)}
        />
        <button
          className="secondary-action add-team-button"
          disabled={isAddingGroup}
          type="submit"
        >
          <Plus aria-hidden="true" />
          {isAddingGroup ? "Adding..." : "Add team"}
        </button>
      </form>}

      {playMode === "teams" && groups.length > 0 && (
        <div className="team-settings-list">
          {groups.map((group, index) => (
            <TeamSettingsRow
              key={group.id}
              group={group}
              canRemove={(playersByGroup.get(group.id)?.length ?? 0) === 0 && !submissions.some((item) => item.groupId === group.id)}
              canMoveDown={index < groups.length - 1}
              canMoveUp={index > 0}
              onMoveDown={() => onUpdateGroup(group.id, { sortOrder: index + 2 })}
              onMoveUp={() => onUpdateGroup(group.id, { sortOrder: index })}
              onRemove={() => onRemoveGroup(group.id)}
              onUpdate={(patch) => onUpdateGroup(group.id, patch)}
              sortOrder={index + 1}
            />
          ))}
        </div>
      )}

      {players.length > 0 && playMode === "teams" ? (
        <div className="roster-grid">
          {groups.map((group) => {
            const groupPlayers = playersByGroup.get(group.id) ?? [];

            return (
              <article
                className="team-roster"
                key={group.id}
                style={{ "--group-color": group.color } as React.CSSProperties}
              >
                <div className="team-roster-header">
                  <span>
                    <Users aria-hidden="true" />
                    <strong>{group.shortName}</strong>
                  </span>
                  <span>{groupPlayers.length}</span>
                </div>

                {groupPlayers.length > 0 ? (
                  <ul className="roster-list">
                    {groupPlayers.map((player) => {
                      const proofCount = submissionsByPlayer.get(player.id) ?? 0;
                      const isMoving = movingMembershipId === player.id;
                      const isKicking = kickingMembershipId === player.id;
                      const hasRosterAction =
                        movingMembershipId.length > 0 ||
                        kickingMembershipId.length > 0;

                      return (
                        <li className="roster-member" key={player.id}>
                          <span className="roster-member-main">
                            <strong>{player.displayName}</strong>
                            <span>
                              {isKicking
                                ? "Deleting..."
                                : isMoving
                                  ? "Moving..."
                                  : getProofCountLabel(proofCount)}
                            </span>
                          </span>
                          <span className="roster-member-actions">
                            <select
                              aria-label={`Move ${player.displayName} to another team`}
                              disabled={hasRosterAction}
                              value={player.groupId ?? ""}
                              onChange={(event) => handleMove(player, event.target.value)}
                            >
                              {groups.map((targetGroup) => (
                                <option key={targetGroup.id} value={targetGroup.id}>
                                  {targetGroup.shortName}
                                </option>
                              ))}
                            </select>
                            <button
                              aria-label={`Delete ${player.displayName}'s room data`}
                              className="roster-kick-button"
                              disabled={hasRosterAction}
                              type="button"
                              onClick={() => handleKick(player)}
                            >
                              <UserMinus aria-hidden="true" />
                              <span>Delete data</span>
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="roster-empty">No players</p>
                )}
              </article>
            );
          })}
        </div>
      ) : playMode === "teams" ? (
        <div className="empty-state roster-empty-state">
          <Users aria-hidden="true" />
          <strong>No players yet</strong>
          <p>Joined players will appear here.</p>
        </div>
      ) : (
        <div className="individual-roster-list">
          {players.length === 0 ? (
            <div className="empty-state roster-empty-state"><Users aria-hidden="true" /><strong>No players yet</strong><p>Share the room link so players can join.</p></div>
          ) : players.map((player) => (
            <div className="roster-member" key={player.id}>
              <span className="roster-member-main"><strong>{player.displayName}</strong><span>{getProofCountLabel(submissionsByPlayer.get(player.id) ?? 0)}</span></span>
              <span className="roster-member-actions">
                <button className="secondary-action" type="button" onClick={() => onPromotePlayer(player.id)}>Make co-host</button>
                <button className="roster-kick-button" type="button" onClick={() => handleKick(player)}><UserMinus aria-hidden="true" />Delete data</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {hosts.length > 0 && (
        <div className="host-roster-crew" aria-label="Hosts">
          <p className="label">Hosts</p>
          <div>
            {hosts.map((host) => (
              <span className="host-chip" key={host.id}>
                {host.displayName}{host.isOwner ? " · owner" : " · co-host"}
                {currentHost.isOwner && !host.isOwner && (
                  <span className="host-chip-actions">
                    <button type="button" onClick={() => onTransferHost(host.id)}>Transfer</button>
                    <button type="button" onClick={() => onRemoveCohost(host.id)}>Remove</button>
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {playMode === "teams" && players.length > 0 && (
        <div className="host-roster-crew" aria-label="Player host controls">
          <p className="label">Add a co-host</p>
          <div>{players.map((player) => <button className="host-chip" key={player.id} type="button" onClick={() => onPromotePlayer(player.id)}>+ {player.displayName}</button>)}</div>
        </div>
      )}
    </section>
  );
}

function TeamSettingsRow({
  group,
  canRemove,
  canMoveDown,
  canMoveUp,
  onMoveDown,
  onMoveUp,
  onRemove,
  onUpdate,
  sortOrder,
}: {
  group: Group;
  canRemove: boolean;
  canMoveDown: boolean;
  canMoveUp: boolean;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onRemove: () => void;
  onUpdate: (patch: Parameters<typeof updateGroupDetails>[2]) => void;
  sortOrder: number;
}) {
  const [name, setName] = useState(group.name);
  const [colorKey, setColorKey] = useState(
    () => /--group-([a-z]+)/.exec(group.color)?.[1] ?? "purple",
  );

  useEffect(() => setName(group.name), [group.name]);

  return (
    <div className="team-settings-row" style={{ "--group-color": group.color } as React.CSSProperties}>
      <span className="waiting-team-mark" aria-hidden="true" />
      <label className="field"><span>Team name</span><input maxLength={40} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="field"><span>Color</span><select value={colorKey} onChange={(event) => setColorKey(event.target.value)}><option value="purple">Purple</option><option value="maroon">Maroon</option><option value="orange">Orange</option><option value="blue">Blue</option><option value="green">Green</option><option value="teal">Teal</option><option value="pink">Pink</option><option value="gold">Gold</option></select></label>
      <button className="secondary-action" disabled={!name.trim()} type="button" onClick={() => onUpdate({ name: name.trim(), colorKey, sortOrder })}>Save</button>
      <span className="team-order-actions"><button disabled={!canMoveUp} type="button" onClick={onMoveUp}>Up</button><button disabled={!canMoveDown} type="button" onClick={onMoveDown}>Down</button></span>
      <button aria-label={`Remove ${group.name}`} className="roster-kick-button" disabled={!canRemove} type="button" onClick={onRemove}><Trash2 aria-hidden="true" /></button>
    </div>
  );
}

export function BoardEditor({
  boardAssignments,
  boardMode,
  boardSize,
  boardsLocked,
  boardsNeedShuffle,
  freeSpace,
  groups,
  onAddCatalogTask,
  onAddTask,
  onGenerateBoards,
  onRemoveTask,
  onResetCatalogTask,
  onSaveGroupBoard,
  onUpdateBoardSetup,
  onUpdateTask,
  openByDefault = false,
  playMode,
  showHeading = true,
  submissions,
  tasks,
}: {
  boardAssignments: BoardAssignment[];
  boardMode: Game["boardMode"];
  boardSize: BoardSize;
  boardsLocked: boolean;
  boardsNeedShuffle: boolean;
  freeSpace: boolean;
  groups: Group[];
  onAddCatalogTask: (catalogTaskId: string) => void;
  onAddTask: (task: { title?: string; description?: string; icon?: string }) => void;
  onGenerateBoards: () => void;
  onRemoveTask: (taskId: string) => void;
  onResetCatalogTask: (taskId: string) => void;
  onSaveGroupBoard: (groupId: string, taskIds: string[]) => void;
  onUpdateBoardSetup: (
    setup: Pick<Game, "boardSize" | "boardMode" | "freeSpace">,
  ) => void;
  onUpdateTask: (
    taskId: string,
    patch: Partial<Pick<Task, "title" | "description" | "icon">>,
  ) => void;
  openByDefault?: boolean;
  playMode: Game["playMode"];
  showHeading?: boolean;
  submissions: Submission[];
  tasks: Task[];
}) {
  const [isCollapsed, setIsCollapsed] = useState(!openByDefault);
  const [taskSearch, setTaskSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CatalogCategory | "All">("All");
  const [visibleCatalogCount, setVisibleCatalogCount] = useState(30);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id ?? "");
  const sortedTasks = useMemo(
    () => getSortedTasks(tasks.filter((task) => !task.free)),
    [tasks],
  );
  const visibleCatalogTasks = useMemo(
    () =>
      searchTaskCatalog({
        category: selectedCategory,
        query: taskSearch,
      }),
    [selectedCategory, taskSearch],
  );
  const visibleCatalogPage = visibleCatalogTasks.slice(0, visibleCatalogCount);
  const requiredTaskCount = getRequiredPlayableTaskCount(boardSize, freeSpace);
  const selectedTaskCount = sortedTasks.length;
  const selectedCapacity =
    boardMode === "shared"
      ? requiredTaskCount
      : groups.length > 0
        ? requiredTaskCount * groups.length
        : requiredTaskCount;
  const nextShuffleUseCount = Math.min(selectedTaskCount, selectedCapacity);
  const canAddMore =
    !boardsLocked &&
    selectedTaskCount < (boardMode === "shared" ? requiredTaskCount : 100);
  const hasEnoughTasks = selectedTaskCount >= requiredTaskCount;
  const canShuffle =
    !boardsLocked &&
    hasEnoughTasks &&
    (playMode === "individual" || groups.length > 0);
  const progressValue = Math.min(1, selectedTaskCount / requiredTaskCount);
  const selectedTaskIds = new Set(sortedTasks.map((task) => task.id));
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
    setVisibleCatalogCount(30);
  }, [selectedCategory, taskSearch]);

  useEffect(() => {
    if (groups.length > 0 && !groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ?? groups[0] ?? null;

  function saveBoardSetup(
    patch: Partial<Pick<Game, "boardSize" | "boardMode" | "freeSpace">>,
  ) {
    const nextBoardSize = patch.boardSize ?? boardSize;
    onUpdateBoardSetup({
      boardSize: nextBoardSize,
      boardMode: patch.boardMode ?? boardMode,
      freeSpace:
        nextBoardSize % 2 === 1 ? patch.freeSpace ?? freeSpace : false,
    });
  }

  return (
    <section
      className={isCollapsed ? "host-board-editor is-collapsed" : "host-board-editor"}
      aria-label={showHeading ? undefined : "Board editor"}
      aria-labelledby={showHeading ? "board-editor-heading" : undefined}
    >
      {showHeading && (
        <div className="section-heading">
          <div>
            <p className="label">Board editor</p>
            <h2 id="board-editor-heading">Task pool and group boards</h2>
          </div>
          <div className="board-editor-heading-actions">
            <span>
              {boardsLocked ? "Assignments locked" : `${selectedTaskCount} selected tasks`}
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
      )}

      {!isCollapsed && (
        <div id="board-editor-body" className="board-editor-body">
          {boardsLocked && (
            <p className="editor-warning">
              Board assignments lock after the first proof arrives. Task wording can
              still be edited.
            </p>
          )}

          <div className="board-builder-setup" aria-label="Board setup">
            <strong>Board setup</strong>
            <fieldset>
              <legend>Board size</legend>
              <div className="board-choice-group">
                {([3, 4, 5] as const).map((size) => (
                  <button
                    key={size}
                    aria-pressed={boardSize === size}
                    className={boardSize === size ? "is-active" : ""}
                    disabled={boardsLocked}
                    type="button"
                    onClick={() => saveBoardSetup({ boardSize: size })}
                  >
                    {size}×{size}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Boards</legend>
              <div className="board-choice-group board-mode-choices">
                <button
                  aria-pressed={boardMode === "shared"}
                  className={boardMode === "shared" ? "is-active" : ""}
                  disabled={boardsLocked}
                  type="button"
                  onClick={() => saveBoardSetup({ boardMode: "shared" })}
                >
                  Same for everyone
                </button>
                <button
                  aria-pressed={boardMode === "randomized"}
                  className={boardMode === "randomized" ? "is-active" : ""}
                  disabled={boardsLocked}
                  type="button"
                  onClick={() => saveBoardSetup({ boardMode: "randomized" })}
                >
                  Different for each
                </button>
              </div>
            </fieldset>
            <label className={boardSize % 2 === 0 ? "board-free-choice is-disabled" : "board-free-choice"}>
              <span>Free center square</span>
              <input
                checked={boardSize % 2 === 1 && freeSpace}
                disabled={boardsLocked || boardSize % 2 === 0}
                type="checkbox"
                onChange={(event) => saveBoardSetup({ freeSpace: event.target.checked })}
              />
            </label>
          </div>

          <div className="board-builder-progress" aria-live="polite">
            <div>
              <strong>
                {selectedTaskCount} selected · {requiredTaskCount} minimum
              </strong>
              <span>
                {hasEnoughTasks
                  ? boardMode === "shared"
                    ? `${requiredTaskCount} task squares per board · every selected task will be used.`
                    : `${requiredTaskCount} task squares per board · the next shuffle will use ${nextShuffleUseCount} selected tasks.`
                  : `${requiredTaskCount} task squares per board · add ${requiredTaskCount - selectedTaskCount} more.`}
              </span>
              <span
                aria-hidden="true"
                className="board-builder-progress-track"
              >
                <span style={{ transform: `scaleX(${progressValue})` }} />
              </span>
            </div>
            <p>
              {boardMode === "randomized"
                ? "More selected tasks create less overlap between boards."
                : "Shared boards use the same tasks in the same places."}
            </p>
            <button
              className="primary-action board-shuffle-button"
              disabled={!canShuffle}
              type="button"
              onClick={onGenerateBoards}
            >
              <Shuffle aria-hidden="true" />
              {boardsNeedShuffle ? "Shuffle boards" : "Shuffle again"}
            </button>
          </div>

          <div className="catalog-builder-layout">
            <section className="catalog-task-panel" aria-labelledby="catalog-task-heading">
              <div className="catalog-panel-heading">
                <div>
                  <strong id="catalog-task-heading">Choose tasks</strong>
                  <span>{TASK_CATALOG.length} reviewed ideas</span>
                </div>
                <button
                  className="secondary-action"
                  disabled={boardsLocked || !canAddMore}
                  type="button"
                  onClick={() => setIsCreatingTask((current) => !current)}
                >
                  <Plus aria-hidden="true" />
                  Create custom task
                </button>
              </div>

              {isCreatingTask && (
                <CustomTaskComposer
                  onCancel={() => setIsCreatingTask(false)}
                  onCreate={(task) => {
                    onAddTask(task);
                    setIsCreatingTask(false);
                  }}
                />
              )}

              <label className="catalog-search-field">
                <Search aria-hidden="true" />
                <span className="sr-only">Search task catalog</span>
                <input
                  type="search"
                  value={taskSearch}
                  placeholder={`Search ${TASK_CATALOG.length} tasks`}
                  onChange={(event) => setTaskSearch(event.target.value)}
                />
              </label>

              <div className="catalog-category-filters" aria-label="Filter tasks by category">
                {(["All", ...TASK_CATEGORIES] as const).map((category) => (
                  <button
                    key={category}
                    aria-pressed={selectedCategory === category}
                    className={selectedCategory === category ? "is-active" : ""}
                    type="button"
                    onClick={() => setSelectedCategory(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>

              <div className="catalog-task-list">
                {visibleCatalogPage.map((catalogTask) => (
                  <CatalogTaskRow
                    key={catalogTask.id}
                    canAdd={canAddMore}
                    isAdded={selectedTaskIds.has(catalogTask.id)}
                    onAdd={() => onAddCatalogTask(catalogTask.id)}
                    task={catalogTask}
                  />
                ))}
                {visibleCatalogTasks.length === 0 && (
                  <div className="empty-state catalog-empty-state">
                    <Search aria-hidden="true" />
                    <strong>No matching tasks</strong>
                    <p>Try another search or create a custom task.</p>
                  </div>
                )}
              </div>

              {visibleCatalogCount < visibleCatalogTasks.length && (
                <button
                  className="secondary-action catalog-load-more"
                  type="button"
                  onClick={() => setVisibleCatalogCount((count) => count + 30)}
                >
                  Load more tasks
                </button>
              )}
            </section>

            <aside className="selected-task-panel" aria-labelledby="selected-task-heading">
              <div className="catalog-panel-heading">
                <div>
                  <strong id="selected-task-heading">Selected tasks</strong>
                  <span>{selectedTaskCount} selected</span>
                </div>
              </div>

              <div className="selected-task-list">
                {sortedTasks.map((task) => (
                  <SelectedTaskRow
                    key={task.id}
                    assignedCount={assignedCounts.get(task.id) ?? 0}
                    onRemove={() => onRemoveTask(task.id)}
                    onReset={
                      task.catalogId
                        ? () => onResetCatalogTask(task.id)
                        : undefined
                    }
                    onUpdate={(patch) => onUpdateTask(task.id, patch)}
                    proofCount={proofCounts.get(task.id) ?? 0}
                    task={task}
                  />
                ))}
                {sortedTasks.length === 0 && (
                  <div className="empty-state selected-task-empty">
                    <Grid3X3 aria-hidden="true" />
                    <strong>No tasks selected</strong>
                    <p>Search the catalog and add the tasks you want.</p>
                  </div>
                )}
              </div>

              {boardMode === "randomized" && selectedTaskCount >= 100 && (
                <p className="catalog-limit-note">
                  This room has the maximum 100 selected tasks.
                </p>
              )}

              <details className="fine-tune-boards">
                <summary>
                  <span>
                    <strong>Fine-tune boards</strong>
                    <small>Adjust task placement after shuffling</small>
                  </span>
                  <ChevronDown aria-hidden="true" />
                </summary>
                <div className="fine-tune-board-body">
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
                      boardSize={boardSize}
                      group={selectedGroup}
                      onSave={(taskIds) => onSaveGroupBoard(selectedGroup.id, taskIds)}
                      tasks={getSortedTasks(tasks)}
                    />
                  ) : (
                    <div className="empty-state">
                      <Users aria-hidden="true" />
                      <strong>
                        {playMode === "individual" ? "No players yet" : "No teams yet"}
                      </strong>
                      <p>
                        {playMode === "individual"
                          ? "Player boards will be created as people join."
                          : "Add a team before shuffling boards."}
                      </p>
                    </div>
                  )}
                </div>
              </details>
            </aside>
          </div>

          {!boardsNeedShuffle && hasEnoughTasks && (
            <p className="board-ready-message" role="status">
              <Check aria-hidden="true" />
              Boards are shuffled and ready to review.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function CatalogTaskRow({
  canAdd,
  isAdded,
  onAdd,
  task,
}: {
  canAdd: boolean;
  isAdded: boolean;
  onAdd: () => void;
  task: CatalogTask;
}) {
  const Icon = ICONS[task.icon] ?? Circle;

  return (
    <article className="catalog-task-row">
      <span className="task-pool-icon"><Icon aria-hidden="true" /></span>
      <span>
        <strong>{task.title}</strong>
        <small>{task.description}</small>
      </span>
      <em>{task.category}</em>
      <button
        className={isAdded ? "catalog-added-button" : "secondary-action"}
        disabled={isAdded || !canAdd}
        type="button"
        onClick={onAdd}
      >
        {isAdded ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
        {isAdded ? "Added" : "Add to boards"}
      </button>
    </article>
  );
}

function CustomTaskComposer({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (task: { title: string; description: string; icon: string }) => void;
}) {
  const [draft, setDraft] = useState({
    title: "",
    description: "",
    icon: "Camera",
  });

  return (
    <form
      className="custom-task-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft.title.trim()) return;
        onCreate({
          title: draft.title.trim(),
          description: draft.description.trim(),
          icon: draft.icon,
        });
      }}
    >
      <label className="stop-field">
        <span>Task title</span>
        <input
          autoFocus
          maxLength={80}
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
      </label>
      <label className="stop-field">
        <span>Instructions</span>
        <textarea
          maxLength={300}
          value={draft.description}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
        />
      </label>
      <label className="stop-field">
        <span>Icon</span>
        <select
          value={draft.icon}
          onChange={(event) => setDraft({ ...draft, icon: event.target.value })}
        >
          {TASK_ICON_OPTIONS.map((icon) => (
            <option key={icon} value={icon}>{icon}</option>
          ))}
        </select>
      </label>
      <div>
        <button className="secondary-action" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-action" disabled={!draft.title.trim()} type="submit">
          <Plus aria-hidden="true" />
          Add custom task
        </button>
      </div>
    </form>
  );
}

function SelectedTaskRow({
  assignedCount,
  onRemove,
  onReset,
  onUpdate,
  proofCount,
  task,
}: {
  assignedCount: number;
  onRemove: () => void;
  onReset?: () => void;
  onUpdate: (
    patch: Partial<Pick<Task, "title" | "description" | "icon">>,
  ) => void;
  proofCount: number;
  task: Task;
}) {
  const [draft, setDraft] = useState({
    title: task.title,
    description: task.description,
    icon: task.icon,
  });
  const Icon = ICONS[draft.icon] ?? Circle;
  const catalogTask = task.catalogId ? getCatalogTask(task.catalogId) : null;
  const isEdited = Boolean(
    catalogTask &&
      (catalogTask.title !== task.title ||
        catalogTask.description !== task.description ||
        catalogTask.icon !== task.icon),
  );
  const hasChanges =
    draft.title !== task.title ||
    draft.description !== task.description ||
    draft.icon !== task.icon;

  useEffect(() => {
    setDraft({
      title: task.title,
      description: task.description,
      icon: task.icon,
    });
  }, [task]);

  return (
    <details className="selected-task-row">
      <summary>
        <span className="task-pool-icon"><Icon aria-hidden="true" /></span>
        <span>
          <strong>
            {task.title}
            {isEdited && <em>Edited</em>}
          </strong>
          <small>{catalogTask?.category ?? "Custom"}</small>
        </span>
        <span className="selected-task-summary-actions">
          <span>Edit</span>
          <ChevronDown aria-hidden="true" />
        </span>
      </summary>

      <div className="selected-task-edit-fields">
        <label className="stop-field">
          <span>Title</span>
          <input
            maxLength={80}
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </label>
        <label className="stop-field">
          <span>Instructions</span>
          <textarea
            maxLength={300}
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </label>
        <label className="stop-field">
          <span>Icon</span>
          <select
            value={draft.icon}
            onChange={(event) => setDraft({ ...draft, icon: event.target.value })}
          >
            {TASK_ICON_OPTIONS.map((icon) => (
              <option key={icon} value={icon}>{icon}</option>
            ))}
          </select>
        </label>
        <div className="selected-task-edit-actions">
          <span>
            {assignedCount} board{assignedCount === 1 ? "" : "s"}
            {proofCount > 0 ? ` · ${proofCount} proofs` : ""}
          </span>
          <div>
            {isEdited && onReset && (
              <button className="secondary-action" type="button" onClick={onReset}>
                <TimerReset aria-hidden="true" />
                Reset
              </button>
            )}
            <button
              aria-label={`Remove ${task.title}`}
              className="secondary-action remove-stop-button"
              disabled={proofCount > 0}
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
    </details>
  );
}

function GroupBoardSlotEditor({
  assignments,
  boardSize,
  boardsLocked,
  group,
  onSave,
  tasks,
}: {
  assignments: BoardAssignment[];
  boardSize: BoardSize;
  boardsLocked: boolean;
  group: Group;
  onSave: (taskIds: string[]) => void;
  tasks: Task[];
}) {
  const boardTaskIds = useMemo(
    () => getGroupBoardSlotTaskIds(group.id, tasks, assignments, boardSize),
    [assignments, boardSize, group.id, tasks],
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
          {selectedTaskIds.length} of {getBoardSlotCount(boardSize)} slots filled
        </span>
      </div>

      <div className="board-slot-grid" style={{ "--board-size": boardSize } as React.CSSProperties}>
        {Array.from({ length: getBoardSlotCount(boardSize) }, (_, index) => {
          const slotNumber = index + 1;
          const selectedTaskId = draftTaskIds[index] ?? "";
          const isCenterSlot = slotNumber === getBoardCenterSlot(boardSize);

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
  boardSize,
  groupId,
  onTaskSelect,
  pendingProofTaskIds,
  selectedTaskId,
  submissions,
  taskPanelId,
  tasks,
}: {
  boardSize: BoardSize;
  groupId: string;
  onTaskSelect: (taskId: string, trigger: HTMLButtonElement) => void;
  pendingProofTaskIds: Set<string>;
  selectedTaskId: string;
  submissions: Submission[];
  taskPanelId: string;
  tasks: Task[];
}) {
  return (
    <div
      className="blackout-board"
      role="group"
      aria-label="Game board"
      style={{ "--board-size": boardSize } as React.CSSProperties}
    >
      {tasks.map((task) => (
        <TaskTile
          key={task.id}
          groupId={groupId}
          hasPendingProof={pendingProofTaskIds.has(task.id)}
          isSelected={task.id === selectedTaskId}
          onTaskSelect={onTaskSelect}
          submissions={submissions}
          taskPanelId={taskPanelId}
          task={task}
        />
      ))}
    </div>
  );
}

function TaskTile({
  groupId,
  hasPendingProof,
  isSelected,
  onTaskSelect,
  submissions,
  taskPanelId,
  task,
}: {
  groupId: string;
  hasPendingProof?: boolean;
  isSelected?: boolean;
  onTaskSelect?: (taskId: string, trigger: HTMLButtonElement) => void;
  submissions: Submission[];
  taskPanelId?: string;
  task: Task;
}) {
  const status = getTaskStatus(task, groupId, submissions);
  const Icon = ICONS[task.icon] ?? Circle;
  const compactTitle = getBoardTileTitle(task);
  const showSavedState = status === "ready" && hasPendingProof;
  const stateLabel = showSavedState ? "Saved to retry" : getStatusLabel(status);

  return (
    <button
      className={[
        "task-tile",
        isSelected ? "is-selected" : "",
        status !== "ready" ? `is-${status}` : "",
        showSavedState ? "is-saved" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={!onTaskSelect}
      aria-controls={taskPanelId && isSelected ? taskPanelId : undefined}
      aria-expanded={taskPanelId ? Boolean(isSelected) : undefined}
      aria-label={`${task.title}. ${task.description}. Status: ${stateLabel}`}
      aria-pressed={typeof isSelected === "boolean" ? isSelected : undefined}
      title={task.title}
      type="button"
      onClick={(event) => onTaskSelect?.(task.id, event.currentTarget)}
    >
      <Icon className="task-icon" aria-hidden="true" />
      <span className="task-title" aria-hidden="true">
        {compactTitle}
      </span>
      {(status !== "ready" || showSavedState) && (
        <span
          key={showSavedState ? "saved" : status}
          className="tile-state"
          aria-hidden="true"
        >
          {status === "approved" ? (
            <Check aria-hidden="true" />
          ) : showSavedState ? (
            <Upload aria-hidden="true" />
          ) : (
            <Send aria-hidden="true" />
          )}
        </span>
      )}
    </button>
  );
}

function TaskList({
  groupId,
  onTaskSelect,
  pendingProofTaskIds,
  selectedTaskId,
  submissions,
  taskPanelId,
  tasks,
}: {
  groupId: string;
  onTaskSelect: (taskId: string, trigger: HTMLButtonElement) => void;
  pendingProofTaskIds: Set<string>;
  selectedTaskId: string;
  submissions: Submission[];
  taskPanelId: string;
  tasks: Task[];
}) {
  return (
    <div className="task-list" aria-label="Task list">
      {tasks.map((task) => {
        const status = getTaskStatus(task, groupId, submissions);
        const Icon = ICONS[task.icon] ?? Circle;
        const showSavedState = status === "ready" && pendingProofTaskIds.has(task.id);
        const isSelected = selectedTaskId === task.id;
        const stateLabel = showSavedState ? "Saved to retry" : getStatusLabel(status);

        return (
          <button
            key={task.id}
            className={[
              "task-list-item",
              isSelected ? "is-selected" : "",
              status !== "ready" ? `is-${status}` : "",
              showSavedState ? "is-saved" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-controls={isSelected ? taskPanelId : undefined}
            aria-expanded={isSelected}
            aria-label={`${task.title}. ${task.description}. Status: ${stateLabel}`}
            aria-pressed={isSelected}
            type="button"
            onClick={(event) => onTaskSelect(task.id, event.currentTarget)}
          >
            <span className="task-list-icon">
              <Icon aria-hidden="true" />
            </span>
            <span className="task-list-copy">
              <span className="task-list-top">
                <span className="task-list-title">{task.title}</span>
                <StatusBadge saved={showSavedState} status={status} />
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
  isRetryingProof,
  onDismiss,
  onDiscardPendingProof,
  onRetryPendingProof,
  onSubmitProof,
  onCompleteTask,
  panelId,
  panelRef,
  pendingProof,
  submission,
  task,
  proofMode,
}: {
  groupId: string;
  isUploading: boolean;
  isRetryingProof: boolean;
  onDismiss: () => void;
  onDiscardPendingProof: (proofId: string) => void;
  onRetryPendingProof: (proofId: string) => void;
  onSubmitProof: (taskId: string, file: File) => void;
  onCompleteTask: (taskId: string) => void;
  panelId: string;
  panelRef: React.RefObject<HTMLElement>;
  pendingProof?: PendingProofUpload;
  submission?: Submission;
  task: Task;
  proofMode: Game["proofMode"];
}) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [isReplacingProof, setIsReplacingProof] = useState(false);
  const [pendingProofPreviewUrl, setPendingProofPreviewUrl] = useState("");
  const Icon = ICONS[task.icon] ?? Circle;
  const status = getTaskStatus(task, groupId, submission ? [submission] : []);
  const inputId = `${groupId}-${task.id}`;
  const proofNote = submission && !submission.imagePath
    ? proofMode === "optional"
      ? "Completed without a photo. Add one if you want, or mark it incomplete."
      : "Task completed. Mark it incomplete if you need to undo it."
    : getProofStateNote(status, task.free, isReplacingProof);
  const showPendingProofPanel =
    Boolean(pendingProof) && (!isUploading || Boolean(pendingProof?.lastError));
  const canSubmitProof =
    proofMode !== "none" &&
    !task.free &&
    (status === "ready" || status === "retake" || isReplacingProof);
  const canReplaceProof =
    proofMode !== "none" &&
    !task.free &&
    Boolean(submission) &&
    status !== "retake" &&
    !isReplacingProof;
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

  useEffect(() => {
    if (!pendingProof?.file) {
      setPendingProofPreviewUrl("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(pendingProof.file);
    setPendingProofPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [pendingProof?.file, pendingProof?.id, pendingProof?.updatedAt]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      onSubmitProof(task.id, file);
    }

    event.target.value = "";
  }

  return (
    <section
      ref={panelRef}
      aria-labelledby={`${panelId}-heading`}
      className="selected-task"
      id={panelId}
      tabIndex={-1}
    >
      <button
        aria-label="Close current task"
        className="selected-task-close"
        type="button"
        onClick={onDismiss}
      >
        <X aria-hidden="true" />
      </button>
      <div className="selected-task-main">
        <div className="selected-icon">
          <Icon aria-hidden="true" />
        </div>
        <div>
          <p className="label">Current task</p>
          <h2 id={`${panelId}-heading`}>{task.title}</h2>
          <p>{task.description}</p>
          <StatusBadge status={status} />
        </div>
      </div>

      {submission?.imagePath && (
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

      {pendingProof && showPendingProofPanel && (
        <div className="pending-proof-panel">
          <figure className="proof-preview is-local">
            {pendingProofPreviewUrl ? (
              <img src={pendingProofPreviewUrl} alt="" />
            ) : (
              <span className="proof-preview-fallback">
                <Image aria-hidden="true" />
              </span>
            )}
            <figcaption>
              <strong>Photo ready to retry</strong>
              <span>{pendingProof.fileName}</span>
              <small>
                {pendingProof.lastError
                  ? getPendingProofErrorLabel(pendingProof.lastError)
                  : "Keep this page open until retry succeeds."}
              </small>
            </figcaption>
          </figure>
          <button
            className="primary-action pending-proof-retry"
            disabled={isUploading || isRetryingProof}
            type="button"
            onClick={() => onRetryPendingProof(pendingProof.id)}
          >
            <Upload aria-hidden="true" />
            {isRetryingProof ? "Retrying..." : "Retry upload"}
          </button>
          <button
            className="secondary-action pending-proof-discard"
            disabled={isUploading || isRetryingProof}
            type="button"
            onClick={() => onDiscardPendingProof(pendingProof.id)}
          >
            Discard saved photo
          </button>
        </div>
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
            aria-label={`${primaryPhotoLabel} for ${task.title}`}
            className="file-input-hidden"
            id={`${inputId}-camera`}
            type="file"
            accept={PROOF_IMAGE_ACCEPT}
            capture="environment"
            onChange={handleFileChange}
          />
          <input
            ref={uploadInputRef}
            aria-label={`${secondaryPhotoLabel} for ${task.title}`}
            className="file-input-hidden"
            id={`${inputId}-upload`}
            type="file"
            accept={PROOF_IMAGE_ACCEPT}
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

      {!task.free && proofMode !== "required" && !isReplacingProof && (
        <button
          className="primary-action"
          disabled={isUploading}
          type="button"
          onClick={() => onCompleteTask(task.id)}
        >
          <Check aria-hidden="true" />
          {status === "approved" && !submission?.imagePath
            ? "Mark incomplete"
            : proofMode === "optional"
              ? "Complete without photo"
              : "Mark complete"}
        </button>
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
        <span
          style={{
            transform: `scaleX(${tasks.length ? sentCount / tasks.length : 0})`,
          }}
        />
      </span>
      <p>{submittedCount} submitted</p>
    </button>
  );
}

export function HostLiveBoard({
  boardSize,
  group,
  onClose,
  setSubmissionStatus,
  submissions,
  tasks,
}: {
  boardSize: BoardSize;
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
          <button
            aria-label={`Close ${group.shortName} live board`}
            className="host-board-close"
            type="button"
            onClick={onClose}
          >
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
            submitted
          </span>
        </div>
        <div className="blackout-board host-board-grid" style={{ "--board-size": boardSize } as React.CSSProperties}>
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
          onToggleApproval={() =>
            setSubmissionStatus(
              lightboxSubmission.id,
              getToggledApprovalStatus(lightboxSubmission.status),
            )
          }
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
  const [zipDownloadState, setZipDownloadState] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [zipDownloadError, setZipDownloadError] = useState("");
  const sortedSubmissions = useMemo(
    () => submissions.filter((submission) => Boolean(submission.imagePath)).sort((a, b) => b.createdAt - a.createdAt),
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

  async function downloadProofZip() {
    if (zipDownloadState) {
      return;
    }

    const exportItems = sortedSubmissions.map((submission) => ({
      group: groups.find((group) => group.id === submission.groupId) ?? null,
      submission,
      task: tasks.find((task) => task.id === submission.taskId) ?? null,
    }));
    const usedNames = new Set<string>();
    const entries: ZipFileEntry[] = [];
    const skippedProofs: string[] = [];

    setZipDownloadError("");
    setZipDownloadState({ completed: 0, total: exportItems.length });

    try {
      for (const [index, item] of exportItems.entries()) {
        try {
          const signedUrl = await createProofDownloadUrl(item.submission.imagePath);
          const response = await fetch(signedUrl);

          if (!response.ok) {
            throw new Error(
              `Could not download ${item.submission.imageName}: ${response.status}`,
            );
          }

          const blob = await response.blob();
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const filename = getProofZipFilename({
            blobType: blob.type,
            group: item.group,
            index,
            submission: item.submission,
            task: item.task,
            usedNames,
          });

          entries.push({
            bytes,
            lastModified: new Date(item.submission.updatedAt),
            name: filename,
          });
        } catch {
          skippedProofs.push(getProofExportLabel(item));
        }

        setZipDownloadState({ completed: index + 1, total: exportItems.length });
      }

      if (entries.length === 0) {
        throw new Error(
          "No proof photos could be found in storage. The submission rows exist, but the image files are missing.",
        );
      }

      const zipBlob = createZipBlob(entries);
      downloadBlob(zipBlob, getProofZipArchiveName());

      if (skippedProofs.length > 0) {
        setZipDownloadError(
          `Downloaded ${entries.length} photos. Skipped ${
            skippedProofs.length
          } missing ${skippedProofs.length === 1 ? "file" : "files"}: ${formatSkippedProofs(
            skippedProofs,
          )}`,
        );
      }
    } catch (caughtError) {
      setZipDownloadError(getErrorMessage(caughtError));
    } finally {
      setZipDownloadState(null);
    }
  }

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
      <div className="proof-export-toolbar">
        <button
          className="secondary-action proof-download-action"
          disabled={Boolean(zipDownloadState)}
          type="button"
          onClick={downloadProofZip}
        >
          <Download aria-hidden="true" />
          {zipDownloadState
            ? `Zipping ${zipDownloadState.completed}/${zipDownloadState.total}`
            : `Download ZIP (${sortedSubmissions.length})`}
        </button>
        {zipDownloadError && (
          <p className="proof-export-error" role="alert">
            {zipDownloadError}
          </p>
        )}
      </div>
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
                submission.status === "pending" ? "is-submitted" : "",
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
                    aria-pressed={submission.status === "approved"}
                    className={
                      submission.status === "pending"
                        ? "approve-button is-submitted"
                        : "approve-button"
                    }
                    type="button"
                    onClick={() =>
                      setSubmissionStatus(
                        submission.id,
                        getToggledApprovalStatus(submission.status),
                      )
                    }
                  >
                    {submission.status === "pending" ? (
                      <Send aria-hidden="true" />
                    ) : (
                      <Check aria-hidden="true" />
                    )}
                    {getApprovalToggleLabel(submission.status)}
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
                  <Send aria-hidden="true" />
                  Submitted
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
          onToggleApproval={() =>
            setSubmissionStatus(
              lightboxSubmission.id,
              getToggledApprovalStatus(lightboxSubmission.status),
            )
          }
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
  onToggleApproval,
  submission,
  task,
}: {
  group: Group;
  onClose: () => void;
  onToggleApproval?: () => void;
  submission: Submission;
  task: Task;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useModalAccessibility({
    containerRef: dialogRef,
    initialFocusRef: closeButtonRef,
    onClose,
  });

  return (
    <div
      ref={dialogRef}
      aria-labelledby="proof-lightbox-title"
      aria-modal="true"
      className="proof-lightbox"
      role="dialog"
    >
      <div
        aria-hidden="true"
        className="proof-lightbox-backdrop"
        onClick={onClose}
      />
      <div
        className="proof-lightbox-panel"
        style={{ "--group-color": group.color } as React.CSSProperties}
      >
        <div className="proof-lightbox-header">
          <div>
            <p className="label">{group.shortName}</p>
            <h2 id="proof-lightbox-title">{task.title}</h2>
            <span className="proof-lightbox-meta">
              {formatSubmissionByline(submission)}
            </span>
            <span>{submission.imageName}</span>
          </div>
          <button
            ref={closeButtonRef}
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
        {onToggleApproval && (
          <button
            aria-pressed={submission.status === "approved"}
            className={
              submission.status === "pending"
                ? "approve-button is-submitted proof-lightbox-approve"
                : "approve-button proof-lightbox-approve"
            }
            type="button"
            onClick={onToggleApproval}
          >
            {submission.status === "pending" ? (
              <Send aria-hidden="true" />
            ) : (
              <Check aria-hidden="true" />
            )}
            {getApprovalToggleLabel(submission.status)}
          </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ saved, status }: { saved?: boolean; status: TaskStatus }) {
  const isSaved = saved && status === "ready";
  const icon =
    isSaved ? (
      <Upload aria-hidden="true" />
    ) : status === "approved" ? (
      <Check aria-hidden="true" />
    ) : status === "ready" ? (
      <Camera aria-hidden="true" />
    ) : (
      <Send aria-hidden="true" />
    );

  return (
    <span
      key={isSaved ? "saved" : status}
      className={
        isSaved
          ? "status-badge is-saved"
          : status === "ready"
            ? "status-badge"
            : `status-badge is-${status}`
      }
    >
      {icon}
      {isSaved ? "Saved" : getStatusLabel(status)}
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
  boardSize: BoardSize = 5,
) {
  const slotCount = getBoardSlotCount(boardSize);
  const taskIds = new Set(tasks.map((task) => task.id));
  const slotTaskIds = Array.from({ length: slotCount }, () => "");
  const groupAssignments = assignments
    .filter((assignment) => assignment.groupId === groupId)
    .sort((first, second) => first.slotOrder - second.slotOrder);

  if (groupAssignments.length === 0) {
    getSortedTasks(tasks)
      .slice(0, slotCount)
      .forEach((task, index) => {
        slotTaskIds[index] = task.id;
      });
    return slotTaskIds;
  }

  groupAssignments.forEach((assignment) => {
    if (
      assignment.slotOrder >= 1 &&
      assignment.slotOrder <= slotCount &&
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

type ZipFileEntry = {
  bytes: Uint8Array<ArrayBuffer>;
  lastModified: Date;
  name: string;
};

type ProofZipFilenameOptions = {
  blobType: string;
  group: Group | null;
  index: number;
  submission: Submission;
  task: Task | null;
  usedNames: Set<string>;
};

type ProofExportItem = {
  group: Group | null;
  submission: Submission;
  task: Task | null;
};

function getProofExportLabel({ group, submission, task }: ProofExportItem) {
  return `${group?.shortName ?? submission.groupId} - ${
    task?.title ?? submission.taskId
  }`;
}

function formatSkippedProofs(skippedProofs: string[]) {
  const visibleProofs = skippedProofs.slice(0, 3).join(", ");
  const hiddenCount = skippedProofs.length - 3;

  return hiddenCount > 0
    ? `${visibleProofs}, +${hiddenCount} more`
    : visibleProofs;
}

function getProofZipFilename({
  blobType,
  group,
  index,
  submission,
  task,
  usedNames,
}: ProofZipFilenameOptions) {
  const baseName = [
    String(index + 1).padStart(2, "0"),
    group?.shortName ?? submission.groupId,
    task?.title ?? submission.taskId,
    getSubmitterName(submission),
  ]
    .map((value) => getFilenamePart(value ?? ""))
    .filter(Boolean)
    .join("-");
  const extension = getFileExtensionFromMimeType(blobType) || ".jpg";

  return getUniqueFilename(`${baseName || "proof"}${extension}`, usedNames);
}

function getProofZipArchiveName() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const datePart = `${year}-${month}-${day}`;

  return `rally-hunt-proofs-${datePart}.zip`;
}

function getFilenamePart(value: string) {
  return value
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 54);
}

function getFileExtensionFromName(filename: string) {
  const match = filename.toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : "";
}

function getFileExtensionFromMimeType(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/heic":
      return ".heic";
    case "image/heif":
      return ".heif";
    default:
      return "";
  }
}

function getUniqueFilename(filename: string, usedNames: Set<string>) {
  const extension = getFileExtensionFromName(filename);
  const baseName = extension ? filename.slice(0, -extension.length) : filename;
  let nextName = filename;
  let suffix = 2;

  while (usedNames.has(nextName.toLowerCase())) {
    nextName = `${baseName}-${suffix}${extension}`;
    suffix += 1;
  }

  usedNames.add(nextName.toLowerCase());
  return nextName;
}

function createZipBlob(entries: ZipFileEntry[]) {
  const fileParts: BlobPart[] = [];
  const centralDirectoryParts: BlobPart[] = [];
  let offset = 0;

  for (const entry of entries) {
    const encodedName = new TextEncoder().encode(entry.name);
    const crc = getCrc32(entry.bytes);
    const { date, time } = getDosDateTime(entry.lastModified);
    const localHeader = createZipLocalFileHeader({
      crc,
      date,
      nameLength: encodedName.length,
      size: entry.bytes.byteLength,
      time,
    });
    const centralDirectoryHeader = createZipCentralDirectoryHeader({
      crc,
      date,
      nameLength: encodedName.length,
      offset,
      size: entry.bytes.byteLength,
      time,
    });

    fileParts.push(localHeader, encodedName, entry.bytes);
    centralDirectoryParts.push(centralDirectoryHeader, encodedName);
    offset += localHeader.byteLength + encodedName.byteLength + entry.bytes.byteLength;
  }

  const centralDirectorySize = centralDirectoryParts.reduce(
    (size, part) => size + getBlobPartSize(part),
    0,
  );
  const endOfCentralDirectory = createZipEndOfCentralDirectory({
    centralDirectoryOffset: offset,
    centralDirectorySize,
    entryCount: entries.length,
  });

  return new Blob(
    [...fileParts, ...centralDirectoryParts, endOfCentralDirectory],
    { type: "application/zip" },
  );
}

function createZipLocalFileHeader({
  crc,
  date,
  nameLength,
  size,
  time,
}: {
  crc: number;
  date: number;
  nameLength: number;
  size: number;
  time: number;
}) {
  const header = new ArrayBuffer(30);
  const view = new DataView(header);

  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, time, true);
  view.setUint16(12, date, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameLength, true);
  view.setUint16(28, 0, true);

  return new Uint8Array(header);
}

function createZipCentralDirectoryHeader({
  crc,
  date,
  nameLength,
  offset,
  size,
  time,
}: {
  crc: number;
  date: number;
  nameLength: number;
  offset: number;
  size: number;
  time: number;
}) {
  const header = new ArrayBuffer(46);
  const view = new DataView(header);

  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, time, true);
  view.setUint16(14, date, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);

  return new Uint8Array(header);
}

function createZipEndOfCentralDirectory({
  centralDirectoryOffset,
  centralDirectorySize,
  entryCount,
}: {
  centralDirectoryOffset: number;
  centralDirectorySize: number;
  entryCount: number;
}) {
  const header = new ArrayBuffer(22);
  const view = new DataView(header);

  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);

  return new Uint8Array(header);
}

function getBlobPartSize(part: BlobPart) {
  if (typeof part === "string") {
    return new TextEncoder().encode(part).byteLength;
  }

  if (part instanceof Blob) {
    return part.size;
  }

  return part.byteLength;
}

function getDosDateTime(date: Date) {
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = Math.max(1980, safeDate.getFullYear());

  return {
    date:
      ((year - 1980) << 9) |
      ((safeDate.getMonth() + 1) << 5) |
      safeDate.getDate(),
    time:
      (safeDate.getHours() << 11) |
      (safeDate.getMinutes() << 5) |
      Math.floor(safeDate.getSeconds() / 2),
  };
}

function getCrc32(bytes: Uint8Array<ArrayBuffer>) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = ZIP_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const ZIP_CRC_TABLE = Array.from({ length: 256 }, (_, tableIndex) => {
  let crc = tableIndex;

  for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }

  return crc >>> 0;
});

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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

function normalizeGameCodeInput(gameCode: string) {
  return gameCode.trim().toUpperCase();
}

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = crypto.getRandomValues(new Uint8Array(8));
  const segment = (start: number) =>
    Array.from(values.slice(start, start + 4), (value) => alphabet[value % alphabet.length])
      .join("");
  return `${segment(0)}-${segment(4)}`;
}

function generateHostPin() {
  const values = crypto.getRandomValues(new Uint32Array(1));
  return String(10_000_000 + (values[0] % 90_000_000));
}

function getPlayerJoinUrl(gameCode: string) {
  return `${window.location.origin}/?code=${encodeURIComponent(gameCode)}`;
}

function isValidGameCode(gameCode: string) {
  return GAME_CODE_PATTERN.test(gameCode);
}

function getBoardTileTitle(task: Task) {
  return task.title;
}

function generateGroupBoards(
  groups: Group[],
  tasks: Task[],
  boardSize: BoardSize,
  includeFreeSpace: boolean,
  boardMode: Game["boardMode"],
) {
  const sortedTasks = getSortedTasks(tasks);
  const centerTask = includeFreeSpace && boardSize % 2 === 1
    ? sortedTasks.find((task) => task.free) ?? null
    : null;
  const nonFreeTasks = sortedTasks.filter(
    (task) => !task.free && task.id !== centerTask?.id,
  );
  const sharedCount = Math.min(DEFAULT_SHARED_BOARD_TASK_COUNT, Math.max(1, boardSize - 1));
  const sharedTasks = nonFreeTasks.slice(0, Math.min(sharedCount, nonFreeTasks.length));
  const variedPool = nonFreeTasks.filter(
    (task) => !sharedTasks.some((sharedTask) => sharedTask.id === task.id),
  );

  return groups.reduce<Record<string, string[]>>((boards, group) => {
    const boardTaskIds = Array.from({ length: getBoardSlotCount(boardSize) }, () => "");
    const shuffledTasks = stableShuffleTasks(variedPool, boardMode === "shared" ? "shared" : group.id);
    const taskQueue = [
      ...sharedTasks.map((task) => task.id),
      ...shuffledTasks.map((task) => task.id),
    ];
    let taskIndex = 0;

    boardTaskIds.forEach((_, index) => {
      const slotNumber = index + 1;

      if (centerTask && slotNumber === getBoardCenterSlot(boardSize)) {
        boardTaskIds[index] = centerTask.id;
        return;
      }

      const nextTaskId = taskQueue[taskIndex];

      if (nextTaskId) {
        boardTaskIds[index] = nextTaskId;
        taskIndex += 1;
      }
    });

    boards[group.id] = boardTaskIds;
    return boards;
  }, {});
}

function getBoardSlotCount(boardSize: BoardSize) {
  return boardSize * boardSize;
}

function getRequiredPlayableTaskCount(
  boardSize: BoardSize,
  freeSpace: boolean,
) {
  return (
    getBoardSlotCount(boardSize) -
    (freeSpace && boardSize % 2 === 1 ? 1 : 0)
  );
}

function getBoardCenterSlot(boardSize: BoardSize) {
  return Math.floor(getBoardSlotCount(boardSize) / 2) + 1;
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

function createPlayerGroup(
  member: Pick<Membership | RosterMember, "id" | "displayName">,
  index: number,
): Group {
  const colors = ["purple", "blue", "green", "orange", "teal", "pink", "gold", "maroon"];
  const colorKey = colors[index % colors.length];
  return {
    id: member.id,
    name: member.displayName,
    shortName: member.displayName,
    color: `var(--group-${colorKey})`,
    dark: `var(--group-${colorKey}-dark)`,
    soft: `var(--group-${colorKey}-soft)`,
  };
}

function hasCompletedBingo(
  tasks: Task[],
  ownerId: string,
  submissions: Submission[],
  boardSize: BoardSize,
) {
  if (tasks.length < getBoardSlotCount(boardSize)) return false;
  const complete = tasks.slice(0, getBoardSlotCount(boardSize)).map(
    (task) => getTaskStatus(task, ownerId, submissions) === "approved",
  );
  const lines: number[][] = [];
  for (let row = 0; row < boardSize; row += 1) {
    lines.push(Array.from({ length: boardSize }, (_, column) => row * boardSize + column));
  }
  for (let column = 0; column < boardSize; column += 1) {
    lines.push(Array.from({ length: boardSize }, (_, row) => row * boardSize + column));
  }
  lines.push(Array.from({ length: boardSize }, (_, index) => index * boardSize + index));
  lines.push(Array.from({ length: boardSize }, (_, index) => (index + 1) * (boardSize - 1)));
  return lines.some((line) => line.every((index) => complete[index]));
}

function getStatusLabel(status: TaskStatus) {
  if (status === "approved") return "Approved";
  if (status === "pending") return "Submitted";
  if (status === "retake") return "Retake";
  return "Ready";
}

function getToggledApprovalStatus(status: SubmissionStatus): SubmissionStatus {
  return status === "approved" ? "pending" : "approved";
}

function getApprovalToggleLabel(status: SubmissionStatus) {
  if (status === "approved") return "Approved";
  if (status === "pending") return "Submitted";
  return "Approve";
}

function getProofCountLabel(count: number) {
  return count === 1 ? "1 proof" : `${count} proofs`;
}

function isAllowedProofImageFile(file: File) {
  if (file.type) {
    return PROOF_IMAGE_MIME_TYPES.has(file.type.toLowerCase());
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return PROOF_IMAGE_EXTENSIONS.has(extension);
}

async function prepareProofImageFile(file: File) {
  const compressedFile = await compressProofImageFile(file);

  if (compressedFile.size <= MAX_PROOF_FILE_BYTES) {
    return compressedFile;
  }

  throw new Error(
    `Photo is still over ${PROOF_MAX_FILE_LABEL} after compression. Try a smaller photo.`,
  );
}

async function compressProofImageFile(file: File) {
  const image = await loadImageFromFile(file);
  const scale = Math.min(1, PROOF_MAX_IMAGE_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("This browser could not prepare the photo for upload.");
  }

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  let smallestFile: File | null = null;

  for (const quality of PROOF_COMPRESSION_QUALITIES) {
    const blob = await canvasToBlob(canvas, PROOF_RESIZED_IMAGE_TYPE, quality);
    const nextFile = new File([blob], getCompressedProofFilename(file.name), {
      type: PROOF_RESIZED_IMAGE_TYPE,
      lastModified: Date.now(),
    });

    if (!smallestFile || nextFile.size < smallestFile.size) {
      smallestFile = nextFile;
    }

    if (nextFile.size <= MAX_PROOF_FILE_BYTES) {
      return nextFile;
    }
  }

  if (!smallestFile) {
    throw new Error("This browser could not compress the photo.");
  }

  return smallestFile;
}

function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new Error(
          `Photo is over ${PROOF_MAX_FILE_LABEL} and this browser could not compress it.`,
        ),
      );
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("This browser could not compress the photo."));
      },
      type,
      quality,
    );
  });
}

function getCompressedProofFilename(filename: string) {
  const cleanBaseName =
    filename
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "proof";

  return `${cleanBaseName}-compressed.${PROOF_RESIZED_IMAGE_EXTENSION}`;
}

function isProofPreparationError(message: string) {
  return (
    message.includes("compress") ||
    message.includes("over") ||
    message.includes("smaller photo")
  );
}

function replaceMembership(gameState: GameState, membership: Membership): GameState {
  return {
    ...gameState,
    membership:
      gameState.membership?.id === membership.id ? membership : gameState.membership,
    memberships: gameState.memberships.map((currentMembership) =>
      currentMembership.id === membership.id ? membership : currentMembership,
    ),
  };
}

function removeMembership(gameState: GameState, membershipId: string): GameState {
  return {
    ...gameState,
    membership:
      gameState.membership?.id === membershipId ? null : gameState.membership,
    memberships: gameState.memberships.filter(
      (membership) => membership.id !== membershipId,
    ),
  };
}

function upsertGroup(gameState: GameState, group: Group): GameState {
  const groups = gameState.groups.some((currentGroup) => currentGroup.id === group.id)
    ? gameState.groups.map((currentGroup) =>
        currentGroup.id === group.id ? group : currentGroup,
      )
    : [...gameState.groups, group];

  return {
    ...gameState,
    groups,
  };
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
    return "Submitted. The host can approve it or request a retake.";
  }

  if (status === "approved") {
    return "Approved. Replacing it will send this square back to review.";
  }

  if (status === "retake") {
    return "Host requested a new proof.";
  }

  return "";
}

function getPendingProofErrorLabel(message: string) {
  if (isProofPreparationError(message)) {
    return "This saved photo is too large. Choose a smaller replacement.";
  }

  return "Last upload failed. Retry when service improves.";
}

function upsertPendingProof(
  pendingProofs: PendingProofUpload[],
  pendingProof: PendingProofUpload,
) {
  return [
    pendingProof,
    ...pendingProofs.filter((proof) => proof.id !== pendingProof.id),
  ].sort((first, second) => second.updatedAt - first.updatedAt);
}

function getGameRemainingSeconds(
  game: Game,
  stops: HuntStop[],
  activeStopIndex: number,
) {
  if (game.timerMode === "none") return 0;
  if (game.timerMode === "duration") {
    if (!game.timerRunning) return game.timerSecondsTotal;
    const startedAt = new Date(game.timerStartedAt).getTime();
    if (Number.isNaN(startedAt)) return game.timerSecondsTotal;
    return Math.max(
      0,
      game.timerSecondsTotal - Math.floor((Date.now() - startedAt) / 1000),
    );
  }
  const target = getGameTimerTarget(game, stops, activeStopIndex);

  if (!target) {
    return 0;
  }

  return getSecondsUntilClockTarget(target);
}

function getGameTimerTarget(
  game: Game,
  stops: HuntStop[],
  activeStopIndex: number,
): TimerTarget | null {
  if (game.phase === "review") {
    return null;
  }

  if (game.phase === "play") {
    const targetStop =
      activeStopIndex < 0 ? stops[0] : stops[activeStopIndex + 1];
    const referenceStop = activeStopIndex >= 0 ? stops[activeStopIndex] : null;

    return targetStop
      ? {
          targetTime: targetStop.arriveTime,
          referenceTime: referenceStop?.leaveTime,
        }
      : null;
  }

  const activeStop = stops[activeStopIndex] ?? stops[0];

  return activeStop
    ? {
        targetTime: activeStop.leaveTime,
        referenceTime: activeStop.arriveTime,
      }
    : null;
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
  if (!game.setupComplete) {
    return {
      label: "Ready",
      caption: "not started",
      state: "idle",
    };
  }

  if (game.phase === "review") {
    return {
      label: "Done",
      caption: "finished",
      state: "finished",
    };
  }

  if (game.timerMode === "none") {
    return {
      label: game.setupComplete ? "Live" : "Ready",
      caption: "no timer",
      state: "idle",
    };
  }

  if (!game.setupComplete) {
    return {
      label: "Ready",
      caption: "not started",
      state: "idle",
    };
  }

  if (game.timerMode === "duration" && !game.timerRunning) {
    return {
      label: formatTimer(timerSeconds),
      caption: "paused",
      state: "idle",
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

function getSecondsUntilClockTarget({ targetTime, referenceTime }: TimerTarget) {
  const targetMinutes = getClockMinutes(targetTime);

  if (targetMinutes === null) {
    return 0;
  }

  const now = new Date();
  const target = new Date(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const referenceMinutes = referenceTime ? getClockMinutes(referenceTime) : null;

  target.setHours(Math.floor(targetMinutes / 60), targetMinutes % 60, 0, 0);

  if (
    referenceMinutes !== null &&
    targetMinutes <= referenceMinutes &&
    target.getTime() < now.getTime()
  ) {
    const millisPastTarget = now.getTime() - target.getTime();

    if (currentMinutes >= referenceMinutes || millisPastTarget > 12 * 60 * 60 * 1000) {
      target.setDate(target.getDate() + 1);
    }
  }

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
      title: "Rally Hunt",
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

function getTemplateRoute(pathname: string): TemplateRoute | null {
  const match = pathname.match(/^\/(host\/)?templates(?:\/([^/]+))?\/?$/);

  if (!match) {
    return null;
  }

  let templateId: string | undefined;
  if (match[2]) {
    try {
      templateId = decodeURIComponent(match[2]).toLowerCase();
    } catch {
      templateId = "__invalid__";
    }
  }

  return {
    scope: match[1] ? "host" : "public",
    ...(templateId ? { templateId } : {}),
  };
}

function readTemplateIdFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get("template")?.trim().toLowerCase() ?? "";
  } catch {
    return "";
  }
}

function storePlayer(player: StoredPlayer) {
  try {
    window.localStorage.setItem(STORAGE_PLAYER_KEY, JSON.stringify(player));
  } catch {
    // Local storage can be unavailable in private contexts.
  }
}

function clearStoredPlayer() {
  try {
    window.localStorage.removeItem(STORAGE_PLAYER_KEY);
  } catch {
    // Local storage can be unavailable in private contexts.
  }
}

function readInitialGameCode() {
  const linkedGameCode = readGameCodeFromUrl();

  if (linkedGameCode) {
    return linkedGameCode;
  }

  if (readTemplateIdFromUrl()) {
    return "";
  }

  return window.location.pathname === "/host" ? readStoredGameCode() : "";
}

function readGameCodeFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const queryGameCode =
      params.get("code") ?? params.get("game") ?? params.get("room") ?? "";
    const hashGameCode = window.location.hash
      .replace(/^#\/?/, "")
      .replace(/^code=/i, "");
    const gameCode = normalizeGameCodeInput(queryGameCode || hashGameCode);

    return isValidGameCode(gameCode) ? gameCode : "";
  } catch {
    return "";
  }
}

function syncGameCodeToUrl(code: string) {
  const gameCode = normalizeGameCodeInput(code);

  if (!isValidGameCode(gameCode)) {
    return;
  }

  try {
    const url = new URL(window.location.href);

    if (normalizeGameCodeInput(url.searchParams.get("code") ?? "") === gameCode) {
      return;
    }

    url.searchParams.set("code", gameCode);
    url.searchParams.delete("game");
    url.searchParams.delete("room");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Ignore URL sync failures; local storage still preserves the room code.
  }
}

function getPathWithGameCode(pathname: string, code: string) {
  const gameCode = normalizeGameCodeInput(code);

  if (!isValidGameCode(gameCode)) {
    return pathname;
  }

  try {
    const url = new URL(window.location.href);
    url.pathname = pathname;
    url.searchParams.set("code", gameCode);
    url.searchParams.delete("game");
    url.searchParams.delete("room");
    url.searchParams.delete("template");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return pathname;
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

function clearStoredGameCode() {
  try {
    window.localStorage.removeItem(STORAGE_GAME_CODE_KEY);
  } catch {
    // Local storage can be unavailable in private contexts.
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unexpected backend error.";
}
