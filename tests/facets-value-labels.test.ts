import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * #928 (AM-081) — `value-labels` : une facette sur un champ de CODE presente
 * le NOM et continue de filtrer le code.
 *
 * Deux grammaires : un champ compagnon des memes lignes
 * (`value-labels="dep_code:dep_nom"`) et une table statique en JSON
 * (`value-labels='{"dep_code":{"29":"Finistere"}}'`).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';

interface FacetsInternals {
  _activeSelections: Record<string, Set<string>>;
}

const ROWS = [
  { dep_code: '29', dep_nom: 'Finistere', n: 1 },
  { dep_code: '29', dep_nom: 'Finistere', n: 2 },
  { dep_code: '56', dep_nom: 'Morbihan', n: 3 },
  { dep_code: '22', dep_nom: "Cotes-d'Armor", n: 4 },
  // Code le plus GRAND, libelle le plus PETIT : l'ordre par code et l'ordre
  // par libelle different, ce qu'eprouve le tri alphabetique.
  { dep_code: '75', dep_nom: 'Ain', n: 5 },
];

let seq = 0;
const mounted: DsfrDataFacets[] = [];

async function renderFacets(
  attrs: { valueLabels?: string; display?: string; sort?: string } = {}
): Promise<DsfrDataFacets> {
  const sourceId = `vl-src-${++seq}`;
  clearDataCache(sourceId);
  const facets = new DsfrDataFacets();
  facets.id = `vl-facets-${seq}`;
  facets.source = sourceId;
  facets.fields = 'dep_code';
  if (attrs.valueLabels !== undefined) facets.setAttribute('value-labels', attrs.valueLabels);
  if (attrs.display) facets.display = attrs.display;
  if (attrs.sort) facets.sort = attrs.sort;
  document.body.appendChild(facets);
  mounted.push(facets);
  dispatchDataLoaded(sourceId, ROWS);
  await facets.updateComplete;
  return facets;
}

function labelTexts(facets: DsfrDataFacets): string[] {
  return Array.from(facets.querySelectorAll('label.fr-label')).map((l) =>
    (l.textContent ?? '').trim()
  );
}

afterEach(() => {
  for (const f of mounted.splice(0)) f.remove();
});

describe('#928 — AC : le libelle est lu dans un champ compagnon des memes lignes', () => {
  it('sans value-labels, la facette affiche le code (comportement historique)', async () => {
    const facets = await renderFacets();
    const texts = labelTexts(facets).join(' | ');
    expect(texts).toContain('29');
    expect(texts).not.toContain('Finistere');
  });

  it('value-labels="dep_code:dep_nom" affiche les noms', async () => {
    const facets = await renderFacets({ valueLabels: 'dep_code:dep_nom' });
    const texts = labelTexts(facets).join(' | ');
    expect(texts).toContain('Finistere');
    expect(texts).toContain('Morbihan');
    expect(texts).toContain("Cotes-d'Armor");
  });

  it('la valeur selectionnee reste le CODE', async () => {
    const facets = await renderFacets({ valueLabels: 'dep_code:dep_nom' });
    const inputs = Array.from(facets.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    const labels = inputs.map(
      (i) => facets.querySelector(`label[for="${i.id}"]`)?.textContent?.trim() ?? ''
    );
    const idx = labels.findIndex((l) => l.startsWith('Morbihan'));
    expect(idx).toBeGreaterThanOrEqual(0);
    inputs[idx].click();
    await facets.updateComplete;
    const selections = (facets as unknown as FacetsInternals)._activeSelections;
    expect([...(selections.dep_code ?? [])]).toEqual(['56']);
  });

  it('en mode select, la valeur de l’option reste le code et son texte est le nom', async () => {
    const facets = await renderFacets({
      valueLabels: 'dep_code:dep_nom',
      display: 'dep_code:select',
    });
    const options = Array.from(facets.querySelectorAll<HTMLOptionElement>('option'));
    const morbihan = options.find((o) => (o.textContent ?? '').includes('Morbihan'));
    expect(morbihan).toBeDefined();
    expect(morbihan!.value).toBe('56');
  });

  it('le tri alphabetique porte sur le LIBELLE, pas sur le code', async () => {
    const facets = await renderFacets({ valueLabels: 'dep_code:dep_nom', sort: 'alpha:asc' });
    const texts = labelTexts(facets);
    // Ain porte le code 75 : range par code il serait DERNIER, range par
    // libelle il est premier.
    expect(texts[0].startsWith('Ain')).toBe(true);
  });
});

describe('#928 — AC : une table statique code:libelle est acceptee', () => {
  it('value-labels JSON affiche les libelles de la table', async () => {
    const facets = await renderFacets({
      valueLabels: '{"dep_code":{"29":"Finistere","56":"Morbihan"}}',
    });
    const texts = labelTexts(facets).join(' | ');
    expect(texts).toContain('Finistere');
    expect(texts).toContain('Morbihan');
    // 22 n'est pas dans la table : le code reste affiche
    expect(texts).toContain('22');
  });
});

describe('#928 — AC : une grammaire fausse est signalee et non ignoree', () => {
  it('un libelle de VALEUR passe a `labels` est signale en console', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sourceId = `vl-src-${++seq}`;
    clearDataCache(sourceId);
    const facets = new DsfrDataFacets();
    facets.id = `vl-facets-${seq}`;
    facets.source = sourceId;
    facets.fields = 'dep_code';
    facets.labels = "dep_code:Departement | 22:Cotes-d'Armor";
    document.body.appendChild(facets);
    mounted.push(facets);
    dispatchDataLoaded(sourceId, ROWS);
    await facets.updateComplete;

    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes('labels') && m.includes('22'))).toBe(true);
    expect(messages.some((m) => m.includes('value-labels'))).toBe(true);
    warn.mockRestore();
  });
});
