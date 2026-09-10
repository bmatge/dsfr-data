import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * #730 — `replace` et `replace-fields` étaient gardés par
 * `typeof normalizedValue === 'string'` : sur une colonne numérique ils ne
 * faisaient rien, et sans message. L'attribut mentait.
 *
 * La comparaison porte désormais sur la forme chaîne de la valeur, à égalité
 * stricte : ce qui n'est pas visé ne change ni de valeur ni de type.
 */

import { DsfrDataNormalize } from '@/components/dsfr-data-normalize.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  getDataCache,
} from '@/utils/data-bridge.js';

const SRC = 'replace-num-src';
const OUT = 'replace-num-out';

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

describe('#730 — replace / replace-fields sur une valeur numérique', () => {
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

  it('AC : replace-fields s’applique à une colonne numérique', () => {
    mount((el) => (el.replaceFields = 'annee:2024:2024-2025'));
    dispatchDataLoaded(SRC, [{ annee: 2024, ville: 'Brest' }]);

    expect(rows()[0].annee).toBe('2024-2025');
    expect(rows()[0].ville).toBe('Brest');
  });

  it('replace global s’applique aussi à une colonne numérique', () => {
    mount((el) => (el.replace = '0:Aucun'));
    dispatchDataLoaded(SRC, [{ total: 0 }, { total: 12 }]);

    expect(rows()[0].total).toBe('Aucun');
    expect(rows()[1].total).toBe(12);
  });

  it('AC : une valeur non concernée reste du même type qu’avant', () => {
    mount((el) => (el.replaceFields = 'annee:2024:2024-2025'));
    dispatchDataLoaded(SRC, [
      { annee: 2023, note: 20.24, absent: null, liste: [2024] },
      { annee: '2023', vide: undefined },
    ]);

    expect(rows()[0].annee).toBe(2023);
    expect(typeof rows()[0].annee).toBe('number');
    expect(rows()[0].note).toBe(20.24);
    expect(rows()[0].absent).toBeNull();
    expect(rows()[0].liste).toEqual([2024]);
    expect(rows()[1].annee).toBe('2023');
  });

  it('l’égalité reste stricte sur la forme chaîne (2024 ne vise pas 20240)', () => {
    mount((el) => (el.replaceFields = 'code:2024:cible'));
    dispatchDataLoaded(SRC, [{ code: 20240 }, { code: 2024.0 }, { code: '2024' }]);

    expect(rows()[0].code).toBe(20240);
    // 2024.0 EST le nombre 2024 : String() donne « 2024 », il est bien visé
    expect(rows()[1].code).toBe('cible');
    expect(rows()[2].code).toBe('cible');
  });

  it('une colonne booléenne est visée par sa forme chaîne', () => {
    mount((el) => (el.replaceFields = 'actif:true:Oui | actif:false:Non'));
    dispatchDataLoaded(SRC, [{ actif: true }, { actif: false }]);

    expect(rows()[0].actif).toBe('Oui');
    expect(rows()[1].actif).toBe('Non');
  });

  it('un objet n’est jamais converti en « [object Object] »', () => {
    mount((el) => (el.replace = '[object Object]:piege'));
    dispatchDataLoaded(SRC, [{ bloc: { a: 1 } }]);

    expect(rows()[0].bloc).toEqual({ a: 1 });
  });
});
