import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  _resetAuthState,
  checkAuth,
  login,
  register,
  logout,
  isDbMode,
  getUser,
  isAuthenticated,
  getAuthState,
  onAuthChange,
  setAuthBaseUrl,
} from '../../packages/shared/src/auth/auth-service';

describe('AuthService', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
    originalFetch = globalThis.fetch;
    _resetAuthState();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('isDbMode', () => {
    it('returns true when backend responds with 200', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ status: 200 });
      expect(await isDbMode()).toBe(true);
    });

    it('returns true when backend responds with 401', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ status: 401 });
      expect(await isDbMode()).toBe(true);
    });

    it('returns false when backend is unreachable', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      expect(await isDbMode()).toBe(false);
    });

    it('caches the result', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ status: 200 });
      await isDbMode();
      await isDbMode();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('checkAuth', () => {
    it('sets user when authenticated', async () => {
      const user = { id: '1', email: 'a@b.com', displayName: 'A', role: 'admin' };

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ status: 200 }) // isDbMode
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ user }) }); // GET /me

      const state = await checkAuth();

      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual(user);
      expect(state.isLoading).toBe(false);
    });

    it('sets unauthenticated when 401', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ status: 401 }) // isDbMode (still returns true)
        .mockResolvedValueOnce({ ok: false, status: 401 }); // GET /me

      const state = await checkAuth();

      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
    });

    it('sets unauthenticated when no backend', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));

      const state = await checkAuth();

      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.isLoading).toBe(false);
    });
  });

  describe('login', () => {
    it('succeeds and sets state', async () => {
      const user = { id: '1', email: 'a@b.com', displayName: 'A', role: 'editor' };

      // First call is isDbMode (from _resetAuthState), then login POST, then migration check
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ user }) }) // POST /login
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) }); // POST /migrate

      const result = await login({ email: 'a@b.com', password: 'pass123' });

      expect(result.success).toBe(true);
      expect(isAuthenticated()).toBe(true);
      expect(getUser()).toEqual(user);
    });

    it('returns error on failure', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: 'Invalid email or password' }),
        });

      const result = await login({ email: 'a@b.com', password: 'wrong' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Invalid/);
      expect(isAuthenticated()).toBe(false);
    });

    it('returns error on network failure', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));

      const result = await login({ email: 'a@b.com', password: 'pass' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Network/);
    });
  });

  describe('register', () => {
    it('succeeds and sets state', async () => {
      const user = { id: '1', email: 'new@b.com', displayName: 'New', role: 'admin' };

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ user }) }) // POST /register
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) }); // POST /migrate

      const result = await register({ email: 'new@b.com', password: 'pass123', displayName: 'New' });

      expect(result.success).toBe(true);
      expect(isAuthenticated()).toBe(true);
      expect(getUser()?.displayName).toBe('New');
    });

    it('returns error on duplicate email', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: 'Email already registered' }),
        });

      const result = await register({ email: 'dup@b.com', password: 'pass123', displayName: 'Dup' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/already/i);
    });
  });

  describe('logout', () => {
    it('clears state', async () => {
      const user = { id: '1', email: 'a@b.com', displayName: 'A', role: 'admin' };

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ user }) }) // login
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) }) // migrate
        .mockResolvedValueOnce({ ok: true }); // logout

      await login({ email: 'a@b.com', password: 'pass' });
      expect(isAuthenticated()).toBe(true);

      await logout();
      expect(isAuthenticated()).toBe(false);
      expect(getUser()).toBeNull();
    });

    it('clears state even if API fails', async () => {
      const user = { id: '1', email: 'a@b.com', displayName: 'A', role: 'admin' };

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ user }) }) // login
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) }) // migrate
        .mockRejectedValueOnce(new Error('offline')); // logout

      await login({ email: 'a@b.com', password: 'pass' });
      await logout();

      expect(isAuthenticated()).toBe(false);
    });
  });

  describe('onAuthChange', () => {
    it('notifies on state change', async () => {
      const changes: boolean[] = [];
      onAuthChange((state) => { changes.push(state.isAuthenticated); });

      const user = { id: '1', email: 'a@b.com', displayName: 'A', role: 'admin' };
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ user }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

      await login({ email: 'a@b.com', password: 'pass' });

      expect(changes).toContain(true);
    });

    it('returns unsubscribe function', async () => {
      const changes: boolean[] = [];
      const unsub = onAuthChange((state) => { changes.push(state.isAuthenticated); });

      unsub();

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ user: { id: '1' } }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

      await login({ email: 'a@b.com', password: 'pass' });

      expect(changes.length).toBe(0);
    });
  });

  describe('auto-migration', () => {
    it('migrates localStorage data on first login', async () => {
      localStorage.setItem('dsfr-data-sources', JSON.stringify([{ id: 'src-1', name: 'Test' }]));

      const user = { id: '1', email: 'a@b.com', displayName: 'A', role: 'admin' };
      let migrateCalled = false;

      globalThis.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/api/auth/login')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ user }) });
        }
        if (url.includes('/api/migrate') && options?.method === 'POST') {
          migrateCalled = true;
          const body = JSON.parse(options.body as string);
          expect(body.sources).toEqual([{ id: 'src-1', name: 'Test' }]);
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ imported: { sources: 1 } }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      await login({ email: 'a@b.com', password: 'pass' });

      expect(migrateCalled).toBe(true);
      expect(localStorage.getItem('gw-migrated')).toBe('1');
    });

    it('skips migration if already migrated', async () => {
      localStorage.setItem('gw-migrated', '1');
      localStorage.setItem('dsfr-data-sources', JSON.stringify([{ id: 'src-1' }]));

      const user = { id: '1', email: 'a@b.com', displayName: 'A', role: 'admin' };

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/auth/login')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ user }) });
        }
        if (url.includes('/api/migrate')) {
          throw new Error('Should not call migrate');
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      await login({ email: 'a@b.com', password: 'pass' });
      // No error = migration was not called
    });

    it('skips migration if no localStorage data', async () => {
      const user = { id: '1', email: 'a@b.com', displayName: 'A', role: 'admin' };
      let migrateCalled = false;

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/auth/login')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ user }) });
        }
        if (url.includes('/api/migrate')) {
          migrateCalled = true;
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      await login({ email: 'a@b.com', password: 'pass' });

      expect(migrateCalled).toBe(false);
      // Should still mark as migrated
      expect(localStorage.getItem('gw-migrated')).toBe('1');
    });
  });

  describe('setAuthBaseUrl', () => {
    it('prepends baseUrl to fetch calls', async () => {
      setAuthBaseUrl('http://localhost:3001');
      globalThis.fetch = vi.fn().mockResolvedValue({ status: 200 });

      _resetAuthState();
      setAuthBaseUrl('http://localhost:3001');

      await isDbMode();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/auth/me',
        expect.any(Object),
      );
    });
  });

  describe('getAuthState', () => {
    it('returns initial loading state', () => {
      const state = getAuthState();
      expect(state.isLoading).toBe(true);
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });
});
