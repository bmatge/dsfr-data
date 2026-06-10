import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Tests traversants #312 (EPIC I) — url-sync : cohabitation et validation.
 *
 * Bugs d'origine : _syncUrl repartait de new URLSearchParams() → effaçait le
 * paramètre du dsfr-data-search voisin et tout autre param de la page à
 * chaque clic ; sans url-param-map, TOUT paramètre d'URL devenait une
 * sélection (?utm_source=newsletter → filtre sur un champ inexistant →
 * 0 résultat) ; doc « pushState » vs code replaceState ; sr-label de search
 * appliquait la classe sr-only qui n'existe pas en DSFR.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import { DsfrDataSearch } from '@/components/dsfr-data-search.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';

afterEach(() => {
  window.history.replaceState(null, '', window.location.pathname);
});

describe('#312 — AC : facets + search en url-sync cohabitent', () => {
  it('un clic facette préserve le paramètre du search voisin', async () => {
    clearDataCache('cohab-src');
    window.history.replaceState(null, '', '?q=velo&autre=param');

    const facets = new DsfrDataFacets();
    facets.id = 'cohab-facets';
    facets.source = 'cohab-src';
    facets.fields = 'region';
    (facets as any).urlSync = true;
    document.body.appendChild(facets);
    dispatchDataLoaded('cohab-src', [{ region: 'IDF' }, { region: 'BRE' }]);
    await facets.updateComplete;

    const checkbox = facets.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.click();
    await facets.updateComplete;

    const params = new URLSearchParams(window.location.search);
    expect(params.get('q')).toBe('velo');
    expect(params.get('autre')).toBe('param');
    expect(params.get('region')).toBeTruthy();

    facets.remove();
  });
});

describe('#312 — AC : ?utm_source=x sans effet', () => {
  it('un param marketing ne crée aucune sélection', () => {
    clearDataCache('utm-src');
    window.history.replaceState(null, '', '?utm_source=newsletter&utm_campaign=ete');

    const facets = new DsfrDataFacets();
    facets.id = 'utm-facets';
    facets.source = 'utm-src';
    facets.fields = 'region';
    (facets as any)._rawData = [{ region: 'IDF' }];

    (facets as any)._applyUrlParams();

    expect(Object.keys((facets as any)._activeSelections)).toHaveLength(0);
  });
});

describe('#312 — AC : sr-label masque le label (fr-sr-only)', () => {
  it('la classe DSFR fr-sr-only est appliquée (sr-only n’existe pas)', async () => {
    clearDataCache('sr-src');
    const search = new DsfrDataSearch();
    search.id = 'sr-search';
    search.source = 'sr-src';
    (search as any).srLabel = true;
    document.body.appendChild(search);
    dispatchDataLoaded('sr-src', [{ nom: 'a' }]);
    await search.updateComplete;

    const label = search.querySelector('label');
    expect(label?.className).toContain('fr-sr-only');
    expect(label?.className).not.toMatch(/(?<!fr-)sr-only/);

    search.remove();
  });
});
