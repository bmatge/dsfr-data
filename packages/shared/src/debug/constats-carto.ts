/**
 * Règles de diagnostic cartographiques (#1000, epic #991, ADR-143 §3).
 *
 * Le premier lot carto de l'ADR : les pannes silencieuses d'une couche
 * `dsfr-data-map-layer`, lues sur la trace — attributs `lat-field`,
 * `lon-field`, `geo-field`, `type`, `max-items` du nœud, échantillon et
 * champs de son amont (`summarizeStage`), `skippedRows`, `stackedPositions`,
 * `renderedCount` et le journal réseau. Chaque constat DÉSIGNE les repères du
 * builder carto qui le corrigent (`apps/builder-carto/src/assistant/
 * reperes.generated.ts`, vérifiés par `check:reperes`, règle 5).
 *
 * Mêmes invariants que `constats.ts` :
 *
 * 1. **Lib-safe** : n'importe que le collecteur et les types de `constats.ts`.
 * 2. **Aucun chiffre nouveau** (ADR-122) : un constat ne cite que des comptes,
 *    durées et valeurs présents dans la trace. Les seuils internes (bornes
 *    d'une latitude, volume, latence) décident, ils ne s'affichent jamais.
 * 3. **Une panne, un constat** : les causes d'une couche sont établies UNE
 *    fois (`diagnostiquerCouche`) ; « rien dessiné » ne parle que faute de
 *    cause précise, « lignes ignorées » se tait quand les décimales à virgule
 *    l'expliquent, « points empilés » quand les points sont à (0, 0).
 * 4. **Aucune expression régulière sur du texte externe** (noms de champs,
 *    valeurs) : `includes`, `indexOf`, `===`.
 *
 * Composition (app `builder-carto`) : `[...REGLES_GENERIQUES, ...REGLES_CARTO]`
 * (alias `REGLES_BUILDER_CARTO`). Cinq génériques sont dites mieux ici, par
 * couche et avec leurs repères : les règles carto les déclarent dans
 * `remplace`, et le moteur retire leurs constats sur les couches (et sur les
 * étapes qu'une couche lit), nulle part ailleurs. Les garder sur une même
 * couche compterait deux alertes pour une panne : une couche sans ligne
 * ferait parler `pipeline/zero-ligne` (sur la source), `pipeline/afficheur-
 * inerte` (sur la couche) ET `carte/aucune-donnee`.
 */

import type { StageNode } from './graph.js';
import { topoOrder } from './graph.js';
import type { StageState, Trace } from './recorder.js';
import { formatInt, plural } from './format.js';
import { masquerUrl, type EntreeReseau } from './journal.js';
import {
  REGLES_GENERIQUES,
  type Constat,
  type GraviteConstat,
  type RegleConstat,
  type RemedeConstat,
} from './constats.js';

/** L'app dont ces règles désignent les repères. */
const APP: readonly string[] = ['builder-carto'];
/** Les nœuds que ces règles visent : les couches. */
const TAGS: readonly string[] = ['dsfr-data-map-layer'];

/**
 * Plafond `max-items` par défaut de `dsfr-data-map-layer`. Il décide, il ne
 * s'affiche jamais (ADR-122) ; un test le compare au custom-elements manifest
 * pour qu'il ne dérive pas de la bibliothèque.
 */
export const MAX_ITEMS_PAR_DEFAUT = 5000;

/** Lignes chargées d'un coup, sans cluster ni bbox, au-delà desquelles la carte rame. */
const SEUIL_VOLUME_LIGNES = 20000;
/** Poids d'une réponse jugé excessif pour une carte (octets). */
const SEUIL_VOLUME_OCTETS = 10_000_000;
/** Durée d'une requête jugée excessive (ms). */
const SEUIL_LATENCE_MS = 5000;

/** Colonnes de points que la couche reconnaît seule (`_extractCoords`, mode auto). */
const POINTS_AUTO = ['geo_point_2d', 'geopoint', 'geo_point'];
/** Colonnes de géométrie qu'une couche « Zones » reconnaît seule (#1053). */
const ZONES_AUTO = ['geo_shape', 'geometry', 'geom'];

/** Fragments de nom d'une colonne d'adresse. */
const NOMS_ADRESSE = ['adresse', 'address', 'addr_', 'libelle_voie', 'nom_voie'];
/** Noms (ou fragments) d'une colonne de code géographique officiel. */
const NOMS_CODE_INSEE = ['insee', 'code_commune', 'codgeo', 'code_geo', 'com_code', 'codecommune'];

// ---------------------------------------------------------------------------
// Lecture d'une couche
// ---------------------------------------------------------------------------

type ModeCoordonnees = 'lat-lon' | 'geo-field' | 'auto';

interface Couche {
  node: StageNode;
  type: string;
  lat: string;
  lon: string;
  geo: string;
  mode: ModeCoordonnees;
  amontId?: string;
  amont?: StageState;
}

function lireCouche(trace: Trace, node: StageNode): Couche {
  const lat = node.attrs['lat-field'] ?? '';
  const lon = node.attrs['lon-field'] ?? '';
  const geo = node.attrs['geo-field'] ?? '';
  const amontId = node.upstream[0];
  return {
    node,
    type: node.attrs.type || 'marker',
    lat,
    lon,
    geo,
    // Même ordre que `_extractCoords` : la paire lat/lon d'abord.
    mode: lat && lon ? 'lat-lon' : geo ? 'geo-field' : 'auto',
    ...(amontId !== undefined ? { amontId, amont: trace.states[amontId] } : {}),
  };
}

/** Couches de la carte principale : les clones d'encart n'en disent rien de plus. */
function couches(trace: Trace): Couche[] {
  return topoOrder(trace.graph)
    .filter((n) => n.tag === 'dsfr-data-map-layer' && !n.inset)
    .map((n) => lireCouche(trace, n));
}

/** L'amont a livré des lignes : les règles de données peuvent juger. */
function lignesRecues(c: Couche): number {
  return c.amont?.status === 'loaded' ? (c.amont.rows ?? 0) : 0;
}

function nomsDeChamps(c: Couche): string[] {
  return (c.amont?.fields ?? []).map((f) => f.name);
}

/** Chemin pointé (`a.b.c`), sans évaluation. */
function lireChemin(row: Record<string, unknown>, chemin: string): unknown {
  let v: unknown = row;
  for (const part of chemin.split('.')) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[part];
  }
  return v;
}

/** Valeur géo sérialisée en chaîne JSON (#426) : lue sous `try`. */
function valeurGeo(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return v;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return v;
  }
}

function enNombre(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
}

/** Une paire lue dans l'échantillon : valeurs brutes (citables) et nombres. */
interface PaireLue {
  latBrut: unknown;
  lonBrut: unknown;
  lat: number;
  lon: number;
}

/** Point GeoJSON `[lon, lat]`, objet `{lat, lon}` ou tableau `[lat, lon]` — comme la couche. */
function paireDepuisGeo(geo: unknown): PaireLue | null {
  if (Array.isArray(geo)) {
    if (geo.length < 2) return null;
    return { latBrut: geo[0], lonBrut: geo[1], lat: enNombre(geo[0]), lon: enNombre(geo[1]) };
  }
  if (!geo || typeof geo !== 'object') return null;
  const g = geo as { type?: unknown; coordinates?: unknown; lat?: unknown; lon?: unknown };
  if (g.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
    const [lonBrut, latBrut] = g.coordinates as unknown[];
    return { latBrut, lonBrut, lat: enNombre(latBrut), lon: enNombre(lonBrut) };
  }
  if (typeof g.lat === 'number' && typeof g.lon === 'number') {
    return { latBrut: g.lat, lonBrut: g.lon, lat: g.lat, lon: g.lon };
  }
  return null;
}

/** Les paires de coordonnées de l'échantillon de l'amont, telles que la couche les lirait. */
function pairesEchantillon(c: Couche): PaireLue[] {
  const out: PaireLue[] = [];
  for (const row of c.amont?.sample ?? []) {
    if (c.mode === 'lat-lon') {
      const latBrut = lireChemin(row, c.lat);
      const lonBrut = lireChemin(row, c.lon);
      if (latBrut == null || latBrut === '' || lonBrut == null || lonBrut === '') continue;
      out.push({ latBrut, lonBrut, lat: enNombre(latBrut), lon: enNombre(lonBrut) });
    } else if (c.mode === 'geo-field') {
      const p = paireDepuisGeo(valeurGeo(lireChemin(row, c.geo)));
      if (p) out.push(p);
    } else {
      for (const nom of POINTS_AUTO) {
        const p = paireDepuisGeo(row[nom]);
        if (p) {
          out.push(p);
          break;
        }
      }
    }
  }
  return out;
}

/** Valeur brute citée telle quelle (ADR-122 : on ne reformate pas un nombre de la trace). */
function citer(v: unknown): string {
  if (typeof v === 'string') return `« ${v} »`;
  return String(v);
}

function preuvePaire(c: Couche, p: PaireLue): string {
  if (c.mode === 'lat-lon') {
    return `lat-field="${c.lat}" : ${citer(p.latBrut)}, lon-field="${c.lon}" : ${citer(p.lonBrut)}`;
  }
  const champ = c.mode === 'geo-field' ? `geo-field="${c.geo}"` : 'colonne de points détectée';
  return `${champ} : latitude ${citer(p.latBrut)}, longitude ${citer(p.lonBrut)}`;
}

/** Repères qui règlent la localisation de la couche, selon son mode. */
function reperesLocalisation(c: Couche): string[] {
  if (c.mode === 'lat-lon') return ['carto.couches.lat', 'carto.couches.lon'];
  if (c.mode === 'geo-field') return ['carto.couches.geo-field'];
  return ['carto.couches.geo-field', 'carto.couches.lat', 'carto.couches.lon'];
}

// ---------------------------------------------------------------------------
// Diagnostic d'une couche : les causes, établies une fois
// ---------------------------------------------------------------------------

type CauseLocalisation = 'sans-champ-geo' | 'adresse-seule' | 'code-insee-seul';
type CauseCoordonnees = 'lambert-93' | 'lat-lon-inverses' | 'decimales-virgule' | 'points-zero';

interface Diagnostic {
  localisation?: { cause: CauseLocalisation; champs: string[] };
  coordonnees?: { cause: CauseCoordonnees; exemple: PaireLue };
}

function contientUnDe(nom: string, fragments: readonly string[]): boolean {
  const n = nom.toLowerCase();
  return fragments.some((f) => n.includes(f));
}

function diagnosticLocalisation(c: Couche): Diagnostic['localisation'] {
  if (c.mode !== 'auto') return undefined;
  const champs = nomsDeChamps(c);
  if (champs.length === 0) return undefined;
  // Une couche « Zones » détecte seule sa colonne de géométrie (#1053), une
  // couche ponctuelle sa colonne de points : présentes, rien ne manque.
  const auto = c.type === 'geoshape' ? ZONES_AUTO : POINTS_AUTO;
  if (champs.some((n) => auto.includes(n))) return undefined;
  if (c.type !== 'geoshape') {
    const adresses = champs.filter((n) => contientUnDe(n, NOMS_ADRESSE));
    if (adresses.length > 0) return { cause: 'adresse-seule', champs: adresses };
    const codes = champs.filter((n) => contientUnDe(n, NOMS_CODE_INSEE));
    if (codes.length > 0) return { cause: 'code-insee-seul', champs: codes };
  }
  return { cause: 'sans-champ-geo', champs };
}

const hors = (v: number, borne: number): boolean => Math.abs(v) > borne;
const entre = (v: number, min: number, max: number): boolean => v >= min && v <= max;

/** Latitude et longitude échangées : impossible telle quelle, ou la métropole transposée. */
function inversee(p: PaireLue): boolean {
  const impossible = hors(p.lat, 90) && !hors(p.lat, 180) && !hors(p.lon, 90);
  const metropoleTransposee = entre(p.lat, -6, 10) && entre(p.lon, 41, 52);
  return impossible || metropoleTransposee;
}

function diagnosticCoordonnees(c: Couche): Diagnostic['coordonnees'] {
  const paires = pairesEchantillon(c);
  if (paires.length === 0) return undefined;
  if (c.mode === 'lat-lon') {
    const virgule = paires.find(
      (p) =>
        [p.latBrut, p.lonBrut].some((v) => typeof v === 'string' && v.includes(',')) &&
        (Number.isNaN(p.lat) || Number.isNaN(p.lon))
    );
    if (virgule) return { cause: 'decimales-virgule', exemple: virgule };
  }
  const finies = paires.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (finies.length === 0) return undefined;
  if (finies.every((p) => hors(p.lat, 180) && hors(p.lon, 180))) {
    return { cause: 'lambert-93', exemple: finies[0] };
  }
  if (finies.every(inversee)) return { cause: 'lat-lon-inverses', exemple: finies[0] };
  const zero = finies.find((p) => p.lat === 0 && p.lon === 0);
  if (zero) return { cause: 'points-zero', exemple: zero };
  return undefined;
}

function diagnostiquerCouche(c: Couche): Diagnostic {
  if (lignesRecues(c) === 0) return {};
  const localisation = diagnosticLocalisation(c);
  if (localisation) return { localisation };
  const coordonnees = diagnosticCoordonnees(c);
  return coordonnees ? { coordonnees } : {};
}

// ---------------------------------------------------------------------------
// Fabrique
// ---------------------------------------------------------------------------

interface Champs {
  titre: string;
  explication: string;
  action?: string;
  reperes: readonly string[];
  remedes?: readonly RemedeConstat[];
  preuve: string;
}

function constatCouche(regle: string, gravite: GraviteConstat, c: Couche, champs: Champs): Constat {
  return {
    id: `${regle}@${c.node.id}`,
    regle,
    gravite,
    titre: champs.titre,
    explication: champs.explication,
    ...(champs.action !== undefined ? { action: champs.action } : {}),
    reperes: champs.reperes,
    ...(champs.remedes !== undefined ? { remedes: champs.remedes } : {}),
    preuve: champs.preuve,
    etape: c.node.id,
  };
}

/** Une règle qui juge chaque couche de la carte principale. */
function regleParCouche(
  id: string,
  juger: (c: Couche, d: Diagnostic, trace: Trace) => Constat | null,
  remplace?: readonly string[]
): RegleConstat {
  return {
    id,
    appliesTo: APP,
    tags: TAGS,
    ...(remplace ? { remplace } : {}),
    evaluer: (trace) =>
      couches(trace).flatMap((c) => {
        const out = juger(c, diagnostiquerCouche(c), trace);
        return out ? [out] : [];
      }),
  };
}

/** Liste de noms bornée sans jamais couper un nom (ADR-122 : un nom coupé cite un chiffre tronqué). */
function listeNoms(noms: readonly string[], max = 8): string {
  const vus = noms.slice(0, max).join(', ');
  return noms.length > max ? `${vus}…` : vus;
}

// ---------------------------------------------------------------------------
// Localisation absente
// ---------------------------------------------------------------------------

const sansChampGeo = regleParCouche('carte/sans-champ-geo', (c, d) => {
  if (d.localisation?.cause !== 'sans-champ-geo') return null;
  const zones = c.type === 'geoshape';
  return constatCouche('carte/sans-champ-geo', 'erreur', c, {
    titre: zones
      ? `${c.node.id} : aucune géométrie pour dessiner les zones`
      : `${c.node.id} : aucun champ de localisation`,
    explication: zones
      ? 'La représentation « Zones » dessine des contours. Sans geo-field, la couche cherche seule une colonne geo_shape, geometry ou geom : les données reçues n’en ont aucune.'
      : 'La couche ne sait pas où placer les éléments : ni latitude et longitude, ni champ géographique, et aucune colonne de points reconnue seule (geo_point_2d, geopoint, geo_point).',
    action: zones
      ? 'Renseigner le champ géographique, ou passer en « Marqueurs » ou « Cercles »'
      : 'Choisir la latitude et la longitude, ou le champ géographique',
    reperes: zones
      ? ['carto.couches.geo-field', 'carto.elements.representation.type']
      : ['carto.couches.geo-field', 'carto.couches.lat', 'carto.couches.lon'],
    preuve: `champs reçus : ${listeNoms(d.localisation.champs)}`,
  });
});

const adresseSeule = regleParCouche('carte/adresse-seule', (c, d) => {
  if (d.localisation?.cause !== 'adresse-seule') return null;
  return constatCouche('carte/adresse-seule', 'avertissement', c, {
    titre: `${c.node.id} : une adresse, mais pas de coordonnées`,
    explication:
      'Une adresse ne se place pas seule sur une carte : il faut des coordonnées, obtenues par géocodage, ou un jeu qui les porte déjà.',
    action: 'Choisir un jeu de données géocodé, ou géocoder les adresses en amont',
    reperes: ['carto.couches.source', 'carto.couches.lat', 'carto.couches.lon'],
    preuve: `colonnes d’adresse : ${listeNoms(d.localisation.champs)}`,
  });
});

const codeInseeSeul = regleParCouche('carte/code-insee-seul', (c, d) => {
  if (d.localisation?.cause !== 'code-insee-seul') return null;
  return constatCouche('carte/code-insee-seul', 'avertissement', c, {
    titre: `${c.node.id} : un code géographique, mais pas de coordonnées`,
    explication:
      'Un code INSEE désigne un territoire sans le situer : la couche a besoin de ses contours ou de son centre, que le jeu reçu ne porte pas.',
    action:
      'Joindre un référentiel géographique sur ce code, ou choisir un jeu qui porte la géométrie',
    reperes: ['carto.couches.source', 'carto.couches.geo-field'],
    preuve: `colonnes de code : ${listeNoms(d.localisation.champs)}`,
  });
});

// ---------------------------------------------------------------------------
// Coordonnées présentes mais fausses
// ---------------------------------------------------------------------------

const lambert93 = regleParCouche('carte/lambert-93', (c, d) => {
  if (d.coordonnees?.cause !== 'lambert-93') return null;
  return constatCouche('carte/lambert-93', 'erreur', c, {
    titre: `${c.node.id} : coordonnées projetées, Lambert 93 probable`,
    explication:
      'Les valeurs sortent des bornes d’une latitude et d’une longitude : ce sont des mètres d’une projection (Lambert 93 le plus souvent), que la carte ne sait pas placer.',
    action: 'Choisir des colonnes en degrés décimaux, ou convertir les coordonnées en amont',
    reperes: reperesLocalisation(c),
    preuve: preuvePaire(c, d.coordonnees.exemple),
  });
});

const latLonInverses = regleParCouche('carte/lat-lon-inverses', (c, d) => {
  if (d.coordonnees?.cause !== 'lat-lon-inverses') return null;
  return constatCouche('carte/lat-lon-inverses', 'erreur', c, {
    titre: `${c.node.id} : latitude et longitude semblent inversées`,
    explication:
      'Les valeurs lues comme latitude ressemblent à des longitudes, et inversement : les éléments tombent loin de leur place, ou hors de la carte.',
    action:
      c.mode === 'lat-lon'
        ? 'Échanger les champs Latitude et Longitude'
        : 'Vérifier l’ordre des coordonnées du champ géographique',
    reperes: reperesLocalisation(c),
    preuve: preuvePaire(c, d.coordonnees.exemple),
  });
});

const decimalesVirgule = regleParCouche('carte/decimales-virgule', (c, d) => {
  if (d.coordonnees?.cause !== 'decimales-virgule') return null;
  const ignorees = c.node.skippedRows;
  return constatCouche('carte/decimales-virgule', 'avertissement', c, {
    titre: `${c.node.id} : coordonnées à virgule décimale`,
    explication:
      'Les coordonnées sont écrites avec une virgule : elles ne se lisent pas comme des nombres, et les lignes sont écartées du rendu.',
    action: 'Convertir la virgule en point en amont (dsfr-data-normalize, attribut numeric)',
    reperes: reperesLocalisation(c),
    preuve:
      preuvePaire(c, d.coordonnees.exemple) +
      (ignorees ? ` — ${plural(ignorees, 'ligne')} ignorée${ignorees > 1 ? 's' : ''}` : ''),
  });
});

const pointsZero = regleParCouche('carte/points-zero', (c, d) => {
  if (d.coordonnees?.cause !== 'points-zero') return null;
  return constatCouche('carte/points-zero', 'avertissement', c, {
    titre: `${c.node.id} : points au large de l’Afrique, en (0, 0)`,
    explication:
      'Des lignes portent 0 en latitude et en longitude : une valeur manquante remplacée par zéro, qui les place dans le golfe de Guinée.',
    action: 'Filtrer ces lignes, ou corriger la colonne de coordonnées en amont',
    reperes: [...reperesLocalisation(c), 'carto.elements.avancees.filtre'],
    preuve: preuvePaire(c, d.coordonnees.exemple),
  });
});

// ---------------------------------------------------------------------------
// Comptes de la couche
// ---------------------------------------------------------------------------

const pointsEmpiles = regleParCouche(
  'carte/points-empiles',
  (c, d) => {
    const p = c.node.stackedPositions;
    if (!p || d.coordonnees?.cause === 'points-zero') return null;
    const s = p.positions > 1 ? 's' : '';
    return constatCouche('carte/points-empiles', 'avertissement', c, {
      titre: `${c.node.id} : points empilés`,
      explication:
        'Des points distincts tombent à la même position : colonne de coordonnées constante, ou mal jointe.',
      action: 'Vérifier la colonne de coordonnées choisie',
      reperes: reperesLocalisation(c),
      preuve: `${plural(p.items, 'point')} sur ${plural(p.positions, 'position')} distincte${s}`,
    });
  },
  ['pipeline/points-empiles']
);

const lignesIgnorees = regleParCouche(
  'carte/lignes-ignorees',
  (c, d) => {
    const n = c.node.skippedRows;
    if (!n || d.coordonnees?.cause === 'decimales-virgule') return null;
    const s = n > 1 ? 's' : '';
    const rows = lignesRecues(c);
    return constatCouche('carte/lignes-ignorees', 'avertissement', c, {
      titre: `${c.node.id} : lignes reçues mais non dessinées`,
      explication: `Ces lignes n’ont pas de position exploitable (${c.type === 'geoshape' ? 'géométrie' : 'coordonnées'} absentes ou invalides) : la carte en montre moins que la source n’en livre.`,
      action: 'Vérifier le champ de localisation, ou filtrer les lignes sans position',
      reperes: [...reperesLocalisation(c), 'carto.elements.avancees.filtre'],
      preuve:
        `${plural(n, 'ligne')} ignorée${s}` +
        (rows > 0 ? ` sur ${formatInt(rows)} reçue${rows > 1 ? 's' : ''}` : ''),
    });
  },
  ['pipeline/lignes-ignorees']
);

/** Le plafond effectif et sa citation, sans jamais afficher la valeur par défaut. */
function plafond(c: Couche): { max: number; cite: string } {
  const attr = c.node.attrs['max-items'];
  if (attr !== undefined && attr.trim() !== '' && Number.isFinite(Number(attr))) {
    return { max: Number(attr), cite: `max-items="${attr}"` };
  }
  return { max: MAX_ITEMS_PAR_DEFAUT, cite: 'plafond max-items par défaut' };
}

const tronqueMaxItems = regleParCouche('carte/tronque-max-items', (c) => {
  const rows = lignesRecues(c);
  const { max, cite } = plafond(c);
  if (max <= 0 || rows <= max) return null;
  const dessines = c.node.renderedCount;
  return constatCouche('carte/tronque-max-items', 'avertissement', c, {
    titre: `${c.node.id} : plus de lignes que la couche n’en dessine (${cite})`,
    explication:
      'La couche coupe au plafond max-items : les lignes suivantes ne sont pas sur la carte, sans que rien ne le dise au lecteur.',
    action: 'Relever max-items, regrouper les points (cluster), ou charger selon la zone visible',
    reperes: [
      'carto.elements.avancees.max-items',
      'carto.elements.cluster',
      'carto.elements.avancees.bbox',
    ],
    preuve:
      `${formatInt(rows)} lignes reçues, ${cite}` +
      (dessines !== undefined ? `, ${formatInt(dessines)} dessinées` : ''),
  });
});

// ---------------------------------------------------------------------------
// Jeu tronqué par la source : des remèdes au choix (#1021)
// ---------------------------------------------------------------------------

/** Composer par échelle : l'encart du panneau Couches (#1021, lot 1). */
const REMEDE_COMPOSER: RemedeConstat = {
  libelle: 'Composer par échelle',
  repere: 'carto.couches.composition.composer',
};
/** Filtre de la couche, qui devient le `where` de sa source. */
const REMEDE_FILTRER: RemedeConstat = {
  libelle: 'Filtrer en amont',
  repere: 'carto.elements.avancees.filtre',
};
/** Plafond de la couche : le builder y aligne le `limit` de la source (#1020). */
const REMEDE_PLAFOND: RemedeConstat = {
  libelle: 'Relever le plafond',
  repere: 'carto.elements.avancees.max-items',
};

/** « A, b ou c » : les remèdes dits dans l'action, en minuscule après le premier. */
function direRemedes(remedes: readonly RemedeConstat[]): string {
  const gestes = remedes.map((r, i) => (i === 0 ? r.libelle : r.libelle.toLowerCase()));
  if (gestes.length < 2) return gestes.join('');
  return `${gestes.slice(0, -1).join(', ')} ou ${gestes[gestes.length - 1]}`;
}

/**
 * La source que lit la couche a coupé le jeu (`meta.truncated`). Depuis
 * #1020, c'est le cas ordinaire d'un gros jeu dans le builder, dont la source
 * porte `limit` = `max-items` : la couche dessine tout ce qu'elle reçoit, la
 * coupe est en amont, et `carte/tronque-max-items` ne parle pas.
 *
 * Remèdes au choix, dans l'ordre de l'issue #1021 : composer par échelle
 * (le seul qui montre tout le jeu, compté par le serveur), filtrer en amont,
 * relever le plafond. « Charger selon la zone visible » n'y est pas : sur
 * Tabular, `bbox` ne filtre que côté client tant que #1023 n'est pas
 * implémenté. La composition n'est proposée qu'à une couche de points pas
 * encore composée (`min-zoom` absent) ; le plafond, que si la coupe est le
 * `limit` d'une source, celui que règle « Nombre max d'éléments affichés ».
 *
 * Remplace `pipeline/tronque` sur la source que la couche lit : le même
 * fait, dit avec ses repères.
 */
const jeuTronque = regleParCouche(
  'carte/jeu-tronque',
  (c, _d, trace) => {
    const meta = c.amont?.meta;
    if (!c.amontId || !meta?.truncated || lignesRecues(c) === 0) return null;
    const amontId = c.amontId;
    const amont = trace.graph.nodes.find((n) => n.id === amontId);
    const limit = amont?.attrs.limit ?? '';
    const parLimit = amont?.tag === 'dsfr-data-source' && limit.trim() !== '';
    const maxRecords = amont?.attrs['max-records'] ?? '';
    const cite = parLimit
      ? `limit="${limit}"`
      : maxRecords.trim() !== ''
        ? `max-records="${maxRecords}"`
        : 'plafond max-records par défaut';
    const composable = c.type !== 'geoshape' && c.node.attrs['min-zoom'] === undefined;
    const remedes: RemedeConstat[] = [
      ...(composable ? [REMEDE_COMPOSER] : []),
      REMEDE_FILTRER,
      ...(parLimit ? [REMEDE_PLAFOND] : []),
    ];
    const total = meta.total !== undefined ? ` / ${formatInt(meta.total)}` : ' (total inconnu)';
    return constatCouche('carte/jeu-tronque', 'avertissement', c, {
      titre: `${c.node.id} : la carte ne montre qu’une partie du jeu (${cite})`,
      explication:
        'La source ne livre que les premières lignes du jeu : les points dessinés ne sont pas un échantillon représentatif, et le reste du territoire paraît vide.',
      action: direRemedes(remedes),
      reperes: remedes.map((r) => r.repere),
      remedes,
      preuve: `${formatInt(lignesRecues(c))}${total} lignes, ${amontId} : ${cite}`,
    });
  },
  ['pipeline/tronque']
);

/** La couche a-t-elle déjà un remède au volume (regroupement, zone visible, chaleur) ? */
function allegee(c: Couche): boolean {
  return (
    c.node.attrs.cluster !== undefined || c.node.attrs.bbox !== undefined || c.type === 'heatmap'
  );
}

/**
 * Requêtes du journal attribuables à la couche : celles qui partent de l'URL
 * de sa source (`url` ou `base-url` de l'étape amont), ou toutes quand la
 * carte n'a qu'une couche. Comparaison de chaînes, sans expression régulière.
 */
function requetesDeLaCouche(trace: Trace, c: Couche, toutes: Couche[]): EntreeReseau[] {
  const reussies = (trace.reseau ?? []).filter((e) => e.statut !== null && e.statut < 400);
  const amont = trace.graph.nodes.find((n) => n.id === c.amontId);
  const racine = amont?.attrs.url || amont?.attrs['base-url'];
  if (racine) {
    const base = masquerUrl(racine);
    const liees = reussies.filter((e) => masquerUrl(e.url).startsWith(base));
    if (liees.length > 0) return liees;
  }
  return toutes.length === 1 ? reussies : [];
}

/** Hôte et chemin, sans requête ni fragment (où logent données et jetons). */
function urlCourte(url: string): string {
  const m = masquerUrl(url);
  let fin = m.length;
  const q = m.indexOf('?');
  if (q >= 0) fin = q;
  const h = m.indexOf('#');
  if (h >= 0 && h < fin) fin = h;
  return m.slice(0, fin);
}

const volumeExcessif: RegleConstat = {
  id: 'carte/volume-excessif',
  appliesTo: APP,
  tags: TAGS,
  evaluer: (trace) => {
    const toutes = couches(trace);
    return toutes.flatMap((c) => {
      if (allegee(c)) return [];
      const rows = lignesRecues(c);
      const lourde = requetesDeLaCouche(trace, c, toutes).find(
        (e) => e.taille !== null && e.taille >= SEUIL_VOLUME_OCTETS
      );
      // Au-delà du plafond, `carte/tronque-max-items` le dit déjà.
      const nombreuses = rows >= SEUIL_VOLUME_LIGNES && rows <= plafond(c).max;
      if (!nombreuses && !lourde) return [];
      const preuves: string[] = [];
      if (nombreuses) preuves.push(`${formatInt(rows)} lignes chargées d’un coup`);
      if (lourde && lourde.taille !== null) {
        preuves.push(`${urlCourte(lourde.url)} : ${formatInt(lourde.taille)} octets`);
      }
      return [
        constatCouche('carte/volume-excessif', 'avertissement', c, {
          titre: `${c.node.id} : volume de données lourd pour une carte`,
          explication:
            'Tout le jeu est chargé et dessiné d’un coup : la carte met du temps à s’afficher et à répondre, surtout sur mobile.',
          action:
            'Regrouper les points (cluster), charger selon la zone visible (bbox), ou filtrer en amont',
          reperes: [
            'carto.elements.cluster',
            'carto.elements.avancees.bbox',
            'carto.elements.avancees.filtre',
          ],
          preuve: preuves.join(' ; '),
        }),
      ];
    });
  },
};

const latenceExcessive: RegleConstat = {
  id: 'carte/latence-excessive',
  appliesTo: APP,
  tags: TAGS,
  evaluer: (trace) => {
    const toutes = couches(trace);
    return toutes.flatMap((c) => {
      let lente: EntreeReseau | undefined;
      for (const e of requetesDeLaCouche(trace, c, toutes)) {
        if (e.dureeMs === null || e.dureeMs < SEUIL_LATENCE_MS) continue;
        if (!lente || (lente.dureeMs ?? 0) < e.dureeMs) lente = e;
      }
      if (!lente || lente.dureeMs === null) return [];
      return [
        constatCouche('carte/latence-excessive', 'avertissement', c, {
          titre: `${c.node.id} : les données mettent longtemps à arriver`,
          explication:
            'Le serveur de données répond lentement : la carte reste vide le temps de la requête, et l’usager peut croire qu’elle est cassée.',
          action:
            'Charger selon la zone visible (bbox), ou demander moins de lignes (filtre, limit)',
          reperes: ['carto.elements.avancees.bbox', 'carto.elements.avancees.filtre'],
          preuve: `${lente.methode} ${urlCourte(lente.url)} : ${formatInt(lente.dureeMs)} ms`,
        }),
      ];
    });
  },
};

// ---------------------------------------------------------------------------
// Symptômes : rien dessiné, aucune donnée
// ---------------------------------------------------------------------------

const rienDessine = regleParCouche('carte/rien-dessine', (c, d) => {
  const rows = lignesRecues(c);
  if (rows === 0 || c.node.renderedCount !== 0) return null;
  // Une cause précise est déjà dite : le symptôme ne la redouble pas.
  if (d.localisation || d.coordonnees || c.node.skippedRows) return null;
  // bbox : la couche ne dessine que la zone visible, 0 peut être juste.
  if (c.node.attrs.bbox !== undefined) return null;
  const zones = c.type === 'geoshape';
  return constatCouche('carte/rien-dessine', 'erreur', c, {
    titre: `${c.node.id} : données chargées, rien de dessiné`,
    explication: zones
      ? 'La représentation « Zones » dessine des contours : le champ géographique doit porter une géométrie (GeoJSON). Sans geo-field, la couche la cherche seule dans une colonne geo_shape, geometry ou geom.'
      : 'La couche a reçu des lignes mais n’en a placé aucune : le champ de localisation ne porte pas de position qu’elle sache lire.',
    action: zones
      ? 'Vérifier le champ géographique, ou passer en « Marqueurs » ou « Cercles »'
      : 'Vérifier la localisation (panneau Couches) et la représentation (panneau Éléments)',
    reperes: [...reperesLocalisation(c), 'carto.elements.representation.type'],
    preuve: `${formatInt(rows)} ligne${rows > 1 ? 's' : ''} reçue${rows > 1 ? 's' : ''}, ${c.node.renderedCount} élément dessiné`,
  });
});

const aucuneDonnee: RegleConstat = {
  id: 'carte/aucune-donnee',
  appliesTo: APP,
  tags: TAGS,
  // Le « zéro ligne » de la source qu'une couche lit, et l'afficheur inerte
  // qu'est cette couche, sont dits ici, avec les repères qui les corrigent.
  remplace: ['pipeline/zero-ligne', 'pipeline/afficheur-inerte'],
  evaluer: (trace) =>
    couches(trace).flatMap((c) => {
      const a = c.amont;
      if (!a || !c.amontId) return [];
      // Amont introuvable, en échec, en attente voulue ou en cours : les
      // règles génériques (ou la patience) en disent plus.
      if (trace.graph.dangling.some((x) => x.node === c.node.id)) return [];
      const vide = a.status === 'loaded' && (a.rows ?? 0) === 0;
      const muet = a.status === 'idle';
      if (!vide && !muet) return [];
      return [
        constatCouche('carte/aucune-donnee', 'erreur', c, {
          titre: `${c.node.id} : aucune donnée reçue`,
          explication: vide
            ? 'La source a répondu sans ligne : la couche n’a rien à dessiner.'
            : 'La source de la couche n’a rien émis : elle n’a pas été chargée, ou son identifiant ne correspond pas.',
          action: vide
            ? 'Vérifier le filtre, ou le jeu de données choisi'
            : 'Vérifier les données de la couche',
          reperes: ['carto.couches.source', 'carto.elements.avancees.filtre'],
          preuve: vide ? `${c.amontId} → ${plural(0, 'ligne')}` : `${c.amontId} : aucune émission`,
        }),
      ];
    }),
};

/** Le lot carto (#1000), à composer avec les génériques : voir `REGLES_BUILDER_CARTO`. */
export const REGLES_CARTO: readonly RegleConstat[] = [
  sansChampGeo,
  adresseSeule,
  codeInseeSeul,
  lambert93,
  latLonInverses,
  decimalesVirgule,
  pointsZero,
  pointsEmpiles,
  lignesIgnorees,
  tronqueMaxItems,
  jeuTronque,
  volumeExcessif,
  latenceExcessive,
  rienDessine,
  aucuneDonnee,
];

/**
 * Registre du builder carto : la composition au contrat, `remplace` faisant
 * le reste. Alias : l'app comme les tests n'ont qu'un nom à écrire.
 */
export const REGLES_BUILDER_CARTO: readonly RegleConstat[] = [
  ...REGLES_GENERIQUES,
  ...REGLES_CARTO,
];
