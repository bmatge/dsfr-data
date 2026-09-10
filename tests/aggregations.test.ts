import { describe, it, expect } from 'vitest';
import { parseExpression, computeAggregation } from '@/utils/aggregations.js';

describe('aggregations', () => {
  describe('parseExpression', () => {
    it('parse un accès direct', () => {
      expect(parseExpression('total')).toEqual({ type: 'direct', field: 'total' });
    });

    it('parse une moyenne', () => {
      expect(parseExpression('avg:score')).toEqual({ type: 'avg', field: 'score' });
    });

    it('parse une somme', () => {
      expect(parseExpression('sum:amount')).toEqual({ type: 'sum', field: 'amount' });
    });

    it('parse un comptage avec filtre', () => {
      expect(parseExpression('count:status:active')).toEqual({
        type: 'count',
        field: 'status',
        filterField: 'status',
        filterValue: 'active',
      });
    });

    it('parse un comptage avec filtre booléen true', () => {
      expect(parseExpression('count:valid:true')).toEqual({
        type: 'count',
        field: 'valid',
        filterField: 'valid',
        filterValue: true,
      });
    });

    it('parse un comptage avec filtre booléen false', () => {
      expect(parseExpression('count:valid:false')).toEqual({
        type: 'count',
        field: 'valid',
        filterField: 'valid',
        filterValue: false,
      });
    });

    // #649 : fonction hors liste blanche → type 'invalid' nommant la fonction reçue
    it('signale une fonction inconnue en grammaire commune ("x:somme")', () => {
      const parsed = parseExpression('x:somme');
      expect(parsed.type).toBe('invalid');
      expect(parsed.field).toBe('x');
      expect(parsed.error).toContain('"somme"');
      expect(parsed.error).toContain('avg, sum, count, min, max, first, last');
    });

    it('signale une fonction inconnue en grammaire historique à 3 segments', () => {
      const parsed = parseExpression('compte:status:active');
      expect(parsed.type).toBe('invalid');
      expect(parsed.error).toContain('"compte"');
    });

    it('ne casse pas le parsing legacy count:field:value ni fn:champ', () => {
      expect(parseExpression('count:status:active').type).toBe('count');
      expect(parseExpression('sum:amount')).toEqual({ type: 'sum', field: 'amount' });
      expect(parseExpression('sum:count')).toEqual({ type: 'sum', field: 'count' });
    });

    it('computeAggregation retourne null (jamais 0) sur une fonction inconnue', () => {
      expect(computeAggregation([{ x: 1 }, { x: 2 }], 'x:somme')).toBeNull();
    });
  });

  describe('computeAggregation', () => {
    const testData = [
      { name: 'A', score: 80, active: true },
      { name: 'B', score: 60, active: false },
      { name: 'C', score: 100, active: true },
      { name: 'D', score: 40, active: true },
    ];

    it('calcule une moyenne', () => {
      expect(computeAggregation(testData, 'avg:score')).toBe(70);
    });

    it('calcule une somme', () => {
      expect(computeAggregation(testData, 'sum:score')).toBe(280);
    });

    it('compte tous les éléments', () => {
      expect(computeAggregation(testData, 'count:name')).toBe(4);
    });

    it('compte avec filtre booléen', () => {
      expect(computeAggregation(testData, 'count:active:true')).toBe(3);
      expect(computeAggregation(testData, 'count:active:false')).toBe(1);
    });

    it('trouve le minimum', () => {
      expect(computeAggregation(testData, 'min:score')).toBe(40);
    });

    it('trouve le maximum', () => {
      expect(computeAggregation(testData, 'max:score')).toBe(100);
    });

    it('retourne le premier élément', () => {
      expect(computeAggregation(testData, 'first:name')).toBe('A');
    });

    it('retourne le dernier élément', () => {
      expect(computeAggregation(testData, 'last:name')).toBe('D');
    });

    it("accède directement à une propriété d'un objet", () => {
      const obj = { total: 42 };
      expect(computeAggregation(obj, 'total')).toBe(42);
    });

    it('retourne null pour un tableau vide', () => {
      expect(computeAggregation([], 'avg:score')).toBe(null);
    });

    it('retourne null si les données ne sont pas un tableau pour les agrégations', () => {
      expect(computeAggregation('invalid', 'avg:score')).toBe(null);
    });
  });

  describe('min / max sur des dates ISO (#667)', () => {
    const rows = [
      { maj: '2026-09-01', prix: 1.749 },
      { maj: '2026-09-09', prix: 1.799 },
      { maj: '2026-08-30', prix: 1.7 },
    ];

    it('AC : max renvoie la date ISO la plus récente (grammaire commune et historique)', () => {
      expect(computeAggregation(rows, 'maj:max')).toBe('2026-09-09');
      expect(computeAggregation(rows, 'max:maj')).toBe('2026-09-09');
    });

    it('min renvoie la date ISO la plus ancienne', () => {
      expect(computeAggregation(rows, 'maj:min')).toBe('2026-08-30');
    });

    it('avant #667, toNumber("2026-09-09") valait 2026 : plus de faux maximum numérique', () => {
      expect(computeAggregation(rows, 'maj:max')).not.toBe(2026);
    });

    it('accepte les datetime ISO (T ou espace, Z ou décalage) et ignore les vides', () => {
      // Comparaison textuelle (espace ramené à T) : les décalages horaires ne
      // sont pas convertis — une colonne homogène est l'usage attendu.
      const dt = [
        { at: '2026-09-09T08:00:00Z' },
        { at: '' },
        { at: null },
        { at: '2026-09-09 17:30:00' },
        { at: '2026-09-08T23:59:59+02:00' },
      ];
      expect(computeAggregation(dt, 'at:max')).toBe('2026-09-09 17:30:00');
      expect(computeAggregation(dt, 'at:min')).toBe('2026-09-08T23:59:59+02:00');
    });

    it('colonne numérique : comportement INCHANGÉ (nombres, décimales françaises)', () => {
      expect(computeAggregation(rows, 'prix:max')).toBe(1.799);
      expect(computeAggregation(rows, 'prix:min')).toBe(1.7);
      const fr = [{ v: '1 234,5' }, { v: '99' }];
      expect(computeAggregation(fr, 'v:max')).toBe(1234.5);
    });

    it('colonne mixte (dates et nombres) : chemin numérique, pas de comparaison de dates', () => {
      const mixed = [{ v: '2026-09-09' }, { v: 3000 }];
      expect(computeAggregation(mixed, 'v:max')).toBe(3000);
    });

    it('first / last renvoient la chaîne ISO brute (formatée par le KPI via format="date")', () => {
      expect(computeAggregation(rows, 'maj:first')).toBe('2026-09-01');
      expect(computeAggregation(rows, 'maj:last')).toBe('2026-08-30');
    });
  });
});
