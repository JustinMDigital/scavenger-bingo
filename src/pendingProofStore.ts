const DATABASE_NAME = "scavenger-blackout-pending-proofs";
const DATABASE_VERSION = 1;
const STORE_NAME = "pendingProofs";

let pendingProofDbPromise: Promise<IDBDatabase> | null = null;

export type PendingProofUpload = {
  id: string;
  gameId: string;
  gameCode: string;
  groupId: string;
  taskId: string;
  file: File;
  fileName: string;
  fileSize: number;
  fileType: string;
  createdAt: number;
  updatedAt: number;
  retryCount: number;
  lastError: string;
};

export function createPendingProofUpload({
  file,
  gameCode,
  gameId,
  groupId,
  taskId,
}: {
  file: File;
  gameCode: string;
  gameId: string;
  groupId: string;
  taskId: string;
}): PendingProofUpload {
  const now = Date.now();

  return {
    id: getPendingProofId(gameId, groupId, taskId),
    gameId,
    gameCode,
    groupId,
    taskId,
    file,
    fileName: file.name || "proof photo",
    fileSize: file.size,
    fileType: file.type,
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
    lastError: "",
  };
}

export async function readPendingProofUploads() {
  const db = await openPendingProofDb();

  return new Promise<PendingProofUpload[]>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();

    request.onsuccess = () =>
      resolve(
        (request.result as PendingProofUpload[])
          .map(normalizePendingProofUpload)
          .sort((first, second) => second.updatedAt - first.updatedAt),
      );
    request.onerror = () =>
      reject(request.error ?? new Error("Saved proof photos could not be read."));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Saved proof photos could not be read."));
  });
}

export async function savePendingProofUpload(upload: PendingProofUpload) {
  const db = await openPendingProofDb();

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const request = transaction.objectStore(STORE_NAME).put(upload);

    request.onerror = () =>
      reject(request.error ?? new Error("Proof photo could not be saved for retry."));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Proof photo could not be saved for retry."));
  });
}

export async function deletePendingProofUpload(id: string) {
  const db = await openPendingProofDb();

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const request = transaction.objectStore(STORE_NAME).delete(id);

    request.onerror = () =>
      reject(request.error ?? new Error("Saved proof photo could not be cleared."));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Saved proof photo could not be cleared."));
  });
}

function getPendingProofId(gameId: string, groupId: string, taskId: string) {
  return `${gameId}:${groupId}:${taskId}`;
}

function normalizePendingProofUpload(upload: PendingProofUpload): PendingProofUpload {
  const rawFile = upload.file as Blob;
  const fallbackName = upload.fileName || "proof photo";
  const fallbackUpdatedAt = Number.isFinite(upload.updatedAt)
    ? upload.updatedAt
    : Date.now();
  const file =
    rawFile instanceof File
      ? rawFile
      : new File([rawFile], fallbackName, {
          type: upload.fileType || rawFile.type,
          lastModified: fallbackUpdatedAt,
        });

  return {
    ...upload,
    file,
    fileName: fallbackName,
    fileSize: upload.fileSize || file.size,
    fileType: upload.fileType || file.type,
    createdAt: Number.isFinite(upload.createdAt)
      ? upload.createdAt
      : fallbackUpdatedAt,
    updatedAt: fallbackUpdatedAt,
    retryCount: Number.isFinite(upload.retryCount) ? upload.retryCount : 0,
    lastError: upload.lastError || "",
  };
}

function openPendingProofDb() {
  if (pendingProofDbPromise) {
    return pendingProofDbPromise;
  }

  pendingProofDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("This browser cannot save proof photos for retry."));
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Proof photo retry storage could not open."));
    request.onblocked = () =>
      reject(new Error("Proof photo retry storage is blocked by another tab."));
  });

  pendingProofDbPromise.catch(() => {
    pendingProofDbPromise = null;
  });

  return pendingProofDbPromise;
}
