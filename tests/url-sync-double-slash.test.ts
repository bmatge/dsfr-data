import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests #683 (#640 pt 1) — URL de synchronisation construite par l'API `URL`.
 *
 * Bug d'origine : `_syncUrl` concaténait `pathname` + `?` + params. Sur une
 * page servie sous `//dsfr-data/…`, `pathname` commence par `//` : la chaîne
 * `//dsfr-data/page?x=1` est une URL relative au SCHÉMA (hôte « dsfr-data »),
 * `history.replaceState` levait SecurityError et toute la synchro d'URL
 * cessait, silencieusement. Les trois chemins (contexte, facets, search)
 * partent désormais de `new URL(location.href)` + `searchParams`.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import '@/components/dsfr-data-context.js';
import '@/components/dsfr-data-context-filter.js';
import { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import { DsfrDataSearch } from '@/components/dsfr-data-search.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';
import type { DsfrDataContext } from '@/components/dsfr-data-context.js';

const DOUBLE_SLASH_PAGE = 'http://localhost//dsfr-data/page';

function fakeSource(id: string) {
  clearDataCache(id);
  const el = document.createElement('div');
  el.id = id;
  (el as unknown as Record<string, unknown>).getAdapter = () => ({
    capabilities: { whereFormat: 'colon' },
  });
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  // Page ouverte sur //chemin (URL absolue, même origine)
  window.history.replaceState(null, '', DOUBLE_SLASH_PAGE);
  expect(window.location.pathname).toBe('//dsfr-data/page');
});

afterEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState(null, '', 'http://localhost/');
});

describe('#683 — AC : page ouverte sur //chemin, sélection → URL mise à jour, aucune exception', () => {
  it('le témoin : concaténer pathname lève bien SecurityError dans cet environnement', () => {
    expect(() => window.history.replaceState(null, '', `${window.location.pathname}?x=1`)).toThrow(
      /cannot be created in a document with origin/
    );
  });

  it('dsfr-data-context url-sync', async () => {
    fakeSource('dd-src');
    const input = document.createElement('input');
    input.id = 'ui-dd';
    document.body.appendChild(input);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <dsfr-data-context id="dd-ctx" sources="dd-src" url-sync>
        <dsfr-data-context-filter field="statut" operator="eq" ui="ui-dd"></dsfr-data-context-filter>
      </dsfr-data-context>
    `;
    document.body.appendChild(wrapper);
    await (wrapper.querySelector('dsfr-data-context') as DsfrDataContext).updateComplete;
    await new Promise((r) => setTimeout(r, 0));

    input.value = 'actif';
    expect(() => input.dispatchEvent(new Event('change', { bubbles: true }))).not.toThrow();

    expect(window.location.pathname).toBe('//dsfr-data/page');
    expect(new URLSearchParams(window.location.search).get('statut')).toBe('actif');

    input.value = '';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('//dsfr-data/page');
  });

  it('dsfr-data-facets url-sync (mode autonome)', async () => {
    clearDataCache('dd-facets-src');
    const facets = new DsfrDataFacets();
    facets.id = 'dd-facets';
    facets.source = 'dd-facets-src';
    facets.fields = 'region';
    facets.urlSync = true;
    document.body.appendChild(facets);
    dispatchDataLoaded('dd-facets-src', [{ region: 'IDF' }, { region: 'BRE' }]);
    await facets.updateComplete;

    const checkbox = facets.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(() => checkbox.click()).not.toThrow();
    await facets.updateComplete;

    expect(window.location.pathname).toBe('//dsfr-data/page');
    expect(new URLSearchParams(window.location.search).get('region')).toBeTruthy();
  });

  it('dsfr-data-search url-sync (mode autonome)', async () => {
    clearDataCache('dd-search-src');
    const search = new DsfrDataSearch();
    search.id = 'dd-search';
    search.source = 'dd-search-src';
    search.urlSearchParam = 'q';
    search.urlSync = true;
    document.body.appendChild(search);
    dispatchDataLoaded('dd-search-src', [{ nom: 'velo' }, { nom: 'auto' }]);
    await search.updateComplete;

    expect(() => search.search('velo')).not.toThrow();

    expect(window.location.pathname).toBe('//dsfr-data/page');
    expect(new URLSearchParams(window.location.search).get('q')).toBe('velo');

    search.clear();
    expect(window.location.search).toBe('');
  });

  it('le hash et les paramètres voisins sont préservés', async () => {
    window.history.replaceState(null, '', `${DOUBLE_SLASH_PAGE}?routing=page2#section`);
    fakeSource('dd-src2');
    const input = document.createElement('input');
    input.id = 'ui-dd2';
    document.body.appendChild(input);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <dsfr-data-context id="dd-ctx2" sources="dd-src2" url-sync>
        <dsfr-data-context-filter field="f" operator="eq" ui="ui-dd2"></dsfr-data-context-filter>
      </dsfr-data-context>
    `;
    document.body.appendChild(wrapper);
    await new Promise((r) => setTimeout(r, 0));

    input.value = 'v';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(window.location.hash).toBe('#section');
    const params = new URLSearchParams(window.location.search);
    expect(params.get('routing')).toBe('page2');
    expect(params.get('f')).toBe('v');
  });
});
