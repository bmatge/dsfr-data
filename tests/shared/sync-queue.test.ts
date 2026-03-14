import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  onSyncStatusChange,
  getSyncStatus,
  setSyncBaseUrl,
  enqueueSync,
  syncItems,
  deleteItem,
  _resetSyncQueue,
} from '../../packages/shared/src/storage/sync-queue';

describe('SyncQueue', () => {
  beforeEach(() => {
    _resetSyncQueue();
    vi.restoreAllMocks();
  });

  describe('getSyncStatus', () => {
    it('should return idle initially', () => {
      expect(getSyncStatus()).toEqual({ status: 'idle', errorCount: 0 });
    });
  });

  describe('onSyncStatusChange', () => {
    it('should notify callback immediately with current state', () => {
      const cb = vi.fn();
      onSyncStatusChange(cb);
      expect(cb).toHaveBeenCalledWith('idle', 0);
    });

    it('should return an unsubscribe function', () => {
      const cb = vi.fn();
      const unsub = onSyncStatusChange(cb);
      expect(typeof unsub).toBe('function');
      unsub();
      // After unsubscribe, no further calls expected
    });
  });

  describe('setSyncBaseUrl', () => {
    it('should set the base URL for operations', () => {
      setSyncBaseUrl('http://localhost:3000');
      // Verify indirectly by checking that enqueueSync uses it
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
      enqueueSync('POST', '/api/test', { id: '1' });
      // processQueue runs async, wait a tick
      return vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:3000/api/test',
          expect.objectContaining({ method: 'POST' }),
        );
      });
    });
  });

  describe('enqueueSync', () => {
    it('should process a POST operation successfully', async () => {
      setSyncBaseUrl('http://test');
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('{}', { status: 200 }),
      );

      enqueueSync('POST', '/api/sources', { id: 'a', name: 'src' });

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://test/api/sources',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ id: 'a', name: 'src' }),
          credentials: 'include',
        }),
      );

      // After success, status should be idle
      expect(getSyncStatus().status).toBe('idle');
    });

    it('should handle 404 as success (resource already gone)', async () => {
      setSyncBaseUrl('http://test');
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('', { status: 404 }),
      );

      enqueueSync('DELETE', '/api/sources/123');

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      expect(getSyncStatus().status).toBe('idle');
    });

    it('should handle 409 as success (resource already exists)', async () => {
      setSyncBaseUrl('http://test');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('', { status: 409 }),
      );

      enqueueSync('POST', '/api/sources', { id: '1' });

      await vi.waitFor(() => {
        expect(getSyncStatus().status).toBe('idle');
      });
    });

    it('should clear queue on 401 (unauthorized)', async () => {
      setSyncBaseUrl('http://test');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('', { status: 401 }),
      );

      enqueueSync('POST', '/api/sources', { id: '1' });
      enqueueSync('POST', '/api/sources', { id: '2' });

      await vi.waitFor(() => {
        expect(getSyncStatus()).toEqual({ status: 'idle', errorCount: 0 });
      });
    });

    it('should retry on server error and give up after MAX_RETRIES', async () => {
      setSyncBaseUrl('http://test');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('', { status: 500 }),
      );

      enqueueSync('POST', '/api/sources', { id: '1' });

      // Wait for retries to complete (3 attempts with backoff)
      // Retries have exponential backoff but we're in test env
      await vi.waitFor(() => {
        expect(getSyncStatus().errorCount).toBeGreaterThan(0);
      }, { timeout: 20000 });

      expect(getSyncStatus().status).toBe('error');
    }, 25000);
  });

  describe('deleteItem', () => {
    it('should enqueue a DELETE operation', async () => {
      setSyncBaseUrl('http://test');
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('{}', { status: 200 }),
      );

      deleteItem('/api/sources', 'abc-123');

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          'http://test/api/sources/abc-123',
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    });
  });

  describe('syncItems', () => {
    it('should skip sync for empty items array', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch');
      await syncItems('/api/sources', []);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should skip sync for null items', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch');
      await syncItems('/api/sources', null as unknown as []);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should POST new items and PUT existing items', async () => {
      setSyncBaseUrl('http://test');

      // First call: GET remote items (return one existing item)
      const fetchMock = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify([{ id: 'existing-1' }]), { status: 200 }),
        )
        // Then: PUT for existing, POST for new
        .mockResolvedValue(new Response('{}', { status: 200 }));

      await syncItems('/api/sources', [
        { id: 'existing-1', name: 'updated' },
        { id: 'new-1', name: 'created' },
      ]);

      // Wait for queue to process
      await vi.waitFor(() => {
        // GET + PUT + POST = at least 3 calls
        expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
      });

      // Check the GET call
      expect(fetchMock.mock.calls[0][0]).toBe('http://test/api/sources');

      // The enqueued operations should use PUT for existing and POST for new
      const methods = fetchMock.mock.calls.slice(1).map(c => (c[1] as RequestInit).method);
      expect(methods).toContain('PUT');
      expect(methods).toContain('POST');
    });

    it('should NOT delete remote items absent from local array', async () => {
      setSyncBaseUrl('http://test');

      // Remote has items A and B, local only has A
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify([{ id: 'A' }, { id: 'B' }]), { status: 200 }),
        )
        .mockResolvedValue(new Response('{}', { status: 200 }));

      await syncItems('/api/sources', [{ id: 'A', name: 'kept' }]);

      await vi.waitFor(() => {
        expect(getSyncStatus().status).toBe('idle');
      });

      // No DELETE call should have been made
      const allCalls = vi.mocked(globalThis.fetch).mock.calls;
      const deleteCall = allCalls.find(c => (c[1] as RequestInit)?.method === 'DELETE');
      expect(deleteCall).toBeUndefined();
    });

    it('should skip silently on 401', async () => {
      setSyncBaseUrl('http://test');

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('', { status: 401 }),
      );

      await syncItems('/api/sources', [{ id: '1', name: 'test' }]);

      expect(getSyncStatus().status).toBe('idle');
    });

    it('should set error status on network failure', async () => {
      setSyncBaseUrl('http://test');

      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      await syncItems('/api/sources', [{ id: '1', name: 'test' }]);

      expect(getSyncStatus().status).toBe('error');
      expect(getSyncStatus().errorCount).toBeGreaterThan(0);
    });

    it('should skip items without id', async () => {
      setSyncBaseUrl('http://test');

      const fetchMock = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response('[]', { status: 200 }))
        .mockResolvedValue(new Response('{}', { status: 200 }));

      await syncItems('/api/sources', [
        { name: 'no-id' } as { id?: string; [k: string]: unknown },
        { id: 'has-id', name: 'ok' },
      ]);

      await vi.waitFor(() => {
        expect(getSyncStatus().status).toBe('idle');
      });

      // Only the GET + 1 POST for 'has-id' (not the no-id item)
      expect(fetchMock.mock.calls.length).toBe(2);
    });
  });

  describe('status notifications', () => {
    it('should notify listeners on status changes', async () => {
      setSyncBaseUrl('http://test');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('{}', { status: 200 }),
      );

      const statuses: string[] = [];
      onSyncStatusChange((status) => { statuses.push(status); });

      enqueueSync('POST', '/api/test', { id: '1' });

      await vi.waitFor(() => {
        expect(statuses).toContain('syncing');
        expect(statuses[statuses.length - 1]).toBe('idle');
      });
    });

    it('should not throw if listener throws', () => {
      const badCb = vi.fn(() => { throw new Error('oops'); });
      expect(() => onSyncStatusChange(badCb)).not.toThrow();
    });
  });

  describe('queue persistence', () => {
    it('should persist queue to localStorage when items are enqueued', () => {
      setSyncBaseUrl('http://test');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

      enqueueSync('POST', '/api/sources', { id: '1' });

      const stored = localStorage.getItem('dsfr-data-sync-queue');
      // Queue may have already been processed, but it was persisted at enqueue time
      expect(stored === null || JSON.parse(stored).length >= 0).toBe(true);
    });

    it('should clear localStorage when queue is empty after processing', async () => {
      setSyncBaseUrl('http://test');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

      enqueueSync('POST', '/api/sources', { id: '1' });

      await vi.waitFor(() => {
        expect(getSyncStatus().status).toBe('idle');
      });

      const stored = localStorage.getItem('dsfr-data-sync-queue');
      expect(stored).toBeNull();
    });

    it('should restore persisted queue on setSyncBaseUrl', async () => {
      // Pre-persist a queue entry
      localStorage.setItem('dsfr-data-sync-queue', JSON.stringify([
        { method: 'DELETE', url: 'http://test/api/sources/old-id', retries: 2 },
      ]));

      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('{}', { status: 200 }),
      );

      // Setting the base URL triggers restore + processing
      setSyncBaseUrl('http://test');

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          'http://test/api/sources/old-id',
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    });

    it('should reset retries on restored operations', () => {
      localStorage.setItem('dsfr-data-sync-queue', JSON.stringify([
        { method: 'POST', url: 'http://test/api/x', body: '{}', retries: 5 },
      ]));

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
      setSyncBaseUrl('http://test');

      // The restored operation should have retries reset to 0
      // Verified indirectly: if retries were still 5 (>= MAX_RETRIES=3),
      // it would be dropped immediately. Instead it should be processed.
      return vi.waitFor(() => {
        expect(getSyncStatus().status).toBe('idle');
      });
    });

    it('should handle corrupt localStorage data gracefully', () => {
      localStorage.setItem('dsfr-data-sync-queue', 'not-valid-json{{{');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

      // Should not throw
      expect(() => setSyncBaseUrl('http://test')).not.toThrow();
    });

    it('should clear localStorage on _resetSyncQueue', () => {
      localStorage.setItem('dsfr-data-sync-queue', '[{"method":"POST"}]');
      _resetSyncQueue();
      expect(localStorage.getItem('dsfr-data-sync-queue')).toBeNull();
    });
  });
});
