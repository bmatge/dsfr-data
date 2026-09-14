import { describe, it, expect, afterEach, vi } from 'vitest';

import {
  estUrlBrute,
  exportUrl,
  fetchUrlRows,
  resoudreFeed,
  suivreChemin,
} from '../../tools/oracle/raw';

/**
 * L'alimentation BRUTE de l'oracle.
 *
 * Elle est la seule partie du moteur qui sorte sur le réseau : si elle rend
 * des lignes fausses, tout ce qui en découle accuse la bibliothèque à sa
 * place. On l'éprouve donc hors ligne, sur des réponses écrites à la main —
 * l'enveloppe Tabular (`data` + `links.next`) et l'enveloppe INSEE Melodi
 * (`observations` + `paging.next`), les deux formes pour lesquelles la
 * variante `RawUrlSource` existe.
 */

const vraiFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = vraiFetch;
  vi.restoreAllMocks();
});

/** Un faux réseau : une URL, une charge JSON. Toute autre URL est un échec. */
function reseau(pages: Record<string, unknown>): string[] {
  const vues: string[] = [];
  globalThis.fetch = (async (entree: string | URL) => {
    const url = String(entree);
    vues.push(url);
    if (!(url in pages)) return new Response('', { status: 404 });
    return new Response(JSON.stringify(pages[url]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return vues;
}

describe('suivreChemin', () => {
  it('descend un chemin pointé et rend undefined sur un chemin absent', () => {
    const body = { links: { next: 'https://exemple.invalid/p2' }, meta: { total: 3 } };
    expect(suivreChemin(body, 'links.next')).toBe('https://exemple.invalid/p2');
    expect(suivreChemin(body, 'meta.total')).toBe(3);
    expect(suivreChemin(body, 'links.prev')).toBeUndefined();
    expect(suivreChemin(body, 'paging.count')).toBeUndefined();
    expect(suivreChemin(null, 'a.b')).toBeUndefined();
  });
});

describe('estUrlBrute', () => {
  it('distingue une URL nue d’un jeu Opendatasoft', () => {
    expect(estUrlBrute({ url: 'https://exemple.invalid/x' })).toBe(true);
    expect(estUrlBrute({ baseUrl: 'https://portail.invalid', dataset: 'jeu' })).toBe(false);
  });

  it('laisse `exportUrl` inchangé pour un jeu Opendatasoft', () => {
    expect(
      exportUrl({ baseUrl: 'https://portail.invalid', dataset: 'jeu', where: "a = 'b'" })
    ).toBe(
      'https://portail.invalid/api/explore/v2.1/catalog/datasets/jeu/exports/json?where=a+%3D+%27b%27'
    );
  });
});

describe('fetchUrlRows', () => {
  it('lit un tableau nu à la racine', async () => {
    reseau({ 'https://exemple.invalid/nu': [{ a: 1 }, { a: 2 }] });
    await expect(fetchUrlRows({ url: 'https://exemple.invalid/nu' })).resolves.toEqual([
      { a: 1 },
      { a: 2 },
    ]);
  });

  it('suit `links.next` de Tabular jusqu’à la dernière page', async () => {
    const p1 = 'https://tabular.invalid/data/?page=1';
    const p2 = 'https://tabular.invalid/data/?page=2';
    const vues = reseau({
      [p1]: { data: [{ n: 1 }, { n: 2 }], links: { next: p2 }, meta: { total: 3 } },
      [p2]: { data: [{ n: 3 }], links: { next: null }, meta: { total: 3 } },
    });
    const lignes = await fetchUrlRows({ url: p1, rowsPath: 'data', nextPath: 'links.next' });
    expect(lignes).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    expect(vues).toEqual([p1, p2]);
  });

  it('résout une page suivante RELATIVE contre la page courante', async () => {
    const p1 = 'https://melodi.invalid/data/JEU?page=1';
    const vues = reseau({
      [p1]: { observations: [{ v: 1 }], paging: { next: '/data/JEU?page=2' } },
      'https://melodi.invalid/data/JEU?page=2': { observations: [{ v: 2 }], paging: {} },
    });
    const lignes = await fetchUrlRows({
      url: p1,
      rowsPath: 'observations',
      nextPath: 'paging.next',
    });
    expect(lignes).toEqual([{ v: 1 }, { v: 2 }]);
    expect(vues[1]).toBe('https://melodi.invalid/data/JEU?page=2');
  });

  it('s’arrête au plafond de pages plutôt que de boucler', async () => {
    const boucle = 'https://boucle.invalid/p';
    const vues = reseau({ [boucle]: { data: [{ n: 0 }], links: { next: boucle } } });
    const lignes = await fetchUrlRows({
      url: boucle,
      rowsPath: 'data',
      nextPath: 'links.next',
      maxPages: 3,
    });
    expect(lignes).toHaveLength(3);
    expect(vues).toHaveLength(3);
  });

  it('refuse une réponse sans tableau au chemin annoncé', async () => {
    reseau({ 'https://exemple.invalid/x': { data: { pas: 'un tableau' } } });
    await expect(
      fetchUrlRows({ url: 'https://exemple.invalid/x', rowsPath: 'data' })
    ).rejects.toThrow(/pas de tableau en « data »/);
  });

  it('refuse un HTTP non ok plutôt que de rendre zéro ligne', async () => {
    reseau({});
    await expect(fetchUrlRows({ url: 'https://exemple.invalid/absent' })).rejects.toThrow(
      /HTTP 404/
    );
  });
});

describe('resoudreFeed', () => {
  it('rend les fixtures telles quelles, sans réseau', async () => {
    globalThis.fetch = (() => {
      throw new Error('le mode déterministe ne doit appeler personne');
    }) as unknown as typeof fetch;
    const datasets = { main: [{ a: 1 }] };
    await expect(resoudreFeed({ kind: 'fixture', datasets })).resolves.toBe(datasets);
  });

  it('range les lignes d’une URL brute sous le jeu principal', async () => {
    reseau({ 'https://exemple.invalid/nu': [{ a: 1 }] });
    await expect(
      resoudreFeed({ kind: 'raw', source: { url: 'https://exemple.invalid/nu' } })
    ).resolves.toEqual({ main: [{ a: 1 }] });
  });
});
