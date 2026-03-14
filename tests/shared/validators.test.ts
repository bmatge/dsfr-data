import { describe, it, expect, vi } from 'vitest';
import {
  validateSource,
  validateConnection,
  validateFavorite,
  validateDashboard,
  validateAndFilterArray,
} from '../../packages/shared/src/validation/validators';

describe('validators', () => {
  describe('validateSource', () => {
    it('should accept a valid source', () => {
      const source = { id: 'src-1', name: 'Test', type: 'manual', data: [] };
      expect(validateSource(source)).toEqual(source);
    });

    it('should reject null', () => {
      expect(validateSource(null)).toBeNull();
    });

    it('should reject undefined', () => {
      expect(validateSource(undefined)).toBeNull();
    });

    it('should reject non-object', () => {
      expect(validateSource('string')).toBeNull();
      expect(validateSource(42)).toBeNull();
      expect(validateSource(true)).toBeNull();
    });

    it('should reject missing id', () => {
      expect(validateSource({ name: 'Test', type: 'manual' })).toBeNull();
    });

    it('should reject empty id', () => {
      expect(validateSource({ id: '', name: 'Test', type: 'manual' })).toBeNull();
    });

    it('should reject numeric id', () => {
      expect(validateSource({ id: 123, name: 'Test', type: 'manual' })).toBeNull();
    });

    it('should reject missing name', () => {
      expect(validateSource({ id: 'src-1', type: 'manual' })).toBeNull();
    });

    it('should reject empty name', () => {
      expect(validateSource({ id: 'src-1', name: '', type: 'manual' })).toBeNull();
    });

    it('should reject missing type', () => {
      expect(validateSource({ id: 'src-1', name: 'Test' })).toBeNull();
    });

    it('should reject non-string type', () => {
      expect(validateSource({ id: 'src-1', name: 'Test', type: 42 })).toBeNull();
    });

    it('should accept source with extra fields', () => {
      const source = { id: 'src-1', name: 'Test', type: 'grist', apiUrl: 'http://test', data: [{ a: 1 }] };
      expect(validateSource(source)).toEqual(source);
    });
  });

  describe('validateConnection', () => {
    it('should accept a valid connection', () => {
      const conn = { id: 'conn-1', name: 'My Grist', type: 'grist', url: 'http://test' };
      expect(validateConnection(conn)).toEqual(conn);
    });

    it('should reject null/undefined', () => {
      expect(validateConnection(null)).toBeNull();
      expect(validateConnection(undefined)).toBeNull();
    });

    it('should reject missing id', () => {
      expect(validateConnection({ name: 'Test', type: 'grist' })).toBeNull();
    });

    it('should reject empty id', () => {
      expect(validateConnection({ id: '', name: 'Test', type: 'grist' })).toBeNull();
    });

    it('should reject missing name', () => {
      expect(validateConnection({ id: 'c-1', type: 'grist' })).toBeNull();
    });

    it('should reject empty name', () => {
      expect(validateConnection({ id: 'c-1', name: '', type: 'grist' })).toBeNull();
    });

    it('should reject missing type', () => {
      expect(validateConnection({ id: 'c-1', name: 'Test' })).toBeNull();
    });

    it('should reject non-string type', () => {
      expect(validateConnection({ id: 'c-1', name: 'Test', type: 5 })).toBeNull();
    });
  });

  describe('validateFavorite', () => {
    it('should accept a valid favorite', () => {
      const fav = { id: 'fav-1', name: 'My Chart', code: '<div>chart</div>' };
      expect(validateFavorite(fav)).toEqual(fav);
    });

    it('should reject null/undefined', () => {
      expect(validateFavorite(null)).toBeNull();
      expect(validateFavorite(undefined)).toBeNull();
    });

    it('should reject missing id', () => {
      expect(validateFavorite({ name: 'Test', code: 'x' })).toBeNull();
    });

    it('should reject empty id', () => {
      expect(validateFavorite({ id: '', name: 'Test', code: 'x' })).toBeNull();
    });

    it('should reject missing name', () => {
      expect(validateFavorite({ id: 'f-1', code: 'x' })).toBeNull();
    });

    it('should reject empty name', () => {
      expect(validateFavorite({ id: 'f-1', name: '', code: 'x' })).toBeNull();
    });

    it('should reject missing code', () => {
      expect(validateFavorite({ id: 'f-1', name: 'Test' })).toBeNull();
    });

    it('should reject empty code', () => {
      expect(validateFavorite({ id: 'f-1', name: 'Test', code: '' })).toBeNull();
    });

    it('should accept favorite with extra fields', () => {
      const fav = { id: 'f-1', name: 'Test', code: '<div/>', chartType: 'bar', source: 'builder' };
      expect(validateFavorite(fav)).toEqual(fav);
    });
  });

  describe('validateDashboard', () => {
    it('should accept a valid dashboard', () => {
      const dash = { id: 'd-1', name: 'My Dashboard' };
      expect(validateDashboard(dash)).toEqual(dash);
    });

    it('should reject null/undefined', () => {
      expect(validateDashboard(null)).toBeNull();
      expect(validateDashboard(undefined)).toBeNull();
    });

    it('should reject missing id', () => {
      expect(validateDashboard({ name: 'Test' })).toBeNull();
    });

    it('should reject empty id', () => {
      expect(validateDashboard({ id: '', name: 'Test' })).toBeNull();
    });

    it('should reject missing name', () => {
      expect(validateDashboard({ id: 'd-1' })).toBeNull();
    });

    it('should reject empty name', () => {
      expect(validateDashboard({ id: 'd-1', name: '' })).toBeNull();
    });

    it('should accept dashboard with extra fields', () => {
      const dash = { id: 'd-1', name: 'Test', description: 'A dashboard', widgets: [] };
      expect(validateDashboard(dash)).toEqual(dash);
    });
  });

  describe('validateAndFilterArray', () => {
    it('should filter valid items and drop invalid ones', () => {
      const items = [
        { id: 'src-1', name: 'Good', type: 'manual' },
        null,
        { name: 'No ID', type: 'manual' },
        { id: 'src-2', name: 'Also Good', type: 'grist' },
      ];
      const result = validateAndFilterArray(items, validateSource, 'source');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(items[0]);
      expect(result[1]).toEqual(items[3]);
    });

    it('should return empty array for all invalid items', () => {
      const items = [null, undefined, 'str', 42];
      const result = validateAndFilterArray(items, validateSource, 'source');
      expect(result).toEqual([]);
    });

    it('should return empty array for empty input', () => {
      const result = validateAndFilterArray([], validateSource, 'source');
      expect(result).toEqual([]);
    });

    it('should log warnings for invalid items', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      validateAndFilterArray([null, { bad: true }], validateSource, 'source');
      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(warnSpy.mock.calls[0][0]).toContain('[validation] Invalid source');
    });
  });
});
