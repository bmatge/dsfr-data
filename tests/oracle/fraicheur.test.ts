import { describe, it, expect, afterEach } from 'vitest';

import {
  empreinteLignes,
  lireDataProcessed,
  prendreEmpreinte,
  urlMetadonnees,
  verdictFraicheur,
  viderFraicheur,
} from '../../tools/oracle/fraicheur.js';

/**
 * Le verdict d'une nuit rouge (#884), éprouvé hors ligne : l'empreinte d'un
 * jeu, la date de traitement lue au catalogue (une fois par jeu et par run,
 * `null` sans catalogue ou sans réponse — jamais inventée), et les trois
 * verdicts.
 */

const vraiFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = vraiFetch;
  viderFraicheur();
});

describe('empreinteLignes', () => {
  it('change avec une cellule, pas avec l’identité des objets', () => {
    const a = empreinteLignes([{ x: 1 }, { x: 2 }]);
    expect(a).toBe(empreinteLignes([{ x: 1 }, { x: 2 }]));
    expect(a).not.toBe(empreinteLignes([{ x: 1 }, { x: 3 }]));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('urlMetadonnees', () => {
  it('trouve le catalogue d’un jeu ODS, depuis un jeu ou une URL d’export, et rien ailleurs', () => {
    expect(urlMetadonnees({ baseUrl: 'https://p.invalid', dataset: 'jeu' })).toBe(
      'https://p.invalid/api/explore/v2.1/catalog/datasets/jeu'
    );
    expect(
      urlMetadonnees({
        url: 'https://p.invalid/api/explore/v2.1/catalog/datasets/jeu/exports/json?select=a',
      })
    ).toBe('https://p.invalid/api/explore/v2.1/catalog/datasets/jeu');
    expect(
      urlMetadonnees({ url: 'https://tabular-api.data.gouv.fr/api/resources/x/data/' })
    ).toBeNull();
  });
});

describe('lireDataProcessed', () => {
  function reseau(reponses: Record<string, unknown>): string[] {
    const vues: string[] = [];
    globalThis.fetch = (async (entree: string | URL) => {
      const url = String(entree);
      vues.push(url);
      if (!(url in reponses)) return new Response('', { status: 404 });
      return new Response(JSON.stringify(reponses[url]), { status: 200 });
    }) as typeof fetch;
    return vues;
  }
  const CATALOGUE = 'https://p.invalid/api/explore/v2.1/catalog/datasets/jeu';

  it('lit metas.default.data_processed, une fois par jeu et par run', async () => {
    const vues = reseau({
      [CATALOGUE]: { metas: { default: { data_processed: '2026-09-18T03:00:00+00:00' } } },
    });
    const source = { baseUrl: 'https://p.invalid', dataset: 'jeu' };
    expect(await lireDataProcessed(source)).toBe('2026-09-18T03:00:00+00:00');
    expect(await lireDataProcessed(source)).toBe('2026-09-18T03:00:00+00:00');
    expect(vues).toHaveLength(1);
    const e = await prendreEmpreinte(source, [{ a: 1 }]);
    expect(e).toEqual({
      rows: 1,
      sha256: empreinteLignes([{ a: 1 }]),
      dataProcessed: '2026-09-18T03:00:00+00:00',
    });
  });

  it('rend null sans catalogue, sans réponse ou sans métadonnée — jamais une date inventée', async () => {
    reseau({ [CATALOGUE]: { metas: { default: {} } } });
    expect(await lireDataProcessed({ baseUrl: 'https://p.invalid', dataset: 'jeu' })).toBeNull();
    expect(await lireDataProcessed({ baseUrl: 'https://p.invalid', dataset: 'absent' })).toBeNull();
    expect(
      await lireDataProcessed({ url: 'https://tabular-api.data.gouv.fr/api/resources/x/data/' })
    ).toBeNull();
  });
});

describe('verdictFraicheur', () => {
  it('bibliothèque si la date n’a pas bougé, donnée si elle a bougé, indéterminé sans date', () => {
    expect(verdictFraicheur('2026-09-18', '2026-09-18')).toBe('bibliothèque');
    expect(verdictFraicheur('2026-09-18', '2026-09-19')).toBe('donnée');
    expect(verdictFraicheur(null, '2026-09-19')).toBe('indéterminé');
    expect(verdictFraicheur('2026-09-18', null)).toBe('indéterminé');
  });
});
