import { describe, it, expect } from 'vitest';
import {
  applyWhereFilter,
  inspectData,
  distinctValues,
  countWhere,
  diagnoseConfig,
} from '../../packages/shared/src/ia/data-tools';
import type { Field } from '../../packages/shared/src/ia/data-tools';

const DATA = [
  { region: 'Ile-de-France', population: 12000, code: '75' },
  { region: 'Provence', population: 5000, code: '13' },
  { region: 'Bretagne', population: 3000, code: '35' },
  { region: 'Bretagne', population: 300, code: '35' },
];

const FIELDS: Field[] = [
  { name: 'region', type: 'texte', sample: 'Ile-de-France' },
  { name: 'population', type: 'numérique', sample: 12000 },
  { name: 'code', type: 'texte', sample: '75' },
];

describe('data-tools', () => {
  describe('applyWhereFilter', () => {
    it('filtre par egalite et combine en AND', () => {
      expect(applyWhereFilter(DATA, 'region:eq:Bretagne')).toHaveLength(2);
      expect(applyWhereFilter(DATA, 'region:eq:Bretagne, population:gt:1000')).toHaveLength(1);
    });
    it('supporte gt/lt/contains/in', () => {
      expect(applyWhereFilter(DATA, 'population:gte:5000')).toHaveLength(2);
      expect(applyWhereFilter(DATA, 'region:contains:bret')).toHaveLength(2);
      expect(applyWhereFilter(DATA, 'code:in:75|13')).toHaveLength(2);
    });
  });

  describe('inspectData', () => {
    it('expose type, min/max pour les nombres et valeurs distinctes pour le texte', () => {
      const out = inspectData(DATA, FIELDS);
      expect(out).toContain('region (texte)');
      expect(out).toContain('Bretagne');
      expect(out).toContain('population (nombre)');
      expect(out).toContain('min 300');
      expect(out).toContain('max 12000');
    });
    it('gere l absence de données', () => {
      expect(inspectData([], [])).toMatch(/Aucune donnee/);
    });
  });

  describe('distinctValues', () => {
    it('liste les valeurs reelles et leur nombre', () => {
      const out = distinctValues(DATA, 'region');
      expect(out).toContain('3 au total');
      expect(out).toContain('Bretagne');
    });
    it('signale un champ inexistant avec la liste des champs', () => {
      expect(distinctValues(DATA, 'nope')).toContain('Champs disponibles');
    });
  });

  describe('countWhere', () => {
    it('compte les lignes qui matchent', () => {
      expect(countWhere(DATA, 'region:eq:Bretagne')).toContain('2 / 4');
    });
    it('avertit quand zero ligne', () => {
      expect(countWhere(DATA, 'region:eq:Corse')).toContain('ZERO');
    });
  });

  describe('diagnoseConfig', () => {
    it('valide une config correcte', () => {
      const d = diagnoseConfig(
        { type: 'bar', valueField: 'population', labelField: 'region' },
        DATA
      );
      expect(d.ok).toBe(true);
      expect(d.text).toContain('valide');
    });
    it('rejette un champ inexistant (erreur bloquante)', () => {
      const d = diagnoseConfig({ type: 'bar', valueField: 'pib', labelField: 'region' }, DATA);
      expect(d.ok).toBe(false);
      expect(d.text).toContain('pib');
    });
    it('rejette un filtre a zero ligne', () => {
      const d = diagnoseConfig(
        { type: 'bar', valueField: 'population', labelField: 'region', where: 'region:eq:Corse' },
        DATA
      );
      expect(d.ok).toBe(false);
      expect(d.text).toContain('AUCUNE ligne');
    });
    it('bloque un valueField non numerique (cause du graphe a plat sur 0)', () => {
      const d = diagnoseConfig({ type: 'bar', valueField: 'region', labelField: 'code' }, DATA);
      expect(d.ok).toBe(false);
      expect(d.text).toContain('non numerique');
    });
    it('valide une config multi-séries (valueFields)', () => {
      const d = diagnoseConfig(
        { type: 'line', valueField: 'population', valueFields: ['code'], labelField: 'region' },
        DATA
      );
      expect(d.ok).toBe(true);
    });
    it('rejette une série valueFields inexistante', () => {
      const d = diagnoseConfig(
        { type: 'line', valueField: 'population', valueFields: ['ghost'], labelField: 'region' },
        DATA
      );
      expect(d.ok).toBe(false);
      expect(d.text).toContain('ghost');
    });
  });
});
