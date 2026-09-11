import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * #773 — la liste blanche `url-params` d'une facette AUTONOME.
 *
 * `knownFields` incluait toutes les colonnes de la première ligne : sur une
 * page qui portait aussi un `dsfr-data-context url-sync`, `?annee=2023` était
 * capté par la facette (colonne présente dans les données, sans facette), qui
 * posait une sélection fantôme — KPI à 0, carte vide. Requalifié P2 : la voie
 * native est `context="id"`. Durcissement : seules les facettes EFFECTIVES
 * lisent l'URL, et un paramètre partagé avec un contexte est signalé.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import '@/components/dsfr-data-context.js';
import '@/components/dsfr-data-context-filter.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';

const ROWS = [
  { annee: '2023', region: 'IDF', statut: 'ouvert', id: 'a' },
  { annee: '2024', region: 'BRE', statut: 'clos', id: 'b' },
  { annee: '2024', region: 'IDF', statut: 'clos', id: 'c' },
];

let seq = 0;
const mounted: Element[] = [];

afterEach(() => {
  for (const el of mounted.splice(0)) el.remove();
  window.history.replaceState(null, '', window.location.pathname);
  vi.restoreAllMocks();
});

async function autonomousFacets(fields: string, extra: (el: DsfrDataFacets) => void = () => {}) {
  const src = `wl-src-${++seq}`;
  clearDataCache(src);
  const facets = new DsfrDataFacets();
  facets.id = `wl-facets-${seq}`;
  facets.source = src;
  facets.fields = fields;
  facets.urlParams = true;
  extra(facets);
  document.body.appendChild(facets);
  mounted.push(facets);
  dispatchDataLoaded(src, ROWS);
  await facets.updateComplete;
  return facets;
}

const selections = (f: DsfrDataFacets) =>
  (f as unknown as { _activeSelections: Record<string, Set<string>> })._activeSelections;

describe('#773 — seules les facettes effectives lisent l’URL', () => {
  it('AC : une colonne des données qui n’est pas une facette n’est plus lue', async () => {
    window.history.replaceState(null, '', '?annee=2023&region=IDF');
    const facets = await autonomousFacets('region');
    expect(Object.keys(selections(facets))).toEqual(['region']);
    expect([...selections(facets).region]).toEqual(['IDF']);
  });

  it('AC : le cas fields vide continue de fonctionner (facettes détectées)', async () => {
    window.history.replaceState(null, '', '?statut=clos&id=a');
    const facets = await autonomousFacets('');
    // statut est détecté comme facette ; id (toutes valeurs uniques) ne l'est pas.
    expect([...(selections(facets).statut ?? [])]).toEqual(['clos']);
    expect(selections(facets).id).toBeUndefined();
  });

  it('url-param-map garde la main : un paramètre mappé est lu', async () => {
    window.history.replaceState(null, '', '?r=BRE');
    const facets = await autonomousFacets('region', (el) => (el.urlParamMap = 'r:region'));
    expect([...selections(facets).region]).toEqual(['BRE']);
  });
});

describe('#773 — paramètre partagé avec un contexte', () => {
  async function pageWithContext(facetsFields: string, extra?: (el: DsfrDataFacets) => void) {
    const host = document.createElement('div');
    host.innerHTML = `
      <select id="sel-annee"><option value=""></option><option value="2023">2023</option></select>
      <dsfr-data-context id="ctx-wl" url-sync sources="wl-ctx-src">
        <dsfr-data-context-filter field="annee" ui="sel-annee"></dsfr-data-context-filter>
      </dsfr-data-context>`;
    document.body.appendChild(host);
    mounted.push(host);
    await new Promise((r) => setTimeout(r, 0));
    return autonomousFacets(facetsFields, extra);
  }

  it('AC : une facette autonome qui lirait le paramètre du contexte est signalée', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const facets = await pageWithContext('annee, region');
    facets.requestUpdate();
    await facets.updateComplete;

    const marker = facets.getAttribute('data-dsfr-config-error') ?? '';
    expect(marker).toContain('"annee"');
    expect(marker).toContain('dsfr-data-context#ctx-wl');
    expect(marker).toContain('context="ctx-wl"');
    // Une seule erreur console, même après plusieurs rendus.
    expect(error.mock.calls.filter((c) => String(c[0]).includes('url-params'))).toHaveLength(1);
  });

  it('sans recoupement, rien n’est signalé', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const facets = await pageWithContext('region');
    facets.requestUpdate();
    await facets.updateComplete;
    expect(facets.hasAttribute('data-dsfr-config-error')).toBe(false);
  });

  it('url-param-map qui borne la lecture lève le conflit', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const facets = await pageWithContext('annee', (el) => (el.urlParamMap = 'tranche:annee'));
    facets.requestUpdate();
    await facets.updateComplete;
    expect(facets.hasAttribute('data-dsfr-config-error')).toBe(false);
  });
});
