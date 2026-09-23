/**
 * Composition par échelle (#1021, volet builder).
 *
 * Quand le jeu d'une couche dépasse son plafond (#1020 : 1 000 points par
 * défaut), la carte ne montre que les premiers enregistrements du fichier. La
 * Carto propose alors une COMPOSITION : aux zooms nationaux, une choroplèthe
 * du nombre d'enregistrements par département (ou région), calculé sur TOUT
 * le jeu par un regroupement délégué à l'API ; aux zooms locaux, les points.
 *
 * Ce module ne touche ni au DOM ni à la bibliothèque : il détecte le champ
 * territoire, dit si la proposition s'applique et construit la couche
 * agrégée. Le générateur (`ui/code-generator.ts`) en tire le code, `main.ts`
 * l'encart et la confirmation.
 */
import type {
  AgregatConfig,
  CartoState,
  ChampTerritoire,
  FieldInfo,
  LayerConfig,
  NiveauTerritoire,
} from './state.js';

/** La couche agrégée est visible jusqu'à ce zoom inclus (vue nationale). */
export const MAX_ZOOM_AGREGAT = 7;
/** La couche de points est visible à partir de ce zoom (vue départementale). */
export const MIN_ZOOM_POINTS = 8;

/**
 * Codes des fonds administratifs livrés avec le paquet (`dsfr-data/geo/*.json`,
 * propriété `code`). La jointure compare la clé BRUTE (#792) : un code écrit
 * autrement (`1` pour `01`) ne s'apparierait pas. La détection exige donc ces
 * graphies exactes, sans les normaliser en silence.
 */
const CODES_DEPARTEMENTS = new Set<string>([
  ...Array.from({ length: 19 }, (_, i) => String(i + 1).padStart(2, '0')),
  '2A',
  '2B',
  ...Array.from({ length: 75 }, (_, i) => String(i + 21)),
  '971',
  '972',
  '973',
  '974',
  '976',
]);

const CODES_REGIONS = new Set<string>([
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

/** Part minimale des valeurs renseignées de l'échantillon qui doivent être des codes connus. */
const PART_MINIMALE = 0.9;

/**
 * Caractères qu'un nom de champ ne peut pas porter ici : `,` `:` `|` sont les
 * séparateurs de `group-by` / `aggregate` / `where` (et de la délégation
 * Tabular), `=` celui de l'attribut `on` de la jointure, `.` ferait lire
 * `fill-field` comme un chemin imbriqué.
 */
const CARACTERES_INTERDITS = /[,:|=.]/;

function sansAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Niveau annoncé par le NOM du champ — sans lui, `11` peut être un département ou une région. */
function niveauDuNom(nom: string): NiveauTerritoire | null {
  const n = sansAccents(nom).toLowerCase();
  if (/dep/.test(n)) return 'departement';
  if (/reg/.test(n)) return 'region';
  return null;
}

/**
 * Champ portant un code de département ou de région, lu sur un échantillon
 * de la source. `null` quand aucun champ n'est sûr : mieux vaut ne rien
 * proposer qu'une carte où la jointure perd des territoires sans le dire.
 *
 * Règles : le nom annonce le niveau (`dep…` / `reg…`, accents ignorés) ; les
 * valeurs sont des CHAÎNES (un nombre a perdu le zéro de `01`) ; au moins
 * 90 % des valeurs renseignées sont des codes du fond correspondant. À
 * égalité, un nom contenant « code » l'emporte (on préfère `Code du
 * département` à `Département`), puis le département (plus fin).
 */
export function detecterChampTerritoire(
  records: Record<string, unknown>[]
): ChampTerritoire | null {
  const noms = new Set<string>();
  for (const r of records) for (const k of Object.keys(r)) noms.add(k);

  const candidats: Array<ChampTerritoire & { score: number }> = [];
  for (const nom of noms) {
    if (CARACTERES_INTERDITS.test(nom) || nom.trim() !== nom || !nom) continue;
    const niveau = niveauDuNom(nom);
    if (!niveau) continue;
    const valeurs = records
      .map((r) => r[nom])
      .filter((v) => v !== null && v !== undefined && v !== '');
    if (valeurs.length === 0) continue;
    if (valeurs.some((v) => typeof v !== 'string')) continue;
    const codes = niveau === 'departement' ? CODES_DEPARTEMENTS : CODES_REGIONS;
    const connus = valeurs.filter((v) => codes.has(v as string)).length;
    if (connus / valeurs.length < PART_MINIMALE) continue;
    const score =
      (sansAccents(nom).toLowerCase().includes('code') ? 2 : 0) +
      (niveau === 'departement' ? 1 : 0) +
      connus / valeurs.length;
    candidats.push({ champ: nom, niveau, score });
  }
  candidats.sort((a, b) => b.score - a.score || a.champ.localeCompare(b.champ, 'fr'));
  const meilleur = candidats[0];
  return meilleur ? { champ: meilleur.champ, niveau: meilleur.niveau } : null;
}

/** « département » / « région », pour les libellés. */
export function libelleNiveau(niveau: NiveauTerritoire): string {
  return niveau === 'departement' ? 'département' : 'région';
}

/** Colonne du comptage produit par la query agrégée (alias par défaut `champ__count`, #269). */
export function colonneComptage(agregat: AgregatConfig): string {
  return `${agregat.champ}__count`;
}

/**
 * Champs connus d'une couche agrégée, ceux des lignes jointes : les
 * propriétés du fond (`code`, `nom`, `geometry`) et le comptage. Ils
 * alimentent les listes de suggestions du panneau Éléments.
 */
export function champsAgregat(agregat: AgregatConfig): FieldInfo[] {
  return [
    { name: 'nom', type: 'string', fillRate: 1 },
    { name: 'code', type: 'string', fillRate: 1 },
    { name: colonneComptage(agregat), type: 'number', fillRate: 1 },
    { name: 'geometry', type: 'object', fillRate: 1 },
  ];
}

/**
 * URL du fond administratif. Le paquet npm le livre hors bundle
 * (`packages/core/geo/`, `files: ["geo/"]`) : on le sert par le CDN du paquet,
 * celui qu'indique `LIB_URL` quand c'est un CDN npm, jsDelivr sinon — une
 * instance auto-hébergée ne sert pas `geo/`.
 */
export function urlContours(niveau: NiveauTerritoire, libUrl: string): string {
  const fichier = niveau === 'departement' ? 'departements.json' : 'regions.json';
  const cdn = /^https:\/\/(cdn\.jsdelivr\.net\/npm|unpkg\.com)\/[^/]+\/dist\/?$/.test(libUrl)
    ? libUrl.replace(/\/dist\/?$/, '')
    : 'https://cdn.jsdelivr.net/npm/dsfr-data@0';
  return `${cdn}/geo/${fichier}`;
}

/** Une couche agrégée a-t-elle déjà été composée depuis cette couche ? */
export function estComposee(state: CartoState, layer: LayerConfig): boolean {
  return state.layers.some((l) => l.agregat?.depuis === layer.id);
}

/**
 * La proposition s'applique-t-elle ? Une couche de données (pas déjà
 * agrégée, pas déjà composée), dont le jeu dépasse le plafond, et dont un
 * champ territoire a été détecté.
 */
export function proposerComposition(
  state: CartoState,
  layer: LayerConfig,
  total: number | undefined
): boolean {
  return Boolean(
    layer.source &&
    !layer.agregat &&
    layer.territoire &&
    typeof total === 'number' &&
    total > layer.maxItems &&
    !estComposee(state, layer)
  );
}

/**
 * Compose par échelle : ajoute, SOUS la couche de points, une couche
 * choroplèthe du nombre d'enregistrements par territoire (visible jusqu'au
 * zoom 7), et rend la couche de points visible à partir du zoom 8.
 *
 * La couche agrégée a SA PROPRE source (copie de celle des points) : une
 * source partagée n'a qu'un regroupement serveur (#765), la couche de points
 * recevrait sinon des lignes agrégées. Son filtre reprend celui des points :
 * les deux échelles comptent les mêmes enregistrements.
 */
export function composerParEchelle(
  state: CartoState,
  points: LayerConfig,
  createLayer: () => LayerConfig
): LayerConfig {
  const territoire = points.territoire;
  if (!points.source || !territoire) {
    throw new Error('Composition impossible : couche sans source ou sans champ territoire');
  }
  const agregat: AgregatConfig = { ...territoire, depuis: points.id };
  const zones = createLayer();
  Object.assign(zones, {
    name: `${points.name} par ${libelleNiveau(territoire.niveau)}`,
    source: { ...points.source },
    type: 'geoshape',
    geoField: 'geometry',
    fillField: colonneComptage(agregat),
    popupMode: 'tooltip',
    tooltipField: 'nom',
    filter: points.filter,
    minZoom: 0,
    maxZoom: MAX_ZOOM_AGREGAT,
    agregat,
    territoire: null,
    fields: champsAgregat(agregat),
  } satisfies Partial<LayerConfig>);

  points.minZoom = MIN_ZOOM_POINTS;
  if (points.maxZoom < MIN_ZOOM_POINTS) points.maxZoom = 18;

  // Sous les points : l'ordre des couches est l'ordre de dessin.
  const index = state.layers.findIndex((l) => l.id === points.id);
  state.layers.splice(index < 0 ? state.layers.length : index, 0, zones);
  return zones;
}

/**
 * Suppression d'une couche agrégée : la couche de points d'origine redevient
 * visible à tous les zooms, sinon la vue nationale resterait vide.
 */
export function defaireComposition(state: CartoState, supprimee: LayerConfig): void {
  if (!supprimee.agregat) return;
  const points = state.layers.find((l) => l.id === supprimee.agregat!.depuis);
  if (points && points.minZoom === MIN_ZOOM_POINTS) points.minZoom = 0;
}
