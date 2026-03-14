import { describe, it, expect } from 'vitest';
import { getByPath, hasPath, getByPathOrDefault } from '../src/utils/json-path.js';

describe('json-path', () => {
  describe('getByPath', () => {
    it('retourne la valeur pour un chemin simple', () => {
      const obj = { name: 'test' };
      expect(getByPath(obj, 'name')).toBe('test');
    });

    it('retourne la valeur pour un chemin imbriqué', () => {
      const obj = { data: { results: { count: 42 } } };
      expect(getByPath(obj, 'data.results.count')).toBe(42);
    });

    it('retourne undefined pour un chemin inexistant', () => {
      const obj = { name: 'test' };
      expect(getByPath(obj, 'unknown')).toBeUndefined();
    });

    it('gère les tableaux avec notation crochets', () => {
      const obj = { items: ['a', 'b', 'c'] };
      expect(getByPath(obj, 'items[1]')).toBe('b');
    });

    it('gère les tableaux imbriqués', () => {
      const obj = { data: { items: [{ name: 'first' }, { name: 'second' }] } };
      expect(getByPath(obj, 'data.items[1].name')).toBe('second');
    });

    it('retourne l\'objet entier si le chemin est vide', () => {
      const obj = { name: 'test' };
      expect(getByPath(obj, '')).toBe(obj);
    });

    it('retourne undefined si l\'objet est null', () => {
      expect(getByPath(null, 'name')).toBeUndefined();
    });
  });

  describe('hasPath', () => {
    it('retourne true si le chemin existe', () => {
      const obj = { data: { value: 0 } };
      expect(hasPath(obj, 'data.value')).toBe(true);
    });

    it('retourne false si le chemin n\'existe pas', () => {
      const obj = { data: {} };
      expect(hasPath(obj, 'data.value')).toBe(false);
    });
  });

  describe('getByPathOrDefault', () => {
    it('retourne la valeur si elle existe', () => {
      const obj = { count: 10 };
      expect(getByPathOrDefault(obj, 'count', 0)).toBe(10);
    });

    it('retourne la valeur par défaut si le chemin n\'existe pas', () => {
      const obj = {};
      expect(getByPathOrDefault(obj, 'count', 42)).toBe(42);
    });
  });
});
