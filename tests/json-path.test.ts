import { describe, it, expect } from 'vitest';
import { getByPath, hasPath, setByPath, getByPathOrDefault } from '@/utils/json-path.js';

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

    it("retourne l'objet entier si le chemin est vide", () => {
      const obj = { name: 'test' };
      expect(getByPath(obj, '')).toBe(obj);
    });

    it("retourne l'objet entier si le chemin est whitespace", () => {
      const obj = { name: 'test' };
      expect(getByPath(obj, '   ')).toBe(obj);
    });

    it("retourne undefined si l'objet est null", () => {
      expect(getByPath(null, 'name')).toBeUndefined();
    });

    it("retourne undefined si l'objet est undefined", () => {
      expect(getByPath(undefined, 'name')).toBeUndefined();
    });

    it('retourne undefined si un segment intermediaire est null', () => {
      const obj = { data: null };
      expect(getByPath(obj, 'data.value')).toBeUndefined();
    });

    it('retourne undefined si un segment intermediaire est primitif', () => {
      const obj = { data: 42 };
      expect(getByPath(obj, 'data.value')).toBeUndefined();
    });

    it('gère les valeurs falsy (0, false, chaine vide)', () => {
      const obj = { zero: 0, empty: '', no: false };
      expect(getByPath(obj, 'zero')).toBe(0);
      expect(getByPath(obj, 'empty')).toBe('');
      expect(getByPath(obj, 'no')).toBe(false);
    });

    it('gère les tableaux avec index [0]', () => {
      const obj = { items: [{ id: 1 }, { id: 2 }] };
      expect(getByPath(obj, 'items[0].id')).toBe(1);
    });

    it('gère les index hors limites (retourne undefined)', () => {
      const obj = { items: ['a', 'b'] };
      expect(getByPath(obj, 'items[99]')).toBeUndefined();
    });

    it('gère les crochets multiples dans le chemin', () => {
      const obj = {
        matrix: [
          [1, 2],
          [3, 4],
        ],
      };
      expect(getByPath(obj, 'matrix[1][0]')).toBe(3);
    });

    it('gère les cles avec des chiffres dans le nom', () => {
      const obj = { field2: 'val' };
      expect(getByPath(obj, 'field2')).toBe('val');
    });

    it('gère les objets profondement imbriqués', () => {
      const obj = { a: { b: { c: { d: { e: 'deep' } } } } };
      expect(getByPath(obj, 'a.b.c.d.e')).toBe('deep');
    });
  });

  describe('hasPath', () => {
    it('retourne true si le chemin existe', () => {
      const obj = { data: { value: 0 } };
      expect(hasPath(obj, 'data.value')).toBe(true);
    });

    it("retourne false si le chemin n'existe pas", () => {
      const obj = { data: {} };
      expect(hasPath(obj, 'data.value')).toBe(false);
    });

    it('retourne true pour les valeurs falsy existantes', () => {
      expect(hasPath({ v: 0 }, 'v')).toBe(true);
      expect(hasPath({ v: '' }, 'v')).toBe(true);
      expect(hasPath({ v: false }, 'v')).toBe(true);
      expect(hasPath({ v: null }, 'v')).toBe(true);
    });

    it('retourne false pour un objet vide', () => {
      expect(hasPath({}, 'anything')).toBe(false);
    });

    it('retourne true pour un chemin imbriqué avec crochets', () => {
      const obj = { items: [{ id: 1 }] };
      expect(hasPath(obj, 'items[0].id')).toBe(true);
    });

    it('rejette __proto__ (prototype pollution)', () => {
      const obj = { a: 1 };
      expect(getByPath(obj, '__proto__')).toBeUndefined();
      expect(getByPath(obj, 'constructor')).toBeUndefined();
      expect(getByPath(obj, 'a.__proto__')).toBeUndefined();
    });
  });

  describe('setByPath', () => {
    it('assigne une valeur a un chemin simple', () => {
      const obj: Record<string, unknown> = {};
      setByPath(obj, 'name', 'test');
      expect(obj.name).toBe('test');
    });

    it('cree les objets intermediaires', () => {
      const obj: Record<string, unknown> = {};
      setByPath(obj, 'a.b.c', 42);
      expect((obj as any).a.b.c).toBe(42);
    });

    it('ecrase une valeur existante', () => {
      const obj: Record<string, unknown> = { name: 'old' };
      setByPath(obj, 'name', 'new');
      expect(obj.name).toBe('new');
    });

    it('ecrase un intermediaire non-objet', () => {
      const obj: Record<string, unknown> = { a: 'string' };
      setByPath(obj, 'a.b', 42);
      expect((obj as any).a.b).toBe(42);
    });

    it('gère la notation crochets', () => {
      const obj: Record<string, unknown> = { items: ['a', 'b', 'c'] };
      setByPath(obj, 'items[1]', 'x');
      expect((obj as any).items[1]).toBe('x');
    });

    it('gère un chemin profondement imbriqué', () => {
      const obj: Record<string, unknown> = {};
      setByPath(obj, 'fields.Pays', 'France');
      expect((obj as any).fields.Pays).toBe('France');
    });

    it('ne cree pas de nouvel objet intermediaire si existant', () => {
      const obj: Record<string, unknown> = { data: { existing: true } };
      setByPath(obj, 'data.new_key', 'val');
      expect((obj as any).data.existing).toBe(true);
      expect((obj as any).data.new_key).toBe('val');
    });

    it("n'assigne pas une cle __proto__ (prototype pollution)", () => {
      const obj: Record<string, unknown> = {};
      setByPath(obj, '__proto__.polluted', 'yes');
      expect(({} as any).polluted).toBeUndefined();
    });

    it("n'assigne pas via une cle constructor", () => {
      const obj: Record<string, unknown> = {};
      setByPath(obj, 'constructor.prototype.polluted', 'yes');
      expect(({} as any).polluted).toBeUndefined();
    });
  });

  describe('getByPathOrDefault', () => {
    it('retourne la valeur si elle existe', () => {
      const obj = { count: 10 };
      expect(getByPathOrDefault(obj, 'count', 0)).toBe(10);
    });

    it("retourne la valeur par défaut si le chemin n'existe pas", () => {
      const obj = {};
      expect(getByPathOrDefault(obj, 'count', 42)).toBe(42);
    });

    it('retourne la valeur falsy si elle existe (0, false, chaine vide)', () => {
      expect(getByPathOrDefault({ v: 0 }, 'v', 99)).toBe(0);
      expect(getByPathOrDefault({ v: false }, 'v', true)).toBe(false);
      expect(getByPathOrDefault({ v: '' }, 'v', 'default')).toBe('');
    });

    it('retourne la valeur par défaut pour un chemin imbriqué inexistant', () => {
      const obj = { a: {} };
      expect(getByPathOrDefault(obj, 'a.b.c', 'fallback')).toBe('fallback');
    });

    it('retourne la valeur pour un chemin imbriqué existant', () => {
      const obj = { a: { b: { c: 'found' } } };
      expect(getByPathOrDefault(obj, 'a.b.c', 'fallback')).toBe('found');
    });
  });
});
