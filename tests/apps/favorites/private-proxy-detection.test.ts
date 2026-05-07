/**
 * Pure unit tests for favoriteNeedsPrivateProxy().
 * No DB needed — runs in the default vitest pool (covered by `npm run test:run`).
 *
 * Regression : a favorite with builder_state_json = JSON literal `null`
 * (string `"null"` returned by mysql2 for unparsed JSON columns) used to
 * crash the POST /api/shares handler with
 * `Cannot read properties of null (reading 'savedSource')`.
 */

import { describe, it, expect } from 'vitest';
import { favoriteNeedsPrivateProxy } from '../../../server/src/routes/shares';

describe('favoriteNeedsPrivateProxy', () => {
  describe('safe / "no private source" paths', () => {
    it('returns false for null', () => {
      expect(favoriteNeedsPrivateProxy(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(favoriteNeedsPrivateProxy(undefined)).toBe(false);
    });

    it('returns false for the JSON literal null (string "null")', () => {
      expect(favoriteNeedsPrivateProxy('null')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(favoriteNeedsPrivateProxy('')).toBe(false);
    });

    it('returns false for invalid JSON string', () => {
      expect(favoriteNeedsPrivateProxy('not-json{')).toBe(false);
    });

    it('returns false for non-object JSON values', () => {
      expect(favoriteNeedsPrivateProxy('"a string"')).toBe(false);
      expect(favoriteNeedsPrivateProxy('42')).toBe(false);
      expect(favoriteNeedsPrivateProxy('[1,2,3]')).toBe(false);
    });

    it('returns false for empty object', () => {
      expect(favoriteNeedsPrivateProxy({})).toBe(false);
    });

    it('returns false when savedSource is missing', () => {
      expect(favoriteNeedsPrivateProxy({ chartType: 'bar' })).toBe(false);
    });

    it('returns false when savedSource is null', () => {
      expect(favoriteNeedsPrivateProxy({ savedSource: null })).toBe(false);
    });

    it('returns false when savedSource is an array', () => {
      expect(favoriteNeedsPrivateProxy({ savedSource: [] })).toBe(false);
    });

    it('returns false for a public source (no connectionId, no apiKey)', () => {
      expect(
        favoriteNeedsPrivateProxy({
          savedSource: { id: 'src-1', type: 'api', apiUrl: 'https://data.gouv.fr/...' },
        })
      ).toBe(false);
    });

    it('returns false when apiKey is empty string', () => {
      expect(favoriteNeedsPrivateProxy({ savedSource: { apiKey: '' } })).toBe(false);
    });

    it('returns false when apiKey is whitespace', () => {
      expect(favoriteNeedsPrivateProxy({ savedSource: { apiKey: '   ' } })).toBe(false);
    });
  });

  describe('private source detection', () => {
    it('returns true when savedSource has a connectionId', () => {
      expect(favoriteNeedsPrivateProxy({ savedSource: { connectionId: 'conn-1' } })).toBe(true);
    });

    it('returns true when savedSource has a non-empty inline apiKey', () => {
      expect(favoriteNeedsPrivateProxy({ savedSource: { apiKey: 'sk_secret' } })).toBe(true);
    });

    it('accepts JSON-serialized input (string) as well as object input', () => {
      expect(
        favoriteNeedsPrivateProxy(JSON.stringify({ savedSource: { connectionId: 'c-1' } }))
      ).toBe(true);
    });
  });
});
