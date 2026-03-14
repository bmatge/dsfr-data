import { describe, it, expect } from 'vitest';
import {
  formatValue,
  formatNumber,
  formatPercentage,
  formatCurrency,
  formatDecimal,
  formatDate,
  getColorBySeuil,
  getDsfrColorClass,
  getDsfrKpiColor
} from '../src/utils/formatters.js';

describe('formatters', () => {
  describe('formatNumber', () => {
    it('formate un nombre avec séparateurs de milliers', () => {
      // Le format français utilise l'espace insécable
      expect(formatNumber(1234567)).toMatch(/1\s*234\s*567/);
    });

    it('arrondit les décimales', () => {
      expect(formatNumber(123.456)).toBe('123');
    });
  });

  describe('formatPercentage', () => {
    it('formate un pourcentage', () => {
      const result = formatPercentage(75);
      expect(result).toMatch(/75\s*%/);
    });

    it('gère les décimales', () => {
      const result = formatPercentage(75.5);
      expect(result).toMatch(/75[,.]5\s*%/);
    });
  });

  describe('formatCurrency', () => {
    it('formate une valeur en euros', () => {
      const result = formatCurrency(1500);
      expect(result).toMatch(/1\s*500\s*€/);
    });
  });

  describe('formatValue', () => {
    it('formate selon le type spécifié', () => {
      expect(formatValue(100, 'nombre')).toBe('100');
      expect(formatValue(75, 'pourcentage')).toMatch(/75\s*%/);
    });

    it('retourne "—" pour les valeurs nulles', () => {
      expect(formatValue(null, 'nombre')).toBe('—');
      expect(formatValue(undefined, 'nombre')).toBe('—');
      expect(formatValue('', 'nombre')).toBe('—');
    });

    it('retourne "—" pour les valeurs non numériques', () => {
      expect(formatValue('abc', 'nombre')).toBe('—');
    });
  });

  describe('formatDate', () => {
    it('formate une date en format français', () => {
      const result = formatDate('2025-01-15');
      expect(result).toBe('15/01/2025');
    });

    it('retourne "—" pour une date invalide', () => {
      expect(formatDate('invalid')).toBe('—');
    });
  });

  describe('getColorBySeuil', () => {
    it('retourne vert si au-dessus du seuil vert', () => {
      expect(getColorBySeuil(90, 80, 50)).toBe('vert');
    });

    it('retourne orange si au-dessus du seuil orange mais sous le vert', () => {
      expect(getColorBySeuil(60, 80, 50)).toBe('orange');
    });

    it('retourne rouge si sous tous les seuils', () => {
      expect(getColorBySeuil(30, 80, 50)).toBe('rouge');
    });

    it('retourne bleu si aucun seuil défini', () => {
      expect(getColorBySeuil(50)).toBe('bleu');
    });

    it('retourne rouge avec seuil vert seul et valeur en dessous', () => {
      expect(getColorBySeuil(50, 80)).toBe('rouge');
    });

    it('retourne vert avec seuil vert seul et valeur au-dessus', () => {
      expect(getColorBySeuil(90, 80)).toBe('vert');
    });
  });

  describe('formatDecimal', () => {
    it('formate un nombre avec decimales', () => {
      const result = formatDecimal(12.5);
      expect(result).toMatch(/12[,.]5/);
    });

    it('ajoute au moins 1 decimale', () => {
      const result = formatDecimal(42);
      expect(result).toMatch(/42[,.]0/);
    });

    it('limite a 2 decimales', () => {
      const result = formatDecimal(3.14159);
      expect(result).toMatch(/3[,.]14/);
    });
  });

  describe('formatValue with decimal format', () => {
    it('formate en decimal', () => {
      const result = formatValue(12.5, 'decimal');
      expect(result).toMatch(/12[,.]5/);
    });

    it('formate en euro', () => {
      const result = formatValue(1500, 'euro');
      expect(result).toMatch(/1\s*500\s*€/);
    });

    it('formate une string numerique', () => {
      expect(formatValue('42', 'nombre')).toBe('42');
    });
  });

  describe('getDsfrColorClass', () => {
    it('retourne fr-badge--success pour vert', () => {
      expect(getDsfrColorClass('vert')).toBe('fr-badge--success');
    });

    it('retourne fr-badge--warning pour orange', () => {
      expect(getDsfrColorClass('orange')).toBe('fr-badge--warning');
    });

    it('retourne fr-badge--error pour rouge', () => {
      expect(getDsfrColorClass('rouge')).toBe('fr-badge--error');
    });

    it('retourne fr-badge--info pour bleu', () => {
      expect(getDsfrColorClass('bleu')).toBe('fr-badge--info');
    });

    it('retourne fr-badge--info pour couleur inconnue', () => {
      expect(getDsfrColorClass('inconnu' as any)).toBe('fr-badge--info');
    });
  });

  describe('getDsfrKpiColor', () => {
    it('retourne la variable CSS success pour vert', () => {
      expect(getDsfrKpiColor('vert')).toBe('var(--background-contrast-success)');
    });

    it('retourne la variable CSS warning pour orange', () => {
      expect(getDsfrKpiColor('orange')).toBe('var(--background-contrast-warning)');
    });

    it('retourne la variable CSS error pour rouge', () => {
      expect(getDsfrKpiColor('rouge')).toBe('var(--background-contrast-error)');
    });

    it('retourne la variable CSS info pour bleu', () => {
      expect(getDsfrKpiColor('bleu')).toBe('var(--background-contrast-info)');
    });

    it('retourne la variable CSS info pour couleur inconnue', () => {
      expect(getDsfrKpiColor('inconnu' as any)).toBe('var(--background-contrast-info)');
    });
  });
});
