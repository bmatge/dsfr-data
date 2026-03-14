import { describe, it, expect } from 'vitest';
import {
  DSFR_COLORS,
  PALETTE_PRIMARY_COLOR,
  PALETTE_COLORS,
} from '../../packages/shared/src/constants/dsfr-palettes';

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
    it('should have a default color', () => {
      expect(PALETTE_PRIMARY_COLOR['default']).toBe('#000091');
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

    it('should have categorical palette matching DSFR_COLORS', () => {
      expect([...PALETTE_COLORS['categorical']]).toEqual([...DSFR_COLORS]);
    });

    it('should have at least 5 colors per palette', () => {
      for (const [, colors] of Object.entries(PALETTE_COLORS)) {
        expect(colors.length).toBeGreaterThanOrEqual(5);
      }
    });
  });
});
