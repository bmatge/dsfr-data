import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * #789 — colonnage responsive : échelle mobile-first sur `per-row` et `span`
 * (#790, ADR-112 : jamais sur `cols` / `col`, qui gardent leur sens).
 *
 * Le repli mobile était binaire et câblé : quatre KPI = 4 colonnes au-dessus
 * de 768 px, 4 lignes empilées en dessous ; sur téléphone, 2 × 2 se lit mieux.
 * jsdom ne calcule pas de mise en page : on fixe le contrat de classes DSFR
 * (fr-col-N à toutes les largeurs, fr-col-{bp}-N à partir du point de rupture)
 * et les règles CSS générées.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { parseScale, scaleToClasses } from '@/utils/grid-layout.js';
import { DsfrDataDisplay } from '@/components/dsfr-data-display.js';
import { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import { DsfrDataKpiGroup } from '@/components/dsfr-data-kpi-group.js';

const mounted: Element[] = [];
afterEach(() => {
  for (const el of mounted.splice(0)) el.remove();
  vi.restoreAllMocks();
});

const classes = (raw: string, kind: 'per-row' | 'span' = 'per-row', max = 12) => {
  const { scale, error } = parseScale(raw, kind, max);
  if (error) throw new Error(error);
  return scaleToClasses(scale!);
};

describe('#789 — grammaire de l’échelle', () => {
  it('une valeur nue garde le rendu historique exactement', () => {
    expect(classes('3')).toBe('fr-col-12 fr-col-md-4');
    expect(classes('4', 'span')).toBe('fr-col-12 fr-col-md-4');
    expect(classes('12', 'span')).toBe('fr-col-12');
  });

  it('AC : per-row="1 md:3 lg:4" rend trois paliers (320 / 768 / 992 px)', () => {
    // < 576 : fr-col-12 (un par ligne) ; >= 768 : 4/12 (trois) ; >= 992 : 3/12 (quatre)
    expect(classes('1 md:3 lg:4')).toBe('fr-col-12 fr-col-md-4 fr-col-lg-3');
  });

  it('terme de base : la disposition mobile est fixée par l’auteur', () => {
    expect(classes('2 md:4')).toBe('fr-col-6 fr-col-md-3');
    expect(parseScale('2 md:4', 'per-row').scale?.mobileExplicit).toBe(true);
    expect(parseScale('md:3', 'per-row').scale?.mobileExplicit).toBe(false);
    expect(classes('md:3 xl:6')).toBe('fr-col-12 fr-col-md-4 fr-col-xl-2');
  });

  it('les paliers sont rangés dans l’ordre des points de rupture', () => {
    expect(classes('lg:4 sm:2')).toBe('fr-col-12 fr-col-sm-6 fr-col-lg-3');
  });

  it('AC : un point de rupture inconnu est une erreur nommée, pas un silence', () => {
    expect(parseScale('1 xxl:4', 'per-row').error).toContain('point de rupture inconnu « xxl »');
    expect(parseScale('1 xxl:4', 'per-row').error).toContain('sm, md, lg, xl');
    expect(parseScale('md:3 4', 'per-row').error).toContain('seul le premier terme peut être nu');
    expect(parseScale('1 md:5', 'per-row').error).toContain('per-row="1 md:5"');
    expect(parseScale('12 md:13', 'span').error).toContain('span="12 md:13"');
  });
});

describe('#789 — dsfr-data-display', () => {
  it('per-row en échelle', () => {
    const d = new DsfrDataDisplay();
    d.perRow = '1 sm:2 lg:3';
    expect((d as unknown as { _getColClass(): string })._getColClass()).toBe(
      'fr-col-12 fr-col-sm-6 fr-col-lg-4'
    );
  });

  it('cols ne prend pas l’échelle et garde son rendu (ADR-112)', () => {
    const d = new DsfrDataDisplay();
    d.cols = 3;
    expect((d as unknown as { _getColClass(): string })._getColClass()).toBe(
      'fr-col-12 fr-col-md-4'
    );
  });

  it('échelle invalide : erreur de configuration', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const d = new DsfrDataDisplay();
    d.setAttribute('per-row', '1 xxl:3');
    document.body.appendChild(d);
    mounted.push(d);
    await d.updateComplete;
    expect(d.getAttribute('data-dsfr-config-error')).toContain('xxl');
  });
});

describe('#789 — dsfr-data-facets', () => {
  const colClass = (configure: (f: DsfrDataFacets) => void, field: string) => {
    const f = new DsfrDataFacets();
    configure(f);
    return f._getColClass(field);
  };

  it('AC : span compose champ et point de rupture', () => {
    const cfg = (f: DsfrDataFacets) => (f.span = 'annee:12 md:3 | type:6');
    expect(colClass(cfg, 'annee')).toBe('fr-col-12 fr-col-md-3');
    // `type:6` nu : sens historique, pleine largeur sous 768 px
    expect(colClass(cfg, 'type')).toBe('fr-col-12 fr-col-md-6');
  });

  it('span global en échelle, et per-row en échelle', () => {
    expect(colClass((f) => (f.span = '6 lg:4'), 'x')).toBe('fr-col-6 fr-col-lg-4');
    expect(colClass((f) => (f.perRow = '2 md:4'), 'x')).toBe('fr-col-6 fr-col-md-3');
  });

  it('cols garde sa grammaire et son rendu', () => {
    expect(colClass((f) => (f.cols = 'a:3 | b:12'), 'a')).toBe('fr-col-12 fr-col-md-3');
    expect(colClass((f) => (f.cols = 'a:3 | b:12'), 'b')).toBe('fr-col-12');
  });
});

describe('#789 — dsfr-data-kpi-group', () => {
  async function group(perRow: string) {
    const g = new DsfrDataKpiGroup();
    g.setAttribute('per-row', perRow);
    document.body.appendChild(g);
    mounted.push(g);
    await g.updateComplete;
    return g;
  }
  const css = (g: DsfrDataKpiGroup) => (g.shadowRoot?.innerHTML ?? '').replace(/<!---->/g, '');

  it('per-row="2 md:4" : 2 × 2 sur téléphone, 4 par ligne à partir de 768 px', async () => {
    const g = await group('2 md:4');
    expect(css(g)).toContain('grid-column: span 6;');
    expect(css(g)).toContain('@media (min-width: 48em)');
    expect(css(g)).toContain('grid-column: span 3;');
    // L'auteur a fixé la disposition mobile : pas de repli forcé sur une colonne
    expect(g.hasAttribute('data-mobile-layout')).toBe(true);
  });

  it('per-row nu : repli mobile historique conservé', async () => {
    const g = await group('4');
    expect(g.hasAttribute('data-mobile-layout')).toBe(false);
    expect(css(g)).toContain('@media (min-width: 48em)');
  });

  it('le repli forcé ne vise que les groupes sans disposition mobile explicite', () => {
    const text = (DsfrDataKpiGroup.styles as unknown as { cssText: string }).cssText;
    expect(text).toContain(':host(:not([data-mobile-layout]))');
  });
});
