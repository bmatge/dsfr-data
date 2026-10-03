import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * #1243 — une valeur à virgule ne survivait pas au rechargement de l'URL
 * (famille de BUG-031 du banc d'essai).
 *
 * #1236 a posé la grammaire d'échappement pour `dsfr-data-facets` (virgule en
 * `%2C`, pourcent en `%25`). Le même couple `join(',')` / `split(',')` restait
 * sur le contexte : `dsfr-data-context` découpait TOUT paramètre sur les
 * virgules, quel que soit le filtre qui le lisait.
 *
 * - `dsfr-data-context-filter` : un `in` sur une liste à choix multiple
 *   coupait « 1,5 à 2 parcours » en deux — dès la clause, avant même l'URL ;
 *   un `eq` sur une liste simple perdait le blanc qui suit la virgule, la
 *   valeur ne retrouvait plus son option, le filtre disparaissait.
 * - la sélection au clic (`refine-on-click`) ne gardait que le premier
 *   morceau : « 1 ».
 * - `dsfr-data-search` en mode `context` recollait les morceaux nettoyés :
 *   « Paris, France » revenait en « Paris,France ».
 *
 * Chaque cas se joue en deux temps, comme un rechargement : on agit, on lit
 * l'URL écrite, on démonte tout, on remonte la page sur cette URL.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import '@/components/dsfr-data-context.js';
import '@/components/dsfr-data-context-filter.js';
import '@/components/dsfr-data-search.js';
import { DsfrDataList } from '@/components/dsfr-data-list.js';
import type { DsfrDataSearch } from '@/components/dsfr-data-search.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  subscribeToSourceCommands,
} from '@/utils/data-bridge.js';
import {
  escapeUrlValue,
  joinUrlValues,
  readUrlScalar,
  splitUrlPositions,
  splitUrlValues,
  unescapeUrlValue,
} from '@/utils/url-values.js';
import {
  escapeUrlFacetValue,
  joinUrlFacetValues,
  splitUrlFacetValues,
  unescapeUrlFacetValue,
} from '@/components/facets/facets-url.js';

interface Captured {
  where?: string;
}

const CIBLE = 'cible-1243';
const unsubs: Array<() => void> = [];

afterEach(() => {
  demonter();
  window.history.replaceState(null, '', window.location.pathname);
  vi.restoreAllMocks();
});

function demonter(): void {
  for (const u of unsubs.splice(0)) u();
  document.body.innerHTML = '';
  for (const id of [CIBLE, 'src-1243']) {
    clearDataCache(id);
    clearDataMeta(id);
  }
}

/** Fausse source cible, au dialecte colon : rend la dernière clause reçue. */
function cible(): () => string | undefined {
  const el = document.createElement('div');
  el.id = CIBLE;
  Object.assign(el, { getAdapter: () => ({ capabilities: { whereFormat: 'colon' } }) });
  document.body.appendChild(el);
  const commands: Captured[] = [];
  unsubs.push(subscribeToSourceCommands(CIBLE, (cmd) => commands.push(cmd as Captured)));
  return () => commands.at(-1)?.where;
}

async function settle(ms = 20): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function monter(html: string): Promise<void> {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  await settle();
}

/** Ce qu'un rechargement garde : la chaîne de requête, et rien d'autre. */
function recharger(): string {
  const search = window.location.search;
  demonter();
  window.history.replaceState(null, '', search || window.location.pathname);
  return search;
}

function param(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

function change(el: HTMLElement): void {
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

const OPTIONS = ['1,5 à 2 parcours', '2 à 3 parcours', 'Moins de 1 parcours', 'Paris, France'];

function selectHtml(id: string, multiple: boolean): string {
  return `<select id="${id}" ${multiple ? 'multiple' : ''}>
    <option value="">Toutes</option>
    ${OPTIONS.map((v) => `<option value="${v}">${v}</option>`).join('')}
  </select>`;
}

function contexte(filtre: string): string {
  return `<dsfr-data-context id="ctx-1243" sources="${CIBLE}" url-sync>${filtre}</dsfr-data-context>`;
}

// ---------------------------------------------------------------------------
// La grammaire est UNE : celle des facettes, déplacée
// ---------------------------------------------------------------------------

describe('#1243 — une seule grammaire, celle des facettes', () => {
  it('les noms historiques de facets-url désignent les mêmes fonctions', () => {
    expect(escapeUrlFacetValue).toBe(escapeUrlValue);
    expect(unescapeUrlFacetValue).toBe(unescapeUrlValue);
    expect(joinUrlFacetValues).toBe(joinUrlValues);
    expect(splitUrlFacetValues).toBe(splitUrlValues);
  });

  it('valeur unique : le paramètre entier, jamais découpé', () => {
    for (const v of ['1,5 à 2 parcours', 'Paris, France', '50 %', ' bord ', '%2C', 'a,b,c%']) {
      expect(readUrlScalar(escapeUrlValue(v))).toBe(v);
    }
    // Lien ancien, virgule nue : relu tel qu'il a été écrit
    expect(readUrlScalar('Paris, France')).toBe('Paris, France');
    expect(readUrlScalar('1,5 à 2 parcours')).toBe('1,5 à 2 parcours');
    // Lien ancien sans virgule : identique, blancs de bord retirés comme avant
    expect(readUrlScalar('Bretagne')).toBe('Bretagne');
    expect(readUrlScalar(' Bretagne ')).toBe('Bretagne');
    expect(readUrlScalar('50 %')).toBe('50 %');
  });

  it('positions fixes : les vides sont gardés', () => {
    expect(splitUrlPositions('10,20')).toEqual(['10', '20']);
    expect(splitUrlPositions(',2024')).toEqual(['', '2024']);
    expect(splitUrlPositions('2020,')).toEqual(['2020', '']);
    expect(splitUrlPositions('1%2C5,2%2C5')).toEqual(['1,5', '2,5']);
  });
});

// ---------------------------------------------------------------------------
// dsfr-data-context-filter
// ---------------------------------------------------------------------------

describe('#1243 — dsfr-data-context-filter', () => {
  const IN = `<dsfr-data-context-filter field="intensite" operator="in" ui="ui-int"></dsfr-data-context-filter>`;
  const EQ = `<dsfr-data-context-filter field="intensite" operator="eq" ui="ui-int"></dsfr-data-context-filter>`;

  function selected(): string[] {
    const select = document.getElementById('ui-int') as HTMLSelectElement;
    return Array.from(select.options)
      .filter((o) => o.selected)
      .map((o) => o.value);
  }

  it('in sur une liste à choix multiple : une option à virgule est UNE valeur, avant et après rechargement', async () => {
    let where = cible();
    await monter(selectHtml('ui-int', true) + contexte(IN));
    const select = document.getElementById('ui-int') as HTMLSelectElement;
    for (const o of Array.from(select.options)) {
      o.selected = o.value === '1,5 à 2 parcours' || o.value === '2 à 3 parcours';
    }
    change(select);
    await settle();

    const attendu = 'intensite:in:1%2C5 à 2 parcours|2 à 3 parcours';
    expect(where()).toBe(attendu);
    expect(param('intensite')).toBe('1%2C5 à 2 parcours,2 à 3 parcours');

    recharger();
    where = cible();
    await monter(selectHtml('ui-int', true) + contexte(IN));
    expect(selected()).toEqual(['1,5 à 2 parcours', '2 à 3 parcours']);
    expect(where()).toBe(attendu);
  });

  it('in : un lien ancien à virgule NUE est recollé contre les options de la liste', async () => {
    window.history.replaceState(null, '', '?intensite=2 à 3 parcours,1,5 à 2 parcours');
    const where = cible();
    await monter(selectHtml('ui-int', true) + contexte(IN));
    expect(selected()).toEqual(['1,5 à 2 parcours', '2 à 3 parcours']);
    expect(where()).toBe('intensite:in:1%2C5 à 2 parcours|2 à 3 parcours');
  });

  it('in sur un champ texte : la virgule sépare toujours, %2C la porte dans une valeur', async () => {
    window.history.replaceState(null, '', '?intensite=A, B');
    let where = cible();
    await monter(`<input id="ui-int">` + contexte(IN));
    // Lien ancien : même contrôle, même clause qu'avant
    expect((document.getElementById('ui-int') as HTMLInputElement).value).toBe('A,B');
    expect(where()).toBe('intensite:in:A|B');
    expect(param('intensite')).toBe('A,B');

    demonter();
    window.history.replaceState(null, '', '?intensite=1%252C5 à 2 parcours,B');
    where = cible();
    await monter(`<input id="ui-int">` + contexte(IN));
    expect(where()).toBe('intensite:in:1%2C5 à 2 parcours|B');
    expect(param('intensite')).toBe('1%2C5 à 2 parcours,B');
  });

  it('eq sur une liste simple : « Paris, France » retrouve son option au rechargement', async () => {
    let where = cible();
    await monter(selectHtml('ui-int', false) + contexte(EQ));
    const select = document.getElementById('ui-int') as HTMLSelectElement;
    select.value = 'Paris, France';
    change(select);
    await settle();
    expect(where()).toBe('intensite:eq:Paris%2C France');
    expect(param('intensite')).toBe('Paris%2C France');

    recharger();
    where = cible();
    await monter(selectHtml('ui-int', false) + contexte(EQ));
    expect((document.getElementById('ui-int') as HTMLSelectElement).value).toBe('Paris, France');
    expect(where()).toBe('intensite:eq:Paris%2C France');
  });

  it('eq : le lien ancien à virgule nue se relit tel qu’il a été écrit', async () => {
    window.history.replaceState(null, '', '?intensite=Paris, France');
    const where = cible();
    await monter(selectHtml('ui-int', false) + contexte(EQ));
    expect((document.getElementById('ui-int') as HTMLSelectElement).value).toBe('Paris, France');
    expect(where()).toBe('intensite:eq:Paris%2C France');
  });

  it('eq : le tag ne lit plus la virgule d’une valeur comme un séparateur', async () => {
    cible();
    await monter(selectHtml('ui-int', false) + contexte(EQ));
    const select = document.getElementById('ui-int') as HTMLSelectElement;
    select.value = '1,5 à 2 parcours';
    change(select);
    await settle();
    const filtre = document.querySelector('dsfr-data-context-filter') as unknown as {
      displayValue(): string;
    };
    expect(filtre.displayValue()).toBe('1,5 à 2 parcours');
  });

  it('between : deux bornes à virgule décimale, et une borne vide', async () => {
    const BETWEEN = `<dsfr-data-context-filter field="note" operator="between" ui="ui-min ui-max"></dsfr-data-context-filter>`;
    const champs = `<input id="ui-min"><input id="ui-max">`;
    let where = cible();
    await monter(champs + contexte(BETWEEN));
    const min = document.getElementById('ui-min') as HTMLInputElement;
    const max = document.getElementById('ui-max') as HTMLInputElement;
    min.value = '1,5';
    max.value = '2,5';
    change(max);
    await settle();
    expect(where()).toBe('note:gte:1%2C5, note:lt:2%2C5');
    expect(param('note')).toBe('1%2C5,2%2C5');

    recharger();
    where = cible();
    await monter(champs + contexte(BETWEEN));
    expect((document.getElementById('ui-min') as HTMLInputElement).value).toBe('1,5');
    expect((document.getElementById('ui-max') as HTMLInputElement).value).toBe('2,5');
    expect(where()).toBe('note:gte:1%2C5, note:lt:2%2C5');

    demonter();
    window.history.replaceState(null, '', '?note=,20');
    where = cible();
    await monter(champs + contexte(BETWEEN));
    expect((document.getElementById('ui-min') as HTMLInputElement).value).toBe('');
    expect(where()).toBe('note:lt:20');
  });
});

// ---------------------------------------------------------------------------
// dsfr-data-search en mode context
// ---------------------------------------------------------------------------

describe('#1243 — dsfr-data-search en mode context', () => {
  const PAGE =
    contexte('') +
    `<dsfr-data-search id="s-1243" context="ctx-1243" source="${CIBLE}" fields="lieu"
       debounce="0" server-search></dsfr-data-search>`;

  it('« Paris, France » revient avec son blanc', async () => {
    let where = cible();
    await monter(PAGE);
    const search = document.getElementById('s-1243') as DsfrDataSearch;
    await search.updateComplete;
    search.search('Paris, France');
    await settle();
    expect(where()).toBe('lieu:contains:Paris%2C France');
    expect(param('lieu')).toBe('Paris%2C France');

    recharger();
    where = cible();
    await monter(PAGE);
    const reloaded = document.getElementById('s-1243') as DsfrDataSearch;
    await reloaded.updateComplete;
    expect((reloaded.querySelector('input') as HTMLInputElement).value).toBe('Paris, France');
    expect(where()).toBe('lieu:contains:Paris%2C France');
  });

  it('lien ancien : sans virgule identique, à virgule nue relu tel qu’écrit', async () => {
    window.history.replaceState(null, '', '?lieu=immo');
    let where = cible();
    await monter(PAGE);
    expect(where()).toBe('lieu:contains:immo');

    demonter();
    window.history.replaceState(null, '', '?lieu=Paris, France');
    where = cible();
    await monter(PAGE);
    expect(where()).toBe('lieu:contains:Paris%2C France');
  });
});

// ---------------------------------------------------------------------------
// La sélection au clic (SelectionFilterMixin : liste, fiche, carte)
// ---------------------------------------------------------------------------

describe('#1243 — refine-on-click', () => {
  const ROWS = [
    { id: 'a', intensite: '1,5 à 2 parcours' },
    { id: 'b', intensite: '2 à 3 parcours' },
  ];

  async function liste(): Promise<DsfrDataList> {
    const list = new DsfrDataList();
    list.setAttribute('source', 'src-1243');
    list.setAttribute('columns', 'intensite:Intensité');
    list.setAttribute('refine-on-click', 'intensite');
    list.setAttribute('context', 'ctx-1243');
    document.body.appendChild(list);
    dispatchDataLoaded('src-1243', ROWS);
    await list.updateComplete;
    await settle();
    await list.updateComplete;
    return list;
  }

  it('la valeur cliquée revient ENTIÈRE, pas son premier morceau', async () => {
    let where = cible();
    await monter(contexte(''));
    const list = await liste();
    const bouton = list.querySelector('button[aria-pressed]') as HTMLButtonElement;
    bouton.click();
    await settle();
    expect(where()).toBe('intensite:eq:1%2C5 à 2 parcours');
    expect(param('intensite')).toBe('1%2C5 à 2 parcours');

    recharger();
    where = cible();
    await monter(contexte(''));
    await liste();
    expect(where()).toBe('intensite:eq:1%2C5 à 2 parcours');
  });

  it('lien ancien : sans virgule identique, à virgule nue relu en entier', async () => {
    window.history.replaceState(null, '', '?intensite=2 à 3 parcours');
    let where = cible();
    await monter(contexte(''));
    await liste();
    expect(where()).toBe('intensite:eq:2 à 3 parcours');

    demonter();
    window.history.replaceState(null, '', '?intensite=1,5 à 2 parcours');
    where = cible();
    await monter(contexte(''));
    await liste();
    expect(where()).toBe('intensite:eq:1%2C5 à 2 parcours');
  });
});
