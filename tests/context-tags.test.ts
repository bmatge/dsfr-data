import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests #232 (EPIC #224) — dsfr-data-context-tags : récap des filtres actifs.
 *
 * Tags DSFR supprimables : un tag par filtre actif ; la croix retire le
 * filtre EN VIDANT son UI (même chemin qu'un clic utilisateur → sources,
 * URL et tags se mettent à jour ensemble).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import '@/components/dsfr-data-context.js';
import '@/components/dsfr-data-context-filter.js';
import '@/components/dsfr-data-context-tags.js';
import '@/components/dsfr-data-facets.js';
import '@/components/dsfr-data-search.js';
import {
  subscribeToSourceCommands,
  dispatchDataLoaded,
  clearDataCache,
} from '@/utils/data-bridge.js';
import type { DsfrDataContext } from '@/components/dsfr-data-context.js';
import type { DsfrDataContextTags } from '@/components/dsfr-data-context-tags.js';
import type { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import type { DsfrDataSearch } from '@/components/dsfr-data-search.js';

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

beforeEach(() => clearDataCache('t-src'));

afterEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState(null, '', window.location.pathname);
});

async function mountDashboard(): Promise<{
  tags: DsfrDataContextTags;
  cat: HTMLInputElement;
  statut: HTMLInputElement;
}> {
  fakeSource('t-src');
  for (const id of ['ui-t-cat', 'ui-t-statut']) {
    const i = document.createElement('input');
    i.id = id;
    document.body.appendChild(i);
  }
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <dsfr-data-context id="tctx" sources="t-src" url-sync>
      <dsfr-data-context-filter field="categorie" label="Catégorie" operator="eq" ui="ui-t-cat">
      </dsfr-data-context-filter>
      <dsfr-data-context-filter field="statut" operator="eq" ui="ui-t-statut">
      </dsfr-data-context-filter>
    </dsfr-data-context>
    <dsfr-data-context-tags for="tctx"></dsfr-data-context-tags>
  `;
  document.body.appendChild(wrapper);
  await settle();
  const tags = wrapper.querySelector('dsfr-data-context-tags') as DsfrDataContextTags;
  await tags.updateComplete;
  return {
    tags,
    cat: document.getElementById('ui-t-cat') as HTMLInputElement,
    statut: document.getElementById('ui-t-statut') as HTMLInputElement,
  };
}

describe('#232 — AC : 2 filtres actifs → 2 tags rendus', () => {
  it('rend un tag DSFR par filtre actif (libellé naturel + valeur)', async () => {
    const { tags, cat, statut } = await mountDashboard();

    expect(tags.querySelectorAll('.fr-tag')).toHaveLength(0);

    cat.value = 'jouets';
    cat.dispatchEvent(new Event('change', { bubbles: true }));
    statut.value = 'actif';
    statut.dispatchEvent(new Event('change', { bubbles: true }));
    await tags.updateComplete;

    const rendered = Array.from(tags.querySelectorAll('.fr-tag'));
    expect(rendered).toHaveLength(2);
    // label explicite pour l'un, field par défaut pour l'autre
    expect(rendered[0]?.textContent).toContain('Catégorie');
    expect(rendered[0]?.textContent).toContain('jouets');
    expect(rendered[1]?.textContent).toContain('statut');
  });
});

describe('#232 — AC : suppression d’un tag → vue, UI, URL et sources à jour', () => {
  it('la croix vide l’UI, retire le filtre des sources et de l’URL', async () => {
    const commands: Array<{ where?: string; whereKey?: string }> = [];
    const unsub = subscribeToSourceCommands('t-src', (cmd) =>
      commands.push(cmd as Record<string, unknown>)
    );

    const { tags, cat } = await mountDashboard();
    cat.value = 'jouets';
    cat.dispatchEvent(new Event('change', { bubbles: true }));
    await tags.updateComplete;
    expect(new URLSearchParams(window.location.search).get('categorie')).toBe('jouets');

    const dismiss = tags.querySelector('.fr-tag') as HTMLButtonElement;
    dismiss.click();
    await tags.updateComplete;

    // UI vidée (chemin utilisateur), filtre retiré, URL nettoyée, tag disparu
    expect(cat.value).toBe('');
    expect(commands.at(-1)?.where).toBe('');
    expect(new URLSearchParams(window.location.search).get('categorie')).toBeNull();
    expect(tags.querySelectorAll('.fr-tag')).toHaveLength(0);

    unsub();
  });
});

describe('#232 — config', () => {
  it('for introuvable → reportConfigError', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tags = document.createElement('dsfr-data-context-tags') as DsfrDataContextTags;
    tags.setAttribute('for', 'inexistant');
    document.body.appendChild(tags);
    await tags.updateComplete;
    await settle();

    expect(tags.hasAttribute('data-dsfr-config-error')).toBe(true);
    errorSpy.mockRestore();
  });
});

/**
 * #679 (ADR-104 §6) — les tags acceptent les filtres issus des facettes et
 * de la recherche, et gagnent `clear-all`. Montage repris de
 * context-facets-search.test.ts : facettes et recherche HORS du contexte,
 * enregistrées par `context="id"`, sur une source cible en colon.
 */

interface Captured {
  where?: string;
  whereKey?: string;
}

const ROWS = [
  { region: 'IDF', postes: 'Dette financiere' },
  { region: 'BRE', postes: 'Immobilisations' },
  { region: 'PAC', postes: 'Tresorerie' },
];

/** Laisse passer les microtasks de bind et un rAF d'annonce live */
async function wait(ms = 20) {
  await new Promise((r) => setTimeout(r, ms));
}

/** Case à cocher d'une valeur, retrouvée par son libellé (fieldset checkbox sans data-field) */
function checkboxFor(facets: DsfrDataFacets, value: string): HTMLInputElement {
  const labels = Array.from(facets.querySelectorAll<HTMLLabelElement>('.fr-checkbox-group label'));
  const label = labels.find((l) => l.textContent?.trim().startsWith(value));
  const input = label ? (facets.querySelector(`#${label.htmlFor}`) as HTMLInputElement) : null;
  if (!input) throw new Error(`case introuvable : ${value}`);
  return input;
}

function tagTexts(tags: DsfrDataContextTags): string[] {
  return Array.from(tags.querySelectorAll('.fr-tag')).map((t) =>
    (t.textContent ?? '').replace(/\s+/g, ' ').trim()
  );
}

function clearAllButton(tags: DsfrDataContextTags): HTMLButtonElement | null {
  return tags.querySelector('[data-action="clear-all"]');
}

async function mountFacetsPage(clearAll = true): Promise<{
  tags: DsfrDataContextTags;
  context: DsfrDataContext;
  facets: DsfrDataFacets;
  search: DsfrDataSearch;
  cat: HTMLInputElement;
  commands: Captured[];
  unsub: () => void;
}> {
  clearDataCache('cf-src');
  fakeSource('cf-src');
  const commands: Captured[] = [];
  const unsub = subscribeToSourceCommands('cf-src', (cmd) => commands.push(cmd as Captured));
  const i = document.createElement('input');
  i.id = 'ui-cf-cat';
  document.body.appendChild(i);
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <dsfr-data-facets id="cf-facets" context="cfctx" source="cf-src" fields="region"
      labels="region:Région" disjunctive="region" no-reset></dsfr-data-facets>
    <dsfr-data-search id="cf-search" context="cfctx" source="cf-src" fields="postes"></dsfr-data-search>
    <dsfr-data-context-tags for="cfctx" ${clearAll ? 'clear-all' : ''}></dsfr-data-context-tags>
    <dsfr-data-context id="cfctx" sources="cf-src" url-sync>
      <dsfr-data-context-filter field="categorie" label="Catégorie" operator="eq" ui="ui-cf-cat">
      </dsfr-data-context-filter>
    </dsfr-data-context>
  `;
  document.body.appendChild(wrapper);
  dispatchDataLoaded('cf-src', ROWS);
  await wait();
  const facets = document.getElementById('cf-facets') as DsfrDataFacets;
  const search = document.getElementById('cf-search') as DsfrDataSearch;
  const tags = wrapper.querySelector('dsfr-data-context-tags') as DsfrDataContextTags;
  await facets.updateComplete;
  await search.updateComplete;
  await tags.updateComplete;
  return {
    tags,
    context: document.getElementById('cfctx') as DsfrDataContext,
    facets,
    search,
    cat: document.getElementById('ui-cf-cat') as HTMLInputElement,
    commands,
    unsub,
  };
}

describe('#679 — facette multi-valeurs : un tag par valeur, retirable seule', () => {
  it('deux cases cochées → deux tags ; la croix d’un tag décoche SA case, l’autre reste', async () => {
    const { tags, facets, commands, unsub } = await mountFacetsPage();

    checkboxFor(facets, 'IDF').click();
    await facets.updateComplete;
    checkboxFor(facets, 'BRE').click();
    await facets.updateComplete;
    await tags.updateComplete;

    expect(tagTexts(tags)).toEqual(['Région : IDF', 'Région : BRE']);
    expect(commands.at(-1)?.where).toBe('region:in:IDF|BRE');

    const idfTag = tags.querySelector('.fr-tag') as HTMLButtonElement;
    idfTag.click();
    await facets.updateComplete;
    await tags.updateComplete;

    expect(tagTexts(tags)).toEqual(['Région : BRE']);
    expect(checkboxFor(facets, 'IDF').checked).toBe(false);
    expect(checkboxFor(facets, 'BRE').checked).toBe(true);
    // Le filtre reste actif sur la valeur restante (même whereKey, eq)
    expect(commands.at(-1)?.where).toBe('region:eq:BRE');
    expect(new URLSearchParams(window.location.search).get('region')).toBe('BRE');
    unsub();
  });

  it('une seule valeur → un seul tag, la croix vide le champ', async () => {
    const { tags, facets, commands, unsub } = await mountFacetsPage();
    checkboxFor(facets, 'PAC').click();
    await facets.updateComplete;
    await tags.updateComplete;
    expect(tagTexts(tags)).toEqual(['Région : PAC']);

    (tags.querySelector('.fr-tag') as HTMLButtonElement).click();
    await facets.updateComplete;
    await tags.updateComplete;
    expect(tagTexts(tags)).toEqual([]);
    expect(commands.at(-1)?.where).toBe('');
    unsub();
  });
});

describe('#679 — recherche : tag « Recherche : terme »', () => {
  it('la frappe donne un tag, la croix vide le champ de recherche', async () => {
    const { tags, search, commands, unsub } = await mountFacetsPage();
    search.search('dette');
    await search.updateComplete;
    await tags.updateComplete;

    expect(tagTexts(tags)).toEqual(['Recherche : dette']);
    expect(commands.at(-1)?.where).toBe('postes:contains:dette');

    (tags.querySelector('.fr-tag') as HTMLButtonElement).click();
    await search.updateComplete;
    await tags.updateComplete;
    expect((search.querySelector('input') as HTMLInputElement).value).toBe('');
    expect(tagTexts(tags)).toEqual([]);
    expect(commands.at(-1)?.where).toBe('');
    unsub();
  });
});

describe('#679 — AC : clear-all, un bouton unique « Tout effacer »', () => {
  it('absent sans filtre actif ; présent dès qu’un filtre est actif ; absent sans l’attribut', async () => {
    const { tags, cat, unsub } = await mountFacetsPage();
    expect(clearAllButton(tags)).toBeNull();

    cat.value = 'jouets';
    cat.dispatchEvent(new Event('change', { bubbles: true }));
    await tags.updateComplete;
    const btn = clearAllButton(tags);
    expect(btn).not.toBeNull();
    expect(btn?.textContent?.trim()).toBe('Tout effacer');
    expect(btn?.classList.contains('fr-btn--tertiary')).toBe(true);
    unsub();

    document.body.innerHTML = '';
    const page = await mountFacetsPage(false);
    page.cat.value = 'jouets';
    page.cat.dispatchEvent(new Event('change', { bubbles: true }));
    await page.tags.updateComplete;
    expect(page.tags.querySelectorAll('.fr-tag')).toHaveLength(1);
    expect(clearAllButton(page.tags)).toBeNull();
    page.unsub();
  });

  it('vide filtre classique, facettes et recherche en UNE diffusion : une URL, un événement, un where vide par whereKey', async () => {
    const { tags, context, facets, search, cat, commands, unsub } = await mountFacetsPage();

    cat.value = 'jouets';
    cat.dispatchEvent(new Event('change', { bubbles: true }));
    checkboxFor(facets, 'IDF').click();
    await facets.updateComplete;
    checkboxFor(facets, 'BRE').click();
    await facets.updateComplete;
    search.search('dette');
    await search.updateComplete;
    await tags.updateComplete;
    expect(tagTexts(tags)).toHaveLength(4);
    expect(new URLSearchParams(window.location.search).get('region')).toBe('IDF,BRE');

    let changes = 0;
    context.addEventListener('dsfr-data-context-change', () => changes++);
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    const before = commands.length;

    clearAllButton(tags)!.click();
    await facets.updateComplete;
    await search.updateComplete;
    await tags.updateComplete;

    // Un seul lot : une écriture d'URL, une notification — pas une par filtre
    expect(changes).toBe(1);
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    replaceSpy.mockRestore();

    // Chaque filtre a libéré son whereKey (where vide), aucun re-fetch inutile
    const emitted = commands.slice(before);
    expect(emitted.every((c) => c.where === '')).toBe(true);
    expect(new Set(emitted.map((c) => c.whereKey)).size).toBe(3);

    // UI vidées par le chemin utilisateur, URL nettoyée, tags et bouton disparus
    expect(cat.value).toBe('');
    expect(checkboxFor(facets, 'IDF').checked).toBe(false);
    expect((search.querySelector('input') as HTMLInputElement).value).toBe('');
    expect(window.location.search).toBe('');
    expect(tagTexts(tags)).toEqual([]);
    expect(clearAllButton(tags)).toBeNull();
    expect(context.activeFilters()).toHaveLength(0);

    // Annonce live du résultat (région persistante, même sans tag)
    await wait(50);
    await tags.updateComplete;
    expect(tags.querySelector('[aria-live="polite"]')?.textContent).toContain('4 filtres');
    unsub();
  });

  it('DsfrDataContext.clearAll() retourne le nombre de filtres retirés, 0 sans filtre', async () => {
    const { context, cat, unsub } = await mountFacetsPage();
    expect(context.clearAll()).toBe(0);
    cat.value = 'x';
    cat.dispatchEvent(new Event('change', { bubbles: true }));
    expect(context.clearAll()).toBe(1);
    expect(cat.value).toBe('');
    unsub();
  });
});

describe('#679 — no-reset : le bouton local « Réinitialiser les filtres » de facets est masqué', () => {
  it('avec no-reset, aucun bouton local après sélection ; sans, il est rendu', async () => {
    const { facets, unsub } = await mountFacetsPage();
    checkboxFor(facets, 'IDF').click();
    await facets.updateComplete;
    expect(facets.querySelector('.dsfr-data-facets__header')).toBeNull();

    facets.noReset = false;
    await facets.updateComplete;
    expect(facets.querySelector('.dsfr-data-facets__header')?.textContent).toContain(
      'Réinitialiser les filtres'
    );
    unsub();
  });
});
