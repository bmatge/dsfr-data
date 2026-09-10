import { describe, it, expect, beforeEach } from 'vitest';

/**
 * `heading-level` (#670) : niveau de titre HTML du titre de la DataBox
 * (RGAA 9.1). Transmis à DSFR Chart via sa prop `heading-level` (h1..h6),
 * borné à [2, 6], défaut 3 (rendu historique).
 */

import { DsfrDataChart } from '@/components/dsfr-data-chart.js';

/** Vue interne du composant : membres privés inspectés par ces tests. */
interface ChartInternals {
  _data: unknown[];
  _databoxHeadingLevel(): number;
  _createDataboxElement(tagName: string, attributes: Record<string, string>): HTMLElement;
}

function headingAttr(internals: ChartInternals): string | null {
  const wrapper = internals._createDataboxElement('bar-chart', { x: '[[]]', y: '[[]]' });
  return wrapper.querySelector('data-box')?.getAttribute('heading-level') ?? null;
}

describe('dsfr-data-chart — heading-level (#670)', () => {
  let chart: DsfrDataChart;
  let internals: ChartInternals;

  beforeEach(() => {
    chart = new DsfrDataChart();
    internals = chart as unknown as ChartInternals;
    chart.id = 'hl';
    chart.type = 'bar';
    chart.labelField = 'cat';
    chart.valueField = 'val';
    chart.databox = true;
    chart.databoxTitle = 'Titre';
    internals._data = [{ cat: 'A', val: 1 }];
  });

  it('défaut : h3 (rien ne casse)', () => {
    expect(chart.headingLevel).toBe(3);
    expect(headingAttr(internals)).toBe('h3');
  });

  it('heading-level="2" rend un h2 (critère #670)', () => {
    chart.setAttribute('heading-level', '2');
    expect(chart.headingLevel).toBe(2);
    expect(headingAttr(internals)).toBe('h2');
  });

  it('borné à [2, 6] : 1 → h2, 9 → h6', () => {
    chart.headingLevel = 1;
    expect(headingAttr(internals)).toBe('h2');
    chart.headingLevel = 9;
    expect(headingAttr(internals)).toBe('h6');
  });

  it('valeur invalide → défaut h3 ; décimale arrondie', () => {
    chart.headingLevel = Number.NaN;
    expect(internals._databoxHeadingLevel()).toBe(3);
    chart.headingLevel = 4.4;
    expect(internals._databoxHeadingLevel()).toBe(4);
  });
});
