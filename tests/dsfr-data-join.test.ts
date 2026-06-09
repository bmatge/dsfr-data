import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for DsfrDataJoin component — jointure multi-sources.
 */

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataJoin } from '@/components/dsfr-data-join.js';
import { parseJoinKeys, performJoin } from '@dsfr-data/shared';
import {
  clearDataCache,
  dispatchDataLoaded,
  dispatchDataError,
  getDataCache,
  setDataCache,
} from '@/utils/data-bridge.js';

// Données de test
const LEFT_DATA = [
  { code: '75', region: 'Ile-de-France', population: 12000 },
  { code: '13', region: 'Provence', population: 5000 },
  { code: '35', region: 'Bretagne', population: 3000 },
  { code: '14', region: 'Normandie', population: 3300 },
];

const RIGHT_DATA = [
  { code: '75', budget: 500, status: 'A' },
  { code: '13', budget: 200, status: 'B' },
  { code: '35', budget: 150, status: 'A' },
];

describe('DsfrDataJoin', () => {
  let join: DsfrDataJoin;

  beforeEach(() => {
    clearDataCache('test-join');
    clearDataCache('left-source');
    clearDataCache('right-source');
    clearDataCache('src-a');
    clearDataCache('src-b');
    clearDataCache('cached-left');
    clearDataCache('cached-right');
    mockFetch.mockReset();
    join = new DsfrDataJoin();
    join.id = 'test-join';
  });

  afterEach(() => {
    (join as any)._cleanup?.();
    if (join.isConnected) {
      join.disconnectedCallback();
    }
  });

  // --- Key parsing ---

  describe('Key parsing', () => {
    it('parses a single key', () => {
      const keys = parseJoinKeys('code');
      expect(keys).toEqual([{ left: 'code', right: 'code' }]);
    });

    it('parses a mapped key (left=right)', () => {
      const keys = parseJoinKeys('dept_code=code');
      expect(keys).toEqual([{ left: 'dept_code', right: 'code' }]);
    });

    it('parses multiple keys', () => {
      const keys = parseJoinKeys('annee, code_region');
      expect(keys).toEqual([
        { left: 'annee', right: 'annee' },
        { left: 'code_region', right: 'code_region' },
      ]);
    });

    it('parses mixed simple and mapped keys', () => {
      const keys = parseJoinKeys('annee, dept=code_dept');
      expect(keys).toEqual([
        { left: 'annee', right: 'annee' },
        { left: 'dept', right: 'code_dept' },
      ]);
    });
  });

  // --- Join logic ---

  describe('Inner join', () => {
    it('keeps only matching rows', () => {
      join.on = 'code';
      join.type = 'inner';
      const result = performJoin(LEFT_DATA, RIGHT_DATA, {
        on: join.on,
        type: join.type,
        prefixLeft: join.prefixLeft,
        prefixRight: join.prefixRight,
      });
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.code)).toEqual(['75', '13', '35']);
      // Champs des deux sources présents
      expect(result[0]).toHaveProperty('region', 'Ile-de-France');
      expect(result[0]).toHaveProperty('budget', 500);
    });

    it('excludes non-matching rows', () => {
      join.on = 'code';
      join.type = 'inner';
      const result = performJoin(LEFT_DATA, RIGHT_DATA, {
        on: join.on,
        type: join.type,
        prefixLeft: join.prefixLeft,
        prefixRight: join.prefixRight,
      });
      expect(result.find((r) => r.code === '14')).toBeUndefined();
    });
  });

  describe('Left join', () => {
    it('keeps all left rows', () => {
      join.on = 'code';
      join.type = 'left';
      const result = performJoin(LEFT_DATA, RIGHT_DATA, {
        on: join.on,
        type: join.type,
        prefixLeft: join.prefixLeft,
        prefixRight: join.prefixRight,
      });
      expect(result).toHaveLength(4);
    });

    it('fills null for unmatched right fields', () => {
      join.on = 'code';
      join.type = 'left';
      const result = performJoin(LEFT_DATA, RIGHT_DATA, {
        on: join.on,
        type: join.type,
        prefixLeft: join.prefixLeft,
        prefixRight: join.prefixRight,
      });
      const normandie = result.find((r) => r.code === '14')!;
      expect(normandie.region).toBe('Normandie');
      // Pas de correspondance droite → pas de champs droite (ou null)
      expect(normandie.budget).toBeUndefined();
    });

    it('merges matched rows correctly', () => {
      join.on = 'code';
      join.type = 'left';
      const result = performJoin(LEFT_DATA, RIGHT_DATA, {
        on: join.on,
        type: join.type,
        prefixLeft: join.prefixLeft,
        prefixRight: join.prefixRight,
      });
      const idf = result.find((r) => r.code === '75')!;
      expect(idf.region).toBe('Ile-de-France');
      expect(idf.population).toBe(12000);
      expect(idf.budget).toBe(500);
      expect(idf.status).toBe('A');
    });
  });

  describe('Right join', () => {
    it('keeps all right rows', () => {
      join.on = 'code';
      join.type = 'right';
      const result = performJoin(LEFT_DATA, RIGHT_DATA, {
        on: join.on,
        type: join.type,
        prefixLeft: join.prefixLeft,
        prefixRight: join.prefixRight,
      });
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.code)).toEqual(['75', '13', '35']);
    });

    it('includes left fields for matched rows', () => {
      join.on = 'code';
      join.type = 'right';
      const result = performJoin(LEFT_DATA, RIGHT_DATA, {
        on: join.on,
        type: join.type,
        prefixLeft: join.prefixLeft,
        prefixRight: join.prefixRight,
      });
      expect(result[0].region).toBe('Ile-de-France');
      expect(result[0].budget).toBe(500);
    });
  });

  describe('Full outer join', () => {
    it('keeps all rows from both sides', () => {
      join.on = 'code';
      join.type = 'full';
      const result = performJoin(LEFT_DATA, RIGHT_DATA, {
        on: join.on,
        type: join.type,
        prefixLeft: join.prefixLeft,
        prefixRight: join.prefixRight,
      });
      // 3 matched + 1 left-only (14)
      expect(result).toHaveLength(4);
    });

    it('includes unmatched right rows', () => {
      join.on = 'code';
      join.type = 'full';
      const rightWithExtra = [...RIGHT_DATA, { code: '99', budget: 50, status: 'C' }];
      const result = performJoin(LEFT_DATA, rightWithExtra, {
        on: join.on,
        type: join.type,
        prefixRight: join.prefixRight,
      });
      // 3 matched + 1 left-only (14) + 1 right-only (99)
      expect(result).toHaveLength(5);
      const extra = result.find((r) => r.code === '99')!;
      expect(extra.budget).toBe(50);
      expect(extra.region).toBeUndefined();
    });
  });

  // --- Field collision ---

  describe('Field name collisions', () => {
    it('applies prefix-right on collision', () => {
      const leftData = [{ code: '75', name: 'Paris', value: 100 }];
      const rightData = [{ code: '75', name: 'Budget Paris', value: 500 }];
      const result = performJoin(leftData, rightData, {
        on: 'code',
        type: 'inner',
        prefixRight: 'r_',
      });
      expect(result[0].name).toBe('Paris');
      expect(result[0]['r_name']).toBe('Budget Paris');
      expect(result[0].value).toBe(100);
      expect(result[0]['r_value']).toBe(500);
    });

    it('applies prefix-left on collision', () => {
      const leftData = [{ code: '75', name: 'Paris' }];
      const rightData = [{ code: '75', name: 'Budget' }];
      const result = performJoin(leftData, rightData, {
        on: 'code',
        type: 'inner',
        prefixLeft: 'l_',
        prefixRight: 'r_',
      });
      expect(result[0]['l_name']).toBe('Paris');
      expect(result[0]['r_name']).toBe('Budget');
    });

    it('does not duplicate join key', () => {
      const leftData = [{ code: '75', value: 1 }];
      const rightData = [{ code: '75', other: 2 }];
      const result = performJoin(leftData, rightData, { on: 'code', type: 'inner' });
      expect(result[0]).toEqual({ code: '75', value: 1, other: 2 });
    });
  });

  // --- Multi-key join ---

  describe('Multi-key join', () => {
    it('joins on two keys', () => {
      const leftData = [
        { annee: 2020, code: '75', pop: 12000 },
        { annee: 2021, code: '75', pop: 12100 },
        { annee: 2020, code: '13', pop: 5000 },
      ];
      const rightData = [
        { annee: 2020, code: '75', budget: 500 },
        { annee: 2020, code: '13', budget: 200 },
      ];
      const result = performJoin(leftData, rightData, { on: 'annee,code', type: 'inner' });
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ annee: 2020, code: '75', pop: 12000, budget: 500 });
    });
  });

  // --- Mapped keys (left=right) ---

  describe('Mapped keys', () => {
    it('joins on differently named keys', () => {
      const leftData = [
        { dept_code: '75', region: 'IDF' },
        { dept_code: '13', region: 'PACA' },
      ];
      const rightData = [{ code: '75', budget: 500 }];
      const result = performJoin(leftData, rightData, { on: 'dept_code=code', type: 'inner' });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ dept_code: '75', region: 'IDF', budget: 500 });
      // La clé droite 'code' ne doit pas apparaitre (la clé gauche dept_code suffit)
      expect(result[0]).not.toHaveProperty('code');
    });
  });

  // --- 1-N relationship ---

  describe('1-N relationship', () => {
    it('generates multiple rows for 1-N matches', () => {
      const leftData = [{ code: '75', region: 'IDF' }];
      const rightData = [
        { code: '75', projet: 'A', montant: 100 },
        { code: '75', projet: 'B', montant: 200 },
        { code: '75', projet: 'C', montant: 300 },
      ];
      const result = performJoin(leftData, rightData, { on: 'code', type: 'left' });
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.projet)).toEqual(['A', 'B', 'C']);
      expect(result.every((r) => r.region === 'IDF')).toBe(true);
    });
  });

  // --- Null/missing key handling ---

  describe('Null and missing keys', () => {
    it('handles null key values', () => {
      const leftData = [
        { code: null, region: 'Unknown' },
        { code: '75', region: 'IDF' },
      ];
      const rightData = [
        { code: null, budget: 0 },
        { code: '75', budget: 500 },
      ];
      const result = performJoin(leftData as any[], rightData as any[], {
        on: 'code',
        type: 'inner',
      });
      // null == null → match
      expect(result).toHaveLength(2);
    });

    it('handles missing key fields', () => {
      const leftData = [
        { region: 'Unknown' }, // pas de champ 'code'
        { code: '75', region: 'IDF' },
      ];
      const rightData = [{ code: '75', budget: 500 }];
      const result = performJoin(leftData as any[], rightData as any[], {
        on: 'code',
        type: 'inner',
      });
      // Seul '75' matche
      expect(result).toHaveLength(1);
    });
  });

  // --- Source subscription and event system ---

  describe('Source subscription', () => {
    it('reads from cache on subscribe', () => {
      setDataCache('left-source', LEFT_DATA);
      setDataCache('right-source', RIGHT_DATA);

      join.left = 'left-source';
      join.right = 'right-source';
      join.on = 'code';
      join.type = 'inner';
      join.id = 'test-join';

      join.reinitTransformer();

      expect(join.getData()).toHaveLength(3);
      expect(getDataCache('test-join')).toHaveLength(3);
    });

    it('waits for both sources before joining', () => {
      join.left = 'src-a';
      join.right = 'src-b';
      join.on = 'code';
      join.id = 'test-join';

      join.reinitTransformer();

      // Envoyer seulement la gauche
      dispatchDataLoaded('src-a', LEFT_DATA);
      expect(join.getData()).toHaveLength(0); // Pas encore de join

      // Envoyer la droite → join effectué
      dispatchDataLoaded('src-b', RIGHT_DATA);
      expect(join.getData()).toHaveLength(4); // left join (default)
    });

    it('recalculates when a source updates', () => {
      join.left = 'src-a';
      join.right = 'src-b';
      join.on = 'code';
      join.type = 'inner';
      join.id = 'test-join';

      join.reinitTransformer();

      dispatchDataLoaded('src-a', LEFT_DATA);
      dispatchDataLoaded('src-b', RIGHT_DATA);
      expect(join.getData()).toHaveLength(3);

      // Mettre à jour la source droite avec moins de données
      dispatchDataLoaded('src-b', [{ code: '75', budget: 600 }]);
      expect(join.getData()).toHaveLength(1);
      expect(join.getData()[0]).toMatchObject({ code: '75', budget: 600 });
    });

    it('propagates loading state via events', () => {
      const loadingEvents: string[] = [];
      const handler = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail.sourceId === 'test-join') {
          loadingEvents.push('loading');
        }
      };
      document.addEventListener('dsfr-data-loading', handler);

      join.left = 'src-a';
      join.right = 'src-b';
      join.on = 'code';
      join.id = 'test-join';

      join.reinitTransformer();
      // Un événement loading est émis à l'init
      expect(loadingEvents.length).toBeGreaterThan(0);

      // Après les deux sources, le join est terminé → données disponibles
      dispatchDataLoaded('src-a', LEFT_DATA);
      dispatchDataLoaded('src-b', RIGHT_DATA);
      expect(join.getData().length).toBeGreaterThan(0);

      document.removeEventListener('dsfr-data-loading', handler);
    });

    it('propagates error from source', () => {
      join.left = 'src-a';
      join.right = 'src-b';
      join.on = 'code';
      join.id = 'test-join';

      join.reinitTransformer();

      const error = new Error('Source failed');
      dispatchDataError('src-a', error);
      expect(join.getError()).toBe(error);
      expect(join.isLoading()).toBe(false);
    });
  });

  // --- Lifecycle ---

  describe('Lifecycle', () => {
    it('does not initialize without required props', () => {
      join.reinitTransformer();
      expect(join.getData()).toHaveLength(0);
    });

    it('cleans up subscriptions on disconnect', () => {
      join.left = 'src-a';
      join.right = 'src-b';
      join.on = 'code';
      join.id = 'test-join';

      join.reinitTransformer();

      // Vérifier que les unsubscribe existent
      expect((join as any)._transformerUnsubs.length).toBe(2);

      (join as any)._cleanup();
      expect((join as any)._transformerUnsubs.length).toBe(0);
    });

    it('re-initializes when source properties change', () => {
      const initSpy = vi.spyOn(join as any, 'reinitTransformer');
      (join as any)._transformerMountCycleDone = true; // cycle de montage consomme
      join.willUpdate(new Map([['left', '']]));
      expect(initSpy).toHaveBeenCalled();
    });

    it('re-initializes when on property changes', () => {
      const initSpy = vi.spyOn(join as any, 'reinitTransformer');
      (join as any)._transformerMountCycleDone = true;
      join.willUpdate(new Map([['on', '']]));
      expect(initSpy).toHaveBeenCalled();
    });

    it('re-computes join (without re-subscribing) when only type changes', () => {
      // Setup: initialize and provide both sources
      join.left = 'src-a';
      join.right = 'src-b';
      join.on = 'code';
      join.type = 'inner';
      join.id = 'test-join';
      join.reinitTransformer();

      dispatchDataLoaded('src-a', LEFT_DATA);
      dispatchDataLoaded('src-b', RIGHT_DATA);
      expect(join.getData()).toHaveLength(3); // inner: 3 matches

      // Change type to left → should re-compute without full re-init
      const initSpy = vi.spyOn(join as any, 'reinitTransformer');
      join.type = 'left';
      (join as any)._transformerMountCycleDone = true;
      join.willUpdate(new Map([['type', 'inner']]));
      expect(initSpy).not.toHaveBeenCalled(); // NOT re-initialized
      expect(join.getData()).toHaveLength(4); // left: all 4 rows
    });

    it('does not re-init when only non-join properties change', () => {
      const initSpy = vi.spyOn(join as any, 'reinitTransformer');
      (join as any)._transformerMountCycleDone = true;
      join.willUpdate(new Map([['_loading', true]]));
      expect(initSpy).not.toHaveBeenCalled();
    });

    it('connectedCallback initialise UNE fois, le premier willUpdate ne re-init pas (#281)', () => {
      const initSpy = vi.spyOn(join as any, 'reinitTransformer');
      join.connectedCallback();
      expect(initSpy).toHaveBeenCalledTimes(1);
      // Cycle de montage Lit : toutes les props posees figurent dans
      // changedProperties — sans le flag, double init
      join.willUpdate(new Map([['left', undefined]]));
      expect(initSpy).toHaveBeenCalledTimes(1);
    });

    it('handles Lit lifecycle: data arrives after updated()', () => {
      // Simulate real Lit lifecycle:
      // 1. connectedCallback (no init)
      // 2. updated() with initial property changes → _initialize()
      // 3. Data events arrive later
      join.left = 'src-a';
      join.right = 'src-b';
      join.on = 'code';
      join.id = 'test-join';

      // Step 1: connectedCallback — no subscription
      join.connectedCallback();
      expect(join.getData()).toHaveLength(0);

      // Step 2: first updated() — properties changed from defaults
      join.willUpdate(
        new Map([
          ['left', ''],
          ['right', ''],
          ['on', ''],
        ])
      );

      // Step 3: Data arrives (simulating async fetch completion)
      dispatchDataLoaded('src-a', LEFT_DATA);
      expect(join.getData()).toHaveLength(0); // right not yet

      dispatchDataLoaded('src-b', RIGHT_DATA);
      expect(join.getData()).toHaveLength(4); // left join default
    });

    it('handles cached data available at updated() time', () => {
      // Sources already emitted before join is created
      setDataCache('cached-left', LEFT_DATA);
      setDataCache('cached-right', RIGHT_DATA);

      join.left = 'cached-left';
      join.right = 'cached-right';
      join.on = 'code';
      join.id = 'test-join';

      // Simulate Lit lifecycle
      join.connectedCallback();
      join.willUpdate(
        new Map([
          ['left', ''],
          ['right', ''],
          ['on', ''],
        ])
      );

      // Data should be available immediately from cache
      expect(join.getData()).toHaveLength(4);
    });
  });

  // --- Empty datasets ---

  describe('Empty datasets', () => {
    it('returns empty for inner join with empty left', () => {
      const result = performJoin([], RIGHT_DATA, { on: 'code', type: 'inner' });
      expect(result).toHaveLength(0);
    });

    it('returns empty for inner join with empty right', () => {
      const result = performJoin(LEFT_DATA, [], { on: 'code', type: 'inner' });
      expect(result).toHaveLength(0);
    });

    it('returns left data for left join with empty right', () => {
      const result = performJoin(LEFT_DATA, [], { on: 'code', type: 'left' });
      expect(result).toHaveLength(4);
      expect(result[0].region).toBe('Ile-de-France');
    });

    it('returns right data for right join with empty left', () => {
      const result = performJoin([], RIGHT_DATA, { on: 'code', type: 'right' });
      expect(result).toHaveLength(3);
      expect(result[0].budget).toBe(500);
    });
  });

  // --- Public API ---

  describe('Public API', () => {
    it('getData returns joined data', () => {
      expect(join.getData()).toEqual([]);
    });

    it('isLoading returns loading state', () => {
      expect(join.isLoading()).toBe(false);
    });

    it('getError returns null by default', () => {
      expect(join.getError()).toBeNull();
    });
  });

  describe('reinitTransformer edge cases', () => {
    it('logs error and sets data-dsfr-config-error when id is missing', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // Override the default 'test-join' id set in beforeEach
      join.id = '';
      join.left = 'a';
      join.right = 'b';
      join.on = 'code';
      join.reinitTransformer();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('attribut "id" requis'));
      expect(join.getAttribute('data-dsfr-config-error')).toMatch(/id/);
      errorSpy.mockRestore();
    });

    it('logs error when left/right/on are missing', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      join.id = 'test-join';
      join.left = '';
      join.right = '';
      join.on = '';
      join.reinitTransformer();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('left'));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('right'));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('on'));
      expect(join.getAttribute('data-dsfr-config-error')).toMatch(/left/);
      errorSpy.mockRestore();
    });

    it('clears data-dsfr-config-error when config becomes valid', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      join.id = '';
      join.reinitTransformer();
      expect(join.hasAttribute('data-dsfr-config-error')).toBe(true);
      join.id = 'test-join';
      join.left = 'a';
      join.right = 'b';
      join.on = 'code';
      join.reinitTransformer();
      expect(join.hasAttribute('data-dsfr-config-error')).toBe(false);
      errorSpy.mockRestore();
    });
  });
});
