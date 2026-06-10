import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests traversants #304 (EPIC G) — contrôleur de pagination partagé
 * list/display.
 *
 * Bugs d'origine : ~150 lignes copiées-collées avec dérives — `?page=3`
 * ignoré en pagination cliente (écrasé par le reset à 1 à l'arrivée des
 * données), tri serveur sans reset de page, recherche/filtres locaux
 * opérant sur la seule page chargée en mode serveur (compteurs faux),
 * `$index` faux en pagination serveur, pagination serveur masquée sans
 * attribut `pagination` redondant, ids DOM dupliqués entre instances.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataList } from '@/components/dsfr-data-list.js';
import { DsfrDataDisplay } from '@/components/dsfr-data-display.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  setDataMeta,
  subscribeToSourceCommands,
} from '@/utils/data-bridge.js';

const ROWS = Array.from({ length: 50 }, (_, i) => ({ nom: `item-${i}`, v: i }));

afterEach(() => {
  window.history.replaceState(null, '', window.location.pathname);
});

describe('#304 — AC : ?page=3 respecté dans les deux modes', () => {
  beforeEach(() => {
    clearDataCache('g5-src');
    clearDataMeta('g5-src');
  });

  it('pagination CLIENTE : la page URL survit à l’arrivée des données', async () => {
    window.history.replaceState(null, '', '?page=3');
    const list = new DsfrDataList();
    list.source = 'g5-src';
    list.colonnes = 'nom:Nom';
    list.pagination = 10;
    list.urlSync = true;
    document.body.appendChild(list);
    await list.updateComplete;
    expect((list as any)._currentPage).toBe(3);

    // Avant le fix : l'arrivée des données écrasait la page restaurée → 1
    dispatchDataLoaded('g5-src', ROWS);
    await list.updateComplete;

    expect((list as any)._currentPage).toBe(3);
    // Les arrivées SUIVANTES reprennent le comportement normal (reset 1)
    dispatchDataLoaded('g5-src', ROWS.slice(0, 30));
    expect((list as any)._currentPage).toBe(1);

    list.remove();
  });

  it('pagination SERVEUR : la commande page part à la source au connect', async () => {
    window.history.replaceState(null, '', '?page=3');
    const commands: Array<Record<string, unknown>> = [];
    const unsub = subscribeToSourceCommands('g5-src', (cmd) =>
      commands.push(cmd as Record<string, unknown>)
    );

    const display = new DsfrDataDisplay();
    display.source = 'g5-src';
    display.urlSync = true;
    document.body.appendChild(display);
    await display.updateComplete;

    expect(commands.some((c) => c.page === 3)).toBe(true);

    unsub();
    display.remove();
  });
});

describe('#304 — AC : tri serveur revient page 1', () => {
  it('la commande orderBy embarque page: 1 (un seul refetch)', async () => {
    clearDataCache('g5-sort');
    clearDataMeta('g5-sort');
    const commands: Array<Record<string, unknown>> = [];
    const unsub = subscribeToSourceCommands('g5-sort', (cmd) =>
      commands.push(cmd as Record<string, unknown>)
    );

    const list = new DsfrDataList();
    list.source = 'g5-sort';
    list.colonnes = 'nom:Nom';
    (list as any).serverTri = true;
    document.body.appendChild(list);
    await list.updateComplete;

    // En page 5 d'une pagination serveur
    setDataMeta('g5-sort', { page: 5, pageSize: 10, total: 100, serverSide: true });
    dispatchDataLoaded('g5-sort', ROWS.slice(0, 10));
    expect((list as any)._currentPage).toBe(5);

    (list as any)._handleSort('nom');

    const sortCmd = commands.find((c) => c.orderBy);
    expect(sortCmd).toBeDefined();
    expect(sortCmd!.page).toBe(1);
    expect((list as any)._currentPage).toBe(1);

    unsub();
    list.remove();
  });
});

describe('#304 — AC : compteurs exacts (recherche/filtres locaux désactivés en serveur)', () => {
  it('la recherche locale est désactivée avec warning en pagination serveur', async () => {
    clearDataCache('g5-counters');
    clearDataMeta('g5-counters');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const list = new DsfrDataList();
    list.source = 'g5-counters';
    list.colonnes = 'nom:Nom';
    (list as any).recherche = true;
    document.body.appendChild(list);
    await list.updateComplete;

    setDataMeta('g5-counters', { page: 1, pageSize: 10, total: 100, serverSide: true });
    dispatchDataLoaded('g5-counters', ROWS.slice(0, 10));
    await list.updateComplete;

    expect(list.querySelector('.fr-search-bar')).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('pagination serveur'));

    warnSpy.mockRestore();
    list.remove();
  });

  it('la pagination serveur s’affiche SANS attribut pagination redondant', async () => {
    clearDataCache('g5-gate');
    clearDataMeta('g5-gate');
    const list = new DsfrDataList();
    list.source = 'g5-gate';
    list.colonnes = 'nom:Nom';
    // PAS d'attribut pagination
    document.body.appendChild(list);
    await list.updateComplete;

    setDataMeta('g5-gate', { page: 1, pageSize: 10, total: 100, serverSide: true });
    dispatchDataLoaded('g5-gate', ROWS.slice(0, 10));
    await list.updateComplete;

    expect(list.querySelector('.fr-pagination')).not.toBeNull();
    list.remove();
  });
});

describe('#304 — $index exact en pagination serveur + ids par instance', () => {
  it('$index utilise l’offset serveur (page 3 × 10 → 20..29)', async () => {
    clearDataCache('g5-idx');
    clearDataMeta('g5-idx');
    const display = new DsfrDataDisplay();
    display.source = 'g5-idx';
    const tpl = document.createElement('template');
    tpl.innerHTML = '<p>n°{{$index}}</p>';
    display.appendChild(tpl);
    document.body.appendChild(display);
    await display.updateComplete;

    setDataMeta('g5-idx', { page: 3, pageSize: 10, total: 100, serverSide: true });
    dispatchDataLoaded('g5-idx', ROWS.slice(20, 30));
    await display.updateComplete;

    expect(display.innerHTML).toContain('n°20');
    expect(display.innerHTML).not.toContain('n°0<');

    display.remove();
  });

  it('deux displays ont des $uid distincts pour le même item', () => {
    const a = new DsfrDataDisplay();
    const b = new DsfrDataDisplay();
    expect((a as any)._getItemUid({ x: 1 }, 0)).not.toBe((b as any)._getItemUid({ x: 1 }, 0));
  });
});
