import { describe, it, expect } from 'vitest';
import { isValidDeptCode } from '../../packages/shared/src/utils/dept-codes';

describe('isValidDeptCode', () => {
  it('should validate metropolitan departments (01-95)', () => {
    expect(isValidDeptCode('01')).toBe(true);
    expect(isValidDeptCode('13')).toBe(true);
    expect(isValidDeptCode('75')).toBe(true);
    expect(isValidDeptCode('95')).toBe(true);
  });

  it('should validate Corsica codes', () => {
    expect(isValidDeptCode('2A')).toBe(true);
    expect(isValidDeptCode('2B')).toBe(true);
  });

  it('should validate overseas departments (971-976)', () => {
    expect(isValidDeptCode('971')).toBe(true);
    expect(isValidDeptCode('972')).toBe(true);
    expect(isValidDeptCode('973')).toBe(true);
    expect(isValidDeptCode('974')).toBe(true);
    expect(isValidDeptCode('975')).toBe(true);
    expect(isValidDeptCode('976')).toBe(true);
  });

  it('should reject invalid codes', () => {
    expect(isValidDeptCode('00')).toBe(false);
    expect(isValidDeptCode('96')).toBe(false);
    expect(isValidDeptCode('977')).toBe(false);
    expect(isValidDeptCode('970')).toBe(false);
    expect(isValidDeptCode('99')).toBe(false);
  });

  it('should reject special strings', () => {
    expect(isValidDeptCode('N/A')).toBe(false);
    expect(isValidDeptCode('null')).toBe(false);
    expect(isValidDeptCode('undefined')).toBe(false);
    expect(isValidDeptCode('')).toBe(false);
  });

  it('should reject null and undefined', () => {
    expect(isValidDeptCode(null)).toBe(false);
    expect(isValidDeptCode(undefined)).toBe(false);
  });
});
