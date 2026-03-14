/**
 * AuthService — singleton client-side auth service.
 *
 * Detects whether a backend is available (DB mode) or not (simple/localStorage mode).
 * In simple mode, all auth methods are no-ops and isAuthenticated() returns false.
 */

import type { User, AuthState, LoginRequest, RegisterRequest } from './auth-types.js';
import { loadFromStorage, STORAGE_KEYS } from '../storage/local-storage.js';

type AuthChangeCallback = (state: AuthState) => void;

const AUTH_STATE_DEFAULTS: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
};

let _state: AuthState = { ...AUTH_STATE_DEFAULTS };
let _dbMode: boolean | null = null; // null = not yet detected
let _checkAuthPromise: Promise<AuthState> | null = null;
let _baseUrl = '';
const _listeners: Set<AuthChangeCallback> = new Set();

function notify(): void {
  for (const cb of _listeners) {
    try { cb(_state); } catch { /* ignore listener errors */ }
  }
}

function setState(partial: Partial<AuthState>): void {
  _state = { ..._state, ...partial };
  notify();
}

async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${_baseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
}

// ──────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────

/**
 * Set the API base URL (e.g. 'http://localhost:3001' in dev).
 * Must be called before checkAuth().
 */
export function setAuthBaseUrl(url: string): void {
  _baseUrl = url;
}

/**
 * Detect whether the backend API is available.
 * Caches the result after the first call.
 */
export async function isDbMode(): Promise<boolean> {
  if (_dbMode !== null) return _dbMode;

  try {
    const res = await fetch(`${_baseUrl}/api/auth/me`, {
      credentials: 'include',
    });
    // If we get any response (200 or 401), the backend is available
    _dbMode = res.status === 200 || res.status === 401;
  } catch {
    _dbMode = false;
  }

  // Set a global flag so fire-and-forget code (beacon) can detect DB mode synchronously
  if (_dbMode && typeof window !== 'undefined') {
    (window as any).__gwDbMode = true;
  }

  return _dbMode;
}

/**
 * Check current authentication state by calling GET /api/auth/me.
 * Should be called once on app startup.
 * Caches the promise so concurrent callers (app + header) share one request.
 */
export async function checkAuth(): Promise<AuthState> {
  if (_checkAuthPromise) return _checkAuthPromise;
  _checkAuthPromise = _doCheckAuth();
  return _checkAuthPromise;
}

async function _doCheckAuth(): Promise<AuthState> {
  try {
    const dbAvailable = await isDbMode();

    if (!dbAvailable) {
      setState({ user: null, isAuthenticated: false, isLoading: false });
      return _state;
    }

    const res = await apiFetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      setState({ user: data.user, isAuthenticated: true, isLoading: false });
    } else {
      setState({ user: null, isAuthenticated: false, isLoading: false });
    }
  } catch {
    // Invalidate promise cache on failure so next caller can retry
    _checkAuthPromise = null;
    setState({ user: null, isAuthenticated: false, isLoading: false });
  }

  return _state;
}

/**
 * Login with email/password.
 * On first login with empty DB, triggers localStorage migration.
 */
export async function login(request: LoginRequest): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const data = await res.json();
      return { success: false, error: data.error || 'Login failed' };
    }

    const data = await res.json();
    setState({ user: data.user, isAuthenticated: true, isLoading: false });

    // Auto-migrate localStorage data if not yet done
    await autoMigrateIfNeeded();

    return { success: true };
  } catch (err) {
    return { success: false, error: 'Network error' };
  }
}

/**
 * Register a new account.
 */
export async function register(request: RegisterRequest): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const data = await res.json();
      return { success: false, error: data.error || 'Registration failed' };
    }

    const data = await res.json();
    setState({ user: data.user, isAuthenticated: true, isLoading: false });

    // Auto-migrate localStorage data after first registration
    await autoMigrateIfNeeded();

    return { success: true };
  } catch (err) {
    return { success: false, error: 'Network error' };
  }
}

/**
 * Logout: clears cookie and local state.
 */
export async function logout(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Ignore errors — clear state anyway
  }
  setState({ user: null, isAuthenticated: false, isLoading: false });
}

/**
 * Subscribe to auth state changes. Returns an unsubscribe function.
 */
export function onAuthChange(callback: AuthChangeCallback): () => void {
  _listeners.add(callback);
  return () => { _listeners.delete(callback); };
}

/** Get current auth state (synchronous). */
export function getAuthState(): AuthState {
  return _state;
}

/** Get current user (synchronous). */
export function getUser(): User | null {
  return _state.user;
}

/** Is user authenticated (synchronous). */
export function isAuthenticated(): boolean {
  return _state.isAuthenticated;
}

// ──────────────────────────────────────────────────────────────
// Auto-migration of localStorage data
// ──────────────────────────────────────────────────────────────

const MIGRATED_KEY = 'gw-migrated';

async function autoMigrateIfNeeded(): Promise<void> {
  // Already migrated?
  if (localStorage.getItem(MIGRATED_KEY)) return;

  const sources = loadFromStorage<unknown[]>(STORAGE_KEYS.SOURCES, []);
  const connections = loadFromStorage<unknown[]>(STORAGE_KEYS.CONNECTIONS, []);
  const favorites = loadFromStorage<unknown[]>(STORAGE_KEYS.FAVORITES, []);
  const dashboards = loadFromStorage<unknown[]>(STORAGE_KEYS.DASHBOARDS, []);

  const hasLocalData =
    sources.length > 0 || connections.length > 0 ||
    favorites.length > 0 || dashboards.length > 0;

  if (!hasLocalData) {
    localStorage.setItem(MIGRATED_KEY, '1');
    return;
  }

  try {
    const res = await apiFetch('/api/migrate', {
      method: 'POST',
      body: JSON.stringify({ sources, connections, favorites, dashboards }),
    });

    if (res.ok) {
      localStorage.setItem(MIGRATED_KEY, '1');
      console.info('[auth] localStorage data migrated to server');
    }
  } catch {
    console.warn('[auth] Migration failed, will retry on next login');
  }
}

// ──────────────────────────────────────────────────────────────
// Reset (for tests)
// ──────────────────────────────────────────────────────────────

export function _resetAuthState(): void {
  _state = { ...AUTH_STATE_DEFAULTS };
  _dbMode = null;
  _checkAuthPromise = null;
  _baseUrl = '';
  _listeners.clear();
}
