import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * #684 — `display="champ:radio-inline"` : boutons radio DSFR visibles en
 * ligne (fieldset + fr-radio-group), option « Tous » qui retire la
 * selection. Le mode `radio` (dropdown a radios) reste inchange.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import { clearDataCache, dispatchDataLoaded, getDataCache } from '@/utils/data-bridge.js';

/** Vue interne limitee aux membres prives inspectes ici */
interface FacetsInternals {
  _activeSelections: Record<string, Set<string>>;
  _parseDisplayModes(): Map<string, string>;
}

const ROWS = [
  { statut: 'actif', region: 'IDF' },
  { statut: 'actif', region: 'BRE' },
  { statut: 'clos', region: 'IDF' },
  { statut: 'suspendu', region: 'PACA' },
];

let seq = 0;
const mounted: DsfrDataFacets[] = [];

async function renderFacets(display: string, fields = 'statut') {
  const sourceId = `ri-src-${++seq}`;
  clearDataCache(sourceId);
  const facets = new DsfrDataFacets();
  facets.id = `ri-facets-${seq}`;
  facets.source = sourceId;
  facets.fields = fields;
  facets.display = display;
  document.body.appendChild(facets);
  mounted.push(facets);
  dispatchDataLoaded(sourceId, ROWS);
  await facets.updateComplete;
  return facets;
}

afterEach(() => {
  for (const f of mounted.splice(0)) f.remove();
});

describe('#684 — AC : display="statut:radio-inline" rend des radios visibles sans clic', () => {
  it('le mode est reconnu par _parseDisplayModes', async () => {
    const facets = await renderFacets('statut:radio-inline | region:radio');
    const modes = (facets as unknown as FacetsInternals)._parseDisplayModes();
    expect(modes.get('statut')).toBe('radio-inline');
    expect(modes.get('region')).toBe('radio');
  });

  it('rend un fieldset DSFR avec une radio par valeur, visibles sans ouvrir de panneau', async () => {
    const facets = await renderFacets('statut:radio-inline');

    const fieldset = facets.querySelector('fieldset.dsfr-data-facets__radio-inline');
    expect(fieldset).not.toBeNull();
    expect(fieldset!.classList.contains('fr-fieldset')).toBe(true);

    // Aucun dropdown : pas de bouton declencheur ni de panneau
    expect(facets.querySelector('.dsfr-data-facets__multiselect-trigger')).toBeNull();
    expect(facets.querySelector('[role="dialog"]')).toBeNull();

    const radios = Array.from(fieldset!.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    // « Tous » + 3 valeurs (actif, clos, suspendu)
    expect(radios.length).toBe(4);
    const labels = radios.map(
      (r) => fieldset!.querySelector(`label[for="${r.id}"]`)?.textContent?.trim() ?? ''
    );
    expect(labels[0]).toBe('Tous');
    // Le libelle porte aussi le compteur (« actif2, 2 resultats ») : on
    // verifie le prefixe, dans l'ordre count:desc par defaut
    expect(labels[1].startsWith('actif')).toBe(true);
    expect(
      labels
        .slice(2)
        .map((l) => l.replace(/\d.*$/, ''))
        .sort()
    ).toEqual(['clos', 'suspendu']);
  });

  it('toutes les radios partagent le meme name (groupe exclusif) et sont en ligne', async () => {
    const facets = await renderFacets('statut:radio-inline');
    const radios = Array.from(facets.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    const names = new Set(radios.map((r) => r.name));
    expect(names.size).toBe(1);
    expect([...names][0]).not.toBe('');

    const elements = facets.querySelectorAll(
      '.dsfr-data-facets__radio-inline .fr-fieldset__element'
    );
    expect(elements.length).toBe(4);
    for (const el of elements) {
      expect(el.classList.contains('fr-fieldset__element--inline')).toBe(true);
      expect(el.querySelector('.fr-radio-group')).not.toBeNull();
    }
  });

  it('accessibilite : la legende du fieldset est le libelle de la facette', async () => {
    const facets = await renderFacets('statut:radio-inline');
    facets.labels = 'statut:Statut du dossier';
    await facets.updateComplete;

    const fieldset = facets.querySelector('fieldset.dsfr-data-facets__radio-inline')!;
    const legend = fieldset.querySelector('legend.fr-fieldset__legend');
    expect(legend).not.toBeNull();
    expect(legend!.textContent?.trim()).toBe('Statut du dossier');
    expect(fieldset.getAttribute('aria-labelledby')).toBe(legend!.id);
    expect(legend!.id).not.toBe('');
  });
});

describe('#684 — selection exclusive et option « Tous »', () => {
  it('« Tous » est coche par defaut ; choisir une valeur filtre et decoche « Tous »', async () => {
    const facets = await renderFacets('statut:radio-inline');
    const internals = facets as unknown as FacetsInternals;
    const all = facets.querySelector<HTMLInputElement>('input[type="radio"][value=""]')!;
    expect(all.checked).toBe(true);

    const radios = Array.from(facets.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    const closRadio = radios.find((r) => {
      const label = facets.querySelector(`label[for="${r.id}"]`);
      return label?.textContent?.trim().startsWith('clos');
    })!;
    closRadio.click();
    await facets.updateComplete;

    expect([...(internals._activeSelections.statut ?? [])]).toEqual(['clos']);
    expect(getDataCache(facets.id)).toEqual([{ statut: 'clos', region: 'IDF' }]);
    expect(facets.querySelector<HTMLInputElement>('input[type="radio"][value=""]')!.checked).toBe(
      false
    );
  });

  it('choisir une autre valeur remplace la precedente (exclusif, sans disjunctive)', async () => {
    const facets = await renderFacets('statut:radio-inline');
    const internals = facets as unknown as FacetsInternals;

    const radioFor = (prefix: string) =>
      Array.from(facets.querySelectorAll<HTMLInputElement>('input[type="radio"]')).find((r) =>
        facets.querySelector(`label[for="${r.id}"]`)?.textContent?.trim().startsWith(prefix)
      )!;

    radioFor('actif').click();
    await facets.updateComplete;
    radioFor('suspendu').click();
    await facets.updateComplete;

    expect([...(internals._activeSelections.statut ?? [])]).toEqual(['suspendu']);
    expect(getDataCache(facets.id)).toHaveLength(1);
  });

  it('« Tous » retire la selection et restaure toutes les lignes', async () => {
    const facets = await renderFacets('statut:radio-inline');
    const internals = facets as unknown as FacetsInternals;

    const actif = Array.from(facets.querySelectorAll<HTMLInputElement>('input[type="radio"]')).find(
      (r) => facets.querySelector(`label[for="${r.id}"]`)?.textContent?.trim().startsWith('actif')
    )!;
    actif.click();
    await facets.updateComplete;
    expect(getDataCache(facets.id)).toHaveLength(2);

    const all = facets.querySelector<HTMLInputElement>('input[type="radio"][value=""]')!;
    all.click();
    await facets.updateComplete;

    expect(internals._activeSelections.statut).toBeUndefined();
    expect(getDataCache(facets.id)).toHaveLength(ROWS.length);
    expect(facets.querySelector<HTMLInputElement>('input[type="radio"][value=""]')!.checked).toBe(
      true
    );
  });
});

describe('#684 — le mode radio (dropdown) ne change pas', () => {
  it('display="statut:radio" rend toujours un declencheur fr-select sans radio visible', async () => {
    const facets = await renderFacets('statut:radio');
    expect(facets.querySelector('.dsfr-data-facets__multiselect-trigger')).not.toBeNull();
    expect(facets.querySelectorAll('input[type="radio"]').length).toBe(0);
    expect(facets.querySelector('.dsfr-data-facets__radio-inline')).toBeNull();
  });
});
