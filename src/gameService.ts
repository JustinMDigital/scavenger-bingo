import type { RealtimeChannel, User } from "@supabase/supabase-js";
import { requireSupabase, supabase } from "./supabaseClient";
import type { Database } from "./supabaseClient";

export const DEFAULT_GAME_CODE = "FAMILY";
export const PROOFS_BUCKET = "proofs";
const STORAGE_PLACEHOLDER_NAMES = new Set([".emptyFolderPlaceholder"]);

type GameRow = Database["public"]["Tables"]["games"]["Row"];
type GroupRow = Database["public"]["Tables"]["groups"]["Row"];
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type BoardAssignmentRow =
  Database["public"]["Tables"]["group_board_tasks"]["Row"];
type StopRow = Database["public"]["Tables"]["stops"]["Row"];
type MembershipRow = Database["public"]["Tables"]["memberships"]["Row"];
type SubmissionRow = Database["public"]["Tables"]["submissions"]["Row"];
type RosterRow =
  Database["public"]["Functions"]["get_game_roster"]["Returns"][number];

export type SubmissionStatus = "pending" | "approved" | "retake";
export type TaskStatus = "ready" | "pending" | "approved" | "retake";
export type HuntPhase = "live" | "play" | "review";

export type Group = {
  id: string;
  name: string;
  shortName: string;
  color: string;
  dark: string;
  soft: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  icon: string;
  free?: boolean;
  sortOrder: number;
};

export type BoardAssignment = {
  groupId: string;
  taskId: string;
  slotOrder: number;
};

export type HuntStop = {
  id: string;
  name: string;
  detail: string;
  arriveTime: string;
  leaveTime: string;
  sortOrder: number;
};

export type Game = {
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

export type Membership = {
  id: string;
  gameId: string;
  userId: string;
  role: "player" | "host";
  groupId: string | null;
  displayName: string;
};

export type RosterMember = {
  id: string;
  gameId: string;
  role: "player" | "host";
  groupId: string | null;
  displayName: string;
};

export type Submission = {
  id: string;
  groupId: string;
  taskId: string;
  submittedBy: string;
  submittedByName: string | null;
  imageUrl: string;
  imagePath: string;
  imageName: string;
  status: SubmissionStatus;
  createdAt: number;
  updatedAt: number;
};

export type GameState = {
  game: Game;
  groups: Group[];
  tasks: Task[];
  boardAssignments: BoardAssignment[];
  stops: HuntStop[];
  membership: Membership | null;
  memberships: Membership[];
  roster: RosterMember[];
  submissions: Submission[];
};

type RealtimeSubscribeStatus =
  | "SUBSCRIBED"
  | "TIMED_OUT"
  | "CLOSED"
  | "CHANNEL_ERROR";

const REALTIME_RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];

export async function ensureAnonymousSession(): Promise<User> {
  const client = requireSupabase();
  const sessionResult = await client.auth.getSession();

  if (sessionResult.error) {
    throw sessionResult.error;
  }

  if (sessionResult.data.session?.user) {
    return sessionResult.data.session.user;
  }

  const signInResult = await client.auth.signInAnonymously();

  if (signInResult.error) {
    throw signInResult.error;
  }

  if (!signInResult.data.user) {
    throw new Error("Anonymous sign-in did not return a user.");
  }

  return signInResult.data.user;
}

export async function loadGameState(gameCode = DEFAULT_GAME_CODE): Promise<GameState> {
  const client = requireSupabase();
  const user = await ensureAnonymousSession();
  const normalizedCode = normalizeGameCode(gameCode);

  if (!normalizedCode) {
    throw new Error("Game code is required.");
  }

  const gameResult = await client
    .from("games")
    .select("*")
    .eq("code", normalizedCode)
    .eq("is_active", true)
    .single();

  if (gameResult.error) {
    if (gameResult.error.code === "PGRST116") {
      throw new Error(`No active game found for ${normalizedCode}.`);
    }

    throw gameResult.error;
  }

  const game = mapGame(gameResult.data);

  const [groupsResult, tasksResult, stopsResult, membershipResult] =
    await Promise.all([
      client
        .from("groups")
        .select("*")
        .eq("game_id", game.id)
        .order("sort_order", { ascending: true }),
      client
        .from("tasks")
        .select("*")
        .eq("game_id", game.id)
        .order("sort_order", { ascending: true }),
      client
        .from("stops")
        .select("*")
        .eq("game_id", game.id)
        .order("sort_order", { ascending: true }),
      client
        .from("memberships")
        .select("*")
        .eq("game_id", game.id)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  if (groupsResult.error) throw groupsResult.error;
  if (tasksResult.error) throw tasksResult.error;
  if (stopsResult.error) throw stopsResult.error;
  if (membershipResult.error) throw membershipResult.error;

  const membership = membershipResult.data
    ? mapMembership(membershipResult.data)
    : null;
  const membershipsPromise =
    membership?.role === "host"
      ? loadGameMemberships(game.id)
      : Promise.resolve(membership ? [membership] : []);
  const rosterPromise = membership
    ? loadGameRoster(game.id)
    : Promise.resolve<RosterMember[]>([]);
  const [boardAssignments, submissions, memberships, roster] = await Promise.all([
    loadBoardAssignments(game.id),
    membership ? loadSubmissionsForMembership(game.id, membership) : [],
    membershipsPromise,
    rosterPromise,
  ]);

  return {
    game,
    groups: groupsResult.data.map(mapGroup),
    tasks: tasksResult.data.map(mapTask),
    boardAssignments,
    stops: stopsResult.data.map(mapStop),
    membership,
    memberships,
    roster,
    submissions,
  };
}

export async function joinGame({
  gameId,
  groupId,
  displayName,
}: {
  gameId: string;
  groupId: string;
  displayName: string;
}) {
  const client = requireSupabase();
  const user = await ensureAnonymousSession();
  const cleanedDisplayName = displayName.trim();

  if (!cleanedDisplayName) {
    throw new Error("Name is required.");
  }

  const result = await client
    .from("memberships")
    .upsert(
      {
        game_id: gameId,
        user_id: user.id,
        role: "player",
        group_slug: groupId,
        display_name: cleanedDisplayName,
      },
      { onConflict: "game_id,user_id" },
    )
    .select("*")
    .single();

  if (result.error) {
    throw result.error;
  }

  return mapMembership(result.data);
}

export async function claimHost({
  gameCode,
  pin,
  displayName,
}: {
  gameCode: string;
  pin: string;
  displayName: string;
}) {
  const client = requireSupabase();
  await ensureAnonymousSession();

  const result = await client.rpc("configure_game_code", {
    desired_game_code: normalizeGameCode(gameCode),
    pin,
    display_name: displayName.trim(),
  });

  if (result.error) {
    throw result.error;
  }

  return mapMembership(result.data);
}

export async function movePlayerMembership({
  membershipId,
  groupId,
}: {
  membershipId: string;
  groupId: string;
}) {
  const client = requireSupabase();
  const result = await client.rpc("move_player_membership", {
    target_membership_id: membershipId,
    target_group_slug: groupId,
  });

  if (result.error) {
    throw result.error;
  }

  if (!result.data) {
    throw new Error("Move did not return a player membership.");
  }

  return mapMembership(result.data);
}

export async function kickPlayerMembership(membershipId: string) {
  const client = requireSupabase();
  const result = await client.rpc("kick_player_membership", {
    target_membership_id: membershipId,
  });

  if (result.error) {
    throw result.error;
  }

  if (!result.data) {
    throw new Error("Kick did not return a player membership.");
  }

  return mapMembership(result.data);
}

export async function saveTaskProof({
  gameId,
  groupId,
  taskId,
  file,
}: {
  gameId: string;
  groupId: string;
  taskId: string;
  file: File;
}) {
  const client = requireSupabase();
  const user = await ensureAnonymousSession();
  const extension = getFileExtension(file);
  const fileId = window.crypto?.randomUUID?.() ?? `${Date.now()}`;
  const imagePath = `${gameId}/${groupId}/${taskId}/${user.id}/${fileId}.${extension}`;

  const uploadResult = await client.storage
    .from(PROOFS_BUCKET)
    .upload(imagePath, file, {
      cacheControl: "3600",
      contentType: file.type || undefined,
      upsert: false,
    });

  if (uploadResult.error) {
    throw uploadResult.error;
  }

  const submissionResult = await client
    .from("submissions")
    .upsert(
      {
        game_id: gameId,
        group_slug: groupId,
        task_slug: taskId,
        submitted_by: user.id,
        image_path: imagePath,
        image_name: file.name || `proof.${extension}`,
        status: "pending",
      },
      { onConflict: "game_id,group_slug,task_slug" },
    )
    .select("*")
    .single();

  if (submissionResult.error) {
    const cleanupResult = await client.storage.from(PROOFS_BUCKET).remove([imagePath]);
    if (cleanupResult.error) {
      console.warn("Could not clean up failed proof upload.", cleanupResult.error);
    }

    throw submissionResult.error;
  }

  const [submission] = await hydrateSubmissions([submissionResult.data]);
  return submission;
}

export async function updateSubmissionStatus(
  submissionId: string,
  status: SubmissionStatus,
) {
  const client = requireSupabase();
  const result = await client
    .from("submissions")
    .update({ status })
    .eq("id", submissionId)
    .select("*")
    .single();

  if (result.error) {
    throw result.error;
  }

  return result.data;
}

export async function resetGameProofs(gameId: string) {
  const client = requireSupabase();
  const submissionsResult = await client
    .from("submissions")
    .select("image_path")
    .eq("game_id", gameId);

  if (submissionsResult.error) {
    throw submissionsResult.error;
  }

  const storedProofPaths = await listStoredProofPaths(gameId);
  const proofPaths = [
    ...new Set([
      ...submissionsResult.data.map((submission) => submission.image_path),
      ...storedProofPaths,
    ]),
  ];

  if (proofPaths.length > 0) {
    const removeResult = await client.storage.from(PROOFS_BUCKET).remove(proofPaths);

    if (removeResult.error) {
      throw removeResult.error;
    }
  }

  const deleteResult = await client
    .from("submissions")
    .delete()
    .eq("game_id", gameId);

  if (deleteResult.error) {
    throw deleteResult.error;
  }

  return {
    deletedImages: proofPaths.length,
    deletedSubmissions: submissionsResult.data.length,
  };
}

export async function abandonGameLobby(gameId: string) {
  const resetResult = await resetGameProofs(gameId);
  const client = requireSupabase();
  const abandonResult = await client.rpc("abandon_game_lobby", {
    target_game_id: gameId,
  });

  if (abandonResult.error) {
    throw abandonResult.error;
  }

  if (!abandonResult.data) {
    throw new Error("Abandon game did not return a result.");
  }

  return {
    deletedImages: resetResult.deletedImages,
    deletedSubmissions:
      resetResult.deletedSubmissions + abandonResult.data.deleted_submissions,
    removedMemberships: abandonResult.data.removed_memberships,
  };
}

export async function addTask({
  gameId,
  slug,
  title,
  description,
  icon,
  isFree,
  sortOrder,
}: {
  gameId: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  isFree: boolean;
  sortOrder: number;
}) {
  const client = requireSupabase();
  const result = await client
    .from("tasks")
    .insert({
      game_id: gameId,
      slug,
      title,
      description,
      icon,
      is_free: isFree,
      sort_order: sortOrder,
    })
    .select("*")
    .single();

  if (result.error) {
    throw result.error;
  }

  return mapTask(result.data);
}

export async function updateTaskDetails(
  gameId: string,
  taskId: string,
  patch: Partial<Pick<Task, "title" | "description" | "icon" | "free" | "sortOrder">>,
) {
  const client = requireSupabase();
  const updates: Database["public"]["Tables"]["tasks"]["Update"] = {};

  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.icon !== undefined) updates.icon = patch.icon;
  if (patch.free !== undefined) updates.is_free = patch.free;
  if (patch.sortOrder !== undefined) updates.sort_order = patch.sortOrder;

  const result = await client
    .from("tasks")
    .update(updates)
    .eq("game_id", gameId)
    .eq("slug", taskId)
    .select("*")
    .single();

  if (result.error) {
    throw result.error;
  }

  return mapTask(result.data);
}

export async function removeTask(gameId: string, taskId: string) {
  const client = requireSupabase();
  const result = await client
    .from("tasks")
    .delete()
    .eq("game_id", gameId)
    .eq("slug", taskId);

  if (result.error) {
    throw result.error;
  }
}

export async function setGroupBoardTasks({
  gameId,
  groupId,
  taskIds,
}: {
  gameId: string;
  groupId: string;
  taskIds: Array<string | null | undefined>;
}) {
  const client = requireSupabase();
  const deleteResult = await client
    .from("group_board_tasks")
    .delete()
    .eq("game_id", gameId)
    .eq("group_slug", groupId);

  if (deleteResult.error) {
    throw deleteResult.error;
  }

  const rows = taskIds
    .slice(0, 25)
    .map((taskId, index) =>
      taskId
        ? {
            game_id: gameId,
            group_slug: groupId,
            task_slug: taskId,
            slot_order: index + 1,
          }
        : null,
    )
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) {
    return [];
  }

  const insertResult = await client
    .from("group_board_tasks")
    .insert(rows)
    .select("*")
    .order("slot_order", { ascending: true });

  if (insertResult.error) {
    throw insertResult.error;
  }

  return insertResult.data.map(mapBoardAssignment);
}

export async function updateStopDetails(
  stopId: string,
  patch: Partial<Pick<HuntStop, "name" | "detail" | "arriveTime" | "leaveTime">>,
) {
  const client = requireSupabase();
  const updates: Database["public"]["Tables"]["stops"]["Update"] = {};

  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.detail !== undefined) updates.detail = patch.detail;
  if (patch.arriveTime !== undefined) updates.arrive_time = patch.arriveTime;
  if (patch.leaveTime !== undefined) updates.leave_time = patch.leaveTime;

  const result = await client
    .from("stops")
    .update(updates)
    .eq("id", stopId)
    .select("*")
    .single();

  if (result.error) {
    throw result.error;
  }

  return mapStop(result.data);
}

export async function addStop({
  gameId,
  name,
  detail,
  arriveTime,
  leaveTime,
  sortOrder,
}: {
  gameId: string;
  name: string;
  detail: string;
  arriveTime: string;
  leaveTime: string;
  sortOrder: number;
}) {
  const client = requireSupabase();
  const result = await client
    .from("stops")
    .insert({
      game_id: gameId,
      slug: `stop-${Date.now()}`,
      name,
      detail,
      arrive_time: arriveTime,
      leave_time: leaveTime,
      sort_order: sortOrder,
    })
    .select("*")
    .single();

  if (result.error) {
    throw result.error;
  }

  return mapStop(result.data);
}

export async function removeStop(stopId: string) {
  const client = requireSupabase();
  const result = await client.from("stops").delete().eq("id", stopId);

  if (result.error) {
    throw result.error;
  }
}

export async function updateGameTimer(
  gameId: string,
  patch: Partial<{
    activeStopId: string | null;
    phase: HuntPhase;
    timerRunning: boolean;
    timerStartedAt: string;
    timerSecondsTotal: number;
    boardHidden: boolean;
  }>,
) {
  const client = requireSupabase();
  const updates: Database["public"]["Tables"]["games"]["Update"] = {};

  if (patch.activeStopId !== undefined) updates.active_stop_id = patch.activeStopId;
  if (patch.phase !== undefined) updates.phase = patch.phase;
  if (patch.timerRunning !== undefined) updates.timer_running = patch.timerRunning;
  if (patch.timerStartedAt !== undefined) {
    updates.timer_started_at = patch.timerStartedAt;
  }
  if (patch.timerSecondsTotal !== undefined) {
    updates.timer_seconds_total = patch.timerSecondsTotal;
  }
  if (patch.boardHidden !== undefined) {
    updates.board_hidden = patch.boardHidden;
  }

  const result = await client
    .from("games")
    .update(updates)
    .eq("id", gameId)
    .select("*")
    .single();

  if (result.error) {
    throw result.error;
  }

  return mapGame(result.data);
}

export function subscribeToGameChanges(
  gameId: string,
  onChange: () => void,
): () => void {
  const client = supabase;

  if (!client) {
    return () => undefined;
  }

  let channel: RealtimeChannel | null = null;
  let channelGeneration = 0;
  let reconnectAttempts = 0;
  let reconnectTimeoutId: number | undefined;
  let isStopped = false;

  const clearReconnectTimer = () => {
    if (reconnectTimeoutId === undefined) {
      return;
    }

    window.clearTimeout(reconnectTimeoutId);
    reconnectTimeoutId = undefined;
  };

  const removeCurrentChannel = () => {
    if (!channel) {
      return;
    }

    const staleChannel = channel;
    channel = null;
    void client.removeChannel(staleChannel);
  };

  const refreshNow = () => {
    if (!isStopped) {
      onChange();
    }
  };

  const connect = () => {
    if (isStopped) {
      return;
    }

    const generation = channelGeneration + 1;
    channelGeneration = generation;
    removeCurrentChannel();

    channel = client
      .channel(`game:${gameId}:${generation}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "tasks",
        filter: `game_id=eq.${gameId}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "group_board_tasks",
        filter: `game_id=eq.${gameId}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        refreshNow,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stops",
          filter: `game_id=eq.${gameId}`,
        },
        refreshNow,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "submissions",
          filter: `game_id=eq.${gameId}`,
        },
        refreshNow,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "memberships",
          filter: `game_id=eq.${gameId}`,
        },
        refreshNow,
      )
      .subscribe((status: RealtimeSubscribeStatus, error?: Error) => {
        if (isStopped || generation !== channelGeneration) {
          return;
        }

        if (status === "SUBSCRIBED") {
          reconnectAttempts = 0;
          refreshNow();
          return;
        }

        if (error) {
          console.warn(`Realtime subscription ${status.toLowerCase()}.`, error);
        }

        scheduleReconnect();
      });
  };

  const reconnectNow = () => {
    if (isStopped) {
      return;
    }

    clearReconnectTimer();
    reconnectAttempts = 0;
    connect();
    refreshNow();
  };

  const scheduleReconnect = () => {
    if (isStopped || reconnectTimeoutId !== undefined) {
      return;
    }

    if (navigator.onLine === false) {
      return;
    }

    const delay =
      REALTIME_RECONNECT_DELAYS_MS[
        Math.min(reconnectAttempts, REALTIME_RECONNECT_DELAYS_MS.length - 1)
      ];
    reconnectAttempts += 1;

    reconnectTimeoutId = window.setTimeout(() => {
      reconnectTimeoutId = undefined;
      connect();
    }, delay);
  };

  const reconnectWhenOnline = () => reconnectNow();
  const refreshAndReconnectWhenVisible = () => {
    if (document.visibilityState === "visible") {
      reconnectNow();
    }
  };

  connect();

  window.addEventListener("online", reconnectWhenOnline);
  document.addEventListener("visibilitychange", refreshAndReconnectWhenVisible);

  return () => {
    isStopped = true;
    channelGeneration += 1;
    clearReconnectTimer();
    removeCurrentChannel();
    window.removeEventListener("online", reconnectWhenOnline);
    document.removeEventListener("visibilitychange", refreshAndReconnectWhenVisible);
  };
}

async function loadSubmissionsForMembership(
  gameId: string,
  membership: Membership,
) {
  const client = requireSupabase();
  let query = client
    .from("submissions")
    .select("*")
    .eq("game_id", gameId)
    .order("updated_at", { ascending: false });

  if (membership.role === "player" && membership.groupId) {
    query = query.eq("group_slug", membership.groupId);
  }

  const result = await query;

  if (result.error) {
    throw result.error;
  }

  return hydrateSubmissions(result.data);
}

async function loadBoardAssignments(gameId: string) {
  const client = requireSupabase();
  const result = await client
    .from("group_board_tasks")
    .select("*")
    .eq("game_id", gameId)
    .order("slot_order", { ascending: true });

  if (result.error) {
    throw result.error;
  }

  return result.data.map(mapBoardAssignment);
}

async function loadGameMemberships(gameId: string) {
  const client = requireSupabase();
  const result = await client
    .from("memberships")
    .select("*")
    .eq("game_id", gameId)
    .order("created_at", { ascending: true });

  if (result.error) {
    throw result.error;
  }

  return result.data.map(mapMembership);
}

async function loadGameRoster(gameId: string) {
  const client = requireSupabase();
  const result = await client.rpc("get_game_roster", { target_game_id: gameId });

  if (result.error) {
    throw result.error;
  }

  return result.data.map(mapRosterMember);
}

async function hydrateSubmissions(rows: SubmissionRow[]) {
  const client = requireSupabase();
  const submittedByIds = [...new Set(rows.map((row) => row.submitted_by))];
  const gameIds = [...new Set(rows.map((row) => row.game_id))];
  const submitterNames = new Map<string, string>();

  if (submittedByIds.length > 0 && gameIds.length > 0) {
    const membershipsResult = await client
      .from("memberships")
      .select("game_id,user_id,display_name")
      .in("game_id", gameIds)
      .in("user_id", submittedByIds);

    if (!membershipsResult.error) {
      membershipsResult.data.forEach((membership) => {
        submitterNames.set(
          getSubmitterKey(membership.game_id, membership.user_id),
          membership.display_name,
        );
      });
    }
  }

  return Promise.all(
    rows.map(async (row) => {
      const signedUrlResult = await client.storage
        .from(PROOFS_BUCKET)
        .createSignedUrl(row.image_path, 60 * 60);

      return mapSubmission(
        row,
        signedUrlResult.error ? "" : signedUrlResult.data.signedUrl,
        submitterNames.get(getSubmitterKey(row.game_id, row.submitted_by)) ?? null,
      );
    }),
  );
}

function getSubmitterKey(gameId: string, userId: string) {
  return `${gameId}:${userId}`;
}

async function listStoredProofPaths(prefix: string): Promise<string[]> {
  const client = requireSupabase();
  const paths: string[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const listResult = await client.storage
      .from(PROOFS_BUCKET)
      .list(prefix, { limit, offset });

    if (listResult.error) {
      throw listResult.error;
    }

    if (listResult.data.length === 0) {
      break;
    }

    for (const item of listResult.data) {
      const itemPath = `${prefix}/${item.name}`;

      if (STORAGE_PLACEHOLDER_NAMES.has(item.name)) {
        continue;
      }

      if (item.id) {
        paths.push(itemPath);
      } else {
        paths.push(...(await listStoredProofPaths(itemPath)));
      }
    }

    if (listResult.data.length < limit) {
      break;
    }

    offset += limit;
  }

  return paths;
}

function mapGame(row: GameRow): Game {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    phase: row.phase,
    activeStopId: row.active_stop_id,
    timerRunning: row.timer_running,
    timerStartedAt: row.timer_started_at,
    timerSecondsTotal: row.timer_seconds_total,
    boardHidden: row.board_hidden,
  };
}

function mapGroup(row: GroupRow): Group {
  return {
    id: row.slug,
    name: row.name,
    shortName: row.short_name,
    color: `var(--group-${row.color_key})`,
    dark: `var(--group-${row.color_key}-dark)`,
    soft: `var(--group-${row.color_key}-soft)`,
  };
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.slug,
    title: row.title,
    description: row.description,
    icon: row.icon,
    free: row.is_free,
    sortOrder: row.sort_order,
  };
}

function mapBoardAssignment(row: BoardAssignmentRow): BoardAssignment {
  return {
    groupId: row.group_slug,
    taskId: row.task_slug,
    slotOrder: row.slot_order,
  };
}

function mapStop(row: StopRow): HuntStop {
  return {
    id: row.id,
    name: row.name,
    detail: row.detail,
    arriveTime: row.arrive_time,
    leaveTime: row.leave_time,
    sortOrder: row.sort_order,
  };
}

function mapMembership(row: MembershipRow): Membership {
  return {
    id: row.id,
    gameId: row.game_id,
    userId: row.user_id,
    role: row.role,
    groupId: row.group_slug,
    displayName: row.display_name,
  };
}

function mapRosterMember(row: RosterRow): RosterMember {
  return {
    id: row.id,
    gameId: row.game_id,
    role: row.role,
    groupId: row.group_slug,
    displayName: row.display_name,
  };
}

function mapSubmission(
  row: SubmissionRow,
  imageUrl: string,
  submittedByName: string | null,
): Submission {
  return {
    id: row.id,
    groupId: row.group_slug,
    taskId: row.task_slug,
    submittedBy: row.submitted_by,
    submittedByName,
    imageUrl,
    imagePath: row.image_path,
    imageName: row.image_name,
    status: row.status,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function normalizeGameCode(gameCode: string) {
  return gameCode.trim().toUpperCase();
}

function getFileExtension(file: File) {
  const filenameExtension = file.name.split(".").pop()?.toLowerCase();

  if (filenameExtension && /^[a-z0-9]{2,5}$/.test(filenameExtension)) {
    return filenameExtension;
  }

  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/heic") return "heic";
  if (file.type === "image/heif") return "heif";

  return "jpg";
}
