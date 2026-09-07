import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #603 — le bus publie ce qu'il faut pour diagnostiquer une chaine sans
 * ouvrir les DevTools.
 *
 * Trois ajouts, tous OPTIONNELS et non cassants :
 *   - `attemptedUrl` sur l'evenement d'erreur — l'URL reellement appelee,
 *     proxy applique. `fetch-diagnostics` la produit deja, mais uniquement
 *     dans la console (#598) : le message de l'`Error` reste volontairement
 *     court, et c'est ce champ qui rend l'information exploitable par le
 *     volet Diagnostic et par l'assistant.
 *   - `origin` sur les commandes remontantes — le bus est plat, sans lui une
 *     trace ne peut pas dire QUI a demande un group-by a la source.
 *   - `getDelegation()` sur dsfr-data-query — quelles operations tournent
 *     cote serveur et lesquelles sont retombees cote client.
 *
 * Le garde-fou central de ce fichier : le message de l'`Error` ne bouge pas.
 * Tout le contrat existant (templates de statut, abonnes) doit etre
 * strictement inchange.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import {
  DATA_EVENTS,
  dispatchDataError,
  dispatchSourceCommand,
  clearDataCache,
  clearDataMeta,
  type DataErrorEvent,
  type SourceCommandEvent,
} from '@/utils/data-bridge.js';

/**
 * Vues internes des composants (CLAUDE.md : pas de casts disperses).
 * Declarer le contrat qu'on inspecte, une fois, plutot que le re-affirmer
 * a chaque appel.
 */
interface SourceInternals {
  _fetchData(): Promise<void>;
}
interface QueryInternals {
  _sendDelegationClears(
    targetId: string,
    delegated: { groupBy: boolean; aggregate: boolean; orderBy: boolean; where: boolean }
  ): void;
  _serverDelegated: { groupBy: boolean; aggregate: boolean; orderBy: boolean; where: boolean };
}

const asSource = (el: DsfrDataSource): SourceInternals => el as unknown as SourceInternals;
const asQuery = (el: DsfrDataQuery): QueryInternals => el as unknown as QueryInternals;

/** Le rejet generique d'un fetch bloque par CORS (cf. #598). */
function corsFailure(): TypeError {
  return new TypeError('NetworkError when attempting to fetch resource.');
}

/** Capture le dernier detail recu pour un evenement du bus. */
function captureDetail<T>(eventName: string): { last: () => T | undefined; stop: () => void } {
  let last: T | undefined;
  const handler = (e: Event) => {
    last = (e as CustomEvent<T>).detail;
  };
  document.addEventListener(eventName, handler);
  return {
    last: () => last,
    stop: () => document.removeEventListener(eventName, handler),
  };
}

describe('bus de diagnostic (#603)', () => {
  describe('attemptedUrl sur l’événement d’erreur', () => {
    it('transporte l’URL quand elle est fournie', () => {
      const cap = captureDetail<DataErrorEvent>(DATA_EVENTS.ERROR);

      dispatchDataError('src', new Error('boom'), 'https://api.example.com/data?page=2');

      expect(cap.last()?.attemptedUrl).toBe('https://api.example.com/data?page=2');
      cap.stop();
    });

    it('n’ajoute pas la clé quand l’URL est absente', () => {
      const cap = captureDetail<DataErrorEvent>(DATA_EVENTS.ERROR);

      dispatchDataError('src', new Error('boom'));

      // Pas juste `undefined` : la clé ne doit pas exister du tout, pour que
      // les consommateurs puissent distinguer « pas de fetch » de « URL
      // inconnue ».
      expect(cap.last()).not.toHaveProperty('attemptedUrl');
      cap.stop();
    });

    it('laisse le message de l’Error strictement inchangé', () => {
      const cap = captureDetail<DataErrorEvent>(DATA_EVENTS.ERROR);
      const original = new Error('HTTP 400: Bad Request');

      dispatchDataError('src', original, 'https://api.example.com/data');

      expect(cap.last()?.error).toBe(original);
      expect(cap.last()?.error.message).toBe('HTTP 400: Bad Request');
      cap.stop();
    });
  });

  describe('dsfr-data-source publie l’URL réellement appelée', () => {
    let source: DsfrDataSource;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      clearDataCache('test-source');
      clearDataMeta('test-source');
      mockFetch.mockReset();
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      source = new DsfrDataSource();
      source.id = 'test-source';
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    it('mode URL : l’URL part sur le bus, pas seulement dans la console', async () => {
      const cap = captureDetail<DataErrorEvent>(DATA_EVENTS.ERROR);
      mockFetch.mockRejectedValueOnce(corsFailure());
      source.url = 'https://api.example.com/data';

      await asSource(source)._fetchData();

      expect(cap.last()?.attemptedUrl).toBe('https://api.example.com/data');
      cap.stop();
    });

    it('mode adapter : l’URL construite par l’adapter part sur le bus', async () => {
      const cap = captureDetail<DataErrorEvent>(DATA_EVENTS.ERROR);
      mockFetch.mockRejectedValue(corsFailure());

      source.apiType = 'tabular';
      source.baseUrl = 'https://tabular-api.data.gouv.fr';
      source.resource = 'resource-456';
      source.groupBy = 'region';

      await asSource(source)._fetchData();

      const url = cap.last()?.attemptedUrl ?? '';
      expect(url).toContain('/api/resources/resource-456/data/');
      expect(url).toContain('region__groupby');
      cap.stop();
    });

    it('l’URL sur le bus est la MÊME que celle du log console', async () => {
      const cap = captureDetail<DataErrorEvent>(DATA_EVENTS.ERROR);
      mockFetch.mockRejectedValueOnce(corsFailure());
      source.url = 'https://api.example.com/data';

      await asSource(source)._fetchData();

      // Le diagnostic console (3e argument de logFetchError) doit citer
      // exactement l'URL publiee : deux sources de verite divergentes
      // rendraient le volet trompeur.
      const [, , diagnostic] = errorSpy.mock.calls[0] as unknown[];
      expect(String(diagnostic)).toContain(cap.last()?.attemptedUrl ?? '__absent__');
      cap.stop();
    });

    it('une erreur HTTP explicite publie aussi son URL', async () => {
      const cap = captureDetail<DataErrorEvent>(DATA_EVENTS.ERROR);
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400, statusText: 'Bad Request' });
      source.url = 'https://api.example.com/data';

      await asSource(source)._fetchData();

      expect(cap.last()?.error.message).toBe('HTTP 400: Bad Request');
      expect(cap.last()?.attemptedUrl).toBe('https://api.example.com/data');
      cap.stop();
    });
  });

  describe('origin sur les commandes remontantes', () => {
    it('un dispatch direct reste sans origin', () => {
      const cap = captureDetail<SourceCommandEvent>(DATA_EVENTS.SOURCE_COMMAND);

      dispatchSourceCommand('src', { page: 2 });

      expect(cap.last()?.origin).toBeUndefined();
      cap.stop();
    });

    it('dsfr-data-query nomme son id en délégant au serveur', () => {
      const cap = captureDetail<SourceCommandEvent>(DATA_EVENTS.SOURCE_COMMAND);
      const query = new DsfrDataQuery();
      query.id = 'q1';
      query.source = 'src';

      asQuery(query)._sendDelegationClears('src', {
        groupBy: true,
        aggregate: false,
        orderBy: false,
        where: false,
      });

      expect(cap.last()?.sourceId).toBe('src');
      expect(cap.last()?.origin).toBe('q1');
      cap.stop();
    });
  });

  describe('getDelegation() sur dsfr-data-query', () => {
    it('expose l’état de délégation, à false par défaut', () => {
      const query = new DsfrDataQuery();

      expect(query.getDelegation()).toEqual({
        groupBy: false,
        aggregate: false,
        orderBy: false,
        where: false,
      });
    });

    it('reflète la délégation négociée', () => {
      const query = new DsfrDataQuery();
      (query as unknown as { _serverDelegated: Record<string, boolean> })._serverDelegated.groupBy =
        true;

      expect(query.getDelegation().groupBy).toBe(true);
    });

    it('rend une copie : muter le résultat ne touche pas l’état interne', () => {
      const query = new DsfrDataQuery();

      const snapshot = query.getDelegation();
      snapshot.groupBy = true;

      expect(query.getDelegation().groupBy).toBe(false);
    });
  });
});
