import { describe, it, expect } from 'vitest';
import {
  analyzeDataFields,
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
  // #1224 : `Date.parse` lit « 75 », « 01004 » ou « Zone 12 » comme des dates
  // sous V8. Un code département annoncé « date » au modèle du Studio oriente
  // vers une courbe temporelle au lieu d'une carte ou d'un classement.
  describe('analyzeDataFields : type des champs', () => {
    const typeDe = (valeurs: unknown[]): string =>
      analyzeDataFields(valeurs.map((v) => ({ champ: v })))[0].type;

    it.each([
      ['un code département', '75'],
      ['un code département corse', '2A'],
      ['un libellé terminé par un nombre', 'Zone 12'],
      ['un code postal écrit en chaîne', '01004'],
      ['une année seule', '2024'],
      ['une date française en chiffres (ordre des champs ambigu)', '03/01/2024'],
      ['une date française en lettres', '4 décembre 1837'],
    ])('%s (« %s ») est du texte, pas une date', (_cas, valeur) => {
      expect(typeDe([valeur])).toBe('texte');
    });

    it.each([
      ['une date ISO', '2024-03-01'],
      ['une date ISO avec heure et fuseau', '2024-03-01T10:00:00Z'],
      ['une date ISO avec heure, séparée par une espace', '2024-03-01 10:00'],
    ])('%s (« %s ») est une date', (_cas, valeur) => {
      expect(typeDe([valeur])).toBe('date');
    });

    it('décide sur plusieurs valeurs : une seule qui n’est pas une date suffit à faire du texte', () => {
      expect(typeDe(['2024-03-01', '2024-03-02', 'inconnue'])).toBe('texte');
      expect(typeDe(['2024-03-01', '2024-03-02', '2024-03-03'])).toBe('date');
    });

    it('les valeurs absentes ne comptent pas : ni pour, ni contre', () => {
      expect(typeDe([null, '', '2024-03-01', undefined, '2024-03-02'])).toBe('date');
      expect(typeDe([null, '', undefined])).toBe('texte');
    });

    it('ne lit que les 100 premières lignes', () => {
      const dates = Array.from({ length: 100 }, () => '2024-03-01');
      expect(typeDe([...dates, 'hors échantillon'])).toBe('date');
    });

    it('un nombre reste numérique, une année en nombre comprise', () => {
      expect(typeDe([2024, 2025])).toBe('numérique');
      expect(typeDe([null, 12.5])).toBe('numérique');
    });

    it('l’exemple reste la première valeur non nulle', () => {
      const [champ] = analyzeDataFields([{ champ: null }, { champ: '75' }]);
      expect(champ).toEqual({ name: 'champ', type: 'texte', sample: '75' });
    });
  });

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
