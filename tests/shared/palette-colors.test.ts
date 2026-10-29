import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  DSFR_COLORS,
  PALETTE_PRIMARY_COLOR,
  PALETTE_COLORS,
} from '../../packages/shared/src/constants/palette-colors';

/**
 * Couleurs du theme clair lues dans le paquet DSFR Chart INSTALLE : c'est lui
 * qui colore `dsfr-data-chart`. Si une montee de version les change, les
 * pastilles du Builder doivent suivre — ce test le dit.
 */
function dsfrChartLightColors(): Record<string, string> {
  // Chemin direct : le champ `exports` du paquet ne publie pas package.json.
  const pkg = join(process.cwd(), 'node_modules/@gouvfr/dsfr-chart');
  const js = readFileSync(join(pkg, 'dist/LineChart/LineChart.js'), 'utf8');
  const bloc = /light:\s*\{([^}]*)\}/.exec(js);
  if (!bloc) throw new Error('theme clair introuvable dans DSFR Chart');
  const colors: Record<string, string> = {};
  for (const m of bloc[1].matchAll(/"dsfr-chart-colors-([a-z0-9]+)":\s*"(#[0-9A-Fa-f]{6})"/g)) {
    colors[m[1]] = m[2].toUpperCase();
  }
  return colors;
}

/** Interpolation RGB lineaire, comme `chroma.scale(stops).colors(n)`. */
function scale(stops: string[], n: number): string[] {
  const rgb = stops.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  return Array.from({ length: n }, (_, k) => {
    const t = (k / (n - 1)) * (stops.length - 1);
    const seg = Math.min(Math.floor(t), stops.length - 2);
    const f = t - seg;
    const c = rgb[seg].map((v, j) => Math.round(v + (rgb[seg + 1][j] - v) * f));
    return (
      '#' +
      c
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
    );
  });
}

describe('DSFR Palettes', () => {
  describe('DSFR_COLORS', () => {
    it('should have 10 colors', () => {
      expect(DSFR_COLORS).toHaveLength(10);
    });

    it('should start with Bleu France', () => {
      expect(DSFR_COLORS[0]).toBe('#000091');
    });

    it('should contain valid hex colors', () => {
      for (const color of DSFR_COLORS) {
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });
  });

  describe('PALETTE_PRIMARY_COLOR', () => {
    it('est la premiere couleur de chaque palette de DSFR Chart', () => {
      for (const [k, colors] of Object.entries(PALETTE_COLORS)) {
        expect(PALETTE_PRIMARY_COLOR[k], k).toBe(colors[0]);
      }
      expect(PALETTE_PRIMARY_COLOR['default']).toBe('#5C68E5');
    });

    it('should have all expected palette types', () => {
      const keys = Object.keys(PALETTE_PRIMARY_COLOR);
      expect(keys).toContain('default');
      expect(keys).toContain('categorical');
      expect(keys).toContain('sequentialAscending');
      expect(keys).toContain('sequentialDescending');
      expect(keys).toContain('divergentAscending');
      expect(keys).toContain('divergentDescending');
      expect(keys).toContain('neutral');
    });
  });

  describe('PALETTE_COLORS', () => {
    it('should have the same keys as PALETTE_PRIMARY_COLOR', () => {
      const primaryKeys = Object.keys(PALETTE_PRIMARY_COLOR).sort();
      const paletteKeys = Object.keys(PALETTE_COLORS).sort();
      expect(paletteKeys).toEqual(primaryKeys);
    });

    it('should contain valid hex colors', () => {
      for (const colors of Object.values(PALETTE_COLORS)) {
        for (const color of colors) expect(color).toMatch(/^#[0-9A-F]{6}$/);
      }
    });
  });

  describe('PALETTE_COLORS = les couleurs que DSFR Chart applique (retour usager)', () => {
    const c = dsfrChartLightColors();
    const pick = (...ids: string[]) => ids.map((id) => c[id]);

    it('categorical : couleurs 01 a 08 de DSFR Chart', () => {
      expect(PALETTE_COLORS.categorical).toEqual(
        pick('01', '02', '03', '04', '05', '06', '07', '08')
      );
    });

    it('default et neutral : une seule couleur, comme DSFR Chart', () => {
      expect(PALETTE_COLORS.default).toEqual([c.default]);
      expect(PALETTE_COLORS.neutral).toEqual([c.neutral]);
    });

    it('degrades : 10 tons entre 09 et 10', () => {
      expect(PALETTE_COLORS.sequentialAscending).toEqual(scale(pick('09', '10'), 10));
      expect(PALETTE_COLORS.sequentialDescending).toEqual(scale(pick('10', '09'), 10));
    });

    it('divergentes : 4 tons entre 11, 13 et 15', () => {
      expect(PALETTE_COLORS.divergentAscending).toEqual(scale(pick('11', '13', '15'), 4));
      expect(PALETTE_COLORS.divergentDescending).toEqual(scale(pick('15', '13', '11'), 4));
    });

    it('la categorical de DSFR Chart n est PAS DSFR_COLORS (podium et cartes)', () => {
      expect([...PALETTE_COLORS.categorical]).not.toEqual([...DSFR_COLORS]);
    });
  });
});
