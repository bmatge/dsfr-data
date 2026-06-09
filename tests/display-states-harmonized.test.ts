import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests traversants #284 (EPIC C) — états loading/error harmonisés sur les
 * composants d'affichage.
 *
 * Bugs d'origine : quatre comportements pour la même erreur — list/chart
 * affichaient error.message, display un texte générique sans message,
 * kpi/podium un libellé sans message ni role="alert". display n'avait pas le
 * revert de page sur erreur que list implémente. Le mixin ne purgeait pas
 * _sourceData/_sourceError quand `source` changeait vers une source sans
 * cache (affichage périmé sans indicateur).
 *
 * AC : même UX d'erreur sur les 6 composants d'affichage ; changer `source`
 * vers une source vide n'affiche pas les anciennes données.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataList } from '@/components/dsfr-data-list.js';
import { DsfrDataChart } from '@/components/dsfr-data-chart.js';
import { DsfrDataDisplay } from '@/components/dsfr-data-display.js';
import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';
import { DsfrDataPodium } from '@/components/dsfr-data-podium.js';
import { DsfrDataWorldMap } from '@/components/dsfr-data-world-map.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  dispatchDataError,
  dispatchDataLoading,
  setDataMeta,
  subscribeToSourceCommands,
} from '@/utils/data-bridge.js';

const SRC = 'c5-src';

const DISPLAY_COMPONENTS: Array<[string, () => HTMLElement]> = [
  ['dsfr-data-list', () => new DsfrDataList()],
  ['dsfr-data-chart', () => new DsfrDataChart()],
  ['dsfr-data-display', () => new DsfrDataDisplay()],
  ['dsfr-data-kpi', () => new DsfrDataKpi()],
  ['dsfr-data-podium', () => new DsfrDataPodium()],
  ['dsfr-data-world-map', () => new DsfrDataWorldMap()],
];

describe('#284 — AC : même UX d’erreur sur les 6 composants d’affichage', () => {
  beforeEach(() => {
    clearDataCache(SRC);
    clearDataMeta(SRC);
  });

  for (const [tag, build] of DISPLAY_COMPONENTS) {
    it(`${tag} : role="alert" + message de l'erreur affiché`, async () => {
      const el = build() as HTMLElement & { source: string; updateComplete: Promise<boolean> };
      el.source = SRC;
      document.body.appendChild(el);
      await el.updateComplete;

      dispatchDataError(SRC, new Error('quota API dépassé'));
      await el.updateComplete;

      const alert = el.querySelector(`.${tag}__error`);
      expect(alert, `${tag} doit rendre .${tag}__error`).not.toBeNull();
      expect(alert!.getAttribute('role'), `${tag} role=alert`).toBe('alert');
      expect(alert!.textContent, `${tag} message inclus`).toContain('quota API dépassé');
      expect(alert!.classList.contains('dsfr-data-status--error')).toBe(true);

      el.remove();
    });

    it(`${tag} : état de chargement avec aria-busy`, async () => {
      const el = build() as HTMLElement & { source: string; updateComplete: Promise<boolean> };
      el.source = SRC;
      document.body.appendChild(el);
      await el.updateComplete;

      dispatchDataLoading(SRC);
      await el.updateComplete;

      const loading = el.querySelector(`.${tag}__loading`);
      expect(loading, `${tag} doit rendre .${tag}__loading`).not.toBeNull();
      expect(loading!.getAttribute('aria-busy')).toBe('true');

      el.remove();
    });
  }
});

describe('#284 — AC : changer source vers une source vide purge l’affichage', () => {
  beforeEach(() => {
    clearDataCache(SRC);
    clearDataMeta(SRC);
    clearDataCache('c5-src-vide');
    clearDataMeta('c5-src-vide');
  });

  it('list : les lignes de l’ancienne source disparaissent', async () => {
    const el = new DsfrDataList();
    el.source = SRC;
    el.colonnes = 'ville:Ville, population:Population';
    document.body.appendChild(el);
    await el.updateComplete;

    dispatchDataLoaded(SRC, [
      { ville: 'Paris', population: 2000000 },
      { ville: 'Lyon', population: 500000 },
    ]);
    await el.updateComplete;
    expect(el.textContent).toContain('Paris');

    el.source = 'c5-src-vide';
    await el.updateComplete;

    expect(el.textContent).not.toContain('Paris');
    expect((el as any)._data).toEqual([]);

    el.remove();
  });

  it('kpi : la valeur de l’ancienne source disparaît', async () => {
    const el = new DsfrDataKpi();
    el.source = SRC;
    (el as unknown as { valeur: string }).valeur = 'population:sum';
    document.body.appendChild(el);
    await el.updateComplete;

    dispatchDataLoaded(SRC, [{ population: 1234 }]);
    await el.updateComplete;
    expect((el as any)._sourceData).not.toBeNull();

    el.source = 'c5-src-vide';
    await el.updateComplete;

    expect((el as any)._sourceData).toBeNull();
    expect(el.textContent).not.toContain('1234');

    el.remove();
  });

  it("l'erreur de l'ancienne source est purgée aussi", async () => {
    const el = new DsfrDataPodium();
    el.source = SRC;
    document.body.appendChild(el);
    await el.updateComplete;

    dispatchDataError(SRC, new Error('panne'));
    await el.updateComplete;
    expect(el.querySelector('.dsfr-data-podium__error')).not.toBeNull();

    el.source = 'c5-src-vide';
    await el.updateComplete;

    expect(el.querySelector('.dsfr-data-podium__error')).toBeNull();

    el.remove();
  });
});

describe('#284 — display : revert de page sur erreur (même contrat que list)', () => {
  beforeEach(() => {
    clearDataCache(SRC);
    clearDataMeta(SRC);
  });

  it('un échec de fetch après un changement de page revient à la page précédente', async () => {
    const el = new DsfrDataDisplay();
    el.source = SRC;
    (el as unknown as { pagination: number }).pagination = 2;
    document.body.appendChild(el);
    await el.updateComplete;

    // Pagination serveur active (meta #270)
    setDataMeta(SRC, { page: 1, pageSize: 2, total: 100, serverSide: true });
    dispatchDataLoaded(SRC, [{ nom: 'a' }, { nom: 'b' }]);
    await el.updateComplete;
    expect((el as any)._serverPagination).toBe(true);
    expect((el as any)._currentPage).toBe(1);

    // Changement de page optimiste → commande envoyée
    const commands: unknown[] = [];
    const unsub = subscribeToSourceCommands(SRC, (cmd) => commands.push(cmd));
    (el as any)._handlePageChange(2);
    expect((el as any)._currentPage).toBe(2);
    expect(commands).toHaveLength(1);

    // Le fetch échoue (ex: limite d'offset API) → revert, données conservées
    dispatchDataError(SRC, new Error('offset trop grand'));
    await el.updateComplete;

    expect((el as any)._currentPage).toBe(1);
    expect((el as any)._data).toHaveLength(2);

    unsub();
    el.remove();
  });
});
