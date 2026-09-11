import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * #774 — `replace` et `replace-fields` sur un champ multivalué.
 *
 * `replaceable` n'acceptait que chaîne, nombre et booléen : un TABLEAU
 * traversait intact, sans message. Ce sont pourtant les colonnes qu'on a
 * besoin de nettoyer — un champ multivalué d'Opendatasoft porte souvent des
 * libellés hétérogènes.
 */

import { DsfrDataNormalize } from '@/components/dsfr-data-normalize.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  getDataCache,
} from '@/utils/data-bridge.js';

const SRC = 'replace-arr-src';
const OUT = 'replace-arr-out';

function mount(configure: (el: DsfrDataNormalize) => void): DsfrDataNormalize {
  const normalize = new DsfrDataNormalize();
  normalize.id = OUT;
  normalize.source = SRC;
  configure(normalize);
  document.body.appendChild(normalize);
  return normalize;
}

function rows(): Record<string, unknown>[] {
  return getDataCache(OUT) as Record<string, unknown>[];
}

describe('#774 — remplacement élément par élément', () => {
  beforeEach(() => {
    for (const id of [SRC, OUT]) {
      clearDataCache(id);
      clearDataMeta(id);
    }
  });

  afterEach(() => {
    document.body.innerHTML = '';
    for (const id of [SRC, OUT]) {
      clearDataCache(id);
      clearDataMeta(id);
    }
  });

  it('AC : replace-fields s’applique à chaque élément d’un champ tableau', () => {
    mount((el) => (el.replaceFields = 'publics:Tout public:Tous | publics:tt public:Tous'));
    dispatchDataLoaded(SRC, [{ publics: ['Tout public', 'Scolaires', 'tt public'] }]);

    expect(rows()[0].publics).toEqual(['Tous', 'Scolaires', 'Tous']);
  });

  it('AC : la longueur est préservée, sans dédoublonnage', () => {
    mount((el) => (el.replace = 'n.d.: | NR:'));
    dispatchDataLoaded(SRC, [{ tags: ['n.d.', 'audit', 'NR'] }]);

    // Deux éléments vidés restent deux éléments vides : rien n'est retiré.
    expect(rows()[0].tags).toEqual(['', 'audit', '']);
  });

  it('replace global vise aussi les éléments numériques et booléens, par leur forme chaîne', () => {
    mount((el) => (el.replace = '0:Aucun | true:Oui'));
    dispatchDataLoaded(SRC, [{ valeurs: [0, 12, true, null] }]);

    expect(rows()[0].valeurs).toEqual(['Aucun', 12, 'Oui', null]);
  });

  it('replace-fields puis replace, dans le même ordre que sur une valeur simple', () => {
    mount((el) => {
      el.replaceFields = 'axes:A:B';
      el.replace = 'B:C';
    });
    dispatchDataLoaded(SRC, [{ axes: ['A', 'B'], simple: 'A' }]);

    expect(rows()[0].axes).toEqual(['C', 'C']);
    // Le champ simple n'a pas de replace-fields : seul le global le vise.
    expect(rows()[0].simple).toBe('A');
  });

  it('un tableau d’un autre champ n’est pas touché par replace-fields', () => {
    mount((el) => (el.replaceFields = 'axes:A:B'));
    dispatchDataLoaded(SRC, [{ axes: ['A'], cibles: ['A'] }]);

    expect(rows()[0].axes).toEqual(['B']);
    expect(rows()[0].cibles).toEqual(['A']);
  });

  it('limite documentée : split découpe APRÈS le remplacement, qui voit la chaîne entière', () => {
    mount((el) => {
      el.split = 'axes:|';
      el.replaceFields = 'axes:A:B';
    });
    dispatchDataLoaded(SRC, [{ axes: 'A|C' }, { axes: 'A' }]);

    // « A|C » n'est pas « A » : la chaîne entière n'est pas visée.
    expect(rows()[0].axes).toEqual(['A', 'C']);
    // « A » est visé avant la découpe.
    expect(rows()[1].axes).toEqual(['B']);
  });
});
