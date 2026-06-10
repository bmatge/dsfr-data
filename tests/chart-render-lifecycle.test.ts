import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests traversants #305 (EPIC G) — cycle de rendu de dsfr-data-chart.
 *
 * Bugs d'origine : remontage complet du composant Vue à chaque update
 * (perte d'état d'animation, remount périodique avec refresh) ;
 * setTimeout(500) jamais annulés au disconnect, empilés à chaque
 * onSourceData ; `value-fields` sans `value-field` incluait '' → première
 * série à zéro + nom vide dans la légende ; chart-data.ts code mort ;
 * date du jour présentée comme date de la donnée sur les cartes.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataChart } from '@/components/dsfr-data-chart.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('#305 — AC : update de données sans remount Vue', () => {
  beforeEach(() => clearDataCache('g6-src'));

  it('le même élément chart est réutilisé quand le type ne change pas', async () => {
    const chart = new DsfrDataChart();
    chart.source = 'g6-src';
    chart.type = 'bar';
    chart.labelField = 'r';
    chart.valueField = 'v';
    document.body.appendChild(chart);
    await chart.updateComplete;

    dispatchDataLoaded('g6-src', [{ r: 'A', v: 1 }]);
    await chart.updateComplete;
    const first = chart.querySelector('bar-chart');
    expect(first).not.toBeNull();

    dispatchDataLoaded('g6-src', [
      { r: 'A', v: 1 },
      { r: 'B', v: 2 },
    ]);
    await chart.updateComplete;
    const second = chart.querySelector('bar-chart');

    // MÊME élément DOM (mise à jour incrémentale), attributs rafraîchis
    expect(second).toBe(first);
    expect(second!.getAttribute('x')).toContain('B');

    chart.remove();
  });

  it('le changement de type recrée l’élément (seul cas de remount)', async () => {
    const chart = new DsfrDataChart();
    chart.source = 'g6-src';
    chart.type = 'bar';
    chart.labelField = 'r';
    chart.valueField = 'v';
    document.body.appendChild(chart);
    await chart.updateComplete;
    dispatchDataLoaded('g6-src', [{ r: 'A', v: 1 }]);
    await chart.updateComplete;
    expect(chart.querySelector('bar-chart')).not.toBeNull();

    chart.type = 'line';
    await chart.updateComplete;
    expect(chart.querySelector('bar-chart')).toBeNull();
    expect(chart.querySelector('line-chart')).not.toBeNull();

    chart.remove();
  });
});

describe('#305 — AC : pas de timer résiduel après disconnect', () => {
  it('les timers différés sont annulés au disconnect', async () => {
    vi.useFakeTimers();
    clearDataCache('g6-timers');
    const chart = new DsfrDataChart();
    chart.source = 'g6-timers';
    chart.type = 'map'; // type à attributs différés
    chart.codeField = 'dept';
    chart.valueField = 'v';
    document.body.appendChild(chart);
    dispatchDataLoaded('g6-timers', [{ dept: '75', v: 1 }]);
    await chart.updateComplete;

    expect((chart as any)._pendingTimers.size).toBeGreaterThan(0);

    chart.remove();
    expect((chart as any)._pendingTimers.size).toBe(0);

    // Aucun timer ne se réveille après le disconnect
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
  });
});

describe('#305 — AC : value-fields seul rend N séries propres', () => {
  it("plus de série fantôme '' en tête", () => {
    const chart = new DsfrDataChart();
    chart.valueFields = 'a, b';
    expect((chart as any)._getAllValueFields()).toEqual(['a', 'b']);
  });

  it('value-field + value-fields : cumul ordonné', () => {
    const chart = new DsfrDataChart();
    chart.valueField = 'main';
    chart.valueFields = 'a, b';
    expect((chart as any)._getAllValueFields()).toEqual(['main', 'a', 'b']);
  });
});

describe('#305 — chart-data.ts supprimé (code mort)', () => {
  it("le module n'existe plus dans utils/", () => {
    const utils = readdirSync(join(__dirname, '../packages/core/src/utils'));
    expect(utils).not.toContain('chart-data.ts');
  });
});
