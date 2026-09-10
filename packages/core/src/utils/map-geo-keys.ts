/**
 * Référentiels de clés des cartes `<map-chart>` de DSFR Chart (#729).
 *
 * `@gouvfr/dsfr-chart` embarque sa table de correspondance en clair
 * (`dist/MapChart/MapChart.js`) et **ne normalise aucune clé entrante** :
 * - niveau `reg` : code ISO 3166-2 sans préfixe pays (`IDF`, `ARA`, `20R`
 *   pour la Corse) et code INSEE pour les régions ultramarines (`971`…) ;
 * - niveau `aca` : capitale de l'académie en majuscules, **sans accent ni
 *   article** (`PARIS`, `BESANCON`, `ORLEANS-TOURS`, `REUNION`).
 *
 * Une clé hors de ces référentiels n'est pas dessinée : elle doit donc être
 * traduite quand c'est possible, et **comptée** sinon (`getSkippedCount()`),
 * pour qu'une carte à moitié muette ne se déclare pas complète.
 *
 * Hors périmètre : les territoires absents du découpage `aca` de DSFR Chart
 * (Polynésie française, Wallis-et-Futuna, Saint-Pierre-et-Miquelon, AEFE) —
 * aucune traduction ne peut les faire apparaître, ils sont comptés comme
 * ignorés. Demande à porter chez GouvernementFR/dsfr-chart.
 */

/** Les 30 académies du découpage `aca` de DSFR Chart 2.1. */
const ACADEMY_KEYS: ReadonlySet<string> = new Set([
  'AIX-MARSEILLE',
  'AMIENS',
  'BESANCON',
  'BORDEAUX',
  'CLERMONT-FERRAND',
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
  'NANCY-METZ',
  'NANTES',
  'NICE',
  'NORMANDIE',
  'ORLEANS-TOURS',
  'PARIS',
  'POITIERS',
  'REIMS',
  'RENNES',
  'REUNION',
  'STRASBOURG',
  'TOULOUSE',
  'VERSAILLES',
]);

/** Les 18 régions du découpage `reg` de DSFR Chart 2.1. */
const REGION_KEYS: ReadonlySet<string> = new Set([
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

/** Code INSEE de région (COG) vers la clé attendue par DSFR Chart. */
const INSEE_TO_REGION: Readonly<Record<string, string>> = {
  '01': '971',
  '02': '972',
  '03': '973',
  '04': '974',
  '06': '976',
  '11': 'IDF',
  '24': 'CVL',
  '27': 'BFC',
  '28': 'NOR',
  '32': 'HDF',
  '44': 'GES',
  '52': 'PDL',
  '53': 'BRE',
  '75': 'NAQ',
  '76': 'OCC',
  '84': 'ARA',
  '93': 'PAC',
  '94': '20R',
};

/** Nom de région (désaccentué, séparateurs aplatis) vers la clé DSFR Chart. */
const REGION_NAMES: Readonly<Record<string, string>> = {
  'AUVERGNE RHONE ALPES': 'ARA',
  'BOURGOGNE FRANCHE COMTE': 'BFC',
  BRETAGNE: 'BRE',
  'CENTRE VAL DE LOIRE': 'CVL',
  'GRAND EST': 'GES',
  'HAUTS DE FRANCE': 'HDF',
  'ILE DE FRANCE': 'IDF',
  'NOUVELLE AQUITAINE': 'NAQ',
  NORMANDIE: 'NOR',
  OCCITANIE: 'OCC',
  "PROVENCE ALPES COTE D'AZUR": 'PAC',
  'PAYS DE LA LOIRE': 'PDL',
  CORSE: '20R',
  GUADELOUPE: '971',
  MARTINIQUE: '972',
  GUYANE: '973',
  'LA REUNION': '974',
  REUNION: '974',
  MAYOTTE: '976',
};

/**
 * Formes courantes d'académies qui ne se déduisent pas du seul retrait de
 * l'article (la clé de DSFR Chart perd le « La » de La Réunion).
 */
const ACADEMY_ALIASES: Readonly<Record<string, string>> = {
  'LA REUNION': 'REUNION',
  'ILE DE LA REUNION': 'REUNION',
  'AIX MARSEILLE': 'AIX-MARSEILLE',
  'CLERMONT FERRAND': 'CLERMONT-FERRAND',
  'NANCY METZ': 'NANCY-METZ',
  'ORLEANS TOURS': 'ORLEANS-TOURS',
};

/** Article ou préposition ouvrant un nom d'académie, après le mot « académie ». */
const ACADEMY_PREFIX = /^ACADEMIE\s+(?:DE\s+LA\s+|DE\s+L'|DES\s+|DE\s+|DU\s+|D')/;

/** Majuscules sans accent, apostrophe droite, espaces normalisés. */
function normalizeKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2019\u02bc\u00b4`]/g, "'")
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sépare les mots par un espace unique (tiret, tiret long ou souligné inclus). */
function flattenSeparators(key: string): string {
  return key
    .replace(/[-\u2010-\u2015_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clé d'académie attendue par `<map-chart level="aca">`, ou chaîne vide si la
 * valeur ne désigne aucune académie du référentiel.
 *
 * Accepte « Académie de Besançon », « ACADEMIE D'AIX-MARSEILLE »,
 * « Besancon », « BESANCON », « Académie de La Réunion ». La liste blanche
 * borne la normalisation : une valeur qui n'aboutit pas à une académie connue
 * est rejetée plutôt que transmise telle quelle, donc comptée par l'appelant.
 */
export function toAcademyKey(raw: string): string {
  const normalized = normalizeKey(raw);
  if (!normalized) return '';
  if (ACADEMY_KEYS.has(normalized)) return normalized;

  const withoutPrefix = normalized.replace(ACADEMY_PREFIX, '');
  if (ACADEMY_KEYS.has(withoutPrefix)) return withoutPrefix;

  const flattened = flattenSeparators(withoutPrefix);
  const alias = ACADEMY_ALIASES[flattened];
  if (alias) return alias;

  const hyphenated = flattened.replace(/ /g, '-');
  return ACADEMY_KEYS.has(hyphenated) ? hyphenated : '';
}

/**
 * Clé de région attendue par `<map-chart level="reg">`, ou chaîne vide si la
 * valeur ne désigne aucune région du référentiel.
 *
 * Accepte la clé DSFR Chart telle quelle (`IDF`, `971`), le code INSEE de
 * région (`11`, `84`, `94`, et `01` à `06` en outre-mer) et le nom de la
 * région (« Île-de-France », « ile de france »).
 */
export function toRegionKey(raw: string): string {
  const normalized = normalizeKey(raw);
  if (!normalized) return '';
  if (REGION_KEYS.has(normalized)) return normalized;

  if (/^\d{1,2}$/.test(normalized)) {
    return INSEE_TO_REGION[normalized.padStart(2, '0')] ?? '';
  }

  return REGION_NAMES[flattenSeparators(normalized)] ?? '';
}
