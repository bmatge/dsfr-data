import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #742 — dsfr-data-context-value : la valeur courante d'un filtre, dans une
 * phrase. `dsfr-data-context-tags` LISTE les filtres actifs mais ne s'insere
 * pas dans un titre : « Résultats pour {{departement}} » n'etait pas
 * exprimable. Le composant lit le registre de contexte, interpole le gabarit
 * et rend un repli declare tant qu'aucun filtre n'est pose.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import '@/components/dsfr-data-context.js';
import '@/components/dsfr-data-context-filter.js';
import '@/components/dsfr-data-context-value.js';
import '@/components/dsfr-data-facets.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';
import type { DsfrDataContextValue } from '@/components/dsfr-data-context-value.js';
import type { DsfrDataFacets } from '@/components/dsfr-data-facets.js';

/**
 * Vue interne de la facette, limitee au seul membre prive que ce test
 * declenche : selectionner une valeur par le MEME chemin qu'un clic.
 */
interface FacetsInternals {
  _toggleValue(field: string, value: string): void;
}

function fakeSource(id: string) {
  const el = document.createElement('div');
  el.id = id;
  (el as unknown as Record<string, unknown>).getAdapter = () => ({
    capabilities: { whereFormat: 'colon' },
  });
  document.body.appendChild(el);
  return el;
}

async function settle() {
  await new Promise((r) => queueMicrotask(() => queueMicrotask(() => r(null))));
}

beforeEach(() => clearDataCache('cv-src'));

afterEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState(null, '', window.location.pathname);
  vi.restoreAllMocks();
});

/** Un contexte, deux filtres classiques et un libelle interpole */
async function mountPage(valueMarkup: string): Promise<{
  value: DsfrDataContextValue;
  departement: HTMLInputElement;
  annee: HTMLInputElement;
}> {
  fakeSource('cv-src');
  for (const id of ['ui-cv-dep', 'ui-cv-annee']) {
    const i = document.createElement('input');
    i.id = id;
    document.body.appendChild(i);
  }
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <dsfr-data-context id="cvctx" sources="cv-src">
      <dsfr-data-context-filter field="departement" label="Département" operator="eq"
        ui="ui-cv-dep"></dsfr-data-context-filter>
      <dsfr-data-context-filter field="annee" operator="eq" ui="ui-cv-annee">
      </dsfr-data-context-filter>
    </dsfr-data-context>
    <h2>${valueMarkup}</h2>
  `;
  document.body.appendChild(wrapper);
  await settle();
  const value = wrapper.querySelector('dsfr-data-context-value') as DsfrDataContextValue;
  await value.updateComplete;
  return {
    value,
    departement: document.getElementById('ui-cv-dep') as HTMLInputElement,
    annee: document.getElementById('ui-cv-annee') as HTMLInputElement,
  };
}

function setFilter(input: HTMLInputElement, v: string) {
  input.value = v;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('#742 — le libelle suit la valeur du filtre', () => {
  it('interpole {{champ}} dans le gabarit', async () => {
    const { value, departement } = await mountPage(
      `<dsfr-data-context-value for="cvctx" template="Résultats pour {{departement}}"
         fallback="Résultats pour toute la France"></dsfr-data-context-value>`
    );
    expect(value.textContent?.trim()).toBe('Résultats pour toute la France');

    setFilter(departement, 'Ain');
    await value.updateComplete;
    expect(value.textContent?.trim()).toBe('Résultats pour Ain');

    setFilter(departement, 'Aisne');
    await value.updateComplete;
    expect(value.textContent?.trim()).toBe('Résultats pour Aisne');
  });

  it('field est le raccourci de template="{{champ}}"', async () => {
    const { value, departement } = await mountPage(
      `<dsfr-data-context-value for="cvctx" field="departement"
         fallback="Tous"></dsfr-data-context-value>`
    );
    expect(value.textContent?.trim()).toBe('Tous');
    setFilter(departement, 'Ain');
    await value.updateComplete;
    expect(value.textContent?.trim()).toBe('Ain');
  });

  it('interpole plusieurs champs dans la meme phrase', async () => {
    const { value, departement, annee } = await mountPage(
      `<dsfr-data-context-value for="cvctx"
         template="{{departement}} en {{annee}}" fallback="Vue nationale"></dsfr-data-context-value>`
    );
    setFilter(departement, 'Ain');
    await value.updateComplete;
    // Un champ cite sans valeur bascule sur le repli : « Ain en  » serait pire
    expect(value.textContent?.trim()).toBe('Vue nationale');

    setFilter(annee, '2024');
    await value.updateComplete;
    expect(value.textContent?.trim()).toBe('Ain en 2024');
  });

  it('rend le texte, jamais du HTML', async () => {
    const { value, departement } = await mountPage(
      `<dsfr-data-context-value for="cvctx" field="departement"></dsfr-data-context-value>`
    );
    setFilter(departement, '<img src=x onerror="alert(1)">');
    await value.updateComplete;
    expect(value.querySelector('img')).toBeNull();
    expect(value.textContent).toContain('<img');
  });
});

describe('#742 — repli', () => {
  it('rend le repli tant qu aucun filtre n est pose, puis y revient', async () => {
    const { value, departement } = await mountPage(
      `<dsfr-data-context-value for="cvctx" field="departement"
         fallback="Toute la France"></dsfr-data-context-value>`
    );
    expect(value.textContent?.trim()).toBe('Toute la France');
    setFilter(departement, 'Ain');
    await value.updateComplete;
    setFilter(departement, '');
    await value.updateComplete;
    expect(value.textContent?.trim()).toBe('Toute la France');
  });

  it('sans repli declare, ne rend rien', async () => {
    const { value } = await mountPage(
      `<dsfr-data-context-value for="cvctx" field="departement"></dsfr-data-context-value>`
    );
    expect(value.textContent?.trim()).toBe('');
  });
});

describe('#742 — accessibilite', () => {
  it('live fait du composant une region live polie', async () => {
    const { value } = await mountPage(
      `<dsfr-data-context-value for="cvctx" field="departement" live></dsfr-data-context-value>`
    );
    expect(value.getAttribute('aria-live')).toBe('polite');
    expect(value.getAttribute('role')).toBe('status');
  });

  it('sans live, aucune region live n est posee', async () => {
    const { value } = await mountPage(
      `<dsfr-data-context-value for="cvctx" field="departement"></dsfr-data-context-value>`
    );
    expect(value.hasAttribute('aria-live')).toBe(false);
    expect(value.hasAttribute('role')).toBe(false);
  });
});

describe('#742 — configuration', () => {
  it('signale un contexte introuvable', async () => {
    const error = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(error);
    const el = document.createElement('dsfr-data-context-value') as DsfrDataContextValue;
    el.for = 'absent';
    el.field = 'departement';
    document.body.appendChild(el);
    await settle();
    await el.updateComplete;
    expect(el.getAttribute('data-dsfr-config-error')).toContain('absent');
  });

  it('signale l absence de for', async () => {
    const error = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(error);
    const el = document.createElement('dsfr-data-context-value') as DsfrDataContextValue;
    el.field = 'departement';
    document.body.appendChild(el);
    await settle();
    await el.updateComplete;
    expect(el.getAttribute('data-dsfr-config-error')).toContain('"for"');
  });

  it('se lie a un contexte declare APRES lui dans la page', async () => {
    const el = document.createElement('dsfr-data-context-value') as DsfrDataContextValue;
    el.for = 'late-ctx';
    el.field = 'departement';
    el.fallback = 'Toute la France';
    document.body.appendChild(el);
    await settle();
    expect(el.getAttribute('data-dsfr-config-error')).toBeTruthy();

    fakeSource('cv-src');
    const input = document.createElement('input');
    input.id = 'ui-late-dep';
    document.body.appendChild(input);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <dsfr-data-context id="late-ctx" sources="cv-src">
        <dsfr-data-context-filter field="departement" operator="eq" ui="ui-late-dep">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `;
    document.body.appendChild(wrapper);
    await settle();
    await el.updateComplete;
    expect(el.hasAttribute('data-dsfr-config-error')).toBe(false);

    setFilter(input, 'Ain');
    await el.updateComplete;
    expect(el.textContent?.trim()).toBe('Ain');
  });
});

describe('#742 — au-dela des filtres classiques (contrat ContextFilterLike)', () => {
  it('rend la valeur d une facette enregistree sur le contexte', async () => {
    fakeSource('cv-src');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <dsfr-data-context id="fctx" sources="cv-src"></dsfr-data-context>
      <dsfr-data-facets id="cv-facets" context="fctx" source="cv-src"
        fields="region"></dsfr-data-facets>
      <dsfr-data-context-value for="fctx" template="Région : {{region}}"
        fallback="Toutes régions"></dsfr-data-context-value>
    `;
    document.body.appendChild(wrapper);
    await settle();
    const facets = wrapper.querySelector('dsfr-data-facets') as DsfrDataFacets;
    const value = wrapper.querySelector('dsfr-data-context-value') as DsfrDataContextValue;
    dispatchDataLoaded('cv-src', [{ region: 'IDF' }, { region: 'BRE' }]);
    await facets.updateComplete;
    await value.updateComplete;
    expect(value.textContent?.trim()).toBe('Toutes régions');

    (facets as unknown as FacetsInternals)._toggleValue('region', 'IDF');
    await facets.updateComplete;
    await value.updateComplete;
    expect(value.textContent?.trim()).toBe('Région : IDF');
  });
});
