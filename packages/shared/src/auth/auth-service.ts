/**
 * AuthService — singleton client-side auth service.
 *
 * Detects whether a backend is available (DB mode) or not (simple/localStorage mode).
 * In simple mode, all auth methods are no-ops and isAuthenticated() returns false.
 */

import type { User, AuthState, LoginRequest, RegisterRequest } from './auth-types.js';
import { loadFromStorage, removeFromStorage, STORAGE_KEYS } from '../storage/local-storage.js';

type AuthChangeCallback = (state: AuthState) => void;

const AUTH_STATE_DEFAULTS: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
};

/**
 * Etat MUTABLE partage via window (#320) : les apps chargent les composants
 * via les bundles pre-compiles (dsfr-data.esm.js, app-ui.esm.js) ET
 * importent @dsfr-data/shared aliase sur src — deux copies compilees de ce
 * module coexistent a l'execution. Avec un etat module-level on avait :
 * double fetch /api/auth/me au demarrage, caches CSRF separes, et
 * l'indicateur de sync du header aveugle aux syncs reels. Meme pattern que
 * le data-bridge (__dsfrDataCache).
 */
interface SharedAuthInternals {
  state: AuthState;
  dbMode: boolean | null;
  checkAuthPromise: Promise<AuthState> | null;
  baseUrl: string;
  csrfToken: string | null;
  listeners: Set<AuthChangeCallback>;
}

const _g = (typeof window !== 'undefined' ? window : globalThis) as {
  __dsfrDataAuthShared?: SharedAuthInternals;
};
const shared: SharedAuthInternals = (_g.__dsfrDataAuthShared ??= {
  state: { ...AUTH_STATE_DEFAULTS },
  dbMode: null,
  checkAuthPromise: null,
  baseUrl: '',
  csrfToken: null,
  listeners: new Set(),
});

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Endpoints qui ne requièrent PAS de token CSRF côté client — doit rester
 * synchronisé avec la SKIP_PATHS de server/src/middleware/csrf.ts (routes
 * d'auth-bootstrap + health check + l'émetteur du token lui-même).
 */
const CSRF_SKIP_PATHS = new Set<string>([
  '/api/health',
  '/api/auth/csrf',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
]);

function notify(): void {
  for (const cb of shared.listeners) {
    try {
      cb(shared.state);
    } catch {
      /* ignore listener errors */
    }
  }
}

function setState(partial: Partial<AuthState>): void {
  shared.state = { ...shared.state, ...partial };
  notify();
}

/**
 * Fetch a fresh CSRF token from GET /api/auth/csrf and cache it in memory.
 * Le token est distribué via cookie non-httpOnly ET body — on lit le body et
 * on l'écho dans `X-CSRF-Token`.
 */
async function fetchCsrfToken(): Promise<string | null> {
  try {
    const res = await fetch(`${shared.baseUrl}/api/auth/csrf`, { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    shared.csrfToken = typeof data?.csrfToken === 'string' ? data.csrfToken : null;
    return shared.csrfToken;
  } catch {
    return null;
  }
}

async function apiFetchOnce(path: string, options?: RequestInit): Promise<Response> {
  const method = (options?.method ?? 'GET').toUpperCase();
  const needsCsrf = MUTATION_METHODS.has(method) && !CSRF_SKIP_PATHS.has(path);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  };

  if (needsCsrf) {
    if (!shared.csrfToken) await fetchCsrfToken();
    if (shared.csrfToken) headers['X-CSRF-Token'] = shared.csrfToken;
  }

  return fetch(`${shared.baseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });
}

/**
 * Fetch wrapper aware of CSRF. Pour les requêtes muantes, injecte le header
 * `X-CSRF-Token` depuis le cache mémoire. Si le server rejette avec 403
 * CSRF_INVALID (token expiré/rotaté), refetch le token et retry UNE fois.
 */
async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const res = await apiFetchOnce(path, options);
  const method = (options?.method ?? 'GET').toUpperCase();

  if (res.status === 403 && MUTATION_METHODS.has(method) && !CSRF_SKIP_PATHS.has(path)) {
    // Peek body for CSRF_INVALID without consuming it
    const cloned = res.clone();
    try {
      const data = await cloned.json();
      if (data?.code === 'CSRF_INVALID') {
        shared.csrfToken = null;
        await fetchCsrfToken();
        return apiFetchOnce(path, options);
      }
    } catch {
      // Not JSON — fall through to returning the original response
    }
  }

  return res;
}

// ──────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────

/**
 * Detect whether the backend API is available.
 * Caches the result after the first call.
 */
export async function isDbMode(): Promise<boolean> {
  if (shared.dbMode !== null) return shared.dbMode;

  try {
    const res = await fetch(`${shared.baseUrl}/api/auth/me`, {
      credentials: 'include',
    });
    // If we get any response (200 or 401), the backend is available
    shared.dbMode = res.status === 200 || res.status === 401;
  } catch {
    // Echec RESEAU (backend qui redemarre) : ne pas figer le mode (#322) —
    // l'app restait en 'simple mode' jusqu'au reload. null = re-sonde au
    // prochain appel.
    shared.dbMode = null;
    return false;
  }

  // Set a global flag so fire-and-forget code (beacon) can detect DB mode synchronously
  if (shared.dbMode && typeof window !== 'undefined') {
    (window as Window & { __gwDbMode?: boolean }).__gwDbMode = true;
  }

  return shared.dbMode;
}

/**
 * Check current authentication state by calling GET /api/auth/me.
 * Should be called once on app startup.
 * Caches the promise so concurrent callers (app + header) share one request.
 */
export async function checkAuth(): Promise<AuthState> {
  if (shared.checkAuthPromise) return shared.checkAuthPromise;
  shared.checkAuthPromise = _doCheckAuth();
  return shared.checkAuthPromise;
}

async function _doCheckAuth(): Promise<AuthState> {
  try {
    const dbAvailable = await isDbMode();

    if (!dbAvailable) {
      setState({ user: null, isAuthenticated: false, isLoading: false });
      return shared.state;
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
    shared.checkAuthPromise = null;
    setState({ user: null, isAuthenticated: false, isLoading: false });
  }

  return shared.state;
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

    // La session côté server vient de changer (anonymous → userId), donc le
    // token CSRF mis en cache est lié à l'ancienne session. On force un fresh
    // fetch pour les mutations qui suivent (auto-migrate, saves…).
    shared.csrfToken = null;
    await fetchCsrfToken();

    // Auto-migrate localStorage data if not yet done
    await autoMigrateIfNeeded();

    return { success: true };
  } catch {
    return { success: false, error: 'Network error' };
  }
}

/**
 * Register a new account.
 */
export async function register(
  request: RegisterRequest
): Promise<{ success: boolean; error?: string }> {
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

    // Cf. login : session change → CSRF token à rafraîchir.
    shared.csrfToken = null;
    await fetchCsrfToken();

    // Auto-migrate localStorage data after first registration
    await autoMigrateIfNeeded();

    return { success: true };
  } catch {
    return { success: false, error: 'Network error' };
  }
}

/**
 * Change password (requires current password).
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await apiFetch('/api/auth/me', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, password: newPassword }),
    });

    if (!res.ok) {
      const data = await res.json();
      return { success: false, error: data.error || 'Erreur lors du changement de mot de passe' };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Erreur reseau' };
  }
}

/**
 * Request a password reset email.
 * Always returns success to avoid leaking account existence.
 */
export async function forgotPassword(
  email: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await apiFetch('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });

    const data = await res.json();
    return { success: true, message: data.message };
  } catch {
    return {
      success: true,
      message: 'Si un compte existe avec cet email, un lien de reinitialisation a ete envoye',
    };
  }
}

/**
 * Reset password using a token (from email link).
 */
export async function resetPassword(
  token: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await apiFetch('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      return { success: false, error: data.error || 'Erreur lors de la reinitialisation' };
    }

    const data = await res.json();
    setState({ user: data.user, isAuthenticated: true, isLoading: false });
    return { success: true };
  } catch {
    return { success: false, error: 'Erreur reseau' };
  }
}

/**
 * Logout: clears cookie and local state.
 *
 * Also clears per-user localStorage entries that should not leak between
 * accounts on a shared machine — currently the product tour state, which
 * is re-hydrated from the server on next login.
 */
export async function logout(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Ignore errors — clear state anyway
  }
  shared.csrfToken = null;
  removeFromStorage(STORAGE_KEYS.TOURS);
  setState({ user: null, isAuthenticated: false, isLoading: false });
}

/**
 * Subscribe to auth state changes. Returns an unsubscribe function.
 */
export function onAuthChange(callback: AuthChangeCallback): () => void {
  shared.listeners.add(callback);
  return () => {
    shared.listeners.delete(callback);
  };
}

/** Get current auth state (synchronous). */
export function getAuthState(): AuthState {
  return shared.state;
}

/** Get current user (synchronous). */
export function getUser(): User | null {
  return shared.state.user;
}

/** Is user authenticated (synchronous). */
export function isAuthenticated(): boolean {
  return shared.state.isAuthenticated;
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
    sources.length > 0 || connections.length > 0 || favorites.length > 0 || dashboards.length > 0;

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
      console.warn('[auth] localStorage data migrated to server');
    }
  } catch {
    console.warn('[auth] Migration failed, will retry on next login');
  }
}

// ──────────────────────────────────────────────────────────────
// Reset (for tests)
// ──────────────────────────────────────────────────────────────

export function _resetAuthState(): void {
  shared.state = { ...AUTH_STATE_DEFAULTS };
  shared.dbMode = null;
  shared.checkAuthPromise = null;
  shared.baseUrl = '';
  shared.csrfToken = null;
  shared.listeners.clear();
}

/**
 * Pré-positionne le CSRF token pour les tests qui veulent éviter le fetch
 * implicite vers /api/auth/csrf avant leur première mutation. À n'utiliser
 * que dans les tests.
 */
export function _setCsrfTokenForTest(token: string | null): void {
  shared.csrfToken = token;
}

/**
 * Fetch wrapper avec credentials + auto-injection CSRF.
 * Pour les consommateurs qui ne sont PAS dans auth-service lui-même :
 * sync-queue, api-storage-adapter, etc. Les requêtes muantes (POST/PUT/…)
 * reçoivent automatiquement `X-CSRF-Token` et retry 1 fois sur 403.
 */
export async function authenticatedFetch(path: string, options?: RequestInit): Promise<Response> {
  return apiFetch(path, options);
}

// ──────────────────────────────────────────────────────────────
// External auth providers (SSO / OIDC) — epic #359
// ──────────────────────────────────────────────────────────────

export interface AuthProvider {
  id: string;
  label: string;
  loginUrl: string;
}

export interface AuthProvidersResponse {
  providers: AuthProvider[];
  /** When true, local register / login / forgot / reset are 403. Front hides the local form. */
  oidcOnly: boolean;
}

const EMPTY_PROVIDERS: AuthProvidersResponse = { providers: [], oidcOnly: false };

/**
 * GET /api/auth/providers — public endpoint, no auth.
 * Returns the list of external SSO providers the server has configured
 * (empty in self-hosted deployments that don't use SSO). Drives the
 * conditional "Se connecter avec…" button in the login modal.
 */
export async function fetchAuthProviders(): Promise<AuthProvidersResponse> {
  try {
    const res = await fetch(`${shared.baseUrl}/api/auth/providers`, {
      credentials: 'include',
    });
    if (!res.ok) return EMPTY_PROVIDERS;
    const data = (await res.json()) as Partial<AuthProvidersResponse>;
    return {
      providers: Array.isArray(data.providers) ? data.providers : [],
      oidcOnly: data.oidcOnly === true,
    };
  } catch {
    return EMPTY_PROVIDERS;
  }
}

/** Garde anti-boucle du SSO silencieux : une tentative par session navigateur (#365). */
const SILENT_SSO_ATTEMPTED_KEY = 'dsfr-data-silent-sso-attempted';

/**
 * SSO silencieux OIDC (#365) : si un provider OIDC est configuré et que
 * l'utilisateur n'est pas loggué localement, tente le flux `prompt=none`
 * via une redirection pleine page.
 * - Session IdP active → callback → loggué, zéro clic.
 * - Pas de session → l'IdP renvoie `login_required`, le callback redirige
 *   vers la page d'origine sans erreur visible.
 * Garde-fou : UNE tentative par session navigateur (sessionStorage, posé
 * AVANT la redirection pour couper toute boucle login_required → retry).
 *
 * Retourne true si une redirection a été déclenchée (l'appelant peut
 * s'arrêter là : la page va se décharger).
 */
export async function attemptSilentSso(): Promise<boolean> {
  try {
    if (sessionStorage.getItem(SILENT_SSO_ATTEMPTED_KEY)) return false;
  } catch {
    return false; // sessionStorage indisponible → pas de tentative (aucune garde possible)
  }

  const { providers } = await fetchAuthProviders();
  const oidcProvider = providers.find((p) => p.id === 'oidc');
  if (!oidcProvider) return false;

  try {
    sessionStorage.setItem(SILENT_SSO_ATTEMPTED_KEY, '1');
  } catch {
    return false;
  }

  const returnTo = window.location.pathname + window.location.search;
  window.location.href = `${oidcProvider.loginUrl}?silent=1&return_to=${encodeURIComponent(returnTo)}`;
  return true;
}
