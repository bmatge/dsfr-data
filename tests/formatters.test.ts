import { describe, it, expect } from 'vitest';
import {
  formatValue,
  formatNumber,
  formatPercentage,
  formatCurrency,
  formatDecimal,
  formatDate,
  FORMAT_TYPES,
  isFormatType,
  getColorBySeuil,
  getDsfrColorClass,
  getDsfrKpiColor,
} from '@/utils/formatters.js';
import { formatNumberFr } from '@dsfr-data/shared/lib';

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

    it('formate une string numérique', () => {
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

describe('formatValue — compact (fr-FR)', () => {
  it('millions : 14 785 684 → "14,8 M"', () => {
    expect(formatValue(14785684, 'compact')).toBe('14,8\u00a0M');
  });
  it('milliers : 6 676 → "6,7 k"', () => {
    expect(formatValue(6676, 'compact')).toBe('6,7\u00a0k');
  });
  it('petits nombres : 42 → "42"', () => {
    expect(formatValue(42, 'compact')).toBe('42');
  });
});

describe('formatValue — options decimals / unit (#665)', () => {
  const norm = (s: string) => s.replace(/\s/g, ' ');

  it('AC : format="euro" decimals="3" → « 1,749 € »', () => {
    expect(norm(formatValue(1.749, 'euro', { decimals: 3 }))).toBe('1,749 €');
  });

  it('AC : format="compact" unit="€" → « 44,9 Md € »', () => {
    expect(norm(formatValue(44_900_000_000, 'compact', { unit: '€' }))).toBe('44,9 Md €');
  });

  it("l'unité est accolée par une espace insécable U+00A0 (convention Intl fr-FR)", () => {
    expect(formatValue(42, 'nombre', { unit: 'km' })).toBe('42 km');
  });

  it('decimals est FIXE sur nombre, euro, decimal, pourcentage (min = max)', () => {
    expect(norm(formatValue(42, 'nombre', { decimals: 2 }))).toBe('42,00');
    expect(norm(formatValue(1.75, 'euro', { decimals: 3 }))).toBe('1,750 €');
    expect(norm(formatValue(3.14159, 'decimal', { decimals: 3 }))).toBe('3,142');
    expect(norm(formatValue(75, 'pourcentage', { decimals: 1 }))).toBe('75,0 %');
  });

  it('decimals est un PLAFOND sur compact (42 reste « 42 »)', () => {
    expect(formatValue(42, 'compact', { decimals: 2 })).toBe('42');
    expect(norm(formatValue(14_785_684, 'compact', { decimals: 2 }))).toBe('14,79 M');
  });

  it('défauts INCHANGÉS sans options (parité previews #317)', () => {
    expect(formatValue(1234.56, 'euro')).toBe(formatValue(1234.56, 'euro', {}));
    expect(norm(formatValue(1234.56, 'euro'))).toBe('1 235 €');
    expect(norm(formatValue(42, 'decimal'))).toBe('42,0');
    expect(formatValue(123.456, 'nombre')).toBe('123');
  });

  it("pas d'unité sur une valeur non formatable (« — » reste seul)", () => {
    expect(formatValue(null, 'nombre', { unit: '€' })).toBe('—');
    expect(formatValue('abc', 'nombre', { unit: '€' })).toBe('—');
  });

  it('decimals hors bornes ou non entier : ignoré (défaut du format, jamais de RangeError)', () => {
    expect(formatValue(1.5, 'euro', { decimals: 99 })).toBe(formatValue(1.5, 'euro'));
    expect(formatValue(1.5, 'euro', { decimals: -1 })).toBe(formatValue(1.5, 'euro'));
    expect(formatValue(1.5, 'euro', { decimals: NaN })).toBe(formatValue(1.5, 'euro'));
  });
});

describe('formatValue — format="date" (#667)', () => {
  it('AC : chaîne ISO → « 09/09/2026 »', () => {
    expect(formatValue('2026-09-09', 'date')).toBe('09/09/2026');
  });

  it('datetime ISO et timestamp numérique', () => {
    expect(formatValue('2026-09-09T10:30:00Z', 'date')).toMatch(/^\d{2}\/09\/2026$/);
    expect(formatValue(Date.UTC(2026, 8, 9, 12), 'date')).toMatch(/^\d{2}\/09\/2026$/);
  });

  it('« — » si vide ou illisible ; decimals/unit sans effet', () => {
    expect(formatValue('', 'date')).toBe('—');
    expect(formatValue('pas une date', 'date')).toBe('—');
    expect(formatValue('2026-09-09', 'date', { decimals: 2, unit: '€' })).toBe('09/09/2026');
  });

  it("formatDate : une date calendaire seule ne glisse pas d'un jour selon le fuseau", () => {
    // AAAA-MM-JJ est lu à minuit UTC par `new Date` ; rendu en UTC pour garder le jour.
    expect(formatDate('2025-01-15')).toBe('15/01/2025');
    expect(formatDate(' 2025-12-31 ')).toBe('31/12/2025');
  });
});

describe('formatNumberFr — nombre fr-FR typeof number (#665, réutilisé par list/a11y)', () => {
  const norm = (s: string) => s.replace(/\s/g, ' ');

  it('garde les décimales de la valeur (plafond Intl 3), sans zéro de bourrage', () => {
    expect(norm(formatNumberFr(1234.5))).toBe('1 234,5');
    expect(norm(formatNumberFr(1234))).toBe('1 234');
    expect(norm(formatNumberFr(1.23456))).toBe('1,235');
  });

  it('decimals est un PLAFOND (maximumFractionDigits)', () => {
    expect(norm(formatNumberFr(1234.5678, { decimals: 2 }))).toBe('1 234,57');
    expect(norm(formatNumberFr(1234.5, { decimals: 0 }))).toBe('1 235');
    expect(norm(formatNumberFr(42, { decimals: 2 }))).toBe('42');
  });

  it('« — » si non fini', () => {
    expect(formatNumberFr(NaN)).toBe('—');
    expect(formatNumberFr(Infinity)).toBe('—');
  });
});

describe('FORMAT_TYPES / isFormatType (#665)', () => {
  it('liste les six formats, date inclus', () => {
    expect(FORMAT_TYPES).toEqual(['nombre', 'pourcentage', 'euro', 'decimal', 'compact', 'date']);
  });

  it('refuse la grammaire colon « euro:3 » et les inconnus', () => {
    expect(isFormatType('euro')).toBe(true);
    expect(isFormatType('date')).toBe(true);
    expect(isFormatType('euro:3')).toBe(false);
    expect(isFormatType('number')).toBe(false);
    expect(isFormatType(undefined)).toBe(false);
  });
});
