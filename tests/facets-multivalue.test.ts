import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Tests #421 — dsfr-data-facets : champs multi-valeurs (tableaux /
 * ChoiceList Grist) en filtrage client.
 *
 * Bug d'origine : `_applyFilters()` comparait `selected.has(String(val))` —
 * une cellule tableau (`besoins: ["a","b"]`) etait stringifiee (« a,b ») et
 * ne matchait jamais une selection ; idem pour le comptage des valeurs de
 * facette. Attendu : intersection avec la selection, et chaque element compte
 * dans son groupe.
 */

import { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import { clearDataCache, clearDataMeta, dispatchDataLoaded } from '@/utils/data-bridge.js';

const MULTI_DATA = [
  { nom: 'Alpha', besoins: ['audit', 'formation'], region: 'Bretagne' },
  { nom: 'Bravo', besoins: ['audit'], region: 'PACA' },
  { nom: 'Charlie', besoins: ['formation', 'conseil'], region: 'Bretagne' },
  { nom: 'Delta', besoins: [], region: 'PACA' },
  { nom: 'Echo', besoins: ['conseil'], region: 'Bretagne' },
];

describe('#421 — facets multi-valeurs (ChoiceList Grist)', () => {
  let facets: DsfrDataFacets;

  beforeEach(() => {
    clearDataCache('mv-facets');
    clearDataCache('mv-source');
    clearDataMeta('mv-facets');
    clearDataMeta('mv-source');
    facets = new DsfrDataFacets();
    facets.id = 'mv-facets';
    facets.source = 'mv-source';
    facets.fields = 'besoins,region';
    window.history.replaceState({}, '', window.location.pathname);
    facets.connectedCallback();
    dispatchDataLoaded('mv-source', MULTI_DATA);
  });

  afterEach(() => {
    if (facets.isConnected) facets.disconnectedCallback();
    window.history.replaceState({}, '', window.location.pathname);
  });

  it('compte chaque élément du tableau dans le groupe de facettes', () => {
    const values = facets._computeFacetValues('besoins');
    const byValue = Object.fromEntries(values.map((v) => [v.value, v.count]));
    expect(byValue).toEqual({ audit: 2, formation: 2, conseil: 2 });
    // Surtout pas la version stringifiée « audit,formation »
    expect(values.some((v) => v.value.includes(','))).toBe(false);
  });

  it('filtre par intersection : une sélection matche les lignes qui contiennent la valeur', () => {
    let emitted: Record<string, unknown>[] = [];
    facets.emitTransformedData = (data: Record<string, unknown>[]) => {
      emitted = data;
    };

    facets._activeSelections['besoins'] = new Set(['audit']);
    facets._applyFilters();
    expect(emitted.map((r) => r.nom)).toEqual(['Alpha', 'Bravo']);
  });

  it('multi-sélection : union des valeurs cochées (OR intra-facette)', () => {
    let emitted: Record<string, unknown>[] = [];
    facets.emitTransformedData = (data: Record<string, unknown>[]) => {
      emitted = data;
    };

    facets._activeSelections['besoins'] = new Set(['audit', 'conseil']);
    facets._applyFilters();
    expect(emitted.map((r) => r.nom)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Echo']);
  });

  it('croise facette tableau et facette scalaire (AND inter-facettes)', () => {
    let emitted: Record<string, unknown>[] = [];
    facets.emitTransformedData = (data: Record<string, unknown>[]) => {
      emitted = data;
    };

    facets._activeSelections['besoins'] = new Set(['formation']);
    facets._activeSelections['region'] = new Set(['Bretagne']);
    facets._applyFilters();
    expect(emitted.map((r) => r.nom)).toEqual(['Alpha', 'Charlie']);
  });

  it('les comptes croisés excluent la facette courante mais filtrent par les autres', () => {
    facets._activeSelections['region'] = new Set(['Bretagne']);
    const values = facets._computeFacetValues('besoins');
    const byValue = Object.fromEntries(values.map((v) => [v.value, v.count]));
    // Alpha (audit, formation), Charlie (formation, conseil), Echo (conseil)
    expect(byValue).toEqual({ audit: 1, formation: 2, conseil: 2 });
  });

  it('une cellule tableau vide ne matche rien et ne compte rien', () => {
    let emitted: Record<string, unknown>[] = [];
    facets.emitTransformedData = (data: Record<string, unknown>[]) => {
      emitted = data;
    };

    facets._activeSelections['besoins'] = new Set(['audit', 'formation', 'conseil']);
    facets._applyFilters();
    expect(emitted.map((r) => r.nom)).not.toContain('Delta');

    const values = facets._computeFacetValues('besoins');
    expect(values.reduce((acc, v) => acc + v.count, 0)).toBe(6);
  });

  it("l'auto-détection retient un champ tableau de chaînes", () => {
    facets.fields = '';
    const fields = facets._autoDetectFields();
    expect(fields).toContain('besoins');
    expect(fields).toContain('region');
  });

  it("l'auto-détection rejette un tableau non-chaînes", () => {
    dispatchDataLoaded('mv-source', [
      { nom: 'X', coords: [1.2, 3.4] },
      { nom: 'Y', coords: [5.6, 7.8] },
    ]);
    facets.fields = '';
    const fields = facets._autoDetectFields();
    expect(fields).not.toContain('coords');
  });

  it('les scalaires continuent de fonctionner à l’identique', () => {
    let emitted: Record<string, unknown>[] = [];
    facets.emitTransformedData = (data: Record<string, unknown>[]) => {
      emitted = data;
    };

    facets._activeSelections['region'] = new Set(['PACA']);
    facets._applyFilters();
    expect(emitted.map((r) => r.nom)).toEqual(['Bravo', 'Delta']);

    const values = facets._computeFacetValues('region');
    const byValue = Object.fromEntries(values.map((v) => [v.value, v.count]));
    expect(byValue).toEqual({ Bretagne: 3, PACA: 2 });
  });
});
