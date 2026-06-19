import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';
import { DsfrDataKpiGroup } from '@/components/dsfr-data-kpi-group.js';
import {
  clearDataCache,
  dispatchDataLoaded,
  dispatchDataLoading,
  dispatchDataError,
} from '@/utils/data-bridge.js';

describe('DsfrDataKpi', () => {
  let kpi: DsfrDataKpi;

  beforeEach(() => {
    clearDataCache('test-kpi-src');
    kpi = new DsfrDataKpi();
  });

  afterEach(() => {
    if (kpi.isConnected) {
      kpi.disconnectedCallback();
    }
  });

  describe('_computeValue', () => {
    it('returns null when no source data', () => {
      kpi.valeur = 'total';
      expect((kpi as any)._computeValue()).toBeNull();
    });

    it('returns null when no valeur expression', () => {
      (kpi as any)._sourceData = [{ score: 42 }];
      kpi.valeur = '';
      expect((kpi as any)._computeValue()).toBeNull();
    });

    it('computes direct field access on object', () => {
      kpi.valeur = 'score';
      (kpi as any)._sourceData = { score: 42 };
      expect((kpi as any)._computeValue()).toBe(42);
    });

    it('computes first value from array', () => {
      kpi.valeur = 'score';
      (kpi as any)._sourceData = [{ score: 85 }, { score: 90 }];
      expect((kpi as any)._computeValue()).toBe(85);
    });

    it('computes sum aggregation', () => {
      kpi.valeur = 'sum:score';
      (kpi as any)._sourceData = [{ score: 10 }, { score: 20 }, { score: 30 }];
      expect((kpi as any)._computeValue()).toBe(60);
    });

    it('computes avg aggregation', () => {
      kpi.valeur = 'avg:score';
      (kpi as any)._sourceData = [{ score: 10 }, { score: 20 }, { score: 30 }];
      expect((kpi as any)._computeValue()).toBe(20);
    });

    it('computes count aggregation', () => {
      kpi.valeur = 'count';
      (kpi as any)._sourceData = [{ a: 1 }, { a: 2 }, { a: 3 }];
      expect((kpi as any)._computeValue()).toBe(3);
    });

    it('computes min aggregation', () => {
      kpi.valeur = 'min:score';
      (kpi as any)._sourceData = [{ score: 30 }, { score: 10 }, { score: 20 }];
      expect((kpi as any)._computeValue()).toBe(10);
    });

    it('computes max aggregation', () => {
      kpi.valeur = 'max:score';
      (kpi as any)._sourceData = [{ score: 30 }, { score: 10 }, { score: 20 }];
      expect((kpi as any)._computeValue()).toBe(30);
    });
  });

  describe('_getColor', () => {
    it('returns forced color when couleur is set', () => {
      kpi.couleur = 'rouge';
      expect((kpi as any)._getColor()).toBe('rouge');
    });

    it('returns forced color regardless of value', () => {
      kpi.couleur = 'vert';
      kpi.valeur = 'score';
      (kpi as any)._sourceData = [{ score: 10 }];
      kpi.seuilVert = 80;
      kpi.seuilOrange = 50;
      expect((kpi as any)._getColor()).toBe('vert');
    });

    it('returns bleu when value is not a number', () => {
      kpi.valeur = 'nom';
      (kpi as any)._sourceData = { nom: 'Paris' };
      expect((kpi as any)._getColor()).toBe('bleu');
    });

    it('returns bleu when no seuils defined', () => {
      kpi.valeur = 'score';
      (kpi as any)._sourceData = [{ score: 42 }];
      expect((kpi as any)._getColor()).toBe('bleu');
    });

    it('returns vert when value >= seuilVert', () => {
      kpi.valeur = 'score';
      (kpi as any)._sourceData = [{ score: 90 }];
      kpi.seuilVert = 80;
      kpi.seuilOrange = 50;
      expect((kpi as any)._getColor()).toBe('vert');
    });

    it('returns orange when value >= seuilOrange but < seuilVert', () => {
      kpi.valeur = 'score';
      (kpi as any)._sourceData = [{ score: 60 }];
      kpi.seuilVert = 80;
      kpi.seuilOrange = 50;
      expect((kpi as any)._getColor()).toBe('orange');
    });

    it('returns rouge when value < all seuils', () => {
      kpi.valeur = 'score';
      (kpi as any)._sourceData = [{ score: 30 }];
      kpi.seuilVert = 80;
      kpi.seuilOrange = 50;
      expect((kpi as any)._getColor()).toBe('rouge');
    });

    it('returns bleu when no source data', () => {
      kpi.valeur = 'score';
      expect((kpi as any)._getColor()).toBe('bleu');
    });
  });

  describe('_getTendanceInfo', () => {
    it('returns null when tendance is empty', () => {
      kpi.tendance = '';
      (kpi as any)._sourceData = [{ score: 42 }];
      expect((kpi as any)._getTendanceInfo()).toBeNull();
    });

    it('returns null when no source data', () => {
      kpi.tendance = 'avg:growth';
      expect((kpi as any)._getTendanceInfo()).toBeNull();
    });

    it('returns up direction for positive values', () => {
      kpi.tendance = 'growth';
      (kpi as any)._sourceData = { growth: 3.5 };
      const info = (kpi as any)._getTendanceInfo();
      expect(info).not.toBeNull();
      expect(info.value).toBe(3.5);
      expect(info.direction).toBe('up');
    });

    it('returns down direction for negative values', () => {
      kpi.tendance = 'growth';
      (kpi as any)._sourceData = { growth: -2.1 };
      const info = (kpi as any)._getTendanceInfo();
      expect(info).not.toBeNull();
      expect(info.value).toBe(-2.1);
      expect(info.direction).toBe('down');
    });

    it('returns stable direction for zero', () => {
      kpi.tendance = 'growth';
      (kpi as any)._sourceData = { growth: 0 };
      const info = (kpi as any)._getTendanceInfo();
      expect(info).not.toBeNull();
      expect(info.value).toBe(0);
      expect(info.direction).toBe('stable');
    });

    it('returns null when tendance value is not a number', () => {
      kpi.tendance = 'label';
      (kpi as any)._sourceData = { label: 'text' };
      expect((kpi as any)._getTendanceInfo()).toBeNull();
    });

    it('computes tendance from aggregation expression', () => {
      kpi.tendance = 'avg:delta';
      (kpi as any)._sourceData = [{ delta: 5 }, { delta: 10 }];
      const info = (kpi as any)._getTendanceInfo();
      expect(info).not.toBeNull();
      expect(info.value).toBe(7.5);
      expect(info.direction).toBe('up');
    });

    it('computes tendance from aggregation on a single-object source (#338)', () => {
      // Source mono-objet (baromètre) : l'agrégation renvoyait null avant #338.
      kpi.trend = 'evol_n1:avg';
      (kpi as any)._sourceData = { valeur: 37849, evol_n1: 92.5 };
      const info = (kpi as any)._getTendanceInfo();
      expect(info).not.toBeNull();
      expect(info.value).toBe(92.5);
      expect(info.direction).toBe('up');
    });
  });

  describe('_getAriaLabel', () => {
    it('returns description when set', () => {
      kpi.description = 'Score moyen de conformite';
      expect((kpi as any)._getAriaLabel()).toBe('Score moyen de conformite');
    });

    it('builds label from label + formatted value', () => {
      kpi.label = 'Score RGAA';
      kpi.valeur = 'score';
      kpi.format = 'nombre';
      (kpi as any)._sourceData = [{ score: 85 }];
      const label = (kpi as any)._getAriaLabel();
      expect(label).toContain('Score RGAA');
      expect(label).toContain('85');
    });

    it('uses "—" for null values', () => {
      kpi.label = 'Valeur';
      kpi.valeur = 'score';
      const label = (kpi as any)._getAriaLabel();
      expect(label).toContain('Valeur');
      expect(label).toContain('\u2014'); // em dash
    });
  });

  describe('Data integration via data-bridge', () => {
    it('receives data from source via subscription', () => {
      kpi.source = 'test-kpi-src';
      kpi.valeur = 'score';
      kpi.connectedCallback();

      dispatchDataLoaded('test-kpi-src', [{ score: 42 }]);

      expect((kpi as any)._sourceData).toEqual([{ score: 42 }]);
      expect((kpi as any)._computeValue()).toBe(42);
    });

    it('picks up cached data on connect', () => {
      dispatchDataLoaded('test-kpi-src', [{ score: 99 }]);

      kpi.source = 'test-kpi-src';
      kpi.valeur = 'score';
      kpi.connectedCallback();

      expect((kpi as any)._sourceData).toEqual([{ score: 99 }]);
      expect((kpi as any)._computeValue()).toBe(99);
    });

    it('tracks loading state', () => {
      kpi.source = 'test-kpi-src';
      kpi.connectedCallback();

      dispatchDataLoading('test-kpi-src');
      expect((kpi as any)._sourceLoading).toBe(true);

      dispatchDataLoaded('test-kpi-src', [{ score: 1 }]);
      expect((kpi as any)._sourceLoading).toBe(false);
    });

    it('tracks error state', () => {
      kpi.source = 'test-kpi-src';
      kpi.connectedCallback();

      const error = new Error('Network failure');
      dispatchDataError('test-kpi-src', error);
      expect((kpi as any)._sourceError).toEqual(error);
      expect((kpi as any)._sourceLoading).toBe(false);
    });
  });

  describe('col property', () => {
    it('defaults to undefined', () => {
      expect(kpi.col).toBeUndefined();
    });

    it('can be set to a number', () => {
      kpi.col = 6;
      expect(kpi.col).toBe(6);
    });

    it('does not affect _computeValue', () => {
      kpi.valeur = 'score';
      kpi.col = 6;
      (kpi as any)._sourceData = [{ score: 42 }];
      expect((kpi as any)._computeValue()).toBe(42);
    });

    it('does not affect _getColor', () => {
      kpi.valeur = 'score';
      kpi.col = 4;
      (kpi as any)._sourceData = [{ score: 90 }];
      kpi.seuilVert = 80;
      kpi.seuilOrange = 50;
      expect((kpi as any)._getColor()).toBe('vert');
    });
  });

  describe('Format types', () => {
    beforeEach(() => {
      kpi.valeur = 'score';
      kpi.label = 'Score';
      (kpi as any)._sourceData = [{ score: 75.5 }];
    });

    it('formats as nombre', () => {
      kpi.format = 'nombre';
      const label = (kpi as any)._getAriaLabel();
      expect(label).toContain('76'); // rounded
    });

    it('formats as pourcentage', () => {
      kpi.format = 'pourcentage';
      const label = (kpi as any)._getAriaLabel();
      expect(label).toMatch(/75[,.]5\s*%/);
    });

    it('formats as euro', () => {
      kpi.format = 'euro';
      const label = (kpi as any)._getAriaLabel();
      expect(label).toMatch(/76\s*€/); // rounded
    });

    it('formats as decimal', () => {
      kpi.format = 'decimal';
      const label = (kpi as any)._getAriaLabel();
      expect(label).toMatch(/75[,.]5/);
    });
  });

  describe('Trend rendering from single-object source (#338)', () => {
    it('renders the trend span for an aggregation on a one-record source', async () => {
      clearDataCache('kpi-mono');
      kpi.source = 'kpi-mono';
      kpi.value = 'valeur';
      kpi.label = 'Test';
      kpi.trend = 'evol_n1:avg';
      document.body.appendChild(kpi);
      kpi.connectedCallback();

      // Source mono-objet (baromètre) : avant #338 la valeur s'affichait mais
      // la tendance agrégée disparaissait silencieusement.
      dispatchDataLoaded('kpi-mono', { valeur: 37849, evol_n1: 92.5 } as unknown as object);
      await kpi.updateComplete;

      const trendEl = kpi.querySelector('.dsfr-data-kpi__tendance');
      expect(trendEl).not.toBeNull();
      expect((trendEl!.textContent || '').replace(/\s+/g, ' ')).toContain('92,5');
      kpi.remove();
    });
  });

  describe('heading + lines (#339, carte baromètre)', () => {
    it('renders the heading above the value', async () => {
      kpi.heading = 'Immat. VE';
      kpi.value = 'v';
      (kpi as any)._sourceData = { v: 37849 };
      document.body.appendChild(kpi);
      await kpi.updateComplete;
      expect(kpi.querySelector('.dsfr-data-kpi__heading')?.textContent).toBe('Immat. VE');
      kpi.remove();
    });

    it('renders a data-driven evolution line, ordered value → line → label', async () => {
      clearDataCache('kpi-baro');
      kpi.source = 'kpi-baro';
      kpi.heading = 'Immat. VE';
      kpi.value = 'valeur';
      kpi.lines = JSON.stringify([
        { value: 'evol:avg', sign: true, suffix: 'vs mai 2025', color: 'auto' },
      ]);
      kpi.label = 'Donnée mai 2026';
      document.body.appendChild(kpi);
      kpi.connectedCallback();

      dispatchDataLoaded('kpi-baro', { valeur: 37849, evol: 92.5 } as unknown as object);
      await kpi.updateComplete;

      const lineEl = kpi.querySelector('.dsfr-data-kpi__line') as HTMLElement;
      expect(lineEl).not.toBeNull();
      expect((lineEl.textContent || '').replace(/\s+/g, ' ').trim()).toBe('+92,5 % vs mai 2025');
      expect(lineEl.getAttribute('style')).toContain('var(--text-default-success)');

      const html = kpi.innerHTML;
      expect(html.indexOf('__value-wrapper')).toBeLessThan(html.indexOf('__line'));
      expect(html.indexOf('__line')).toBeLessThan(html.indexOf('__label'));
      kpi.remove();
    });

    it('reports a config error on invalid lines JSON', async () => {
      kpi.value = 'v';
      kpi.lines = '[{bad';
      (kpi as any)._sourceData = { v: 1 };
      document.body.appendChild(kpi);
      await kpi.updateComplete;
      expect(kpi.hasAttribute('data-dsfr-config-error')).toBe(true);
      kpi.remove();
    });

    it('reports a config error when legacy trend is a literal (#338)', async () => {
      clearDataCache('kpi-bad-trend');
      kpi.source = 'kpi-bad-trend';
      kpi.value = 'v';
      kpi.trend = '+12';
      document.body.appendChild(kpi);
      kpi.connectedCallback();
      dispatchDataLoaded('kpi-bad-trend', [{ v: 1, evol: 2 }]);
      await kpi.updateComplete;
      expect(kpi.hasAttribute('data-dsfr-config-error')).toBe(true);
      kpi.remove();
    });
  });
});

describe('DsfrDataKpiGroup', () => {
  let group: DsfrDataKpiGroup;

  afterEach(() => {
    if (group?.isConnected) {
      group.remove();
    }
  });

  it('is registered as custom element', () => {
    expect(customElements.get('dsfr-data-kpi-group')).toBeDefined();
  });

  it('defaults cols to 3', () => {
    group = new DsfrDataKpiGroup();
    expect(group.cols).toBe(3);
  });

  it('defaults gap to md', () => {
    group = new DsfrDataKpiGroup();
    expect(group.gap).toBe('md');
  });

  it('sets role="group" on connectedCallback', () => {
    group = new DsfrDataKpiGroup();
    document.body.appendChild(group);
    expect(group.getAttribute('role')).toBe('group');
  });

  it('does not override existing role', () => {
    group = new DsfrDataKpiGroup();
    group.setAttribute('role', 'region');
    document.body.appendChild(group);
    expect(group.getAttribute('role')).toBe('region');
  });

  it('computes default span CSS variable from cols', async () => {
    group = new DsfrDataKpiGroup();
    group.cols = 4;
    document.body.appendChild(group);
    await group.updateComplete;
    expect(group.style.getPropertyValue('--_kpi-default-span')).toBe('3');
  });

  it('handles cols that do not divide 12 evenly', async () => {
    group = new DsfrDataKpiGroup();
    group.cols = 5;
    document.body.appendChild(group);
    await group.updateComplete;
    expect(group.style.getPropertyValue('--_kpi-default-span')).toBe('2');
  });

  it('clamps cols to valid range (min 1)', async () => {
    group = new DsfrDataKpiGroup();
    group.cols = 0;
    document.body.appendChild(group);
    await group.updateComplete;
    expect(group.style.getPropertyValue('--_kpi-default-span')).toBe('12');
  });

  it('clamps cols to valid range (max 12)', async () => {
    group = new DsfrDataKpiGroup();
    group.cols = 20;
    document.body.appendChild(group);
    await group.updateComplete;
    expect(group.style.getPropertyValue('--_kpi-default-span')).toBe('1');
  });

  it('uses Shadow DOM', () => {
    group = new DsfrDataKpiGroup();
    document.body.appendChild(group);
    expect(group.shadowRoot).not.toBeNull();
  });

  it('renders a slot for children', async () => {
    group = new DsfrDataKpiGroup();
    document.body.appendChild(group);
    await group.updateComplete;
    const slot = group.shadowRoot!.querySelector('slot');
    expect(slot).not.toBeNull();
  });
});
