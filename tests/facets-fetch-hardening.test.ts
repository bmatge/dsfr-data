import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests traversants #309 + #310 (EPIC I) — facets : fetch durci, UI jamais
 * vide, sélections fantômes.
 *
 * Bugs d'origine : fetchFacets jamais aborté (deux interactions rapides →
 * la réponse la plus lente écrasait _facetGroups), erreurs avalées
 * (catch {}) ; UI entièrement disparue quand un filtre serveur donne 0
 * résultat (utilisateur coincé, plus de bouton Réinitialiser) ; sélection
 * disparue des données = filtre invisible toujours actif.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import { clearDataCache } from '@/utils/data-bridge.js';

function makeServerSource(id: string, fetchFacetsImpl: (...args: unknown[]) => Promise<unknown>) {
  const el = document.createElement('div');
  el.id = id;
  (el as any).getAdapter = () => ({
    capabilities: { serverFacets: true, whereFormat: 'odsql' },
    fetchFacets: fetchFacetsImpl,
  });
  (el as any).getAdapterParams = () => ({
    baseUrl: 'https://api.example.fr',
    datasetId: 'ds',
    headers: undefined,
  });
  (el as any).getEffectiveWhere = () => '';
  document.body.appendChild(el);
  return el;
}

describe('#309 — AC : clics rapides → état final = dernière requête', () => {
  beforeEach(() => clearDataCache('fx-src'));

  it('la réponse périmée (plus lente) n’écrase pas la dernière', async () => {
    let call = 0;
    const fetchFacets = vi.fn().mockImplementation(() => {
      call++;
      const mine = call;
      const delay = mine === 1 ? 50 : 5; // la 1re répond APRÈS la 2e
      return new Promise((resolve) =>
        setTimeout(
          () => resolve([{ field: 'region', values: [{ value: `reponse-${mine}`, count: mine }] }]),
          delay
        )
      );
    });
    const srcEl = makeServerSource('fx-src', fetchFacets);

    const facets = new DsfrDataFacets();
    facets.id = 'fx-facets';
    facets.source = 'fx-src';
    facets.fields = 'region';
    (facets as any).serverFacets = true;

    const p1 = (facets as any)._fetchServerFacets();
    const p2 = (facets as any)._fetchServerFacets();
    await Promise.all([p1, p2]);
    await new Promise((r) => setTimeout(r, 80));

    const group = (facets as any)._facetGroups.find((g: any) => g.field === 'region');
    expect(group.values[0].value).toBe('reponse-2');

    srcEl.remove();
  });

  it('le signal du cycle précédent est aborté', async () => {
    const signals: AbortSignal[] = [];
    const fetchFacets = vi.fn().mockImplementation((_p, _f, _w, signal) => {
      signals.push(signal);
      return new Promise((resolve) => setTimeout(() => resolve([]), 30));
    });
    const srcEl = makeServerSource('fx-src', fetchFacets);

    const facets = new DsfrDataFacets();
    facets.id = 'fx-facets2';
    facets.source = 'fx-src';
    facets.fields = 'region';

    const p1 = (facets as any)._fetchServerFacets();
    const p2 = (facets as any)._fetchServerFacets();

    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    await Promise.all([p1, p2]);

    srcEl.remove();
  });

  it('AC : erreur réseau visible (warn + bannière), plus avalée', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFacets = vi.fn().mockRejectedValue(new Error('API 500'));
    const srcEl = makeServerSource('fx-src', fetchFacets);

    const facets = new DsfrDataFacets();
    facets.id = 'fx-facets3';
    facets.source = 'fx-src';
    facets.fields = 'region';
    document.body.appendChild(facets);

    await (facets as any)._fetchServerFacets();
    await facets.updateComplete;

    expect((facets as any)._facetsError).toContain('API 500');
    expect(warnSpy).toHaveBeenCalled();
    expect(facets.querySelector('.fr-alert--error')).not.toBeNull();

    facets.remove();
    srcEl.remove();
    warnSpy.mockRestore();
  });
});

describe('#310 — AC : 0 résultat → UI complète avec Réinitialiser actif', () => {
  beforeEach(() => clearDataCache('fx0-src'));

  it('avec une sélection active et 0 ligne, le bouton Réinitialiser reste rendu', async () => {
    const facets = new DsfrDataFacets();
    facets.id = 'fx0-facets';
    facets.source = 'fx0-src';
    facets.fields = 'region';
    document.body.appendChild(facets);

    // Sélection active, données filtrées vides (mode serveur : page filtrée)
    (facets as any)._activeSelections = { region: new Set(['IDF']) };
    (facets as any)._rawData = [];
    (facets as any)._facetGroups = [];
    facets.requestUpdate();
    await facets.updateComplete;

    const reset = Array.from(facets.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('initialiser')
    );
    expect(reset).toBeDefined();

    facets.remove();
  });

  it('sans sélection ni erreur, le composant reste invisible (comportement historique)', async () => {
    const facets = new DsfrDataFacets();
    facets.id = 'fx0-facets2';
    facets.source = 'fx0-src';
    document.body.appendChild(facets);
    (facets as any)._rawData = [];
    facets.requestUpdate();
    await facets.updateComplete;

    expect(facets.querySelector('.dsfr-data-facets')).toBeNull();
    facets.remove();
  });
});

describe('#310 — sélections fantômes réinjectées (désélectionnables)', () => {
  it('une valeur sélectionnée absente des données est rendue missing', () => {
    clearDataCache('fxg-src');
    const facets = new DsfrDataFacets();
    facets.id = 'fxg-facets';
    facets.source = 'fxg-src';
    facets.fields = 'region';
    (facets as any)._activeSelections = { region: new Set(['Disparue']) };
    (facets as any)._rawData = [{ region: 'IDF' }, { region: 'BRE' }];

    (facets as any)._buildFacetGroups();

    const group = (facets as any)._facetGroups.find((g: any) => g.field === 'region');
    const orphan = group.values.find((v: any) => v.value === 'Disparue');
    expect(orphan).toBeDefined();
    expect(orphan.missing).toBe(true);
  });

  it('un groupe entier disparu est recréé pour garder la sélection désactivable', () => {
    clearDataCache('fxg-src2');
    const facets = new DsfrDataFacets();
    facets.id = 'fxg-facets2';
    facets.source = 'fxg-src2';
    facets.fields = 'statut';
    (facets as any)._activeSelections = { statut: new Set(['actif']) };
    (facets as any)._rawData = [];

    (facets as any)._buildFacetGroups();

    const group = (facets as any)._facetGroups.find((g: any) => g.field === 'statut');
    expect(group).toBeDefined();
    expect(group.values[0]).toMatchObject({ value: 'actif', missing: true });
  });
});
