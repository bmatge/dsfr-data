import { describe, it, expect } from 'vitest';

/**
 * Tests traversants #317 (EPIC G) — formatage : preview = rendu composant.
 *
 * Bug d'origine : formatKPIValue (shared, previews des apps) et les
 * formatters de core (composants) divergeaient — euro à 2 décimales
 * (shared) vs 0 décimale (core formatCurrency) ; '%' suffixe texte (shared)
 * vs style:'percent' (core). La preview du builder n'affichait pas ce que
 * rendrait le composant.
 *
 * Contrat fixé : une seule famille (shared), core re-exporte, formatKPIValue
 * est un wrapper déprécié qui mappe unit → format.
 */

import { formatKPIValue, formatValue } from '@dsfr-data/shared/lib';
// La famille du composant (re-export depuis core — même module au final)
import { formatValue as coreFormatValue } from '@/utils/formatters.js';

describe('#317 — AC : preview builder = rendu composant pour les 4 formats KPI', () => {
  const VALUE = 1234.56;

  it('euro : formatKPIValue(v, "€") === formatValue(v, "euro")', () => {
    expect(formatKPIValue(VALUE, '€')).toBe(formatValue(VALUE, 'euro'));
    expect(formatKPIValue(VALUE, 'EUR')).toBe(formatValue(VALUE, 'euro'));
  });

  it('pourcentage : formatKPIValue(v, "%") === formatValue(v, "pourcentage")', () => {
    expect(formatKPIValue(5.25, '%')).toBe(formatValue(5.25, 'pourcentage'));
  });

  it('nombre (défaut) : formatKPIValue(v) === formatValue(v, "nombre")', () => {
    expect(formatKPIValue(VALUE)).toBe(formatValue(VALUE, 'nombre'));
  });

  it('core re-exporte la MÊME implémentation (pas une copie)', () => {
    expect(coreFormatValue).toBe(formatValue);
  });

  it('politique % : la valeur EST le pourcentage (5 → « 5 % », pas 500 %)', () => {
    const out = formatValue(5, 'pourcentage').replace(/\s/g, ' ');
    expect(out).toBe('5 %');
  });

  it('euro composant : 0 décimale (1 234,56 → « 1 235 € »)', () => {
    expect(formatValue(1234.56, 'euro').replace(/\s/g, ' ')).toBe('1 235 €');
  });
});
