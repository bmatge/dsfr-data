import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * #598 — une réponse d'erreur HTTP sans en-tête CORS est indiscernable d'une
 * panne réseau côté client : `fetch` rejette avec un `TypeError` générique et
 * le corps de la réponse, qui porte le vrai diagnostic, est perdu.
 *
 * Cas d'origine (#596) : l'API Tabular répondait 400 « Malformed query » sans
 * `Access-Control-Allow-Origin`, la console n'affichait qu'un `NetworkError`.
 */

import {
  isOpaqueFetchFailure,
  describeFetchFailure,
  logFetchError,
  logFetchWarning,
} from '@/utils/fetch-diagnostics.js';

const TABULAR_URL =
  'https://tabular-api.data.gouv.fr/api/resources/abc/data/?page_size=50&region__groupby';

/** Le rejet générique d'un fetch bloqué par CORS. */
function networkError(): TypeError {
  return new TypeError('NetworkError when attempting to fetch resource.');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isOpaqueFetchFailure', () => {
  it('reconnaît le TypeError de fetch', () => {
    expect(isOpaqueFetchFailure(networkError())).toBe(true);
  });

  it('reconnaît un TypeError venant d’un autre realm (name, pas instanceof)', () => {
    // Un TypeError cross-realm échoue au `instanceof` : on teste `name`.
    const foreign = Object.assign(new Error('boom'), { name: 'TypeError' });
    expect(isOpaqueFetchFailure(foreign)).toBe(true);
  });

  it('ignore une erreur HTTP explicite — son message porte déjà le statut', () => {
    expect(isOpaqueFetchFailure(new Error('HTTP 400: Bad Request'))).toBe(false);
  });

  it('ignore un abort et les valeurs non-Error', () => {
    expect(isOpaqueFetchFailure(Object.assign(new Error(), { name: 'AbortError' }))).toBe(false);
    expect(isOpaqueFetchFailure(undefined)).toBe(false);
    expect(isOpaqueFetchFailure('boom')).toBe(false);
  });
});

describe('describeFetchFailure', () => {
  it('nomme l’URL appelée et propose la commande curl correspondante', () => {
    const out = describeFetchFailure(networkError(), TABULAR_URL);
    expect(out).toContain(`URL appelée : ${TABULAR_URL}`);
    expect(out).toContain(`curl -i "${TABULAR_URL}"`);
  });

  it('explique les deux causes possibles et cite l’en-tête manquant', () => {
    const out = describeFetchFailure(networkError(), TABULAR_URL);
    expect(out).toContain('Access-Control-Allow-Origin');
    expect(out).toContain('use-proxy');
  });

  it('reste exploitable sans URL', () => {
    const out = describeFetchFailure(networkError());
    expect(out).toContain('URL appelée : indisponible');
    expect(out).toContain('curl -i');
  });

  it('ne dit rien sur une erreur HTTP explicite', () => {
    expect(describeFetchFailure(new Error('HTTP 400: Bad Request'), TABULAR_URL)).toBe('');
  });
});

describe('logFetchError / logFetchWarning', () => {
  it('joint le diagnostic en 3e argument sur un échec opaque', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = networkError();
    logFetchError('dsfr-data-source[src]: Erreur de chargement', err, TABULAR_URL);

    expect(spy).toHaveBeenCalledTimes(1);
    const [prefix, logged, diagnostic] = spy.mock.calls[0];
    expect(prefix).toBe('dsfr-data-source[src]: Erreur de chargement');
    expect(logged).toBe(err);
    expect(String(diagnostic)).toContain(TABULAR_URL);
  });

  it('n’ajoute pas de 3e argument vide sur une erreur HTTP explicite', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logFetchError('prefix', new Error('HTTP 500: Server Error'), TABULAR_URL);
    expect(spy.mock.calls[0]).toHaveLength(2);
  });

  it('logFetchWarning passe par console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    logFetchWarning('dsfr-data-facets[f]: échec', networkError());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });
});
