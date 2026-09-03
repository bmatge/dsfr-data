import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadFromStorage,
  saveToStorage,
  saveToStorageQuiet,
  removeFromStorage,
  STORAGE_KEYS,
} from '../../packages/shared/src/storage/local-storage';

describe('localStorage helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('loadFromStorage', () => {
    it('should return default value when key does not exist', () => {
      expect(loadFromStorage('nonexistent', [])).toEqual([]);
      expect(loadFromStorage('nonexistent', null)).toBeNull();
    });

    it('should parse stored JSON', () => {
      localStorage.setItem('test', JSON.stringify([1, 2, 3]));
      expect(loadFromStorage('test', [])).toEqual([1, 2, 3]);
    });

    it('should return default on invalid JSON', () => {
      localStorage.setItem('test', 'not-json{');
      expect(loadFromStorage('test', 'default')).toBe('default');
    });

    it('should handle stored objects', () => {
      const obj = { name: 'test', value: 42 };
      localStorage.setItem('test', JSON.stringify(obj));
      expect(loadFromStorage('test', {})).toEqual(obj);
    });
  });

  describe('saveToStorage', () => {
    it('should save JSON to localStorage', () => {
      saveToStorage('test', [1, 2, 3]);
      expect(localStorage.getItem('test')).toBe('[1,2,3]');
    });

    it('should save objects', () => {
      saveToStorage('test', { a: 1 });
      expect(JSON.parse(localStorage.getItem('test')!)).toEqual({ a: 1 });
    });

    it('should overwrite existing values', () => {
      saveToStorage('test', 'first');
      saveToStorage('test', 'second');
      expect(loadFromStorage('test', '')).toBe('second');
    });
  });

  describe('removeFromStorage', () => {
    it('should remove a key from localStorage', () => {
      localStorage.setItem('test', 'value');
      removeFromStorage('test');
      expect(localStorage.getItem('test')).toBeNull();
    });

    it('should not throw when removing nonexistent key', () => {
      expect(() => removeFromStorage('nonexistent')).not.toThrow();
    });
  });

  describe('STORAGE_KEYS', () => {
    it('should have expected keys', () => {
      expect(STORAGE_KEYS.FAVORITES).toBe('dsfr-data-favorites');
      expect(STORAGE_KEYS.CONNECTIONS).toBe('dsfr-data-connections');
      expect(STORAGE_KEYS.SOURCES).toBe('dsfr-data-sources');
      expect(STORAGE_KEYS.SELECTED_SOURCE).toBe('dsfr-data-selected-source');
    });
  });
});

describe('depassement de quota (#322, #586)', () => {
  const QUOTA = new DOMException('quota', 'QuotaExceededError');

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * On remplace le global `localStorage` plutot que d'espionner
   * `Storage.prototype` : happy-dom expose `setItem` en propriete propre de
   * l'instance, un espion pose sur le prototype n'est jamais consulte.
   */
  function failWith(error: unknown) {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw error;
      },
      getItem: () => null,
      removeItem: () => {},
      clear: () => {},
    });
  }

  function captureQuotaEvent(write: () => boolean) {
    const events: CustomEvent[] = [];
    const listener = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('dsfr-data:storage-quota', listener);
    const result = write();
    window.removeEventListener('dsfr-data:storage-quota', listener);
    return { result, events };
  }

  it("saveToStorage emet l'evenement avec la cle et la taille refusee", () => {
    failWith(QUOTA);
    const { result, events } = captureQuotaEvent(() => saveToStorage('k', { a: 'x'.repeat(50) }));
    expect(result).toBe(false);
    expect(events).toHaveLength(1);
    expect(events[0].detail.key).toBe('k');
    expect(events[0].detail.bytes).toBeGreaterThan(50);
  });

  it('saveToStorageQuiet signale aussi le quota (avant #586 : echec silencieux)', () => {
    failWith(QUOTA);
    const { result, events } = captureQuotaEvent(() =>
      saveToStorageQuiet(STORAGE_KEYS.SELECTED_SOURCE, { data: [1, 2, 3] })
    );
    expect(result).toBe(false);
    expect(events).toHaveLength(1);
    expect(events[0].detail.key).toBe(STORAGE_KEYS.SELECTED_SOURCE);
  });

  it("une erreur non liee au quota n'emet pas l'evenement", () => {
    failWith(new Error('autre chose'));
    const { result, events } = captureQuotaEvent(() => saveToStorage('k', { a: 1 }));
    expect(result).toBe(false);
    expect(events).toHaveLength(0);
  });
});
