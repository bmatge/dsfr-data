import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

/**
 * #651 — montage d'une carte DSFR Chart avec le VRAI custom element
 * `<map-chart>` (@gouvfr/dsfr-chart, Vue `defineCustomElement`).
 *
 * `mounted()` → `createChart()` → `JSON.parse(this.data)` : quand `data`
 * n'etait posee qu'en differe (+500 ms), chaque montage de carte loggait
 * « Erreur lors du parsing des données data ». `data` est une prop
 * `required` sans defaut : Vue ne l'ecrase pas, elle peut etre posee
 * immediatement (et rester dans les differes).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataChart } from '@/components/dsfr-data-chart.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';

describe('#651 — carte DSFR Chart montee sans console.error', () => {
  let errorSpy: MockInstance<typeof console.error>;

  beforeEach(async () => {
    clearDataCache('map-mount-src');
    // Charge le composant Vue reel (enregistre `map-chart`)
    await import('@gouvfr/dsfr-chart/MapChart');
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('temoin : un <map-chart> nu sans data reproduit le console.error de DSFR Chart', async () => {
    const raw = document.createElement('map-chart');
    raw.setAttribute('level', 'dep');
    document.body.appendChild(raw);
    await new Promise((r) => setTimeout(r, 20));
    expect(errorSpy.mock.calls.some((c) => String(c[0]).includes('Erreur lors du parsing'))).toBe(
      true
    );
    raw.remove();
  });

  it('type="map" : data posee au montage, aucun console.error', async () => {
    const chart = new DsfrDataChart();
    chart.source = 'map-mount-src';
    chart.type = 'map';
    chart.codeField = 'dept';
    chart.valueField = 'v';
    document.body.appendChild(chart);
    await chart.updateComplete;

    dispatchDataLoaded('map-mount-src', [
      { dept: '75', v: 10 },
      { dept: '13', v: 20 },
    ]);
    await chart.updateComplete;
    await new Promise((r) => setTimeout(r, 20));

    const mapEl = chart.querySelector('map-chart');
    expect(mapEl).not.toBeNull();
    expect(JSON.parse(mapEl!.getAttribute('data') || '{}')).toEqual({ '75': 10, '13': 20 });
    expect(mapEl!.getAttribute('level')).toBe('dep');
    expect(errorSpy).not.toHaveBeenCalled();

    chart.remove();
  });
});
