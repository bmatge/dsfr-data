/**
 * Détection du champ géographique des cartes du Builder (#1204) : régions,
 * académies, pays, en plus des départements (#610).
 *
 * Le Builder recopie les référentiels de la bibliothèque pour détecter, sans
 * l'importer. La première série de tests compare donc les deux : une région ou
 * une académie que la bibliothèque sait dessiner doit être reconnue ici, sinon
 * le Builder avertirait à tort sur une source parfaitement valide.
 *
 * Preuve de mutation (faite à la main, défaut retiré ensuite) : retirer
 * `'NANCY METZ'` de `ACADEMIES` rougit la comparaison des académies ; remplacer
 * le seuil `0.8` par `0` rend « aucun champ ne convient » rouge.
 */
import { describe, it, expect } from 'vitest';
import { SAMPLE_DATASETS } from '@dsfr-data/shared';
import {
  MAP_TYPES,
  REFERENTIELS,
  champConvient,
  estAcademie,
  estCodePays,
  estRegion,
  isMapType,
  trouverChampGeo,
} from '../../../apps/builder/src/geo-codes';
import { toAcademyKey, toRegionKey } from '../../../packages/core/src/utils/map-geo-keys';

const REGIONS = [
  ['11', 'Île-de-France', 'IDF'],
  ['24', 'Centre-Val de Loire', 'CVL'],
  ['27', 'Bourgogne-Franche-Comté', 'BFC'],
  ['28', 'Normandie', 'NOR'],
  ['32', 'Hauts-de-France', 'HDF'],
  ['44', 'Grand Est', 'GES'],
  ['52', 'Pays de la Loire', 'PDL'],
  ['53', 'Bretagne', 'BRE'],
  ['75', 'Nouvelle-Aquitaine', 'NAQ'],
  ['76', 'Occitanie', 'OCC'],
  ['84', 'Auvergne-Rhône-Alpes', 'ARA'],
  ['93', "Provence-Alpes-Côte d'Azur", 'PAC'],
  ['94', 'Corse', '20R'],
  ['01', 'Guadeloupe', '971'],
  ['02', 'Martinique', '972'],
  ['03', 'Guyane', '973'],
  ['04', 'La Réunion', '974'],
  ['06', 'Mayotte', '976'],
] as const;

const ACADEMIES = [
  'Aix-Marseille',
  'Amiens',
  'Besançon',
  'Bordeaux',
  'Clermont-Ferrand',
  'Corse',
  'Créteil',
  'Dijon',
  'Grenoble',
  'Guadeloupe',
  'Guyane',
  'Lille',
  'Limoges',
  'Lyon',
  'Martinique',
  'Mayotte',
  'Montpellier',
  'Nancy-Metz',
  'Nantes',
  'Nice',
  'Normandie',
  'Orléans-Tours',
  'Paris',
  'Poitiers',
  'Reims',
  'Rennes',
  'La Réunion',
  'Strasbourg',
  'Toulouse',
  'Versailles',
];

describe('le Builder reconnaît ce que la bibliothèque sait dessiner', () => {
  it('régions : code INSEE, nom et clé DSFR Chart des 18 régions', () => {
    for (const [insee, nom, cle] of REGIONS) {
      for (const forme of [insee, nom, cle, nom.toUpperCase()]) {
        expect(toRegionKey(forme), `bibliothèque : ${forme}`).toBe(cle);
        expect(estRegion(forme), `Builder : ${forme}`).toBe(true);
      }
    }
    // Un code INSEE numérique perd son zéro de tête dans un tableur.
    expect(estRegion('1')).toBe(true);
    expect(toRegionKey('1')).toBe('971');
  });

  it('régions : ce que la bibliothèque rejette est rejeté', () => {
    for (const forme of ['99', '21', 'Aquitaine', 'France', '', '2A', '590']) {
      expect(toRegionKey(forme), `bibliothèque : ${forme}`).toBe('');
      expect(estRegion(forme), `Builder : ${forme}`).toBe(false);
    }
  });

  it('académies : les 30 noms, nus, préfixés, en majuscules sans accent', () => {
    expect(ACADEMIES).toHaveLength(30);
    for (const nom of ACADEMIES) {
      const formes = [
        nom,
        nom.toUpperCase(),
        `Académie de ${nom}`,
        nom.normalize('NFD').replace(/[̀-ͯ]/g, ''),
      ];
      for (const forme of formes) {
        expect(toAcademyKey(forme), `bibliothèque : ${forme}`).not.toBe('');
        expect(estAcademie(forme), `Builder : ${forme}`).toBe(true);
      }
    }
    expect(estAcademie("Académie d'Aix-Marseille")).toBe(true);
    expect(estAcademie('Académie de La Réunion')).toBe(true);
  });

  it('académies : ce que la bibliothèque rejette est rejeté', () => {
    for (const forme of ['Polynésie française', 'Marseille', '13', 'Académie', '']) {
      expect(toAcademyKey(forme), `bibliothèque : ${forme}`).toBe('');
      expect(estAcademie(forme), `Builder : ${forme}`).toBe(false);
    }
  });

  it('pays : la forme des codes ISO, pas les noms', () => {
    for (const code of ['FR', 'fr', 'FRA', '250', ' DE ']) expect(estCodePays(code)).toBe(true);
    for (const autre of ['France', '25', 'F', 'FRAN', '', '2A']) {
      expect(estCodePays(autre)).toBe(false);
    }
  });
});

const champsDe = (lignes: Record<string, unknown>[]) =>
  Object.keys(lignes[0]).map((name) => ({ name, type: typeof lignes[0][name] }));

describe('choix du champ géographique', () => {
  const regions = SAMPLE_DATASETS.find((d) => d.id === 'regions-france')!.rows as Record<
    string,
    unknown
  >[];

  it('jeu « Régions de France » : la carte des régions trouve son champ', () => {
    const champ = trouverChampGeo('map-reg', champsDe(regions), regions);
    expect(champ).not.toBeNull();
    expect(champConvient('map-reg', champ!, regions)).toBe(true);
    // Le nom et le code conviennent tous deux ; le champ au nom régional passe d'abord.
    expect(champConvient('map-reg', 'region', regions)).toBe(true);
    expect(champConvient('map-reg', 'code_region', regions)).toBe(true);
  });

  it('un champ nommé pour le découpage passe avant un champ quelconque', () => {
    const lignes = [
      { identifiant: '11', code_region: '84', total: 3 },
      { identifiant: '24', code_region: '11', total: 5 },
    ];
    expect(trouverChampGeo('map-reg', champsDe(lignes), lignes)).toBe('code_region');
  });

  it('académies : le champ de noms est trouvé, un champ de codes ne l’est pas', () => {
    const lignes = [
      { code: '01', academie: 'Académie de Lyon', effectif: 10 },
      { code: '02', academie: 'Besançon', effectif: 20 },
      { code: '03', academie: 'Aix-Marseille', effectif: 30 },
    ];
    expect(trouverChampGeo('map-aca', champsDe(lignes), lignes)).toBe('academie');
  });

  it('monde : le champ de codes ISO est trouvé', () => {
    const lignes = [
      { pays: 'France', iso3: 'FRA', exportations: 10 },
      { pays: 'Allemagne', iso3: 'DEU', exportations: 20 },
    ];
    expect(trouverChampGeo('map-monde', champsDe(lignes), lignes)).toBe('iso3');
  });

  it('aucun champ ne convient : null, et l’avertissement du type existe', () => {
    const lignes = [
      { produit: 'Blé tendre', volume: 12 },
      { produit: 'Orge de printemps', volume: 7 },
    ];
    for (const type of MAP_TYPES) {
      if (type === 'map') continue; // départements : `findDeptCodeField` (#610)
      expect(trouverChampGeo(type, champsDe(lignes), lignes), type).toBeNull();
      expect(REFERENTIELS[type].avertissement).toMatch(/^<strong>Aucun/);
    }
    expect(trouverChampGeo('map-reg', champsDe(lignes), [])).toBeNull();
  });

  it('tolère jusqu’à 20 % de valeurs hors référentiel, pas davantage', () => {
    const bonnes = ['11', '24', '27', '28'].map((code) => ({ code }));
    expect(champConvient('map-reg', 'code', [...bonnes, { code: '99' }])).toBe(true);
    expect(champConvient('map-reg', 'code', [...bonnes, { code: '99' }, { code: '98' }])).toBe(
      false
    );
    // Les valeurs vides ne comptent ni pour ni contre.
    expect(champConvient('map-reg', 'code', [...bonnes, { code: '' }, { code: null }])).toBe(true);
  });

  it('isMapType : les quatre découpages, rien d’autre', () => {
    expect(MAP_TYPES.every(isMapType)).toBe(true);
    for (const autre of ['bar', 'podium', 'bar-line', 'carte']) {
      expect(isMapType(autre)).toBe(false);
    }
  });
});
