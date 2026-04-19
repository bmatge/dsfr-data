/**
 * SyncQueue — reliable background synchronization with retry and status tracking.
 *
 * Replaces the fire-and-forget sync in ApiStorageAdapter.
 * - Queues sync operations and processes them sequentially
 * - Retries failed operations with exponential backoff (3 attempts: 2s, 4s, 8s)
 * - Exposes sync status for UI indicators
 * - Never performs implicit DELETEs (deletions must be explicit)
 * - Persists queue to localStorage so operations survive page reloads
 */

import { authenticatedFetch } from '../auth/auth-service.js';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

type SyncStatusCallback = (status: SyncStatus, errorCount: number) => void;

interface SyncOperation {
  method: 'POST' | 'PUT' | 'DELETE';
  url: string;
  body?: string;
  retries: number;
}

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 2000;
const QUEUE_STORAGE_KEY = 'dsfr-data-sync-queue';

let _status: SyncStatus = 'idle';
let _errorCount = 0;
const _listeners: Set<SyncStatusCallback> = new Set();
let _queue: SyncOperation[] = [];
let _processing = false;
let _baseUrl = '';

// ---- Persistence helpers ----

function persistQueue(): void {
  try {
    if (_queue.length === 0) {
      localStorage.removeItem(QUEUE_STORAGE_KEY);
    } else {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(_queue));
    }
  } catch {
    /* QuotaExceeded or unavailable — continue without persistence */
  }
}

function restoreQueue(): SyncOperation[] {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Reset retries on restore (fresh attempt after page reload)
    return parsed.map((op: SyncOperation) => ({ ...op, retries: 0 }));
  } catch {
    return [];
  }
}

// ---- Status management ----

function setStatus(status: SyncStatus, errors: number): void {
  _status = status;
  _errorCount = errors;
  for (const cb of _listeners) {
    try {
      cb(_status, _errorCount);
    } catch {
      /* ignore */
    }
  }
}

/** Subscribe to sync status changes. Returns unsubscribe function. */
export function onSyncStatusChange(cb: SyncStatusCallback): () => void {
  _listeners.add(cb);
  // Immediately notify current state
  try {
    cb(_status, _errorCount);
  } catch {
    /* ignore */
  }
  return () => {
    _listeners.delete(cb);
  };
}

/** Get current sync status */
export function getSyncStatus(): { status: SyncStatus; errorCount: number } {
  return { status: _status, errorCount: _errorCount };
}

/** Set the API base URL for sync operations */
export function setSyncBaseUrl(url: string): void {
  _baseUrl = url;
  // Restore persisted queue and resume processing
  const restored = restoreQueue();
  if (restored.length > 0) {
    _queue.push(...restored);
    processQueue();
  }
}

/** Enqueue a sync operation */
export function enqueueSync(
  method: 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  body?: unknown
): void {
  const url = `${_baseUrl}${endpoint}`;
  _queue.push({
    method,
    url,
    body: body ? JSON.stringify(body) : undefined,
    retries: 0,
  });
  persistQueue();
  processQueue();
}

/** Sync an array of items to an API endpoint (smart diff without implicit DELETE) */
export async function syncItems(
  endpoint: string,
  items: { id?: string; [key: string]: unknown }[]
): Promise<void> {
  if (!items || items.length === 0) return;

  setStatus('syncing', _errorCount);

  // Get current remote items
  let remoteItems: { id: string }[];
  try {
    const response = await fetch(`${_baseUrl}${endpoint}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      if (response.status === 401) {
        // Not authenticated — skip sync silently
        setStatus('idle', _errorCount);
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }
    remoteItems = await response.json();
  } catch {
    setStatus('error', _errorCount + 1);
    return;
  }

  const remoteIds = new Set(remoteItems.map((r) => r.id));

  // Create or update local items on the server
  for (const item of items) {
    if (!item.id) continue;

    const method = remoteIds.has(item.id) ? 'PUT' : 'POST';
    const url = method === 'PUT' ? `${endpoint}/${item.id}` : endpoint;

    enqueueSync(method, url, item);
  }

  // NOTE: We intentionally do NOT delete remote items absent from the local array.
  // Deletions must be triggered explicitly by user action (deleteItem below).
}

/** Explicitly delete a single remote item */
export function deleteItem(endpoint: string, id: string): void {
  enqueueSync('DELETE', `${endpoint}/${id}`);
}

async function processQueue(): Promise<void> {
  if (_processing) return;
  _processing = true;

  while (_queue.length > 0) {
    const op = _queue[0];
    setStatus('syncing', _errorCount);

    try {
      // authenticatedFetch auto-inject `X-CSRF-Token` sur les mutations
      // (POST/PUT/DELETE) et retry 1 fois sur 403 CSRF_INVALID (cf. #92).
      const response = await authenticatedFetch(op.url, {
        method: op.method,
        headers: op.body ? { 'Content-Type': 'application/json' } : undefined,
        body: op.body,
      });

      if (response.ok || response.status === 404 || response.status === 409) {
        // Success, or resource already gone/exists — remove from queue
        _queue.shift();
        persistQueue();
        _errorCount = Math.max(0, _errorCount - 1);
      } else if (response.status === 401) {
        // Not authenticated — clear queue, no point retrying
        _queue.length = 0;
        persistQueue();
        setStatus('idle', 0);
        break;
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch {
      op.retries++;
      if (op.retries >= MAX_RETRIES) {
        // Give up on this operation
        _queue.shift();
        persistQueue();
        _errorCount++;
        console.warn(`[SyncQueue] Gave up on ${op.method} ${op.url} after ${MAX_RETRIES} retries`);
      } else {
        // Exponential backoff
        const delay = BACKOFF_BASE_MS * Math.pow(2, op.retries - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  _processing = false;
  setStatus(_errorCount > 0 ? 'error' : 'idle', _errorCount);
}

/** Reset sync state (for tests) */
export function _resetSyncQueue(): void {
  _queue = [];
  _processing = false;
  _status = 'idle';
  _errorCount = 0;
  _listeners.clear();
  _baseUrl = '';
  try {
    localStorage.removeItem(QUEUE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
