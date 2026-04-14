import { describe, it, expect } from 'vitest';
import { isUnsafeKey } from '../../packages/shared/src/utils/security';

describe('isUnsafeKey', () => {
  it('rejects __proto__', () => {
    expect(isUnsafeKey('__proto__')).toBe(true);
  });

  it('rejects constructor', () => {
    expect(isUnsafeKey('constructor')).toBe(true);
  });

  it('rejects prototype', () => {
    expect(isUnsafeKey('prototype')).toBe(true);
  });

  it('accepts normal keys', () => {
    expect(isUnsafeKey('foo')).toBe(false);
    expect(isUnsafeKey('bar.baz')).toBe(false);
    expect(isUnsafeKey('0')).toBe(false);
    expect(isUnsafeKey('')).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(isUnsafeKey('__PROTO__')).toBe(false);
    expect(isUnsafeKey('Constructor')).toBe(false);
  });
});
