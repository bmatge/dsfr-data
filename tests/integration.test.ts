import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dispatchDataLoaded,
  dispatchDataError,
  dispatchDataLoading,
  subscribeToSource,
  getDataCache,
  clearDataCache,
  setDataCache,
} from '@/utils/data-bridge.js';

/**
 * Integration tests for the data-bridge flow.
 *
 * Tests the full event pipeline: source dispatches -> bridge routes -> consumers receive.
 * Simulates the real-world flow of dsfr-data-source -> dsfr-data-kpi/chart/datalist.
 */
describe('Data flow integration', () => {
  beforeEach(() => {
    clearDataCache('source-1');
    clearDataCache('source-2');
  });

  describe('Multi-consumer scenario', () => {
    it('multiple consumers receive data from the same source', () => {
      const consumer1 = vi.fn();
      const consumer2 = vi.fn();
      const consumer3 = vi.fn();

      const unsub1 = subscribeToSource('source-1', { onLoaded: consumer1 });
      const unsub2 = subscribeToSource('source-1', { onLoaded: consumer2 });
      const unsub3 = subscribeToSource('source-1', { onLoaded: consumer3 });

      const data = [{ id: 1, name: 'Test' }];
      dispatchDataLoaded('source-1', data);

      expect(consumer1).toHaveBeenCalledWith(data);
      expect(consumer2).toHaveBeenCalledWith(data);
      expect(consumer3).toHaveBeenCalledWith(data);

      unsub1();
      unsub2();
      unsub3();
    });

    it('consumers only receive events for their subscribed source', () => {
      const consumer1 = vi.fn();
      const consumer2 = vi.fn();

      const unsub1 = subscribeToSource('source-1', { onLoaded: consumer1 });
      const unsub2 = subscribeToSource('source-2', { onLoaded: consumer2 });

      dispatchDataLoaded('source-1', { from: 'source-1' });

      expect(consumer1).toHaveBeenCalledWith({ from: 'source-1' });
      expect(consumer2).not.toHaveBeenCalled();

      unsub1();
      unsub2();
    });
  });

  describe('Loading -> Loaded lifecycle', () => {
    it('consumer receives loading then loaded in sequence', () => {
      const events: string[] = [];

      const unsub = subscribeToSource('source-1', {
        onLoading: () => events.push('loading'),
        onLoaded: () => events.push('loaded'),
      });

      dispatchDataLoading('source-1');
      dispatchDataLoaded('source-1', []);

      expect(events).toEqual(['loading', 'loaded']);
      unsub();
    });

    it('consumer receives loading then error in sequence', () => {
      const events: string[] = [];

      const unsub = subscribeToSource('source-1', {
        onLoading: () => events.push('loading'),
        onError: () => events.push('error'),
      });

      dispatchDataLoading('source-1');
      dispatchDataError('source-1', new Error('fail'));

      expect(events).toEqual(['loading', 'error']);
      unsub();
    });
  });

  describe('Cache behavior', () => {
    it('dispatchDataLoaded updates the cache', () => {
      dispatchDataLoaded('source-1', { cached: true });
      expect(getDataCache('source-1')).toEqual({ cached: true });
    });

    it('subsequent dispatches overwrite the cache', () => {
      dispatchDataLoaded('source-1', { version: 1 });
      dispatchDataLoaded('source-1', { version: 2 });
      expect(getDataCache('source-1')).toEqual({ version: 2 });
    });

    it('cache is independent per source', () => {
      dispatchDataLoaded('source-1', { data: 'one' });
      dispatchDataLoaded('source-2', { data: 'two' });

      expect(getDataCache('source-1')).toEqual({ data: 'one' });
      expect(getDataCache('source-2')).toEqual({ data: 'two' });
    });

    it('clearDataCache removes only the specified source', () => {
      setDataCache('source-1', 'data1');
      setDataCache('source-2', 'data2');

      clearDataCache('source-1');

      expect(getDataCache('source-1')).toBeUndefined();
      expect(getDataCache('source-2')).toBe('data2');
    });
  });

  describe('Unsubscribe behavior', () => {
    it('unsubscribed consumer does not receive events', () => {
      const consumer = vi.fn();
      const unsub = subscribeToSource('source-1', { onLoaded: consumer });

      unsub();
      dispatchDataLoaded('source-1', { after: 'unsub' });

      expect(consumer).not.toHaveBeenCalled();
    });

    it('unsubscribing one consumer does not affect others', () => {
      const consumer1 = vi.fn();
      const consumer2 = vi.fn();

      const unsub1 = subscribeToSource('source-1', { onLoaded: consumer1 });
      const unsub2 = subscribeToSource('source-1', { onLoaded: consumer2 });

      unsub1();
      dispatchDataLoaded('source-1', { data: true });

      expect(consumer1).not.toHaveBeenCalled();
      expect(consumer2).toHaveBeenCalledWith({ data: true });

      unsub2();
    });
  });

  describe('Data types', () => {
    it('handles array data', () => {
      const consumer = vi.fn();
      const unsub = subscribeToSource('source-1', { onLoaded: consumer });

      const data = [{ a: 1 }, { a: 2 }];
      dispatchDataLoaded('source-1', data);

      expect(consumer).toHaveBeenCalledWith(data);
      unsub();
    });

    it('handles object data', () => {
      const consumer = vi.fn();
      const unsub = subscribeToSource('source-1', { onLoaded: consumer });

      const data = { total: 42, items: [] };
      dispatchDataLoaded('source-1', data);

      expect(consumer).toHaveBeenCalledWith(data);
      unsub();
    });

    it('handles null data', () => {
      const consumer = vi.fn();
      const unsub = subscribeToSource('source-1', { onLoaded: consumer });

      dispatchDataLoaded('source-1', null);
      expect(consumer).toHaveBeenCalledWith(null);
      unsub();
    });

    it('handles error objects with messages', () => {
      const consumer = vi.fn();
      const unsub = subscribeToSource('source-1', { onError: consumer });

      const error = new Error('API rate limit exceeded');
      dispatchDataError('source-1', error);

      expect(consumer).toHaveBeenCalledWith(error);
      expect(consumer.mock.calls[0][0].message).toBe('API rate limit exceeded');
      unsub();
    });
  });

  describe('Rapid updates', () => {
    it('handles multiple rapid data updates', () => {
      const consumer = vi.fn();
      const unsub = subscribeToSource('source-1', { onLoaded: consumer });

      for (let i = 0; i < 10; i++) {
        dispatchDataLoaded('source-1', { version: i });
      }

      expect(consumer).toHaveBeenCalledTimes(10);
      expect(consumer.mock.calls[9][0]).toEqual({ version: 9 });
      expect(getDataCache('source-1')).toEqual({ version: 9 });

      unsub();
    });
  });
});
