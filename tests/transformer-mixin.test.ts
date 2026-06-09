import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tests traversants #280 (EPIC C) — TransformerMixin partagé.
 *
 * Bug d'origine : les 6 composants-tuyaux (query, join, unpivot, normalize,
 * facets, search) recodaient abonnement + cache initial + cleanup à la main,
 * avec des divergences réelles :
 * - query ne réinitialisait jamais son erreur après un succès ;
 * - normalize/unpivot n'avaient ni état erreur ni loading (isLoading/getError
 *   inexistants) ;
 * - facets/search fuyaient leur abonnement quand `source` était vidé au
 *   runtime (early-return avant cleanup).
 *
 * AC :
 * - plus aucun subscribeToSource manuel hors mixins (garde statique) ;
 * - contrats isLoading()/getError() identiques sur les 6 transformateurs.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataJoin } from '@/components/dsfr-data-join.js';
import { DsfrDataUnpivot } from '@/components/dsfr-data-unpivot.js';
import { DsfrDataNormalize } from '@/components/dsfr-data-normalize.js';
import { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import { DsfrDataSearch } from '@/components/dsfr-data-search.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  dispatchDataLoading,
  dispatchDataError,
} from '@/utils/data-bridge.js';

const COMPONENTS_DIR = join(__dirname, '../packages/core/src/components');

describe('#280 — AC : plus aucun subscribeToSource/subscribeToSourceCommands manuel hors mixins', () => {
  it('aucun composant ne souscrit directement au data-bridge', () => {
    const offenders: string[] = [];
    for (const file of readdirSync(COMPONENTS_DIR)) {
      if (!file.endsWith('.ts')) continue;
      const content = readFileSync(join(COMPONENTS_DIR, file), 'utf8');
      // dsfr-data-source est le producteur : il ECOUTE les commandes (c'est
      // sa boite aux lettres), mais ne souscrit a aucune source.
      if (content.includes('subscribeToSource(')) {
        offenders.push(`${file} (subscribeToSource)`);
      }
      if (file !== 'dsfr-data-source.ts' && content.includes('subscribeToSourceCommands(')) {
        offenders.push(`${file} (subscribeToSourceCommands)`);
      }
    }
    expect(
      offenders,
      `Abonnements manuels détectés (utiliser TransformerMixin ou SourceSubscriberMixin) : ${offenders.join(', ')}`
    ).toEqual([]);
  });
});

type TransformerCtor = new () => HTMLElement & {
  id: string;
  isLoading(): boolean;
  getError(): Error | null;
  reinitTransformer(): void;
};

/** Construit chaque transformateur câblé sur la source donnée */
function buildTransformers(sourceId: string) {
  const query = new DsfrDataQuery();
  query.id = 't-query';
  query.source = sourceId;

  const join = new DsfrDataJoin();
  join.id = 't-join';
  join.left = sourceId;
  join.right = sourceId;
  join.on = 'k';

  const unpivot = new DsfrDataUnpivot();
  unpivot.id = 't-unpivot';
  unpivot.source = sourceId;
  unpivot.idCols = 'k';
  unpivot.valueCols = 'v';

  const normalize = new DsfrDataNormalize();
  normalize.id = 't-normalize';
  normalize.source = sourceId;

  const facets = new DsfrDataFacets();
  facets.id = 't-facets';
  facets.source = sourceId;
  facets.fields = 'k';

  const search = new DsfrDataSearch();
  search.id = 't-search';
  search.source = sourceId;

  return { query, join, unpivot, normalize, facets, search } as Record<
    string,
    InstanceType<TransformerCtor>
  >;
}

describe('#280 — AC : contrats isLoading()/getError() identiques sur les 6 transformateurs', () => {
  const SRC = 'c1-contract-src';
  let transformers: Record<string, InstanceType<TransformerCtor>>;

  beforeEach(() => {
    clearDataCache(SRC);
    clearDataMeta(SRC);
    for (const id of ['t-query', 't-join', 't-unpivot', 't-normalize', 't-facets', 't-search']) {
      clearDataCache(id);
      clearDataMeta(id);
    }
    transformers = buildTransformers(SRC);
    for (const t of Object.values(transformers)) t.reinitTransformer();
  });

  afterEach(() => {
    for (const t of Object.values(transformers)) (t as any)._cleanup();
  });

  it('chaque transformateur expose isLoading() et getError()', () => {
    for (const [name, t] of Object.entries(transformers)) {
      expect(typeof t.isLoading, `${name}.isLoading`).toBe('function');
      expect(typeof t.getError, `${name}.getError`).toBe('function');
      // join s'annonce en chargement dès l'init (il attend ses DEUX sources
      // avant d'émettre) — comportement documenté, pas une divergence
      if (name !== 'join') {
        expect(t.isLoading(), `${name} repos`).toBe(false);
      }
      expect(t.getError(), `${name} repos`).toBeNull();
    }
  });

  it('loading amont → isLoading() true partout, retombe à false après émission', () => {
    dispatchDataLoading(SRC);
    for (const [name, t] of Object.entries(transformers)) {
      expect(t.isLoading(), `${name} en chargement`).toBe(true);
    }

    dispatchDataLoaded(SRC, [{ k: 'a', v: 1 }]);
    for (const [name, t] of Object.entries(transformers)) {
      expect(t.isLoading(), `${name} après émission`).toBe(false);
    }
  });

  it('erreur amont → getError() la retourne partout', () => {
    const boom = new Error('panne amont');
    dispatchDataError(SRC, boom);
    for (const [name, t] of Object.entries(transformers)) {
      expect(t.getError(), `${name} erreur`).toBe(boom);
      expect(t.isLoading(), `${name} loading retombé`).toBe(false);
    }
  });

  it("l'erreur est réinitialisée à l'émission suivante (query ne le faisait jamais)", () => {
    dispatchDataError(SRC, new Error('panne amont'));
    for (const t of Object.values(transformers)) {
      expect(t.getError()).not.toBeNull();
    }

    dispatchDataLoaded(SRC, [{ k: 'a', v: 1 }]);
    for (const [name, t] of Object.entries(transformers)) {
      expect(t.getError(), `${name} erreur réinitialisée`).toBeNull();
    }
  });
});

describe('#280 — fuite d’abonnement corrigée (source vidée au runtime)', () => {
  const SRC = 'c1-leak-src';

  for (const [label, build] of [
    [
      'facets',
      () => {
        const el = new DsfrDataFacets();
        el.id = 'leak-facets';
        el.source = SRC;
        el.fields = 'k';
        return el;
      },
    ],
    [
      'search',
      () => {
        const el = new DsfrDataSearch();
        el.id = 'leak-search';
        el.source = SRC;
        return el;
      },
    ],
  ] as Array<[string, () => any]>) {
    it(`${label} : vider source désabonne l'ancienne souscription`, () => {
      clearDataCache(SRC);
      const el = build();
      el.reinitTransformer();
      expect((el as any)._transformerUnsubs.length).toBe(1);

      // Source vidée au runtime → config invalide MAIS l'ancien abonnement
      // doit être coupé (avant le fix : early-return avant cleanup → fuite)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      el.source = '';
      el.reinitTransformer();
      errorSpy.mockRestore();

      expect((el as any)._transformerUnsubs.length).toBe(0);

      const spy = vi.spyOn(el as any, 'onTransformerData');
      dispatchDataLoaded(SRC, [{ k: 'x' }]);
      expect(spy).not.toHaveBeenCalled();

      (el as any)._cleanup();
      clearDataCache(el.id);
    });
  }
});

describe('#280 — normalize/unpivot gagnent les états (ils n’en avaient aucun)', () => {
  it('unpivot expose désormais isLoading/getError', () => {
    const el = new DsfrDataUnpivot();
    el.id = 'c1-unpivot-states';
    el.source = 'c1-states-src';
    el.idCols = 'k';
    el.valueCols = 'v';
    clearDataCache('c1-states-src');
    el.reinitTransformer();

    dispatchDataError('c1-states-src', new Error('boom'));
    expect(el.getError()?.message).toBe('boom');

    dispatchDataLoaded('c1-states-src', [{ k: 'a', v: 1 }]);
    expect(el.getError()).toBeNull();
    expect(el.isLoading()).toBe(false);

    (el as any)._cleanup();
    clearDataCache('c1-unpivot-states');
  });
});
