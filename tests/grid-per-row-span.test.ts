import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * #790 — `cols` désignait une LARGEUR dans dsfr-data-facets et un NOMBRE
 * d'éléments par ligne dans dsfr-data-display et dsfr-data-kpi-group. Deux
 * noms sans ambiguïté : `per-row` (nombre par ligne) et `span` (largeur sur
 * 12). `cols` et `col` gardent leur sens actuel, sans échéance : aucune page
 * existante ne doit changer de rendu.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { parsePerRow, parseSpan } from '@/utils/grid-layout.js';
import { DsfrDataDisplay } from '@/components/dsfr-data-display.js';
import { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import { DsfrDataKpiGroup } from '@/components/dsfr-data-kpi-group.js';
import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';

const mounted: Element[] = [];
afterEach(() => {
  for (const el of mounted.splice(0)) el.remove();
  vi.restoreAllMocks();
});

describe('#790 — lecture des nouveaux attributs', () => {
  it('per-row : diviseurs de 12 seulement, erreur nommée sinon', () => {
    expect(parsePerRow('3', 6)).toEqual({ value: 3, error: null });
    expect(parsePerRow('', 6)).toEqual({ value: null, error: null });
    expect(parsePerRow('5', 6).error).toContain('1, 2, 3, 4, 6');
    expect(parsePerRow('12', 6).error).toContain('per-row="12"');
    expect(parsePerRow(4, 12).value).toBe(4); // propriété JS numérique acceptée
  });

  it('span : entier de 1 à 12', () => {
    expect(parseSpan('6').value).toBe(6);
    expect(parseSpan('13').error).toContain('span="13"');
    expect(parseSpan('0').error).toBeTruthy();
  });
});

type DisplayInternals = { _getColClass(): string };

describe('#790 — dsfr-data-display', () => {
  const colClass = (configure: (d: DsfrDataDisplay) => void) => {
    const d = new DsfrDataDisplay();
    configure(d);
    return (d as unknown as DisplayInternals)._getColClass();
  };

  it('cols garde exactement son rendu (aucune régression)', () => {
    expect(colClass((d) => (d.cols = 3))).toBe('fr-col-12 fr-col-md-4');
    expect(colClass(() => {})).toBe('fr-col-12 fr-col-md-12');
  });

  it('per-row="3" rend comme cols="3" : trois par ligne', () => {
    expect(colClass((d) => (d.perRow = '3'))).toBe('fr-col-12 fr-col-md-4');
  });

  it('per-row prime sur cols, et le conflit est signalé', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const d = new DsfrDataDisplay();
    d.setAttribute('cols', '2');
    d.setAttribute('per-row', '4');
    document.body.appendChild(d);
    mounted.push(d);
    await d.updateComplete;
    expect((d as unknown as DisplayInternals)._getColClass()).toBe('fr-col-12 fr-col-md-3');
    expect(d.getAttribute('data-dsfr-config-error')).toContain(
      'per-row l’emporte'.replace('’', "'")
    );
  });

  it('per-row invalide : signalé, et le rendu retombe sur cols', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const d = new DsfrDataDisplay();
    d.setAttribute('per-row', '5');
    document.body.appendChild(d);
    mounted.push(d);
    await d.updateComplete;
    expect(d.getAttribute('data-dsfr-config-error')).toContain('per-row="5"');
    expect((d as unknown as DisplayInternals)._getColClass()).toBe('fr-col-12 fr-col-md-12');
  });
});

describe('#790 — dsfr-data-facets', () => {
  const colClass = (configure: (f: DsfrDataFacets) => void, field: string) => {
    const f = new DsfrDataFacets();
    configure(f);
    return f._getColClass(field);
  };

  it('cols garde exactement son rendu : une LARGEUR (aucune régression)', () => {
    expect(colClass((f) => (f.cols = '4'), 'a')).toBe('fr-col-12 fr-col-md-4');
    expect(colClass((f) => (f.cols = 'a:3 | b:12'), 'b')).toBe('fr-col-12');
  });

  it('span a le sens de cols, global ou par champ', () => {
    expect(colClass((f) => (f.span = '4'), 'a')).toBe('fr-col-12 fr-col-md-4');
    expect(colClass((f) => (f.span = 'a:3 | b:6'), 'a')).toBe('fr-col-12 fr-col-md-3');
    expect(colClass((f) => (f.span = 'a:3 | b:6'), 'c')).toBe('fr-col-12 fr-col-md-6');
  });

  it('per-row="3" : trois facettes par ligne — ce que cols="3" ne voulait PAS dire ici', () => {
    expect(colClass((f) => (f.perRow = '3'), 'a')).toBe('fr-col-12 fr-col-md-4');
  });

  it('per-row + span par champ : la facette nommée garde sa largeur, les autres se partagent la ligne', () => {
    const configure = (f: DsfrDataFacets) => {
      f.perRow = '4';
      f.span = 'commentaire:12';
    };
    expect(colClass(configure, 'commentaire')).toBe('fr-col-12');
    expect(colClass(configure, 'region')).toBe('fr-col-12 fr-col-md-3');
  });

  it('span prime sur cols, conflit signalé ; span hors grille signalé', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = new DsfrDataFacets();
    f.id = 'fx790';
    f.setAttribute('cols', '4');
    f.setAttribute('span', '6');
    document.body.appendChild(f);
    mounted.push(f);
    await f.updateComplete;
    expect(f._getColClass('a')).toBe('fr-col-12 fr-col-md-6');
    expect(f.getAttribute('data-dsfr-config-error')).toContain('cols et span');

    f.removeAttribute('cols');
    f.setAttribute('span', 'a:13');
    await f.updateComplete;
    expect(f.getAttribute('data-dsfr-config-error')).toContain('largeur 13 hors de la grille');
  });
});

describe('#790 — dsfr-data-kpi-group et dsfr-data-kpi', () => {
  it('per-row fixe la largeur par défaut des KPI, comme cols', async () => {
    const g = new DsfrDataKpiGroup();
    g.setAttribute('per-row', '4');
    document.body.appendChild(g);
    mounted.push(g);
    await g.updateComplete;
    expect(g.style.getPropertyValue('--_kpi-default-span')).toBe('3');
    expect(g.shadowRoot?.innerHTML.replace(/<!---->/g, '')).toContain('span 3');

    const legacy = new DsfrDataKpiGroup();
    legacy.setAttribute('cols', '4');
    document.body.appendChild(legacy);
    mounted.push(legacy);
    await legacy.updateComplete;
    expect(legacy.style.getPropertyValue('--_kpi-default-span')).toBe('3');
  });

  it('les règles span existent pour chaque largeur, après celles de col', () => {
    const css = (DsfrDataKpiGroup.styles as unknown as { cssText: string }).cssText;
    for (let n = 1; n <= 12; n++) expect(css).toContain(`::slotted([span='${n}'])`);
    expect(css.indexOf("::slotted([span='6'])")).toBeGreaterThan(
      css.indexOf("::slotted([col='12'])")
    );
  });

  it('span est reflété en attribut sur le KPI (la grille le lit en CSS)', async () => {
    const k = new DsfrDataKpi();
    k.span = '6';
    document.body.appendChild(k);
    mounted.push(k);
    await k.updateComplete;
    expect(k.getAttribute('span')).toBe('6');
  });

  it('KPI : col et span ensemble, ou span invalide, sont signalés sans bloquer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const k = new DsfrDataKpi();
    k.value = '=12';
    k.setAttribute('col', '3');
    k.setAttribute('span', '6');
    document.body.appendChild(k);
    mounted.push(k);
    await k.updateComplete;
    expect(k.getAttribute('data-dsfr-config-error')).toContain('col et span');
    expect(k.textContent).toContain('12');
  });
});
