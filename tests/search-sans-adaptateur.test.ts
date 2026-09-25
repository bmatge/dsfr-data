import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #1139 — `dsfr-data-search server-search` sans adaptateur amont.
 *
 * Avant : `whereFormat ?? 'odsql'` supposait le dialecte d'un fournisseur
 * quand la source n'exposait aucun adaptateur (source en mode URL). La
 * clause ODSQL partait à une source qui la refuse (#288) et la recherche se
 * perdait. Désormais : aucun dialecte supposé, repli local signalé, comme
 * pour une clause que l'adaptateur ne sait pas transmettre (#1026).
 */

import { DsfrDataSearch } from '@/components/dsfr-data-search.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  getDataCache,
  subscribeToSourceCommands,
} from '@/utils/data-bridge.js';

interface SearchInternals {
  _term: string;
  _applyFilter(): void;
}

const ROWS = [{ nom: 'Paris' }, { nom: 'Lyon' }, { nom: 'Pau' }];

let search: DsfrDataSearch;
let sourceEl: HTMLElement;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  clearDataCache('url-src');
  clearDataMeta('url-src');
  clearDataCache('recherche');
  sourceEl = document.createElement('div');
  sourceEl.id = 'url-src';
  // Source en mode URL : getAdapter() rend null
  Object.assign(sourceEl, { getAdapter: () => null });
  document.body.appendChild(sourceEl);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

  search = new DsfrDataSearch();
  search.id = 'recherche';
  search.source = 'url-src';
  search.fields = 'nom';
  search.serverSearch = true;
  search.searchTemplate = 'nom:contains:{q}';
});

afterEach(() => {
  (search as unknown as { _cleanup?: () => void })._cleanup?.();
  sourceEl.remove();
  warn.mockRestore();
});

describe('#1139 — server-search sans adaptateur : repli local, aucun dialecte supposé', () => {
  it('aucune clause ne part au serveur, le terme filtre les lignes reçues', () => {
    const wheres: string[] = [];
    const unsub = subscribeToSourceCommands('url-src', (cmd) => {
      if (cmd.where !== undefined) wheres.push(cmd.where);
    });

    search.connectedCallback();
    dispatchDataLoaded('url-src', ROWS);
    (search as unknown as SearchInternals)._term = 'pa';
    (search as unknown as SearchInternals)._applyFilter();
    unsub();

    // Seule la levée de la clause part (where vide) : jamais un search("pa") ODSQL
    expect(wheres.every((w) => w === '')).toBe(true);
    expect(getDataCache('recherche')).toEqual([{ nom: 'Paris' }, { nom: 'Pau' }]);
    expect(
      warn.mock.calls.some((c: unknown[]) => String(c[0]).includes("n'a pas d'adaptateur"))
    ).toBe(true);
  });
});
