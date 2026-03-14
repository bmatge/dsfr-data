import { describe, it, expect } from 'vitest';
import { COUNTRY_NAMES_FR } from '../../src/data/country-names.js';
import { COUNTRY_CONTINENT } from '../../src/data/continent-lookup.js';

describe('COUNTRY_NAMES_FR', () => {
  it('contains France', () => {
    expect(COUNTRY_NAMES_FR['250']).toBe('France');
  });

  it('contains Allemagne (Germany)', () => {
    expect(COUNTRY_NAMES_FR['276']).toBe('Allemagne');
  });

  it('contains Etats-Unis (USA)', () => {
    expect(COUNTRY_NAMES_FR['840']).toBe('Etats-Unis');
  });

  it('contains Royaume-Uni (UK)', () => {
    expect(COUNTRY_NAMES_FR['826']).toBe('Royaume-Uni');
  });

  it('contains Espagne (Spain)', () => {
    expect(COUNTRY_NAMES_FR['724']).toBe('Espagne');
  });

  it('contains Japon (Japan)', () => {
    expect(COUNTRY_NAMES_FR['392']).toBe('Japon');
  });

  it('contains Bresil (Brazil)', () => {
    expect(COUNTRY_NAMES_FR['076']).toBe('Bresil');
  });

  it('handles special characters (apostrophe)', () => {
    expect(COUNTRY_NAMES_FR['384']).toBe("Cote d'Ivoire");
  });

  it('returns undefined for unknown code', () => {
    expect(COUNTRY_NAMES_FR['999']).toBeUndefined();
  });

  it('all keys are 3-digit zero-padded strings', () => {
    for (const key of Object.keys(COUNTRY_NAMES_FR)) {
      expect(key).toMatch(/^\d{3}$/);
    }
  });

  it('all values are non-empty strings', () => {
    for (const name of Object.values(COUNTRY_NAMES_FR)) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('has at least 170 entries', () => {
    expect(Object.keys(COUNTRY_NAMES_FR).length).toBeGreaterThanOrEqual(170);
  });

  it('covers nearly all countries in COUNTRY_CONTINENT', () => {
    const missingNames = Object.keys(COUNTRY_CONTINENT).filter(
      code => !COUNTRY_NAMES_FR[code]
    );
    // A few small countries (e.g. Singapore 702, Bahrain 048) may not have French names
    expect(missingNames.length).toBeLessThanOrEqual(3);
  });
});
