import { describe, it, expect, afterEach } from 'vitest';
import { DsfrDataSearch } from '@/components/dsfr-data-search.js';
import { DsfrDataJoin } from '@/components/dsfr-data-join.js';
import {
  dispatchSourceCommand,
  subscribeToSourceCommands,
  dispatchDataLoaded,
  clearDataCache,
} from '@/utils/data-bridge.js';

/**
 * AC de #272 (A4) : un dsfr-data-list paginé derrière un search ou un join
 * dispatche ses commandes (page, where, orderBy) vers l'id de l'intermédiaire —
 * elles doivent être relayées vers la source amont (la gauche pour join).
 */
describe('relais des commandes amont (#272)', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    cleanups.splice(0).forEach((fn) => fn());
    for (const id of ['relay-src', 'relay-left', 'relay-right']) {
      clearDataCache(id);
    }
  });

  it('search relaie page/where/orderBy vers sa source', () => {
    const received: unknown[] = [];
    cleanups.push(subscribeToSourceCommands('relay-src', (cmd) => received.push(cmd)));

    const search = new DsfrDataSearch();
    search.id = 'relay-search';
    search.source = 'relay-src';
    search.connectedCallback();
    cleanups.push(() => search.disconnectedCallback());

    dispatchSourceCommand('relay-search', { page: 3 });
    dispatchSourceCommand('relay-search', { orderBy: 'nom:desc' });
    dispatchSourceCommand('relay-search', { where: 'a:eq:1', whereKey: 'facets-1' });

    expect(received).toHaveLength(3);
    expect(received[0]).toMatchObject({ page: 3 });
    expect(received[1]).toMatchObject({ orderBy: 'nom:desc' });
    expect(received[2]).toMatchObject({ where: 'a:eq:1', whereKey: 'facets-1' });
  });

  it('search ne relaie plus après déconnexion (pas de fuite)', () => {
    const received: unknown[] = [];
    cleanups.push(subscribeToSourceCommands('relay-src', (cmd) => received.push(cmd)));

    const search = new DsfrDataSearch();
    search.id = 'relay-search-2';
    search.source = 'relay-src';
    search.connectedCallback();
    search.disconnectedCallback();

    dispatchSourceCommand('relay-search-2', { page: 2 });
    expect(received).toHaveLength(0);
  });

  it('join relaie les commandes vers la source gauche uniquement', () => {
    const leftReceived: unknown[] = [];
    const rightReceived: unknown[] = [];
    cleanups.push(subscribeToSourceCommands('relay-left', (cmd) => leftReceived.push(cmd)));
    cleanups.push(subscribeToSourceCommands('relay-right', (cmd) => rightReceived.push(cmd)));

    dispatchDataLoaded('relay-left', [{ k: 1, a: 'x' }]);
    dispatchDataLoaded('relay-right', [{ k: 1, b: 'y' }]);

    const join = new DsfrDataJoin();
    join.id = 'relay-join';
    join.left = 'relay-left';
    join.right = 'relay-right';
    join.on = 'k';
    // L'init de join passe par le cycle Lit (willUpdate) — appel direct ici
    join.reinitTransformer();
    cleanups.push(() => join.disconnectedCallback());

    dispatchSourceCommand('relay-join', { page: 2 });
    dispatchSourceCommand('relay-join', { where: 'a:eq:1', whereKey: 'f1' });

    expect(leftReceived).toHaveLength(2);
    expect(leftReceived[0]).toMatchObject({ page: 2 });
    // La source droite est une table de référence : jamais paginée/filtrée
    expect(rightReceived).toHaveLength(0);
  });
});
