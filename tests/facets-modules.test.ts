import { describe, it, expect, vi } from 'vitest';

/**
 * Modules de `<dsfr-data-facets>` (#838, dette DE).
 *
 * Le composant portait quatre responsabilités dans un fichier de 2 736
 * lignes. Les blocs « client » (comptage, tri, filtrage), « serveur »
 * (découverte, paramètres, regroupement par clause) et « statique » (valeurs
 * déclarées) vivent désormais dans `packages/core/src/components/facets/`,
 * en fonctions pures. Ce fichier les éprouve DIRECTEMENT, sans DOM ni Lit :
 * c'est ce que le découpage achète.
 *
 * Les comportements de bout en bout restent couverts par
 * `dsfr-data-facets.test.ts` et consorts, inchangés.
 */

import {
  appendOrphanSelections,
  autoDetectFacetFields,
  countFacetValues,
  facetValuesOf,
  filterRowsBySelections,
  matchesSelection,
  resolveFacetValue,
  rowWeight,
} from '@/components/facets/facets-client.js';
import {
  parseSortAttribute,
  resolveSortCriterion,
  sortFacetValues,
} from '@/components/facets/facets-sort.js';
import { buildStaticFacetGroups, staticValueFields } from '@/components/facets/facets-static.js';
import {
  ServerFacetsDiscovery,
  fetchFacetGroups,
  groupFieldsByWhere,
  hasDateYearSelection,
  hasYearShapedSelection,
  resolveServerParams,
} from '@/components/facets/facets-server.js';
import {
  colClassFor,
  parseDisplayModes,
  parseFacetLabels,
  parseSpanScales,
  parseWidths,
  scaleForField,
} from '@/components/facets/facets-attributes.js';
import {
  parseUrlParamMap,
  readUrlSelections,
  writeUrlSelections,
} from '@/components/facets/facets-url.js';
import type { ApiAdapter, FacetDescriptor } from '@/adapters/api-adapter.js';

const noWarn = () => {};

describe('facets-client — lecture des cellules', () => {
  it('resout un chemin pointe et refuse les cles dangereuses', () => {
    expect(resolveFacetValue({ region: 'IDF' }, 'region')).toBe('IDF');
    expect(resolveFacetValue({ fields: { Region: 'IDF' } }, 'fields.Region')).toBe('IDF');
    expect(resolveFacetValue({ fields: { Region: 'IDF' } }, 'fields.Absent')).toBeUndefined();
    expect(resolveFacetValue({ a: 1 }, '__proto__.polluted')).toBeUndefined();
  });

  it('eclate une cellule tableau en valeurs, vides exclus (#421)', () => {
    expect(facetValuesOf(['a', '', 'b', null])).toEqual(['a', 'b']);
    expect(facetValuesOf('a')).toEqual(['a']);
    expect(facetValuesOf('')).toEqual([]);
    expect(facetValuesOf(null)).toEqual([]);
    expect(facetValuesOf(3)).toEqual(['3']);
  });

  it('matche une selection par intersection (#421)', () => {
    expect(matchesSelection(['a', 'b'], new Set(['b']))).toBe(true);
    expect(matchesSelection(['a', 'b'], new Set(['c']))).toBe(false);
    expect(matchesSelection('a', new Set(['a']))).toBe(true);
  });
});

describe('facets-client — poids et compteurs (#739)', () => {
  it('une ligne pese 1 sans champ de ponderation', () => {
    expect(rowWeight({ n: 12 }, '')).toBe(1);
  });

  it('une cellule non numerique pese zero', () => {
    expect(rowWeight({ n: 12 }, 'n')).toBe(12);
    expect(rowWeight({ n: 'douze' }, 'n')).toBe(0);
    expect(rowWeight({}, 'n')).toBe(0);
  });

  it('compte des lignes, ou somme la mesure demandee', () => {
    const rows = [
      { r: 'IDF', n: 10 },
      { r: 'IDF', n: 5 },
      { r: 'BRE', n: 2 },
    ];
    expect(countFacetValues(rows, 'r', '').values).toEqual([
      { value: 'IDF', count: 2 },
      { value: 'BRE', count: 1 },
    ]);
    expect(countFacetValues(rows, 'r', 'n').values).toEqual([
      { value: 'IDF', count: 15 },
      { value: 'BRE', count: 2 },
    ]);
  });

  it('arrondit les artefacts flottants des sommes', () => {
    const rows = [
      { r: 'A', n: 0.1 },
      { r: 'A', n: 0.2 },
    ];
    expect(countFacetValues(rows, 'r', 'n').values[0].count).toBe(0.3);
  });

  it('annonce zero ligne ponderee quand le champ est absent partout', () => {
    const rows = [{ r: 'A' }, { r: 'B' }];
    expect(countFacetValues(rows, 'r', 'effectif').weightedRows).toBe(0);
    expect(countFacetValues(rows, 'r', '').weightedRows).toBe(2);
  });
});

describe('facets-client — filtrage croise', () => {
  const rows = [
    { r: 'IDF', t: 'a' },
    { r: 'IDF', t: 'b' },
    { r: 'BRE', t: 'a' },
  ];

  it('rend les lignes telles quelles sans selection', () => {
    expect(filterRowsBySelections(rows, {})).toBe(rows);
  });

  it('applique toutes les selections', () => {
    const kept = filterRowsBySelections(rows, { r: new Set(['IDF']), t: new Set(['a']) });
    expect(kept).toEqual([{ r: 'IDF', t: 'a' }]);
  });

  it('exclut le champ compte, c’est ce qui donne les compteurs dynamiques', () => {
    const kept = filterRowsBySelections(rows, { r: new Set(['IDF']), t: new Set(['a']) }, 't');
    expect(kept).toHaveLength(2);
  });
});

describe('facets-client — selections orphelines (#310)', () => {
  it('recree le groupe disparu et marque la valeur indisponible', () => {
    const groups = appendOrphanSelections([], { r: new Set(['IDF']) }, new Map([['r', 'Région']]));
    expect(groups).toEqual([
      { field: 'r', label: 'Région', values: [{ value: 'IDF', count: 0, missing: true }] },
    ]);
  });

  it('n’ajoute rien pour une valeur deja presente', () => {
    const groups = appendOrphanSelections(
      [{ field: 'r', label: 'r', values: [{ value: 'IDF', count: 3 }] }],
      { r: new Set(['IDF']) },
      new Map()
    );
    expect(groups[0].values).toHaveLength(1);
  });
});

describe('facets-client — auto-detection des champs', () => {
  it('retient les colonnes categorielles, ecarte les identifiants', () => {
    const rows = [
      { id: 'a', r: 'IDF', n: 1 },
      { id: 'b', r: 'IDF', n: 2 },
      { id: 'c', r: 'BRE', n: 3 },
    ];
    expect(autoDetectFacetFields(rows)).toEqual(['r']);
  });

  it('rend un tableau vide sans donnees', () => {
    expect(autoDetectFacetFields([])).toEqual([]);
  });
});

describe('facets-sort — grammaire de tri (#645, #741)', () => {
  it('lit critere et sens, avec les defauts par critere', () => {
    expect(resolveSortCriterion('count', noWarn)).toEqual({ by: 'count', dir: 'desc' });
    expect(resolveSortCriterion('alpha', noWarn)).toEqual({ by: 'alpha', dir: 'asc' });
    expect(resolveSortCriterion('alpha:desc', noWarn)).toEqual({ by: 'alpha', dir: 'desc' });
  });

  it('garde le sens historique des formes depreciees, en avertissant', () => {
    const warn = vi.fn();
    expect(resolveSortCriterion('-count', warn)).toEqual({ by: 'count', dir: 'asc' });
    expect(resolveSortCriterion('-alpha', warn)).toEqual({ by: 'alpha', dir: 'desc' });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('signale un critere inconnu au lieu de retomber en silence sur count', () => {
    const warn = vi.fn();
    expect(resolveSortCriterion('frequence', warn)).toEqual({ by: 'count', dir: 'desc' });
    expect(warn.mock.calls[0][1]).toContain('inconnu');
  });

  it('separe le tri par defaut du tri par champ', () => {
    const { fallback, byField } = parseSortAttribute('*:alpha | annee:count:desc', noWarn);
    expect(fallback).toEqual({ by: 'alpha', dir: 'asc' });
    expect(byField.get('annee')).toEqual({ by: 'count', dir: 'desc' });
  });

  it('lit la forme globale historique comme un tri par defaut', () => {
    expect(parseSortAttribute('alpha:desc', noWarn).fallback).toEqual({
      by: 'alpha',
      dir: 'desc',
    });
    expect(parseSortAttribute('', noWarn).fallback).toEqual({ by: 'count', dir: 'desc' });
  });

  it('trie sans muter le tableau recu', () => {
    const values = [
      { value: 'b', count: 1 },
      { value: 'a', count: 2 },
    ];
    expect(sortFacetValues(values, { by: 'alpha', dir: 'asc' }).map((v) => v.value)).toEqual([
      'a',
      'b',
    ]);
    expect(sortFacetValues(values, { by: 'count', dir: 'desc' }).map((v) => v.value)).toEqual([
      'a',
      'b',
    ]);
    expect(values[0].value).toBe('b');
  });
});

describe('facets-static — valeurs declarees', () => {
  it('construit un groupe par champ, sans compteur', () => {
    const groups = buildStaticFacetGroups('{"r":["IDF","BRE"]}', '', new Map(), false);
    expect(groups).toEqual([
      {
        field: 'r',
        label: 'r',
        values: [
          { value: 'IDF', count: 0 },
          { value: 'BRE', count: 0 },
        ],
      },
    ]);
  });

  it('respecte l’ordre de `fields` et masque les facettes a une valeur', () => {
    const groups = buildStaticFacetGroups('{"a":["x"],"b":["y","z"]}', 'b, a', new Map(), true);
    expect(groups?.map((g) => g.field)).toEqual(['b']);
  });

  it('rend null sur un JSON invalide — l’appelant signale', () => {
    expect(buildStaticFacetGroups('pas du json', '', new Map(), false)).toBeNull();
    expect(staticValueFields('pas du json')).toEqual([]);
    expect(staticValueFields('{"a":[],"b":[]}')).toEqual(['a', 'b']);
  });
});

describe('facets-server — decouverte memorisee (#680)', () => {
  const descriptors: FacetDescriptor[] = [
    { field: 'annee', label: 'Année', isDate: true },
    { field: 'r', label: 'Région' },
  ];

  function adapterWith(discover: () => Promise<FacetDescriptor[]>): ApiAdapter {
    return { discoverFacets: discover } as unknown as ApiAdapter;
  }

  it('n’appelle le provider qu’une fois par jeu', async () => {
    const discover = vi.fn().mockResolvedValue(descriptors);
    const discovery = new ServerFacetsDiscovery();
    const params = { baseUrl: 'https://x', datasetId: 'd' };
    await discovery.discover(adapterWith(discover), params, noWarn);
    await discovery.discover(adapterWith(discover), params, noWarn);
    expect(discover).toHaveBeenCalledTimes(1);
    expect(discovery.dateFields()).toEqual(new Set(['annee']));
    expect(discovery.labelOf('r')).toBe('Région');
  });

  it('un autre jeu invalide la memorisation', async () => {
    const discover = vi.fn().mockResolvedValue(descriptors);
    const discovery = new ServerFacetsDiscovery();
    await discovery.discover(
      adapterWith(discover),
      { baseUrl: 'https://x', datasetId: 'a' },
      noWarn
    );
    await discovery.discover(
      adapterWith(discover),
      { baseUrl: 'https://x', datasetId: 'b' },
      noWarn
    );
    expect(discover).toHaveBeenCalledTimes(2);
  });

  it('memorise un echec comme une decouverte vide, et le signale', async () => {
    const onError = vi.fn();
    const discovery = new ServerFacetsDiscovery();
    const adapter = adapterWith(() => Promise.reject(new Error('500')));
    expect(await discovery.discover(adapter, { baseUrl: '', datasetId: 'd' }, onError)).toEqual([]);
    expect(onError).toHaveBeenCalled();
    expect(discovery.facets).toEqual([]);
    expect(discovery.dateFields()).toBeUndefined();
  });

  it('sans `discoverFacets`, rend une liste vide sans rien memoriser', async () => {
    const discovery = new ServerFacetsDiscovery();
    expect(
      await discovery.discover({} as ApiAdapter, { baseUrl: '', datasetId: 'd' }, noWarn)
    ).toEqual([]);
    expect(discovery.facets).toBeNull();
  });
});

describe('facets-server — selections en forme d’annee (#676)', () => {
  it('distingue « une annee quelque part » de « une annee sur un champ date »', () => {
    const selections = { annee: new Set(['2023']), r: new Set(['IDF']) };
    expect(hasYearShapedSelection(selections)).toBe(true);
    expect(hasDateYearSelection(selections, undefined)).toBe(false);
    expect(hasDateYearSelection(selections, new Set(['annee']))).toBe(true);
    expect(hasDateYearSelection(selections, new Set(['autre']))).toBe(false);
  });
});

describe('facets-server — parametres et regroupement par clause', () => {
  it('prefere les parametres resolus par la source (#274)', () => {
    const sourceEl = {
      getAdapterParams: () => ({ baseUrl: 'https://x', datasetId: 'd', headers: { A: '1' } }),
    } as unknown as HTMLElement;
    expect(resolveServerParams(sourceEl, () => null)).toEqual({
      baseUrl: 'https://x',
      datasetId: 'd',
      headers: { A: '1' },
      proxyUrl: undefined,
    });
  });

  it('retombe sur les attributs DOM de la vraie source amont', () => {
    const upstream = document.createElement('div');
    upstream.setAttribute('base-url', 'https://y');
    upstream.setAttribute('dataset-id', 'jeu');
    upstream.setAttribute('headers', '{"B":"2"}');
    const relay = document.createElement('div');
    expect(resolveServerParams(relay, () => upstream)).toEqual({
      baseUrl: 'https://y',
      datasetId: 'jeu',
      headers: { B: '2' },
      proxyUrl: undefined,
    });
  });

  it('rend null sans identifiant de jeu', () => {
    const el = document.createElement('div');
    expect(resolveServerParams(el, () => null)).toBeNull();
  });

  it('regroupe les champs qui partagent la meme clause (#313)', () => {
    const grouped = groupFieldsByWhere(['a', 'b', 'c'], 'base', 'colon', (field) =>
      field === 'c' ? 'c:eq:1' : ''
    );
    expect([...grouped.entries()]).toEqual([
      ['base', ['a', 'b']],
      ['base, c:eq:1', ['c']],
    ]);
  });
});

describe('facets-server — cycle de fetch (#309)', () => {
  const params = { baseUrl: 'https://x', datasetId: 'd' };
  const label = (f: string) => f;
  const sortAsIs = (values: Array<{ value: string; count: number }>) => values;

  it('rend les groupes de chaque clause', async () => {
    const adapter = {
      fetchFacets: vi
        .fn()
        .mockResolvedValue([{ field: 'r', values: [{ value: 'IDF', count: 2 }] }]),
    } as unknown as ApiAdapter;
    const outcome = await fetchFacetGroups(
      adapter,
      params,
      new Map([['', ['r']]]),
      new AbortController().signal,
      label,
      sortAsIs,
      noWarn
    );
    expect(outcome).toEqual({
      groups: [{ field: 'r', label: 'r', values: [{ value: 'IDF', count: 2 }] }],
      error: null,
      aborted: false,
    });
  });

  it('rend l’erreur visible au lieu de l’avaler', async () => {
    const onError = vi.fn();
    const adapter = {
      fetchFacets: vi.fn().mockRejectedValue(new Error('API 500')),
    } as unknown as ApiAdapter;
    const outcome = await fetchFacetGroups(
      adapter,
      params,
      new Map([['', ['r']]]),
      new AbortController().signal,
      label,
      sortAsIs,
      onError
    );
    expect(outcome.error).toBe('API 500');
    expect(outcome.aborted).toBe(false);
    expect(onError).toHaveBeenCalled();
  });

  it('signale un cycle annule, pour que l’appelant n’ecrive rien', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const adapter = {
      fetchFacets: vi.fn().mockRejectedValue(abortError),
    } as unknown as ApiAdapter;
    const outcome = await fetchFacetGroups(
      adapter,
      params,
      new Map([['', ['r']]]),
      new AbortController().signal,
      label,
      sortAsIs,
      noWarn
    );
    expect(outcome.aborted).toBe(true);
  });
});

describe('facets-attributes — grammaires a barre verticale', () => {
  it('lit les libelles, virgule comprise dans la valeur', () => {
    const labels = parseFacetLabels('r:Département, région | t:Type');
    expect(labels.get('r')).toBe('Département, région');
    expect(labels.get('t')).toBe('Type');
  });

  it('signale un mode d’affichage inconnu et garde checkbox (#731)', () => {
    const warn = vi.fn();
    const modes = parseDisplayModes('r:select | t:liste', warn);
    expect(modes.get('r')).toBe('select');
    expect(modes.has('t')).toBe(false);
    expect(warn.mock.calls[0][0]).toContain('inconnu');
  });

  it('lit `cols` en largeur globale ou par champ', () => {
    expect(parseWidths('6')).toEqual({ global: 6 });
    expect(parseWidths('r:4 | t:8')).toEqual({
      map: new Map([
        ['r', 4],
        ['t', 8],
      ]),
      fallback: 6,
    });
    expect(parseWidths('')).toBeNull();
    expect(parseWidths('nimporte')).toBeNull();
  });

  it('lit `span` en echelles, globales ou par champ (#789)', () => {
    const spans = parseSpanScales('annee:12 md:3 | type:12 md:6');
    expect(spans.error).toBeNull();
    expect(spans.global).toBeNull();
    expect(spans.byField.get('annee')?.base).toBe(12);
    expect(parseSpanScales('12 md:3').global?.base).toBe(12);
  });

  it('`per-row` sert de repli, la demi-ligne historique en dernier (#790)', () => {
    const spans = parseSpanScales('annee:12 md:3');
    expect(scaleForField('annee', spans, null)?.steps).toEqual([{ bp: 'md', width: 3 }]);
    expect(scaleForField('autre', spans, null)).toEqual({
      base: 12,
      steps: [{ bp: 'md', width: 6 }],
      mobileExplicit: false,
    });
    expect(scaleForField('autre', parseSpanScales(''), null)).toBeNull();
  });

  it('rend la classe DSFR, pleine largeur sous 768 px (#788)', () => {
    expect(colClassFor('r', null, { global: 4 })).toBe('fr-col-12 fr-col-md-4');
    expect(colClassFor('r', null, { global: 12 })).toBe('fr-col-12');
    expect(colClassFor('r', null, null)).toBe('');
  });
});

describe('facets-url — lecture et ecriture des parametres', () => {
  it('ne lit que les champs connus sans url-param-map (#312, #773)', () => {
    const selections = readUrlSelections(
      new URLSearchParams('?r=IDF,BRE&utm_source=newsletter'),
      new Map(),
      new Set(['r'])
    );
    expect(Object.keys(selections)).toEqual(['r']);
    expect([...selections.r]).toEqual(['IDF', 'BRE']);
  });

  it('suit url-param-map quand il est pose', () => {
    const paramMap = parseUrlParamMap('region:r');
    const selections = readUrlSelections(
      new URLSearchParams('?region=IDF&r=BRE'),
      paramMap,
      new Set(['r'])
    );
    expect([...selections.r]).toEqual(['IDF']);
  });

  it('preserve les parametres voisins et retire les siens perimes (#312)', () => {
    const url = new URL('https://exemple.fr/p?q=texte&r=BRE');
    writeUrlSelections(
      url,
      { t: new Set(['a']) },
      [{ field: 'r', label: 'r', values: [] }],
      new Map()
    );
    expect(url.searchParams.get('q')).toBe('texte');
    expect(url.searchParams.has('r')).toBe(false);
    expect(url.searchParams.get('t')).toBe('a');
  });

  it('ecrit sous le nom du parametre, pas du champ', () => {
    const url = new URL('https://exemple.fr/p');
    writeUrlSelections(url, { r: new Set(['IDF', 'BRE']) }, [], parseUrlParamMap('region:r'));
    expect(url.searchParams.get('region')).toBe('IDF,BRE');
  });
});
