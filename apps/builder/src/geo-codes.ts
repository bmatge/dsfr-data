/**
 * Référentiels géographiques des cartes du Builder (#1204) : pour chaque
 * découpage, ce que le champ « code » doit contenir, comment reconnaître un
 * champ qui le contient, et quoi dire quand la source n'en a pas.
 *
 * Le RENDU reste l'affaire de la bibliothèque (`dsfr-data-chart` traduit codes
 * et noms vers les clés de DSFR Chart, et compte ce qu'il ignore). Ce module ne
 * fait que DÉTECTER, sur un échantillon, pour proposer le bon champ et avertir
 * avant de générer une carte vide. Il recopie donc les référentiels de
 * `packages/core/src/utils/map-geo-keys.ts` (une app n'importe pas la lib) ;
 * `tests/apps/builder/geo-codes.test.ts` vérifie qu'ils ne divergent pas.
 *
 * Module pur : aucune lecture du DOM ni de l'état.
 */

import { isValidDeptCode, normalizeDeptCode } from '@dsfr-data/shared';

/** Types de carte du Builder, tous rendus par `dsfr-data-chart`. */
export const MAP_TYPES = ['map', 'map-reg', 'map-aca', 'map-monde'] as const;
export type MapType = (typeof MAP_TYPES)[number];

export function isMapType(type: string): type is MapType {
  return (MAP_TYPES as readonly string[]).includes(type);
}

/** Majuscules sans accent, apostrophe droite, séparateurs aplatis en espaces. */
export function normaliserLibelleGeo(brut: string): string {
  return brut
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’ʼ´`]/g, "'")
    .toUpperCase()
    .replace(/[-‐-―_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clés de région de DSFR Chart (ISO 3166-2 sans préfixe, INSEE en outre-mer). */
const CLES_REGION = new Set([
  'ARA',
  'BFC',
  'BRE',
  'CVL',
  'GES',
  'HDF',
  'IDF',
  'NAQ',
  'NOR',
  'OCC',
  'PAC',
  'PDL',
  '20R',
  '971',
  '972',
  '973',
  '974',
  '976',
]);

/** Codes INSEE de région (COG). */
const INSEE_REGION = new Set([
  '01',
  '02',
  '03',
  '04',
  '06',
  '11',
  '24',
  '27',
  '28',
  '32',
  '44',
  '52',
  '53',
  '75',
  '76',
  '84',
  '93',
  '94',
]);

/** Noms de région, normalisés. */
const NOMS_REGION = new Set([
  'AUVERGNE RHONE ALPES',
  'BOURGOGNE FRANCHE COMTE',
  'BRETAGNE',
  'CENTRE VAL DE LOIRE',
  'GRAND EST',
  'HAUTS DE FRANCE',
  'ILE DE FRANCE',
  'NOUVELLE AQUITAINE',
  'NORMANDIE',
  'OCCITANIE',
  "PROVENCE ALPES COTE D'AZUR",
  'PAYS DE LA LOIRE',
  'CORSE',
  'GUADELOUPE',
  'MARTINIQUE',
  'GUYANE',
  'LA REUNION',
  'REUNION',
  'MAYOTTE',
]);

/** Les 30 académies du découpage de DSFR Chart, normalisées (tirets aplatis). */
const ACADEMIES = new Set([
  'AIX MARSEILLE',
  'AMIENS',
  'BESANCON',
  'BORDEAUX',
  'CLERMONT FERRAND',
  'CORSE',
  'CRETEIL',
  'DIJON',
  'GRENOBLE',
  'GUADELOUPE',
  'GUYANE',
  'LILLE',
  'LIMOGES',
  'LYON',
  'MARTINIQUE',
  'MAYOTTE',
  'MONTPELLIER',
  'NANCY METZ',
  'NANTES',
  'NICE',
  'NORMANDIE',
  'ORLEANS TOURS',
  'PARIS',
  'POITIERS',
  'REIMS',
  'RENNES',
  'REUNION',
  'STRASBOURG',
  'TOULOUSE',
  'VERSAILLES',
  // Formes courantes que la bibliothèque traduit.
  'LA REUNION',
  'ILE DE LA REUNION',
]);

const PREFIXE_ACADEMIE = /^ACADEMIE\s+(?:DE\s+LA\s+|DE\s+L'|DES\s+|DE\s+|DU\s+|D')/;

/** La valeur désigne-t-elle une région (clé DSFR Chart, code INSEE ou nom) ? */
export function estRegion(brut: string): boolean {
  const n = normaliserLibelleGeo(brut);
  if (!n) return false;
  if (CLES_REGION.has(n)) return true;
  if (/^\d{1,2}$/.test(n)) return INSEE_REGION.has(n.padStart(2, '0'));
  return NOMS_REGION.has(n);
}

/** La valeur désigne-t-elle une académie (« Besançon », « Académie de Lyon ») ? */
export function estAcademie(brut: string): boolean {
  const sansAccent = brut
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’ʼ´`]/g, "'")
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!sansAccent) return false;
  const n = normaliserLibelleGeo(sansAccent.replace(PREFIXE_ACADEMIE, ''));
  return ACADEMIES.has(n);
}

/**
 * La valeur a-t-elle la FORME d'un code pays ISO (alpha-2, alpha-3, numérique) ?
 * La bibliothèque reconnaît aussi les noms de pays en français ; sans sa table,
 * le Builder ne peut pas les valider : il ne s'engage que sur la forme des
 * codes, et l'avertissement le dit.
 */
export function estCodePays(brut: string): boolean {
  const n = brut.trim().toUpperCase();
  return /^[A-Z]{2,3}$/.test(n) || /^\d{3}$/.test(n);
}

const estDepartement = (brut: string): boolean => isValidDeptCode(normalizeDeptCode(brut));

/** Noms de champs qui désignent une RÉGION, pas un département (#610). */
const NOM_REGIONAL = /(^|[_-])(reg|region)([_-]|$)|region/i;

interface ReferentielCarte {
  /** Libellé du champ « code ». */
  libelle: string;
  /** Ce que le champ doit contenir. */
  aide: string;
  /** Unité géographique, pour l'aide de l'agrégation et du champ de nom. */
  unite: string;
  /** Avertissement quand aucun champ de la source ne convient (HTML statique). */
  avertissement: string;
  /** La valeur appartient-elle au référentiel ? */
  valide: (brut: string) => boolean;
  /** Le nom du champ est-il compatible avec ce découpage ? */
  nomAdmis: (nom: string) => boolean;
  /** Le nom du champ désigne-t-il ce découpage (candidat préféré) ? */
  nomPrefere: (nom: string) => boolean;
  /** Ce qui manque, dans la liste de complétude. */
  manque: string;
}

export const REFERENTIELS: Record<MapType, ReferentielCarte> = {
  map: {
    libelle: 'Code département',
    aide: 'Code INSEE (01-95, 2A, 2B, 971-976)',
    unite: 'département',
    avertissement:
      '<strong>Aucun code département détecté.</strong> ' +
      'Cette carte est <em>départementale</em> : elle attend des codes INSEE ' +
      '(01-95, 2A, 2B, 971-976). Si vos données sont régionales, choisissez le type ' +
      '« Carte régions ». Sinon, convertissez vos noms de départements en codes.',
    valide: estDepartement,
    // Les 13 codes région INSEE sont tous des codes département valides : un
    // champ manifestement régional est écarté, seul son nom tranche (#610).
    nomAdmis: (nom) => !NOM_REGIONAL.test(nom),
    nomPrefere: (nom) => /dep|dpt/i.test(nom),
    manque: 'le champ code (département)',
  },
  'map-reg': {
    libelle: 'Région',
    aide: 'Code INSEE de région (11, 84, 93…) ou nom de la région',
    unite: 'région',
    avertissement:
      '<strong>Aucune région détectée.</strong> ' +
      'Cette carte attend un code INSEE de région (11, 84, 93…) ou le nom de la région ' +
      '(« Île-de-France », « Bretagne »). Si vos données sont départementales, choisissez ' +
      'le type « Carte ».',
    valide: estRegion,
    nomAdmis: () => true,
    nomPrefere: (nom) => NOM_REGIONAL.test(nom),
    manque: 'le champ région (code ou nom)',
  },
  'map-aca': {
    libelle: 'Académie',
    aide: 'Nom de l’académie (ex : Besançon, Aix-Marseille, Académie de Lyon)',
    unite: 'académie',
    avertissement:
      '<strong>Aucune académie détectée.</strong> ' +
      'Cette carte attend le nom de l’académie (« Besançon », « Aix-Marseille », ' +
      '« Académie de Lyon »), pas un code. Les lignes dont le nom n’est pas reconnu ' +
      'ne sont pas dessinées.',
    valide: estAcademie,
    nomAdmis: () => true,
    nomPrefere: (nom) => /acad/i.test(nom),
    manque: 'le champ académie (nom)',
  },
  'map-monde': {
    libelle: 'Pays',
    aide: 'Code ISO du pays (FR, FRA ou 250) ou nom du pays en français',
    unite: 'pays',
    avertissement:
      '<strong>Aucun code pays détecté.</strong> ' +
      'Cette carte attend un code ISO (FR, FRA ou 250). Les noms de pays écrits en ' +
      'français sont aussi reconnus au rendu, mais le Builder ne peut pas les vérifier ' +
      'ici : contrôlez l’aperçu après génération.',
    valide: estCodePays,
    nomAdmis: () => true,
    nomPrefere: (nom) => /pays|country|iso/i.test(nom),
    manque: 'le champ pays (code ISO ou nom)',
  },
};

/** Part minimale de valeurs valides, sur l'échantillon, pour retenir un champ. */
const SEUIL = 0.8;
const TAILLE_ECHANTILLON = 50;

/** Le champ contient-il, sur l'échantillon, des valeurs du référentiel du type ? */
export function champConvient(
  type: MapType,
  nom: string,
  lignes: readonly Record<string, unknown>[]
): boolean {
  const ref = REFERENTIELS[type];
  let valides = 0;
  let renseignees = 0;
  for (const ligne of lignes.slice(0, TAILLE_ECHANTILLON)) {
    const brut = ligne[nom];
    if (brut == null || brut === '') continue;
    renseignees++;
    if (ref.valide(String(brut))) valides++;
  }
  return renseignees > 0 && valides / renseignees >= SEUIL;
}

/**
 * Meilleur champ « code » de la source pour ce type de carte, ou `null`. Les
 * champs dont le NOM désigne le découpage passent d'abord (un `code_region`
 * avant un `code` quelconque) ; l'ordre de la source départage le reste.
 */
export function trouverChampGeo(
  type: MapType,
  champs: readonly { name: string; type: string }[],
  lignes: readonly Record<string, unknown>[]
): string | null {
  if (lignes.length === 0) return null;
  const ref = REFERENTIELS[type];
  const candidats = champs.filter(
    (c) => (c.type === 'string' || c.type === 'number') && ref.nomAdmis(c.name)
  );
  const ordonnes = [
    ...candidats.filter((c) => ref.nomPrefere(c.name)),
    ...candidats.filter((c) => !ref.nomPrefere(c.name)),
  ];
  for (const champ of ordonnes) {
    if (champConvient(type, champ.name, lignes)) return champ.name;
  }
  return null;
}
