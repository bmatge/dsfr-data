import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests traversants #303 (EPIC G) — kpi : grammaire commune, chemins
 * imbriqués, tendance fr-FR, count lâche.
 *
 * Bugs d'origine : grammaire d'agrégat INVERSÉE (`valeur="sum:champ"` vs
 * `field:fn` partout ailleurs) ; pas de getByPath (seul composant sans
 * chemins imbriqués — `valeur="avg:fields.score"` échouait silencieusement) ;
 * tendance `toFixed(1)+'%'` en dur (« 5.2% » anglo-saxon à côté d'une valeur
 * « 5 825 » fr-FR) ; `count:field:value` comparait en === strict quand query
 * filtre en == lâche.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { computeAggregation, parseExpression } from '@/utils/aggregations.js';
import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';

describe('#303 — grammaire commune field:fn (ancienne fn:field dépréciée)', () => {
  it('AC : "population:sum" (grammaire du pipeline) fonctionne', () => {
    expect(parseExpression('population:sum')).toEqual({ type: 'sum', field: 'population' });
    expect(computeAggregation([{ population: 100 }, { population: 50 }], 'population:sum')).toBe(
      150
    );
  });

  it('l’ancienne grammaire "sum:population" reste lue avec warn de dépréciation', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(computeAggregation([{ population: 100 }, { population: 50 }], 'sum:population')).toBe(
      150
    );
    warnSpy.mockRestore();
  });

  it('un champ nommé comme une fonction garde la lecture historique', () => {
    // "sum:count" : lecture ancienne = somme du champ 'count'
    expect(parseExpression('sum:count')).toEqual({ type: 'sum', field: 'count' });
  });
});

describe('#303 — AC : chemins imbriqués via getByPath', () => {
  const NESTED = [
    { fields: { score: 10 } },
    { fields: { score: 20 } },
    { fields: { score: 'N/A' } },
  ] as Record<string, unknown>[];

  it('"fields.score:avg" agrège un champ imbriqué', () => {
    expect(computeAggregation(NESTED, 'fields.score:avg')).toBe(15);
  });

  it('accès direct imbriqué', () => {
    expect(computeAggregation({ fields: { total: 42 } }, 'fields.total')).toBe(42);
  });
});

describe('#303 — count:field:value en égalité lâche', () => {
  it('"75" string matche le filtre numérique 75 (comme query)', () => {
    const rows = [{ dept: '75' }, { dept: 75 }, { dept: '13' }] as Record<string, unknown>[];
    expect(computeAggregation(rows, 'count:dept:75')).toBe(2);
  });
});

describe('#303 — AC : tendance formatée fr-FR', () => {
  beforeEach(() => clearDataCache('kpi-src'));

  it('la tendance rend « 5,2 % » (virgule fr-FR), plus « 5.2% »', async () => {
    const kpi = new DsfrDataKpi();
    kpi.source = 'kpi-src';
    (kpi as any).valeur = 'population:sum';
    (kpi as any).label = 'Population';
    kpi.tendance = 'evolution:avg';
    document.body.appendChild(kpi);
    await kpi.updateComplete;

    dispatchDataLoaded('kpi-src', [{ population: 5825, evolution: 5.2 }]);
    await kpi.updateComplete;

    const tendanceEl = kpi.querySelector('.dsfr-data-kpi__tendance');
    expect(tendanceEl).not.toBeNull();
    const text = (tendanceEl!.textContent || '').replace(/\s+/g, ' ').trim();
    expect(text).toContain('5,2 %');
    expect(text).not.toContain('5.2%');

    kpi.remove();
  });
});
