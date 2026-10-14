import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * ADR-159, lot 3 (#1285) — la recherche est portée par le contexte, pas par
 * un filtre `contains`.
 *
 * `dsfr-data-search context="…"` confie au contexte une RECHERCHE (terme,
 * champ, opérateur). Le contexte la diffuse, et chaque source cible la
 * traduit : par ce que son API sait faire pour chercher quand son fournisseur
 * le déclare (`query.contextSearchTemplate`), sinon dans le navigateur, avec
 * la comparaison tolérante de `dsfr-data-search`.
 */

import '@/components/dsfr-data-context.js';
import '@/components/dsfr-data-context-tags.js';
import '@/components/dsfr-data-context-value.js';
import '@/components/dsfr-data-search.js';
import type { DsfrDataContext } from '@/components/dsfr-data-context.js';
import type { DsfrDataSearch } from '@/components/dsfr-data-search.js';
import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import type { AdapterParams, ApiAdapter, FetchResult } from '@/adapters/api-adapter.js';
import { OpenDataSoftAdapter } from '@/adapters/opendatasoft-adapter.js';
import { TabularAdapter } from '@/adapters/tabular-adapter.js';
import { GristAdapter } from '@/adapters/grist-adapter.js';
import { InseeAdapter } from '@/adapters/insee-adapter.js';
import { GenericAdapter } from '@/adapters/generic-adapter.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  getDataCache,
  setDataMeta,
  subscribeToSourceCommands,
} from '@/utils/data-bridge.js';
import { buildSearchClause, contextSearchTemplateOf } from '@/utils/search-clause.js';
import { applySearches, matchesSearch, normalizeSearchText } from '@dsfr-data/shared/lib';
import { describeClientFilter, fetchAllWithClientWhere } from '@/utils/client-where.js';
import type { ContextSearch } from '@dsfr-data/shared';

interface Captured {
  where?: string;
  clientSearch?: ContextSearch | null;
  whereKey?: string;
}

const ods = new OpenDataSoftAdapter();
const tabular = new TabularAdapter();
const grist = new GristAdapter();
const insee = new InseeAdapter();
const generic = new GenericAdapter();

const unsubs: Array<() => void> = [];
const IDS = ['cs-a', 'cs-b', 'cs-search'];

afterEach(() => {
  for (const u of unsubs.splice(0)) u();
  document.body.innerHTML = '';
  for (const id of IDS) {
    clearDataCache(id);
    clearDataMeta(id);
  }
  window.history.replaceState(null, '', window.location.pathname);
  vi.restoreAllMocks();
});

async function settle(ms = 20): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/** Fausse source cible : son adaptateur, et les commandes qu'elle reçoit. */
function cible(id: string, adapter: unknown, rows?: Record<string, unknown>[]): Captured[] {
  const el = document.createElement('div');
  el.id = id;
  Object.assign(el, { getAdapter: () => adapter });
  document.body.appendChild(el);
  const commands: Captured[] = [];
  unsubs.push(subscribeToSourceCommands(id, (cmd) => commands.push(cmd as Captured)));
  if (rows) dispatchDataLoaded(id, rows);
  return commands;
}

async function monter(html: string): Promise<DsfrDataSearch> {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  await settle();
  const search = document.getElementById('cs-search') as DsfrDataSearch;
  await search.updateComplete;
  return search;
}

const PAGE = (sources: string, extra = '') => `
  <dsfr-data-context id="cs-ctx" sources="${sources}" url-sync></dsfr-data-context>
  <dsfr-data-search id="cs-search" context="cs-ctx" source="cs-a" fields="nom" debounce="0"
    ${extra}></dsfr-data-search>`;

// ---------------------------------------------------------------------------
// Ce que chaque fournisseur déclare
// ---------------------------------------------------------------------------

describe('ADR-159 lot 3 — ce que chaque fournisseur sait faire d’une recherche', () => {
  it('Opendatasoft : son moteur, borné aux champs nommés ; Tabular et Grist : une sous-chaîne', () => {
    expect(contextSearchTemplateOf(ods)).toEqual({
      template: 'search({fields}, "{q}")',
      fieldsJoin: ', ',
      textOnly: true,
    });
    expect(contextSearchTemplateOf(tabular)?.template).toBe('{fields}:contains:{q}');
    expect(contextSearchTemplateOf(grist)?.template).toBe('{fields}:contains:{q}');
  });

  it('INSEE, generic, adaptateur sans configuration, pas d’adaptateur : rien — le navigateur', () => {
    expect(contextSearchTemplateOf(insee)).toBeNull();
    expect(contextSearchTemplateOf(generic)).toBeNull();
    expect(contextSearchTemplateOf({ capabilities: { whereFormat: 'colon' } })).toBeNull();
    expect(contextSearchTemplateOf(null)).toBeNull();
  });

  it('le gabarit de server-search ne change pas', () => {
    expect(ods.getDefaultSearchTemplate()).toBe('search("{q}")');
    expect(tabular.getDefaultSearchTemplate()).toBe('{fields}:contains:{q}');
    expect(grist.getDefaultSearchTemplate()).toBeNull();
    expect(insee.getDefaultSearchTemplate()).toBeNull();
  });
});

describe('ADR-159 lot 3 — buildSearchClause : un seul chemin pour dire une recherche', () => {
  it('le terme est échappé dans le dialecte de l’adaptateur', () => {
    expect(
      buildSearchClause(ods, 'search({fields}, "{q}")', 'dit "oui" \\ non', ['nom'], ', ')
    ).toEqual({ where: 'search(nom, "dit \\"oui\\" \\\\ non")', refusal: null });
    expect(buildSearchClause(tabular, '{fields}:contains:{q}', 'Paris, France', ['lieu'])).toEqual({
      where: 'lieu:contains:Paris%2C France',
      refusal: null,
    });
  });

  it('un terme n’est jamais lu comme un motif de remplacement', () => {
    expect(buildSearchClause(ods, 'search("{q}")', "$& $1 $'", []).where).toBe(
      'search("$& $1 $\'")'
    );
  });

  it('plusieurs champs : le séparateur du fournisseur', () => {
    expect(buildSearchClause(ods, 'search({fields}, "{q}")', 'x', ['a', 'b'], ', ').where).toBe(
      'search(a, b, "x")'
    );
    expect(buildSearchClause(tabular, '{fields}:contains:{q}', 'x', ['a', 'b']).where).toBe(
      'a|b:contains:x'
    );
  });

  it('refus : gabarit à champs sans champ, clause que l’API ne sait pas porter', () => {
    expect(buildSearchClause(tabular, '{fields}:contains:{q}', 'x', []).refusal).toContain(
      '"fields" est vide'
    );
    // INSEE ne sait pas dire « ou » entre deux champs (#1026)
    const refus = buildSearchClause(insee, '{fields}:contains:{q}', 'x', ['a', 'b']);
    expect(refus.where).toBe('');
    expect(refus.refusal).toContain('ne peut pas partir au serveur (insee)');
  });
});

// ---------------------------------------------------------------------------
// La comparaison tolérante, partagée entre la recherche et la source
// ---------------------------------------------------------------------------

describe('ADR-159 — comparaison tolérante d’une recherche dans le navigateur', () => {
  const LIGNES = [
    { nom: 'École de Sète', ville: 'Sète' },
    { nom: 'Lycée de Béziers', ville: 'Béziers' },
    { nom: 'Collège Victor Hugo', ville: 'Toulouse' },
    { nom: null, ville: 'Sète' },
  ];

  it('casse et accents ignorés', () => {
    expect(normalizeSearchText('  ÉCOLE de Sète ')).toBe('ecole de sete');
    expect(matchesSearch(LIGNES[0], 'sete', ['nom'], 'contains')).toBe(true);
    expect(matchesSearch(LIGNES[1], 'bezi', ['nom'], 'contains')).toBe(true);
  });

  it('contains : sous-chaîne ; starts : début d’un mot ; words : tous les mots', () => {
    expect(matchesSearch(LIGNES[2], 'ctor', ['nom'], 'contains')).toBe(true);
    expect(matchesSearch(LIGNES[2], 'ctor', ['nom'], 'starts')).toBe(false);
    expect(matchesSearch(LIGNES[2], 'vic', ['nom'], 'starts')).toBe(true);
    expect(matchesSearch(LIGNES[2], 'hugo college', ['nom'], 'words')).toBe(true);
    expect(matchesSearch(LIGNES[2], 'hugo lycee', ['nom'], 'words')).toBe(false);
  });

  it('sans champ nommé : tous les champs, hors champs techniques', () => {
    expect(matchesSearch({ a: 'x', _highlight: 'sete' }, 'sete', [], 'contains')).toBe(false);
    expect(matchesSearch({ a: 'x', b: 'Sète' }, 'sete', [], 'contains')).toBe(true);
  });

  it('applySearches : un ET entre recherches, un terme vide ne filtre rien', () => {
    const sete: ContextSearch = { term: 'SETE', fields: ['ville'], operator: 'contains' };
    const ecole: ContextSearch = { term: 'ecole', fields: ['nom'], operator: 'starts' };
    expect(applySearches(LIGNES, [sete])).toHaveLength(2);
    expect(applySearches(LIGNES, [sete, ecole])).toEqual([LIGNES[0]]);
    expect(applySearches(LIGNES, [{ ...sete, term: '   ' }])).toBe(LIGNES);
    expect(applySearches(LIGNES, [])).toBe(LIGNES);
  });
});

// ---------------------------------------------------------------------------
// Le contexte : une recherche, traduite cible par cible
// ---------------------------------------------------------------------------

describe('ADR-159 lot 3 — dsfr-data-context diffuse une recherche, chaque cible la traduit', () => {
  it('Opendatasoft : le moteur du portail, borné au champ — ni contains ni like', async () => {
    const a = cible('cs-a', ods);
    const search = await monter(PAGE('cs-a'));
    search.search('alim');
    await settle();
    expect(a.at(-1)).toMatchObject({ where: 'search(nom, "alim")' });
    expect(a.at(-1)?.clientSearch).toBeUndefined();
    expect(a.some((c) => /like|contains/.test(c.where ?? ''))).toBe(false);
  });

  it('Tabular et Grist : la clause que la recherche émettait déjà', async () => {
    const a = cible('cs-a', tabular);
    const b = cible('cs-b', grist);
    const search = await monter(PAGE('cs-a cs-b'));
    search.search('Paris, France');
    await settle();
    expect(a.at(-1)).toMatchObject({ where: 'nom:contains:Paris%2C France' });
    expect(b.at(-1)).toMatchObject({ where: 'nom:contains:Paris%2C France' });
    expect(a.at(-1)?.clientSearch).toBeUndefined();
    expect(a.at(-1)?.whereKey).toBe(b.at(-1)?.whereKey);
  });

  it('INSEE : rien à l’API, la source reçoit la recherche à calculer, avec l’opérateur', async () => {
    const a = cible('cs-a', insee);
    const search = await monter(PAGE('cs-a', 'operator="words"'));
    search.search('cote or');
    await settle();
    expect(a.at(-1)).toMatchObject({
      where: '',
      clientSearch: { term: 'cote or', fields: ['nom'], operator: 'words' },
    });
  });

  it('un même terme, deux cibles, deux traductions', async () => {
    const a = cible('cs-a', ods);
    const b = cible('cs-b', insee);
    const search = await monter(PAGE('cs-a cs-b'));
    search.search('lait');
    await settle();
    expect(a.at(-1)?.where).toBe('search(nom, "lait")');
    expect(b.at(-1)).toMatchObject({ where: '', clientSearch: { term: 'lait' } });
    const context = document.getElementById('cs-ctx') as DsfrDataContext;
    const filter = context.activeFilters()[0];
    expect(context._searchRouteFor(filter, 'cs-a')).toBe('server');
    expect(context._searchRouteFor(filter, 'cs-b')).toBe('client');
    expect(context._searchRouteFor(filter, 'ailleurs')).toBeNull();
  });

  it('source sans adaptateur : la commande part quand même, pour que son refus soit dit (#288)', async () => {
    const a = cible('cs-a', null);
    const search = await monter(PAGE('cs-a'));
    search.search('x');
    await settle();
    expect(a.at(-1)).toMatchObject({ where: '', clientSearch: { term: 'x' } });
    const context = document.getElementById('cs-ctx') as DsfrDataContext;
    expect(context._searchRouteFor(context.activeFilters()[0], 'cs-a')).toBe('ignored');
  });

  it('champ numérique face à un moteur qui ne lit que du texte : dans le navigateur, et c’est dit', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = cible('cs-a', ods, [{ nom: 6900 }, { nom: 7500 }]);
    const search = await monter(PAGE('cs-a'));
    search.search('69');
    await settle();
    expect(a.at(-1)).toMatchObject({ where: '', clientSearch: { term: '69', fields: ['nom'] } });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("n'est pas du texte"));
  });

  it('une clause que l’API ne sait pas porter retombe dans le navigateur', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const refuse = Object.assign(Object.create(tabular) as TabularAdapter, {
      supportsServerWhere: () => false,
    });
    const a = cible('cs-a', refuse);
    const search = await monter(PAGE('cs-a'));
    search.search('x');
    await settle();
    expect(a.at(-1)).toMatchObject({ where: '', clientSearch: { term: 'x' } });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ne peut pas partir au serveur'));
  });

  it('effacer le terme retire la recherche des deux voies', async () => {
    const a = cible('cs-a', ods);
    const b = cible('cs-b', insee);
    const search = await monter(PAGE('cs-a cs-b'));
    search.search('lait');
    await settle();
    search.clear();
    await settle();
    expect(a.at(-1)).toMatchObject({ where: '' });
    expect(b.at(-1)).toMatchObject({ where: '' });
    expect(b.at(-1)?.clientSearch).toBeUndefined();
  });

  it('min-length : sous le seuil, aucune recherche n’est portée', async () => {
    const a = cible('cs-a', ods);
    const search = await monter(PAGE('cs-a', 'min-length="3"'));
    search.search('al');
    await settle();
    expect(a.filter((c) => c.where).length).toBe(0);
    search.search('ali');
    await settle();
    expect(a.at(-1)?.where).toBe('search(nom, "ali")');
  });
});

// ---------------------------------------------------------------------------
// Ce qui lisait la recherche comme un filtre continue de la voir
// ---------------------------------------------------------------------------

describe('ADR-159 lot 3 — tags, context-value, URL : rien ne change pour la recherche', () => {
  const AVEC_LECTEURS = `
    <dsfr-data-context-tags id="cs-tags" for="cs-ctx" clear-all></dsfr-data-context-tags>
    <dsfr-data-context-value id="cs-value" for="cs-ctx" template="Recherche de {{nom}}"
      fallback="Tout"></dsfr-data-context-value>`;

  async function lecteurs() {
    const tags = document.getElementById('cs-tags') as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    const value = document.getElementById('cs-value') as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    await settle();
    await tags.updateComplete;
    await value.updateComplete;
    return {
      tag: () => tags.querySelector('.fr-tag')?.textContent?.replace(/\s+/g, ' ').trim(),
      phrase: () => value.textContent?.trim(),
      param: () => new URLSearchParams(window.location.search).get('nom'),
      tags,
    };
  }

  it('le filtre de la recherche est actif sans clause colon', async () => {
    cible('cs-a', ods);
    const search = await monter(PAGE('cs-a'));
    const context = document.getElementById('cs-ctx') as DsfrDataContext;
    expect(context.activeFilters()).toHaveLength(0);
    search.search('lait');
    await settle();
    const [filter] = context.activeFilters();
    expect(filter.buildColonWhere()).toBe('');
    expect(filter.buildSearch?.()).toEqual({ term: 'lait', fields: ['nom'], operator: 'contains' });
    expect(filter.displayLabel()).toBe('Recherche');
    expect(filter.displayValue()).toBe('lait');
    expect(context.getUrlParamNames()).toEqual(['nom']);
  });

  it('tag « Recherche : terme », valeur interpolée, paramètre d’URL — puis retrait par le tag', async () => {
    const a = cible('cs-a', ods);
    const search = await monter(PAGE('cs-a') + AVEC_LECTEURS);
    search.search('Paris, France');
    const vue = await lecteurs();
    expect(vue.tag()).toBe('Recherche : Paris, France');
    expect(vue.phrase()).toBe('Recherche de Paris, France');
    expect(vue.param()).toBe('Paris%2C France');

    (vue.tags.querySelector('.fr-tag') as HTMLButtonElement).click();
    await lecteurs();
    expect((search.querySelector('input') as HTMLInputElement).value).toBe('');
    expect(vue.tag()).toBeUndefined();
    expect(vue.phrase()).toBe('Tout');
    expect(vue.param()).toBeNull();
    expect(a.at(-1)).toMatchObject({ where: '' });
  });

  it('« Tout effacer » retire la recherche', async () => {
    const a = cible('cs-a', insee);
    const search = await monter(PAGE('cs-a') + AVEC_LECTEURS);
    search.search('lait');
    const vue = await lecteurs();
    const context = document.getElementById('cs-ctx') as DsfrDataContext;
    expect(context.clearAll()).toBe(1);
    await lecteurs();
    expect(vue.tag()).toBeUndefined();
    expect(a.at(-1)?.clientSearch).toBeUndefined();
    expect(vue.param()).toBeNull();
  });

  it('le terme relu de l’URL repart comme une recherche', async () => {
    window.history.replaceState(null, '', '?nom=Paris%252C France');
    const a = cible('cs-a', ods);
    const search = await monter(PAGE('cs-a'));
    expect((search.querySelector('input') as HTMLInputElement).value).toBe('Paris, France');
    expect(a.at(-1)?.where).toBe('search(nom, "Paris, France")');
  });
});

// ---------------------------------------------------------------------------
// La recherche elle-même : ne refiltre pas ce que le serveur a cherché
// ---------------------------------------------------------------------------

describe('ADR-159 lot 3 — dsfr-data-search laisse passer les lignes que l’API a cherchées', () => {
  // Ce qu'un portail rend pour « lait prod » : des mots, sans ordre ni
  // adjacence — aucune de ces lignes ne CONTIENT la chaîne « lait prod ».
  const DU_SERVEUR = [{ nom: 'Lait et produits laitiers' }, { nom: 'Produits au lait cru' }];

  it('cible servie par son API : pas de refiltrage, meta et total du serveur', async () => {
    cible('cs-a', ods);
    const search = await monter(PAGE('cs-a', 'count'));
    search.search('lait prod');
    await settle();
    setDataMeta('cs-a', { page: 1, pageSize: 2, total: 3179, serverSide: true });
    dispatchDataLoaded('cs-a', DU_SERVEUR);
    await settle();
    await search.updateComplete;
    expect(getDataCache('cs-search')).toEqual(DU_SERVEUR);
    expect(search.querySelector('.dsfr-data-search-count')?.textContent).toMatch(/3\s179/);
  });

  it('pas de lignes de l’ancien terme émises sous le nouveau', async () => {
    cible('cs-a', ods);
    const search = await monter(PAGE('cs-a'));
    dispatchDataLoaded('cs-a', [{ nom: 'avant' }]);
    await settle();
    const emissions: unknown[] = [];
    const onLoaded = (e: Event) => {
      const d = (e as CustomEvent).detail as { sourceId: string; data: unknown };
      if (d.sourceId === 'cs-search') emissions.push(d.data);
    };
    document.addEventListener('dsfr-data-loaded', onLoaded);
    search.search('lait');
    await settle();
    expect(emissions).toEqual([]);
    dispatchDataLoaded('cs-a', DU_SERVEUR);
    await settle();
    expect(emissions).toEqual([DU_SERVEUR]);
    document.removeEventListener('dsfr-data-loaded', onLoaded);
  });

  it('cible à travers une chaîne de transformateurs', async () => {
    cible('cs-a', ods);
    const etape = document.createElement('div');
    etape.id = 'cs-b';
    etape.setAttribute('source', 'cs-a');
    document.body.appendChild(etape);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <dsfr-data-context id="cs-ctx" sources="cs-a"></dsfr-data-context>
      <dsfr-data-search id="cs-search" context="cs-ctx" source="cs-b" fields="nom" debounce="0">
      </dsfr-data-search>`;
    document.body.appendChild(wrapper);
    await settle();
    const search = document.getElementById('cs-search') as DsfrDataSearch;
    search.search('lait prod');
    await settle();
    dispatchDataLoaded('cs-b', DU_SERVEUR);
    await settle();
    expect(getDataCache('cs-search')).toEqual(DU_SERVEUR);
  });

  it('cible sans moteur, ou source hors du contexte : elle filtre elle-même, comme avant', async () => {
    cible('cs-a', insee);
    const search = await monter(PAGE('cs-a'));
    search.search('lait prod');
    await settle();
    dispatchDataLoaded('cs-a', [...DU_SERVEUR, { nom: 'Du lait produit ici' }]);
    await settle();
    expect(getDataCache('cs-search')).toEqual([{ nom: 'Du lait produit ici' }]);
  });
});

// ---------------------------------------------------------------------------
// La source : une recherche à calculer elle-même
// ---------------------------------------------------------------------------

describe('ADR-159 lot 3 — dsfr-data-source calcule la recherche que son API ne sert pas', () => {
  const LIGNES = [
    { id: 1, nom: 'Côte-d’Or', pop: 3 },
    { id: 2, nom: 'Ain', pop: 9 },
    { id: 3, nom: 'COTES-D’ARMOR', pop: 1 },
  ];
  const PARAMS: AdapterParams = {
    baseUrl: '',
    datasetId: 'jeu',
    resource: '',
    select: '',
    where: '',
    filter: '',
    groupBy: '',
    aggregate: '',
    orderBy: '',
    limit: 0,
    transform: '',
    pageSize: 20,
  };
  const adaptateur = (rows: Record<string, unknown>[]) => {
    const recus: AdapterParams[] = [];
    const adapter = {
      type: 'faux',
      fetchAll: async (params: AdapterParams) => {
        recus.push(params);
        return { data: rows, totalCount: rows.length, needsClientProcessing: false } as FetchResult;
      },
    } as unknown as ApiAdapter;
    return { adapter, recus };
  };
  const cote: ContextSearch = { term: 'cote', fields: ['nom'], operator: 'contains' };
  const signal = new AbortController().signal;

  it('fetchAll puis recherche tolérante, tri et limite après', async () => {
    const { adapter, recus } = adaptateur(LIGNES);
    const r = await fetchAllWithClientWhere(
      adapter,
      { ...PARAMS, orderBy: 'pop:asc', limit: 1 },
      '',
      signal,
      'src',
      [cote]
    );
    expect(recus[0]).toMatchObject({ orderBy: '', limit: 0 });
    expect(r.data).toEqual([LIGNES[2]]);
    expect(r.totalCount).toBe(2);
  });

  it('clause colon ET recherche : les deux s’appliquent', async () => {
    const { adapter } = adaptateur(LIGNES);
    const r = await fetchAllWithClientWhere(adapter, PARAMS, 'nom:contains:or', signal, 'src', [
      cote,
    ]);
    // « Côte-d’Or » et « COTES-D’ARMOR » contiennent « or » (casse ignorée) et « cote »
    expect((r.data as typeof LIGNES).map((l) => l.id)).toEqual([1, 3]);
    expect(describeClientFilter('nom:contains:or', [cote])).toBe(
      'la clause "nom:contains:or" et la recherche « cote » dans nom'
    );
  });

  it('le champ cherché est lu même absent du select, puis retiré', async () => {
    const { adapter, recus } = adaptateur(LIGNES);
    const r = await fetchAllWithClientWhere(
      adapter,
      { ...PARAMS, select: 'id' },
      '',
      signal,
      'src',
      [cote]
    );
    expect(recus[0].select).toBe('id, nom');
    expect(r.data).toEqual([
      { id: 1, pop: 3 },
      { id: 3, pop: 1 },
    ]);
  });

  interface SourceInternals {
    _clientWhereConfigError(adapter: ApiAdapter): string | null;
    _hasReceivedWhere(): boolean;
  }
  const interne = (s: DsfrDataSource) => s as unknown as SourceInternals;

  it('la commande pose la recherche, une commande where sans elle la retire', async () => {
    const source = new DsfrDataSource();
    source.id = 'cs-a';
    source.apiType = 'insee';
    source.baseUrl = 'https://exemple.invalid';
    source.datasetId = 'jeu';
    vi.spyOn(source as unknown as { _scheduleFetch(): void }, '_scheduleFetch').mockImplementation(
      () => {}
    );
    document.body.appendChild(source);
    await settle();
    const { dispatchSourceCommand } = await import('@/utils/data-bridge.js');
    dispatchSourceCommand('cs-a', { where: '', clientSearch: cote, whereKey: 'k' });
    expect(source.getClientSearches()).toEqual([cote]);
    expect(source.getEffectiveWhere()).toBe('');
    expect(interne(source)._hasReceivedWhere()).toBe(true);
    dispatchSourceCommand('cs-a', { where: '', whereKey: 'k' });
    expect(source.getClientSearches()).toEqual([]);
    expect(interne(source)._hasReceivedWhere()).toBe(false);
  });

  it('server-side : erreur de configuration qui nomme la recherche', async () => {
    const source = new DsfrDataSource();
    source.id = 's';
    source.apiType = 'insee';
    source.serverSide = true;
    (
      source as unknown as { _clientSearchOverlays: Map<string, ContextSearch> }
    )._clientSearchOverlays.set('k', cote);
    const message = interne(source)._clientWhereConfigError(insee) ?? '';
    expect(message).toContain('la recherche « cote » dans nom est calculée dans le navigateur');
    expect(message).toContain("n'a pas de moteur de recherche");
    expect(message).toContain('Retirez server-side de dsfr-data-source "s"');
    source.serverSide = false;
    expect(interne(source)._clientWhereConfigError(insee)).toBeNull();
    source.groupBy = 'nom';
    expect(interne(source)._clientWhereConfigError(insee)).toContain('cette recherche');
  });

  it('une requête en attente d’un filtre (require-where) voit la recherche comme un filtre', () => {
    const query = new DsfrDataQuery() as unknown as {
      requireWhere: boolean;
      _hasFilter(): boolean;
      onTransformerCommand(cmd: Captured): void;
    };
    query.requireWhere = true;
    expect(query._hasFilter()).toBe(false);
    query.onTransformerCommand({ where: '', clientSearch: cote, whereKey: 'k' });
    expect(query._hasFilter()).toBe(true);
    query.onTransformerCommand({ where: '', whereKey: 'k' });
    expect(query._hasFilter()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Facettes serveur : une recherche que la source calcule leur échappe
// ---------------------------------------------------------------------------

describe('ADR-159 lot 3 — server-facets à côté d’une recherche calculée dans le navigateur', () => {
  it('erreur de configuration qui nomme la recherche ; levée quand elle disparaît', async () => {
    await import('@/components/dsfr-data-facets.js');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let searches: ContextSearch[] = [{ term: 'cote', fields: ['nom'], operator: 'contains' }];
    const fetchFacets = vi.fn(async (_p: unknown, fields: string[]) =>
      fields.map((field) => ({ field, values: [{ value: 'Bretagne', count: 2 }] }))
    );
    const el = document.createElement('div');
    el.id = 'cs-a';
    Object.assign(el, {
      getAdapter: () => ({
        type: 'faux',
        capabilities: { serverFacets: true, whereFormat: 'colon' },
        fetchFacets,
        buildFacetWhere: () => '',
      }),
      getAdapterParams: () => ({ baseUrl: 'https://exemple.invalid', datasetId: 'jeu' }),
      getEffectiveWhere: () => '',
      getClientWhere: () => '',
      getClientSearches: () => searches,
    });
    document.body.appendChild(el);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `<dsfr-data-facets id="cs-b" source="cs-a" server-facets fields="region">
      </dsfr-data-facets>`;
    document.body.appendChild(wrapper);
    dispatchDataLoaded('cs-a', [{ region: 'Bretagne', nom: 'x' }]);
    await settle(40);
    const facets = document.getElementById('cs-b') as HTMLElement;
    const message = facets.getAttribute('data-dsfr-config-error') ?? '';
    expect(message).toContain('la recherche « cote » dans nom est calculée dans le navigateur');
    expect(message).toContain('Retirez server-facets');
    expect(fetchFacets).not.toHaveBeenCalled();

    searches = [];
    dispatchDataLoaded('cs-a', [{ region: 'Bretagne', nom: 'x' }]);
    await settle(40);
    expect(facets.hasAttribute('data-dsfr-config-error')).toBe(false);
    expect(fetchFacets).toHaveBeenCalled();
  });
});
