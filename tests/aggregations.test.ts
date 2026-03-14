import { describe, it, expect } from 'vitest';
import { parseExpression, computeAggregation } from '../src/utils/aggregations.js';

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
        filterValue: 'active'
      });
    });

    it('parse un comptage avec filtre booléen true', () => {
      expect(parseExpression('count:valid:true')).toEqual({
        type: 'count',
        field: 'valid',
        filterField: 'valid',
        filterValue: true
      });
    });

    it('parse un comptage avec filtre booléen false', () => {
      expect(parseExpression('count:valid:false')).toEqual({
        type: 'count',
        field: 'valid',
        filterField: 'valid',
        filterValue: false
      });
    });
  });

  describe('computeAggregation', () => {
    const testData = [
      { name: 'A', score: 80, active: true },
      { name: 'B', score: 60, active: false },
      { name: 'C', score: 100, active: true },
      { name: 'D', score: 40, active: true }
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

    it('accède directement à une propriété d\'un objet', () => {
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
});
