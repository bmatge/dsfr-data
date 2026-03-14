import { describe, it, expect } from 'vitest';
import {
  COUNTRY_CONTINENT,
  ISO_A2_TO_NUM,
  ISO_A3_TO_NUM,
  toIsoNumeric,
  CONTINENTS,
} from '../../src/data/continent-lookup.js';

describe('COUNTRY_CONTINENT', () => {
  it('maps France (250) to Europe', () => {
    expect(COUNTRY_CONTINENT['250']).toBe('Europe');
  });

  it('maps USA (840) to North America', () => {
    expect(COUNTRY_CONTINENT['840']).toBe('North America');
  });

  it('maps Brazil (076) to South America', () => {
    expect(COUNTRY_CONTINENT['076']).toBe('South America');
  });

  it('maps Japan (392) to Asia', () => {
    expect(COUNTRY_CONTINENT['392']).toBe('Asia');
  });

  it('maps Nigeria (566) to Africa', () => {
    expect(COUNTRY_CONTINENT['566']).toBe('Africa');
  });

  it('maps Australia (036) to Oceania', () => {
    expect(COUNTRY_CONTINENT['036']).toBe('Oceania');
  });

  it('maps Greenland (304) to Oceania (grouped for map zoom)', () => {
    expect(COUNTRY_CONTINENT['304']).toBe('Oceania');
  });

  it('returns undefined for unknown code', () => {
    expect(COUNTRY_CONTINENT['999']).toBeUndefined();
  });

  it('has entries for all 6 continents', () => {
    const continents = new Set(Object.values(COUNTRY_CONTINENT));
    for (const c of CONTINENTS) {
      expect(continents.has(c)).toBe(true);
    }
  });
});

describe('ISO_A2_TO_NUM', () => {
  it('maps FR to 250', () => {
    expect(ISO_A2_TO_NUM['FR']).toBe('250');
  });

  it('maps US to 840', () => {
    expect(ISO_A2_TO_NUM['US']).toBe('840');
  });

  it('maps GB to 826', () => {
    expect(ISO_A2_TO_NUM['GB']).toBe('826');
  });

  it('returns undefined for unknown code', () => {
    expect(ISO_A2_TO_NUM['XX']).toBeUndefined();
  });

  it('all values are 3-digit zero-padded strings', () => {
    for (const val of Object.values(ISO_A2_TO_NUM)) {
      expect(val).toMatch(/^\d{3}$/);
    }
  });
});

describe('ISO_A3_TO_NUM', () => {
  it('maps FRA to 250', () => {
    expect(ISO_A3_TO_NUM['FRA']).toBe('250');
  });

  it('maps USA to 840', () => {
    expect(ISO_A3_TO_NUM['USA']).toBe('840');
  });

  it('maps GBR to 826', () => {
    expect(ISO_A3_TO_NUM['GBR']).toBe('826');
  });

  it('returns undefined for unknown code', () => {
    expect(ISO_A3_TO_NUM['XXX']).toBeUndefined();
  });

  it('all values are 3-digit zero-padded strings', () => {
    for (const val of Object.values(ISO_A3_TO_NUM)) {
      expect(val).toMatch(/^\d{3}$/);
    }
  });
});

describe('toIsoNumeric', () => {
  it('converts iso-a2 code to numeric', () => {
    expect(toIsoNumeric('FR', 'iso-a2')).toBe('250');
  });

  it('converts iso-a3 code to numeric', () => {
    expect(toIsoNumeric('FRA', 'iso-a3')).toBe('250');
  });

  it('returns padded numeric for iso-num', () => {
    expect(toIsoNumeric('250', 'iso-num')).toBe('250');
  });

  it('pads short numeric codes', () => {
    expect(toIsoNumeric('4', 'iso-num')).toBe('004');
  });

  it('handles already-padded numeric codes', () => {
    expect(toIsoNumeric('004', 'iso-num')).toBe('004');
  });

  it('is case-insensitive for alpha-2', () => {
    expect(toIsoNumeric('fr', 'iso-a2')).toBe('250');
    expect(toIsoNumeric('Fr', 'iso-a2')).toBe('250');
  });

  it('is case-insensitive for alpha-3', () => {
    expect(toIsoNumeric('fra', 'iso-a3')).toBe('250');
    expect(toIsoNumeric('Fra', 'iso-a3')).toBe('250');
  });

  it('trims whitespace', () => {
    expect(toIsoNumeric('  FR  ', 'iso-a2')).toBe('250');
  });

  it('returns empty string for unknown alpha-2', () => {
    expect(toIsoNumeric('XX', 'iso-a2')).toBe('');
  });

  it('returns empty string for unknown alpha-3', () => {
    expect(toIsoNumeric('XXX', 'iso-a3')).toBe('');
  });
});

describe('CONTINENTS', () => {
  it('has exactly 6 entries', () => {
    expect(CONTINENTS).toHaveLength(6);
  });

  it('contains expected continent names', () => {
    expect(CONTINENTS).toContain('Africa');
    expect(CONTINENTS).toContain('Europe');
    expect(CONTINENTS).toContain('Asia');
    expect(CONTINENTS).toContain('North America');
    expect(CONTINENTS).toContain('South America');
    expect(CONTINENTS).toContain('Oceania');
  });
});

describe('Cross-consistency', () => {
  it('ISO_A2_TO_NUM and ISO_A3_TO_NUM agree on shared countries', () => {
    // FR/FRA should both map to 250
    expect(ISO_A2_TO_NUM['FR']).toBe(ISO_A3_TO_NUM['FRA']);
    expect(ISO_A2_TO_NUM['US']).toBe(ISO_A3_TO_NUM['USA']);
    expect(ISO_A2_TO_NUM['DE']).toBe(ISO_A3_TO_NUM['DEU']);
    expect(ISO_A2_TO_NUM['JP']).toBe(ISO_A3_TO_NUM['JPN']);
    expect(ISO_A2_TO_NUM['BR']).toBe(ISO_A3_TO_NUM['BRA']);
  });

  it('most ISO_A2 numeric values exist in COUNTRY_CONTINENT', () => {
    let missingCount = 0;
    for (const numCode of Object.values(ISO_A2_TO_NUM)) {
      if (!COUNTRY_CONTINENT[numCode]) missingCount++;
    }
    // A few codes in ISO_A2 (e.g. Grenada 308) are not in the 110m topology
    expect(missingCount).toBeLessThanOrEqual(3);
  });
});
