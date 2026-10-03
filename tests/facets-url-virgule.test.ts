import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * BUG-031 du banc d'essai (#1227) — une valeur de facette qui contient une
 * virgule ne survivait pas au rechargement de l'URL.
 *
 * `writeUrlSelections` joignait les valeurs par `,`, `readUrlSelections` les
 * redécoupait sur `,`, sans échappement : « 1,5 à 2 parcours » revenait en
 * « 1 » et « 5 à 2 parcours », deux cases fantômes, zéro résultat, aucune
 * erreur. La virgule d'une valeur s'écrit désormais `%2C` (et `%` `%25`), si
 * bien que l'aller-retour est exact pour TOUTE valeur, et qu'un lien sans
 * virgule dans ses valeurs garde sa forme.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import { clearDataCache, dispatchDataLoaded, getDataCache } from '@/utils/data-bridge.js';
import {
  escapeUrlFacetValue,
  joinUrlFacetValues,
  readUrlSelections,
  splitUrlFacetValues,
  unescapeUrlFacetValue,
  writeUrlSelections,
} from '@/components/facets/facets-url.js';

/** Aller-retour par une VRAIE chaîne de requête, comme un rechargement de page. */
function roundTrip(values: string[]): string[] {
  const url = new URL('https://exemple.fr/page');
  writeUrlSelections(url, { f: new Set(values) }, [], new Map());
  const reloaded = new URL(url.toString());
  const selections = readUrlSelections(reloaded.searchParams, new Map(), new Set(['f']));
  return [...(selections.f ?? [])];
}

describe('BUG-031 — aller-retour exact, quelle que soit la valeur', () => {
  const CASES: Array<[string, string[]]> = [
    ['la valeur du banc', ['1,5 à 2 parcours']],
    ['une valeur à virgule parmi d’autres', ['2 à 3 parcours', '1,5 à 2 parcours', 'Aucun']],
    ['plusieurs virgules', ['Paris, Lyon, Marseille']],
    ['virgule en tête et en queue', [',a,', ',']],
    ['un pourcent', ['50 %', '100%']],
    ['la séquence d’échappement elle-même', ['%2C', '%25', 'a%2Cb', '%252C']],
    ['des blancs aux bords', [' Paris', 'Lyon ', '  deux  ', '\tTab', 'insécable ']],
    ['un blanc seul', [' ']],
    ['les caractères de la requête', ['a&b=c', 'x+y', 'q?r#s', 'a/b', 'é ü ñ', '日本, 語']],
    ['une valeur qui ressemble à deux valeurs voisines', ['A', 'B', 'A,B']],
  ];

  for (const [name, values] of CASES) {
    it(name, () => {
      expect(roundTrip(values)).toEqual(values);
    });
  }

  it('la virgule est écrite %2C dans la valeur — %252C dans la barre d’adresse', () => {
    const url = new URL('https://exemple.fr/page');
    writeUrlSelections(url, { intensite: new Set(['1,5 à 2 parcours']) }, [], new Map());
    expect(url.searchParams.get('intensite')).toBe('1%2C5 à 2 parcours');
    expect(url.search).toContain('intensite=1%252C5');
  });

  it('échappement et décodage sont inverses l’un de l’autre', () => {
    for (const v of ['1,5', '50 %', ' x ', '%2C', 'a,b,c%', '']) {
      expect(unescapeUrlFacetValue(escapeUrlFacetValue(v))).toBe(v);
    }
    expect(joinUrlFacetValues(['a,b', 'c'])).toBe('a%2Cb,c');
  });
});

describe('BUG-031 — les liens déjà partagés se relisent comme avant', () => {
  it('un lien sans virgule dans ses valeurs garde SA FORME à l’écriture', () => {
    const url = new URL('https://exemple.fr/page');
    writeUrlSelections(url, { region: new Set(['IDF', 'PACA']) }, [], new Map());
    expect(url.searchParams.get('region')).toBe('IDF,PACA');
    expect(url.search).toBe('?region=IDF%2CPACA');
  });

  it('plusieurs valeurs jointes par virgule, écrites à la main ou par une version antérieure', () => {
    for (const search of ['?region=IDF,PACA', '?region=IDF%2CPACA', '?region=IDF,%20PACA']) {
      const selections = readUrlSelections(
        new URLSearchParams(search),
        new Map(),
        new Set(['region'])
      );
      expect([...selections.region]).toEqual(['IDF', 'PACA']);
    }
  });

  it('un paramètre répété cumule ses occurrences', () => {
    const selections = readUrlSelections(
      new URLSearchParams('?region=IDF&region=PACA,BRE'),
      new Map(),
      new Set(['region'])
    );
    expect([...selections.region]).toEqual(['IDF', 'PACA', 'BRE']);
  });

  it('un pourcent littéral d’un ancien lien n’est pas pris pour un échappement', () => {
    expect(splitUrlFacetValues('50 %,100%')).toEqual(['50 %', '100%']);
    expect(splitUrlFacetValues('100%de')).toEqual(['100%de']);
    expect(splitUrlFacetValues('taux %zz')).toEqual(['taux %zz']);
  });

  it('un ancien lien à virgule NUE est recollé contre les valeurs des données', () => {
    const known = new Set(['1,5 à 2 parcours', '2 à 3 parcours', 'Paris, France']);
    expect(splitUrlFacetValues('1,5 à 2 parcours', known)).toEqual(['1,5 à 2 parcours']);
    expect(splitUrlFacetValues('2 à 3 parcours,1,5 à 2 parcours', known)).toEqual([
      '2 à 3 parcours',
      '1,5 à 2 parcours',
    ]);
    // Les blancs intérieurs sont ceux du lien
    expect(splitUrlFacetValues('Paris, France', known)).toEqual(['Paris, France']);
  });

  it('un morceau connu n’est jamais recollé : « A,B » reste deux valeurs', () => {
    expect(splitUrlFacetValues('A,B', new Set(['A', 'B', 'A,B']))).toEqual(['A', 'B']);
  });

  it('sans valeur connue qui convienne, les morceaux sont rendus seuls (comme avant)', () => {
    expect(splitUrlFacetValues('1,5 à 2 parcours', new Set(['autre']))).toEqual([
      '1',
      '5 à 2 parcours',
    ]);
    expect(splitUrlFacetValues('1,5 à 2 parcours')).toEqual(['1', '5 à 2 parcours']);
  });
});

// ---------------------------------------------------------------------------
// Le composant : cocher, recharger, compter
// ---------------------------------------------------------------------------

const ROWS = [
  { id: 'a', intensite: '1,5 à 2 parcours' },
  { id: 'b', intensite: '1,5 à 2 parcours' },
  { id: 'c', intensite: '2 à 3 parcours' },
  { id: 'd', intensite: 'Moins de 1 parcours' },
  { id: 'e', intensite: '2 à 3 parcours' },
  { id: 'f', intensite: '1,5 à 2 parcours' },
];

let seq = 0;
const mounted: Element[] = [];

afterEach(() => {
  for (const el of mounted.splice(0)) el.remove();
  window.history.replaceState(null, '', window.location.pathname);
  vi.restoreAllMocks();
});

async function mountFacets(extra: (el: DsfrDataFacets) => void = () => {}) {
  const src = `virgule-src-${++seq}`;
  clearDataCache(src);
  const facets = new DsfrDataFacets();
  facets.id = `virgule-facets-${seq}`;
  facets.source = src;
  facets.fields = 'intensite';
  facets.urlParams = true;
  facets.urlSync = true;
  extra(facets);
  document.body.appendChild(facets);
  mounted.push(facets);
  dispatchDataLoaded(src, ROWS);
  await facets.updateComplete;
  return facets;
}

interface FacetsInternals {
  _activeSelections: Record<string, Set<string>>;
  _toggleValue(field: string, value: string): void;
}
const internals = (f: DsfrDataFacets) => f as unknown as FacetsInternals;
const emitted = (f: DsfrDataFacets) => getDataCache(f.id) as Array<Record<string, unknown>>;
const checkedLabels = (f: DsfrDataFacets) =>
  Array.from(f.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
    .filter((i) => i.checked)
    .map((i) => f.querySelector(`label[for="${i.id}"]`)?.textContent?.replace(/\s+/g, ' ').trim());

describe('BUG-031 — la facette, de la case cochée au rechargement', () => {
  it('AC : « 1,5 à 2 parcours » cochée puis page rechargée → une case, trois lignes', async () => {
    const first = await mountFacets();
    internals(first)._toggleValue('intensite', '1,5 à 2 parcours');
    await first.updateComplete;
    expect(emitted(first)).toHaveLength(3);
    const shared = window.location.search;
    expect(shared).toBe('?intensite=1%252C5+%C3%A0+2+parcours');

    // Rechargement : une facette neuve lit l'URL laissée par la première
    first.remove();
    window.history.replaceState(null, '', shared);
    const reloaded = await mountFacets();
    expect([...internals(reloaded)._activeSelections.intensite]).toEqual(['1,5 à 2 parcours']);
    expect(emitted(reloaded)).toHaveLength(3);
    const checked = checkedLabels(reloaded);
    expect(checked).toHaveLength(1);
    expect(checked[0]).toContain('1,5 à 2 parcours');
    expect(reloaded.textContent).not.toContain('indisponible');
  });

  it('AC : une valeur sans virgule se recharge comme avant', async () => {
    window.history.replaceState(null, '', '?intensite=2+%C3%A0+3+parcours');
    const facets = await mountFacets();
    expect([...internals(facets)._activeSelections.intensite]).toEqual(['2 à 3 parcours']);
    expect(emitted(facets)).toHaveLength(2);
  });

  it('un lien écrit par la 0.44 (virgule nue) est recollé : une case, trois lignes', async () => {
    window.history.replaceState(null, '', '?intensite=1%2C5+%C3%A0+2+parcours');
    const facets = await mountFacets();
    expect([...internals(facets)._activeSelections.intensite]).toEqual(['1,5 à 2 parcours']);
    expect(emitted(facets)).toHaveLength(3);
    expect(facets.textContent).not.toContain('indisponible');
  });

  it('deux valeurs dont une à virgule : cinq lignes après rechargement', async () => {
    const first = await mountFacets((el) => (el.disjunctive = 'intensite'));
    internals(first)._toggleValue('intensite', '1,5 à 2 parcours');
    internals(first)._toggleValue('intensite', '2 à 3 parcours');
    await first.updateComplete;
    const shared = window.location.search;
    first.remove();
    expect(new URLSearchParams(shared).get('intensite')).toBe('1%2C5 à 2 parcours,2 à 3 parcours');
    window.history.replaceState(null, '', shared);
    const reloaded = await mountFacets((el) => (el.disjunctive = 'intensite'));
    expect([...internals(reloaded)._activeSelections.intensite].sort()).toEqual([
      '1,5 à 2 parcours',
      '2 à 3 parcours',
    ]);
    expect(emitted(reloaded)).toHaveLength(5);
  });
});
