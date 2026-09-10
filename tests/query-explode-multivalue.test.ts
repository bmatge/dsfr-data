import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests #736 — dsfr-data-query : champ multivalué compté par COMBINAISON.
 *
 * `_applyGroupByAndAggregate` construit la clé de groupe par `String(valeur)` :
 * une cellule `["audit", "formation"]` devenait la modalité « audit,formation »,
 * là où `dsfr-data-facets` éclate le même champ depuis #421. Les deux
 * composants branchés sur le même champ donnaient des chiffres différents.
 *
 * L'attribut `explode` éclate explicitement : le défaut reste inchangé (des
 * chiffres publiés en production s'appuient dessus).
 */

import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  subscribeToSourceCommands,
} from '@/utils/data-bridge.js';

/** Jeu de données partagé avec les tests de facettes multi-valeurs (#421). */
const MULTI_DATA: Record<string, unknown>[] = [
  { nom: 'Alpha', besoins: ['audit', 'formation'], region: 'Bretagne' },
  { nom: 'Bravo', besoins: ['audit'], region: 'PACA' },
  { nom: 'Charlie', besoins: ['formation', 'conseil'], region: 'Bretagne' },
  { nom: 'Delta', besoins: [], region: 'PACA' },
  { nom: 'Echo', besoins: ['conseil'], region: 'Bretagne' },
];

/**
 * Vue interne : le regroupement et la négociation sont privés/protégés, ces
 * tests les pilotent directement (pas de `as any` dispersé).
 */
interface QueryInternals {
  _applyGroupByAndAggregate(data: Record<string, unknown>[]): Record<string, unknown>[];
  _negotiateServerSide(): void;
  _serverDelegated: { groupBy: boolean; aggregate: boolean; orderBy: boolean; where: boolean };
  beforeTransformerSubscribe(): void;
}

describe('#736 — explode : champ multivalué au group-by', () => {
  let query: DsfrDataQuery;
  let internals: QueryInternals;

  beforeEach(() => {
    query = new DsfrDataQuery();
    internals = query as unknown as QueryInternals;
    query.id = 'explode-query';
    query.source = 'explode-source';
    query.groupBy = 'besoins';
    query.aggregate = 'nom:count';
  });

  afterEach(() => {
    if (query.isConnected) query.disconnectedCallback();
    vi.restoreAllMocks();
  });

  it('sans explode, le comportement historique est inchangé (une combinaison = une modalité)', () => {
    const result = internals._applyGroupByAndAggregate(MULTI_DATA);
    const modalites = result.map((r) => r.besoins);

    expect(modalites).toContain('audit,formation');
    expect(modalites).toContain('formation,conseil');
    // Cellule vide : groupe null (#647), comme aujourd'hui
    expect(modalites).toContain(null);
    // 5 modalités pour 3 valeurs réelles : les combinaisons comptent à part
    expect(result).toHaveLength(5);
  });

  it('avec explode, les modalités sont celles de la facette du même champ', () => {
    query.explode = 'besoins';
    const result = internals._applyGroupByAndAggregate(MULTI_DATA);

    const facets = new DsfrDataFacets();
    facets.id = 'explode-facets';
    facets.source = 'explode-facets-source';
    facets.fields = 'besoins';
    clearDataCache('explode-facets-source');
    clearDataMeta('explode-facets-source');
    facets.connectedCallback();
    dispatchDataLoaded('explode-facets-source', MULTI_DATA);
    const facetValues = facets._computeFacetValues('besoins');
    facets.disconnectedCallback();
    clearDataCache('explode-facets-source');
    clearDataMeta('explode-facets-source');

    expect([...result.map((r) => String(r.besoins))].sort()).toEqual(
      [...facetValues.map((v) => v.value)].sort()
    );
    // Et les mêmes comptes : une ligne portant N valeurs compte dans N groupes
    const countsQuery = Object.fromEntries(result.map((r) => [r.besoins, r['nom__count']]));
    const countsFacets = Object.fromEntries(facetValues.map((v) => [v.value, v.count]));
    expect(countsQuery).toEqual(countsFacets);
    expect(countsQuery).toEqual({ audit: 2, formation: 2, conseil: 2 });
  });

  it('une cellule sans valeur ne produit aucune ligne (pas de groupe vide)', () => {
    query.explode = 'besoins';
    const result = internals._applyGroupByAndAggregate([
      { nom: 'Delta', besoins: [] },
      { nom: 'Foxtrot', besoins: null },
      { nom: 'Golf' },
      { nom: 'Hotel', besoins: ['audit', '', null] },
    ]);

    expect(result.map((r) => r.besoins)).toEqual(['audit']);
    expect(result[0]['nom__count']).toBe(1);
  });

  it('une cellule scalaire reste une modalité unique', () => {
    query.groupBy = 'region';
    query.explode = 'region';
    const result = internals._applyGroupByAndAggregate(MULTI_DATA);
    const counts = Object.fromEntries(result.map((r) => [r.region, r['nom__count']]));
    expect(counts).toEqual({ Bretagne: 3, PACA: 2 });
  });

  it('éclate un champ imbriqué sans muter les lignes source', () => {
    query.groupBy = 'fields.tags';
    query.explode = 'fields.tags';
    const source = [{ nom: 'Alpha', fields: { tags: ['a', 'b'] } }];

    const result = internals._applyGroupByAndAggregate(source);
    expect(result.map((r) => (r.fields as Record<string, unknown>).tags)).toEqual(['a', 'b']);
    expect(source[0].fields.tags).toEqual(['a', 'b']);
  });

  it('un champ hors group-by est signalé et ignoré', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    query.explode = 'region';

    internals.beforeTransformerSubscribe();

    expect(query.getAttribute('data-dsfr-config-error')).toContain('explode="region"');
    expect(spy).toHaveBeenCalled();

    // Éclatement ignoré : le group-by reste celui d'avant
    const result = internals._applyGroupByAndAggregate(MULTI_DATA);
    expect(result.map((r) => r.besoins)).toContain('audit,formation');
  });

  describe('délégation serveur', () => {
    let mockSource: HTMLElement;
    let commands: Array<Record<string, unknown>>;
    let unsubscribe: () => void;

    beforeEach(() => {
      mockSource = document.createElement('div');
      mockSource.id = 'explode-neg-source';
      (mockSource as unknown as { getAdapter: () => unknown }).getAdapter = () => ({
        type: 'opendatasoft',
        capabilities: { serverGroupBy: true, serverOrderBy: true, whereFormat: 'odsql' },
      });
      document.body.appendChild(mockSource);
      query.source = 'explode-neg-source';
      commands = [];
      unsubscribe = subscribeToSourceCommands('explode-neg-source', (cmd) => commands.push(cmd));
    });

    afterEach(() => {
      unsubscribe?.();
      mockSource?.remove();
    });

    it('délègue le group-by sans explode', () => {
      internals._negotiateServerSide();
      expect(internals._serverDelegated.groupBy).toBe(true);
    });

    it("ne délègue jamais un group-by éclaté (aucune API n'éclate)", () => {
      query.explode = 'besoins';
      internals._negotiateServerSide();

      expect(internals._serverDelegated.groupBy).toBe(false);
      expect(internals._serverDelegated.aggregate).toBe(false);
      expect(commands.some((c) => c.groupBy === 'besoins')).toBe(false);
    });
  });
});
