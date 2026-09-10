import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #674 — `where` sur dsfr-data-kpi : dialecte colon de dsfr-data-query,
 * côté client seulement, appliqué à `value`, `trend` et `lines`. Grammaire
 * `montant:sum:categorie=Actif` refusée (collision avec `count:champ:valeur`).
 */

import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';
import { validateColonFilter, applyLocalFilter, COLON_FILTER_OPERATORS } from '@dsfr-data/shared';
import { parseExpression } from '@/utils/aggregations.js';
import { clearDataCache, clearDataMeta, setDataMeta } from '@/utils/data-bridge.js';

const BUDGET = [
  { categorie: 'Actif', montant: 100, evol: 5, meta: { annee: 2024 } },
  { categorie: 'Actif', montant: 50, evol: 7, meta: { annee: 2025 } },
  { categorie: 'Passif', montant: 30, evol: -2, meta: { annee: 2024 } },
  { categorie: null, montant: 999, evol: 0, meta: { annee: 2025 } },
];

/** Vue interne du KPI. */
interface KpiInternals {
  _sourceData: unknown;
  _computeValue(): number | string | null;
  _getTendanceInfo(): { value: number } | null;
  _resolveLines(): Array<{ text: string }>;
  _validateConfig(): void;
  _blockingConfigError: string | null;
  _filteredData(): unknown;
}
const internals = (k: DsfrDataKpi) => k as unknown as KpiInternals;

describe('#674 — validateColonFilter (moteur partagé)', () => {
  it('accepte les 12 opérateurs et les clauses multiples', () => {
    expect(COLON_FILTER_OPERATORS).toHaveLength(12);
    expect(validateColonFilter('categorie:eq:Actif, montant:gte:1000, x:isnull')).toBeNull();
    expect(validateColonFilter('dept:in:75|13')).toBeNull();
  });

  it('refuse un opérateur inconnu, une valeur manquante, une clause sans opérateur', () => {
    expect(validateColonFilter('categorie:egal:Actif')).toContain('opérateur inconnu "egal"');
    expect(validateColonFilter('categorie:eq')).toContain('valeur manquante');
    expect(validateColonFilter('categorie = Actif')).toContain('non reconnue');
  });

  it('applyLocalFilter accepte un accesseur de champ (chemins imbriqués)', () => {
    const rows = applyLocalFilter(BUDGET, 'meta.annee:eq:2025', (row, field) =>
      field.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], row)
    );
    expect(rows).toHaveLength(2);
  });
});

describe('#674 — dsfr-data-kpi where', () => {
  let kpi: DsfrDataKpi;
  beforeEach(() => {
    clearDataCache('budget');
    clearDataMeta('budget');
    kpi = new DsfrDataKpi();
    kpi.source = 'budget';
    internals(kpi)._sourceData = BUDGET;
  });
  afterEach(() => vi.restoreAllMocks());

  it('AC : value="montant:sum" where="categorie:eq:Actif" = la somme filtrée', () => {
    kpi.value = 'montant:sum';
    kpi.where = 'categorie:eq:Actif';
    expect(internals(kpi)._computeValue()).toBe(150);
  });

  it('sans where : comportement inchangé', () => {
    kpi.value = 'montant:sum';
    expect(internals(kpi)._computeValue()).toBe(1179);
  });

  it('clauses multiples, in, chemins imbriqués', () => {
    kpi.value = 'montant:sum';
    kpi.where = 'categorie:in:Actif|Passif, meta.annee:eq:2024';
    expect(internals(kpi)._computeValue()).toBe(130);
  });

  it('count et count:champ:valeur sont filtrés aussi', () => {
    kpi.value = 'count';
    kpi.where = 'montant:lt:100';
    expect(internals(kpi)._computeValue()).toBe(2);
    kpi.value = 'count:categorie:Actif';
    kpi.where = 'montant:gte:100';
    expect(internals(kpi)._computeValue()).toBe(1);
  });

  it('s’applique à trend', () => {
    kpi.value = 'montant:sum';
    kpi.trend = 'evol:avg';
    kpi.where = 'categorie:eq:Actif';
    expect(internals(kpi)._getTendanceInfo()?.value).toBe(6);
  });

  it('s’applique aux lines', () => {
    kpi.value = 'montant:sum';
    kpi.lines = '[{"value":"montant:max","format":"nombre"}]';
    kpi.where = 'categorie:eq:Passif';
    expect(internals(kpi)._resolveLines()[0].text).toBe('30');
  });

  it('source mono-objet : filtrée comme un tableau à une ligne', () => {
    internals(kpi)._sourceData = { categorie: 'Actif', montant: 42 };
    kpi.value = 'montant:sum';
    kpi.where = 'categorie:eq:Passif';
    expect(internals(kpi)._computeValue()).toBe(0);
    kpi.where = 'categorie:eq:Actif';
    expect(internals(kpi)._computeValue()).toBe(42);
  });

  it('meta:total ignore le where (total de l’amont)', () => {
    setDataMeta('budget', { page: 1, pageSize: 0, total: 4, serverSide: false });
    kpi.value = 'meta:total';
    kpi.where = 'categorie:eq:Actif';
    expect(internals(kpi)._computeValue()).toBe(4);
  });

  it('le warn de troncature (#659) compare au total les lignes reçues, pas filtrées', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setDataMeta('budget', { page: 1, pageSize: 0, total: 4, serverSide: false });
    kpi.value = 'count';
    kpi.where = 'categorie:eq:Actif';
    expect(internals(kpi)._computeValue()).toBe(2);
    expect(warn).not.toHaveBeenCalled();
  });

  it('where invalide : erreur de configuration bloquante', () => {
    kpi.value = 'montant:sum';
    kpi.where = 'categorie:egal:Actif';
    internals(kpi)._validateConfig();
    expect(internals(kpi)._blockingConfigError).toContain('where="categorie:egal:Actif"');
    expect(internals(kpi)._blockingConfigError).toContain('opérateur inconnu');
    expect(kpi.getAttribute('data-dsfr-config-error')).toContain('where=');
  });

  it('where valide : pas d’erreur de configuration', () => {
    kpi.value = 'montant:sum';
    kpi.where = 'categorie:eq:Actif';
    internals(kpi)._validateConfig();
    expect(internals(kpi)._blockingConfigError).toBeNull();
  });

  it('grammaire "montant:sum:categorie=Actif" refusée (collision count:champ:valeur)', () => {
    const parsed = parseExpression('montant:sum:categorie=Actif');
    expect(parsed.type).toBe('invalid');
    expect(parsed.error).toContain('fonction d’agrégat "montant" inconnue'.replace('’', "'"));
  });
});
