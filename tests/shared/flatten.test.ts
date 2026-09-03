import { describe, it, expect } from 'vitest';
import {
  flattenInseeObservation,
  flattenNestedKey,
  flattenProviderRecords,
} from '../../packages/shared/src/providers/flatten.js';
import { INSEE_CONFIG } from '../../packages/shared/src/providers/insee.js';
import { GRIST_CONFIG } from '../../packages/shared/src/providers/grist.js';
import { GENERIC_CONFIG } from '../../packages/shared/src/providers/generic.js';

// Observation reelle de https://api.insee.fr/melodi/data/DD_EEC_ANNUEL (#586)
const OBSERVATION = {
  attributes: { OBS_STATUS: 'A', UNIT_MEASURE: 'PS' },
  dimensions: { SEX: 'M', TIME_PERIOD: '2025', AGE: 'Y20T24' },
  measures: { OBS_VALUE_NIVEAU: { value: 34.9 } },
};

describe('flattenInseeObservation', () => {
  it('aplatit dimensions, mesures et attributs sur un seul niveau', () => {
    expect(flattenInseeObservation(OBSERVATION)).toEqual({
      SEX: 'M',
      TIME_PERIOD: '2025',
      AGE: 'Y20T24',
      OBS_VALUE: 34.9,
      OBS_STATUS: 'A',
      UNIT_MEASURE: 'PS',
    });
  });

  it('retire le suffixe _NIVEAU des mesures', () => {
    const flat = flattenInseeObservation(OBSERVATION);
    expect(flat).toHaveProperty('OBS_VALUE');
    expect(flat).not.toHaveProperty('OBS_VALUE_NIVEAU');
  });

  it('ne laisse aucune valeur objet (cause des [object Object] en table)', () => {
    const values = Object.values(flattenInseeObservation(OBSERVATION));
    expect(values.every((v) => typeof v !== 'object' || v === null)).toBe(true);
  });

  it('tolere les blocs absents et les entrees invalides', () => {
    expect(flattenInseeObservation({ dimensions: { A: 1 } })).toEqual({ A: 1 });
    expect(flattenInseeObservation(null)).toEqual({});
    expect(flattenInseeObservation('pas un objet')).toEqual({});
  });

  it('ignore une mesure sans champ value', () => {
    expect(flattenInseeObservation({ measures: { X: { autre: 1 } } })).toEqual({});
  });
});

describe('flattenNestedKey', () => {
  it("remonte les champs de l'enveloppe et conserve les cles de tete", () => {
    expect(flattenNestedKey({ id: 1, fields: { Nom: 'Paris', Pop: 2000000 } }, 'fields')).toEqual({
      id: 1,
      Nom: 'Paris',
      Pop: 2000000,
    });
  });

  it("laisse l'enregistrement intact quand l'enveloppe est absente", () => {
    expect(flattenNestedKey({ id: 1, Nom: 'Paris' }, 'fields')).toEqual({ id: 1, Nom: 'Paris' });
  });

  it('donne la priorite a la valeur imbriquee en cas de collision', () => {
    expect(flattenNestedKey({ Nom: 'tete', fields: { Nom: 'metier' } }, 'fields')).toEqual({
      Nom: 'metier',
    });
  });
});

describe('flattenProviderRecords', () => {
  it('applique flattenRecord pour INSEE', () => {
    const [flat] = flattenProviderRecords([OBSERVATION], INSEE_CONFIG.response) as Record<
      string,
      unknown
    >[];
    expect(flat.OBS_VALUE).toBe(34.9);
    expect(flat.SEX).toBe('M');
  });

  it('applique nestedDataKey pour Grist', () => {
    const [flat] = flattenProviderRecords(
      [{ id: 7, fields: { Ville: 'Lyon' } }],
      GRIST_CONFIG.response
    ) as Record<string, unknown>[];
    expect(flat).toEqual({ id: 7, Ville: 'Lyon' });
  });

  it('rend le tableau inchange quand requiresFlatten est faux', () => {
    const records = [{ a: { b: 1 } }];
    expect(flattenProviderRecords(records, GENERIC_CONFIG.response)).toBe(records);
  });

  it("rend le tableau inchange quand aucune strategie n'est declaree", () => {
    const records = [{ a: 1 }];
    expect(flattenProviderRecords(records, { requiresFlatten: true, nestedDataKey: null })).toBe(
      records
    );
  });
});
