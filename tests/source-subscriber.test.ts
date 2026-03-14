import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dispatchDataLoaded,
  dispatchDataError,
  dispatchDataLoading,
  setDataCache,
  getDataCache,
  clearDataCache,
  subscribeToSource,
} from '../src/utils/data-bridge.js';

/**
 * Tests for the SourceSubscriberMixin behavior.
 *
 * Since JSDOM doesn't support custom elements registration well enough
 * for Lit components, we test the mixin's underlying data-bridge mechanisms
 * that it relies on, plus the subscription pattern it uses.
 */
describe('SourceSubscriberMixin integration via data-bridge', () => {
  beforeEach(() => {
    clearDataCache('test-src');
    clearDataCache('other-src');
  });

  it('cached data is available immediately after setDataCache', () => {
    const data = [{ id: 1, name: 'test' }];
    setDataCache('test-src', data);
    expect(getDataCache('test-src')).toEqual(data);
  });

  it('events are dispatched and received for correct source', () => {
    const onLoaded = vi.fn();
    const onOther = vi.fn();

    const handler = (e: Event) => {
      const event = e as CustomEvent;
      if (event.detail.sourceId === 'test-src') onLoaded(event.detail.data);
      if (event.detail.sourceId === 'other-src') onOther(event.detail.data);
    };
    document.addEventListener('dsfr-data-loaded', handler);

    dispatchDataLoaded('test-src', { items: [1] });
    dispatchDataLoaded('other-src', { items: [2] });

    expect(onLoaded).toHaveBeenCalledWith({ items: [1] });
    expect(onOther).toHaveBeenCalledWith({ items: [2] });

    document.removeEventListener('dsfr-data-loaded', handler);
  });

  it('loading events are dispatched', () => {
    const handler = vi.fn();
    document.addEventListener('dsfr-data-loading', handler);

    dispatchDataLoading('test-src');

    expect(handler).toHaveBeenCalled();
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail.sourceId).toBe('test-src');

    document.removeEventListener('dsfr-data-loading', handler);
  });

  it('error events carry the error object', () => {
    const handler = vi.fn();
    document.addEventListener('dsfr-data-error', handler);

    const error = new Error('Network timeout');
    dispatchDataError('test-src', error);

    expect(handler).toHaveBeenCalled();
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail.error.message).toBe('Network timeout');

    document.removeEventListener('dsfr-data-error', handler);
  });

  it('data loaded also updates cache', () => {
    dispatchDataLoaded('test-src', { fresh: true });
    expect(getDataCache('test-src')).toEqual({ fresh: true });
  });

  it('clearDataCache removes the entry', () => {
    setDataCache('test-src', { old: true });
    clearDataCache('test-src');
    expect(getDataCache('test-src')).toBeUndefined();
  });

  describe('subscription lifecycle (simulating mixin behavior)', () => {
    it('subscriber receives cached data then live updates', () => {
      // Simulate what happens when a component with the mixin connects:
      // 1. Check cache
      // 2. Subscribe to events
      // 3. Receive new data
      setDataCache('test-src', [{ id: 'cached' }]);

      const cachedData = getDataCache('test-src');
      expect(cachedData).toEqual([{ id: 'cached' }]);

      const onLoaded = vi.fn();
      const unsub = subscribeToSource('test-src', { onLoaded });

      dispatchDataLoaded('test-src', [{ id: 'live' }]);
      expect(onLoaded).toHaveBeenCalledWith([{ id: 'live' }]);
      expect(getDataCache('test-src')).toEqual([{ id: 'live' }]);

      unsub();
    });

    it('unsubscribe stops receiving events', () => {
      const onLoaded = vi.fn();
      const unsub = subscribeToSource('test-src', { onLoaded });

      unsub();

      dispatchDataLoaded('test-src', [{ id: 'after-unsub' }]);
      expect(onLoaded).not.toHaveBeenCalled();
    });

    it('re-subscription works after unsubscribe', () => {
      const onLoaded1 = vi.fn();
      const unsub1 = subscribeToSource('test-src', { onLoaded: onLoaded1 });
      unsub1();

      const onLoaded2 = vi.fn();
      const unsub2 = subscribeToSource('test-src', { onLoaded: onLoaded2 });

      dispatchDataLoaded('test-src', [{ id: 'new' }]);

      expect(onLoaded1).not.toHaveBeenCalled();
      expect(onLoaded2).toHaveBeenCalledWith([{ id: 'new' }]);

      unsub2();
    });

    it('loading callback is invoked on loading event', () => {
      const onLoading = vi.fn();
      const unsub = subscribeToSource('test-src', { onLoading });

      dispatchDataLoading('test-src');

      expect(onLoading).toHaveBeenCalledTimes(1);
      unsub();
    });

    it('error callback is invoked on error event', () => {
      const onError = vi.fn();
      const unsub = subscribeToSource('test-src', { onError });

      const error = new Error('test error');
      dispatchDataError('test-src', error);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(error);
      unsub();
    });

    it('does not call callbacks for different source ids', () => {
      const onLoaded = vi.fn();
      const onLoading = vi.fn();
      const onError = vi.fn();
      const unsub = subscribeToSource('test-src', { onLoaded, onLoading, onError });

      dispatchDataLoaded('other-src', [{ id: 'other' }]);
      dispatchDataLoading('other-src');
      dispatchDataError('other-src', new Error('other'));

      expect(onLoaded).not.toHaveBeenCalled();
      expect(onLoading).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();

      unsub();
    });

    it('multiple subscribers receive the same data', () => {
      const onLoaded1 = vi.fn();
      const onLoaded2 = vi.fn();
      const unsub1 = subscribeToSource('test-src', { onLoaded: onLoaded1 });
      const unsub2 = subscribeToSource('test-src', { onLoaded: onLoaded2 });

      dispatchDataLoaded('test-src', [{ id: 'shared' }]);

      expect(onLoaded1).toHaveBeenCalledWith([{ id: 'shared' }]);
      expect(onLoaded2).toHaveBeenCalledWith([{ id: 'shared' }]);

      unsub1();
      unsub2();
    });

    it('setDataCache does not trigger subscriber (only dispatch does)', () => {
      const onLoaded = vi.fn();
      const unsub = subscribeToSource('test-src', { onLoaded });

      setDataCache('test-src', [{ id: 'set' }]);

      expect(onLoaded).not.toHaveBeenCalled();
      expect(getDataCache('test-src')).toEqual([{ id: 'set' }]);

      unsub();
    });
  });
});
