/**
 * Les échecs de nommage se voient — volet 1 : le champ inexistant (#727).
 *
 * Aucun composant ne comparait jusqu'ici un nom de champ au schéma reçu. Une
 * faute de frappe dans `label-field` rendait un graphique vide, sans le
 * moindre message : la panne la plus fréquente du banc d'essai, et la plus
 * silencieuse.
 *
 * Les deux côtés de la comparaison étaient pourtant déjà collectés par le
 * volet Diagnostic : les attributs de forme par `snapshotGraph`, les champs
 * réellement présents par `summarizeStage`. Ce module ne fait que les croiser.
 *
 * Trois règles, chacune posée pour ne JAMAIS produire de faux positif — un
 * diagnostic qui crie au loup apprend à être ignoré, et celui-ci s'adresse
 * autant à un agent qu'à un humain :
 *
 * 1. **On compare au schéma D'ENTRÉE.** Un attribut d'un afficheur ou d'un
 *    transformateur désigne un champ de ce qu'il REÇOIT. Un nœud sans amont
 *    observé — une source, dont les attributs décrivent un schéma distant —
 *    n'est pas contrôlé du tout.
 * 2. **Un chemin imbriqué n'est vérifié qu'à sa racine.** `label-field="a.b"`
 *    est résolu par `getByPath` : la matrice ne connaît que la clé de premier
 *    niveau `a`. Contrôler `a` suffit, contrôler `a.b` inventerait une panne.
 * 3. **Les attributs à grammaire ambiguë sont exclus**, et le disent : le
 *    `order-by` et l'`aggregate` d'un `dsfr-data-query` peuvent nommer un
 *    alias produit par l'agrégation elle-même, absent de l'entrée.
 */

import type { Field } from '../ia/data-tools.js';
import type { DataflowGraph, StageNode } from './graph.js';
import { COLON_FILTER_OPERATORS } from '../query/filter-translator.js';
import { unescapeColonValue } from '../utils/colon-escape.js';

/**
 * Pourquoi un champ nommé ne rendra rien.
 *
 * - `absent` : le nom n'est pas dans le schéma reçu — faute de frappe,
 *   renommage en amont, colonne disparue.
 * - `vide` : le champ existe, mais aucune valeur non nulle n'a été observée.
 *   La distinction est gratuite, `analyzeDataFields` donne déjà les deux, et
 *   elle évite d'envoyer chercher une faute d'orthographe là où il n'y en a
 *   pas.
 */
export type FieldIssueReason = 'absent' | 'vide';

/** Un champ nommé par un attribut, et introuvable ou vide dans les données. */
export interface FieldIssue {
  /** Attribut fautif, ex. `label-field`. */
  attr: string;
  /** Nom écrit dans l'attribut, tel quel — chemin imbriqué compris. */
  field: string;
  reason: FieldIssueReason;
  /**
   * Message français prêt à rendre, construit là où la liste des champs est
   * sous la main. Même formulation que `diagnoseConfig` du Studio : une seule
   * phrase pour la même panne, où qu'on la rencontre.
   */
  message: string;
}

/**
 * Grammaire de la valeur d'un attribut qui désigne un ou plusieurs champs.
 *
 * - `nom` : un nom nu (`label-field="commune"`).
 * - `liste` : noms séparés par des virgules (`fields="region, dept"`).
 * - `liste-alias` : virgules, chaque élément `champ:suffixe`
 *   (`columns="cle:Libellé"`, `round="pop:2"`, `sort="score:desc"`).
 * - `pipe-alias` : barres verticales, chaque élément `champ:suite`
 *   (`rename="ancien:nouveau | a:b"`).
 * - `clauses` : dialecte colon des filtres (`where="pop:gte:1000"`) — le champ
 *   n'est retenu que si l'opérateur est connu, sinon la clause est malformée
 *   et c'est au composant de le dire.
 * - `paires` : clés de jointure (`on="code_dep=dep"`), les DEUX côtés.
 * - `chemin` : chemin d'objet (`flatten="data.attributes"`).
 * - `expression` : grammaire d'agrégat du KPI (`value="population:sum"`,
 *   `value="count:statut:ouvert / count"`, `value="meta:total"`).
 */
export type FieldAttrKind =
  'nom' | 'liste' | 'liste-alias' | 'pipe-alias' | 'clauses' | 'paires' | 'chemin' | 'expression';

/**
 * Inventaire des attributs qui désignent un champ des données, par balise.
 *
 * `SHAPE_ATTRS` (graph.ts) est complété depuis cette table : un attribut
 * ajouté ici est automatiquement collecté par `snapshotGraph`, il n'y a pas
 * deux listes à tenir d'accord.
 *
 * Ce qui est volontairement ABSENT, et pourquoi :
 * - `dsfr-data-source` en entier : ses attributs (`where`, `group-by`,
 *   `select`…) nomment des champs du jeu DISTANT, avant tout aller-retour.
 *   Rien dans la trace ne peut les contredire.
 * - `order-by` et `aggregate` d'un `dsfr-data-query` : leurs noms peuvent
 *   désigner un alias d'agrégat (`total_pop`, `population__sum`) que l'entrée
 *   ne contient pas.
 * - `value-cols-pattern` (unpivot), `fold` (normalize) : des motifs à joker,
 *   pas des noms.
 * - `labels`, `display`, `cols`, `url-param-map` des facettes : des tables
 *   dont la forme change selon l'écriture (`cols="6"` est un nombre global).
 */
export const FIELD_ATTRS: Record<string, Record<string, FieldAttrKind>> = {
  // --- Afficheurs (feuilles) ---
  'dsfr-data-chart': {
    'label-field': 'nom',
    'value-field': 'nom',
    'value-field-2': 'nom',
    'value-fields': 'liste',
    'series-field': 'nom',
    'code-field': 'nom',
    'databox-date-field': 'nom',
  },
  'dsfr-data-kpi': {
    value: 'expression',
    valeur: 'expression',
    trend: 'expression',
    tendance: 'expression',
    where: 'clauses',
  },
  'dsfr-data-list': {
    columns: 'liste-alias',
    colonnes: 'liste-alias',
    filters: 'liste',
    filtres: 'liste',
    sort: 'liste-alias',
    tri: 'liste-alias',
  },
  'dsfr-data-display': { 'uid-field': 'nom' },
  'dsfr-data-podium': {
    'label-field': 'nom',
    'value-field': 'nom',
    'subtitle-field': 'nom',
  },
  'dsfr-data-a11y': { 'label-field': 'nom', 'value-field': 'nom' },
  'dsfr-data-map-layer': {
    'lat-field': 'nom',
    'lon-field': 'nom',
    'geo-field': 'nom',
    'popup-fields': 'liste',
    'tooltip-field': 'nom',
    'color-field': 'nom',
    'fill-field': 'nom',
    'radius-field': 'nom',
    'heat-field': 'nom',
    'bbox-field': 'nom',
    'time-field': 'nom',
  },

  // --- Transformateurs (tuyaux) ---
  'dsfr-data-query': { where: 'clauses', filter: 'clauses', 'group-by': 'liste' },
  'dsfr-data-join': { on: 'paires' },
  'dsfr-data-pivot': { row: 'liste', column: 'nom', value: 'nom' },
  'dsfr-data-unpivot': { 'id-cols': 'liste', 'value-cols': 'liste-alias' },
  'dsfr-data-normalize': {
    numeric: 'liste',
    round: 'liste-alias',
    split: 'liste-alias',
    rename: 'pipe-alias',
    'replace-fields': 'pipe-alias',
    flatten: 'chemin',
  },
  'dsfr-data-facets': { fields: 'liste', disjunctive: 'liste', searchable: 'liste' },
  'dsfr-data-search': { fields: 'liste' },
};

/**
 * Fonctions d'agrégat du KPI — copie de la liste blanche de
 * `packages/core/src/utils/aggregations.ts`. La frontière lib/app (#319)
 * interdit à ce module d'importer le cœur ; une fonction ajoutée là-bas et
 * oubliée ici fait au pire manquer un contrôle, jamais inventer une panne.
 */
const FONCTIONS_KPI = new Set([
  'avg',
  'sum',
  'count',
  'min',
  'max',
  'first',
  'last',
  'distinct',
  'evolution',
]);

/** Fonctions lisibles dans l'ancienne grammaire inversée `fn:champ` (#303). */
const FONCTIONS_KPI_HERITEES = new Set(['avg', 'sum', 'count', 'min', 'max', 'first', 'last']);

/** Alias de fonction résolus avant lecture (`count-distinct` = `distinct`). */
const ALIAS_KPI: Record<string, string> = { 'count-distinct': 'distinct' };

const OPERATEURS_COLON: ReadonlySet<string> = new Set(COLON_FILTER_OPERATORS);

function morceaux(value: string, separateur: string): string[] {
  return value
    .split(separateur)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Partie gauche d'un élément `champ:suite`, déséchappée. */
function avantDeuxPoints(part: string): string {
  const i = part.indexOf(':');
  return unescapeColonValue((i === -1 ? part : part.slice(0, i)).trim());
}

/**
 * Champs nommés par une expression d'agrégat de KPI.
 *
 * Volontairement conservateur : une expression que cette lecture ne reconnaît
 * pas ne produit AUCUN champ. Le KPI signale lui-même les expressions
 * invalides (doctrine #649), ce n'est pas à la trace de doubler le message
 * avec une supposition.
 */
function champsExpression(value: string): string[] {
  const out: string[] = [];
  for (const cote of value.split(' / ')) {
    const brut = cote.trim();
    // `meta:total` (#659) ne lit pas les lignes : c'est le total de l'amont.
    if (!brut || brut === 'meta:total') continue;
    const parts = brut.split(':').map((p) => ALIAS_KPI[p] ?? p.trim());
    if (parts.length === 1) {
      // `count` seul compte les lignes, il ne nomme pas de champ.
      if (parts[0] !== 'count') out.push(parts[0]);
      continue;
    }
    // Grammaire commune « champ:fn ».
    if (
      parts.length === 2 &&
      FONCTIONS_KPI.has(parts[1]) &&
      !FONCTIONS_KPI_HERITEES.has(parts[0])
    ) {
      out.push(parts[0]);
      continue;
    }
    // Grammaire héritée « fn:champ » et « count:champ:valeur ».
    if (FONCTIONS_KPI_HERITEES.has(parts[0]) && parts[1]) out.push(parts[1]);
  }
  return out;
}

/** Champs nommés par la valeur d'un attribut, selon sa grammaire. */
export function fieldsInAttr(value: string, kind: FieldAttrKind): string[] {
  const brut = value.trim();
  if (!brut) return [];
  switch (kind) {
    case 'nom':
    case 'chemin':
      return [brut];
    case 'liste':
      return morceaux(brut, ',');
    case 'liste-alias':
      return morceaux(brut, ',').map(avantDeuxPoints).filter(Boolean);
    case 'pipe-alias':
      return morceaux(brut, '|').map(avantDeuxPoints).filter(Boolean);
    case 'clauses':
      return (
        morceaux(brut, ',')
          .map((part) => part.split(':'))
          // Une clause dont l'opérateur est inconnu est malformée : c'est
          // `validateColonFilter` qui doit le dire, pas ce module.
          .filter((segs) => segs.length >= 2 && OPERATEURS_COLON.has(segs[1].trim()))
          .map((segs) => unescapeColonValue(segs[0].trim()))
          .filter(Boolean)
      );
    case 'paires':
      return morceaux(brut, ',').flatMap((part) => {
        const eq = part.indexOf('=');
        if (eq > 0) return [part.slice(0, eq).trim(), part.slice(eq + 1).trim()];
        return [part];
      });
    case 'expression':
      return champsExpression(brut);
    default:
      return [];
  }
}

/** Un champ nommé par un attribut du nœud. */
export interface FieldRef {
  attr: string;
  field: string;
}

/**
 * Tous les champs nommés par les attributs d'un nœud, dans l'ordre de
 * déclaration. Les doublons sont écartés : un même nom fautif écrit dans deux
 * attributs mérite deux lignes, le même nom deux fois dans le même attribut
 * n'en mérite qu'une.
 */
export function referencedFields(node: StageNode): FieldRef[] {
  const table = FIELD_ATTRS[node.tag];
  if (!table) return [];
  const out: FieldRef[] = [];
  const vus = new Set<string>();
  for (const [attr, kind] of Object.entries(table)) {
    const value = node.attrs[attr];
    if (value === undefined) continue;
    for (const field of fieldsInAttr(value, kind)) {
      const cle = `${attr} ${field}`;
      if (vus.has(cle)) continue;
      vus.add(cle);
      out.push({ attr, field });
    }
  }
  return out;
}

/**
 * Racine d'un chemin imbriqué : `a.b` et `items[0]` ont pour racine `a` et
 * `items`. C'est la seule clé que `analyzeDataFields` connaît, et donc la
 * seule qu'on puisse contredire sans se tromper (règle 2 de l'en-tête).
 */
function racineDuChemin(field: string): string {
  const point = field.indexOf('.');
  const crochet = field.indexOf('[');
  let fin = field.length;
  if (point >= 0) fin = Math.min(fin, point);
  if (crochet >= 0) fin = Math.min(fin, crochet);
  return field.slice(0, fin);
}

/** Liste des champs pour le message, bornée — un schéma large reste lisible. */
function listerChamps(fields: Field[], max = 20): string {
  const noms = fields.map((f) => f.name);
  if (noms.length <= max) return noms.join(', ');
  return `${noms.slice(0, max).join(', ')}, … (+${noms.length - max})`;
}

/**
 * Croise les champs nommés par un nœud avec le schéma qu'il reçoit.
 *
 * `fields` vide = rien d'observé : on ne rend RIEN. Une étape dont l'amont n'a
 * pas encore émis n'est pas une étape fautive.
 */
export function checkNodeFields(node: StageNode, fields: Field[]): FieldIssue[] {
  if (fields.length === 0) return [];
  const connus = new Set(fields.map((f) => f.name));
  // « Présent mais vide » : `analyzeDataFields` cherche une valeur non nulle
  // sur les 100 premières lignes ; un échantillon resté nul dit que la
  // colonne existe et ne porte rien.
  const vides = new Set(
    fields.filter((f) => f.sample === null || f.sample === '').map((f) => f.name)
  );

  const issues: FieldIssue[] = [];
  for (const { attr, field } of referencedFields(node)) {
    const racine = racineDuChemin(field);
    if (!connus.has(racine)) {
      issues.push({
        attr,
        field,
        reason: 'absent',
        message: `Le champ ${attr} "${field}" n'existe pas. Champs : ${listerChamps(fields)}.`,
      });
      continue;
    }
    // Un chemin imbriqué n'est vide que si sa racine l'est, ce qu'on ne peut
    // pas conclure : on ne signale le vide que sur un nom de premier niveau.
    if (racine === field && vides.has(field)) {
      issues.push({
        attr,
        field,
        reason: 'vide',
        message: `Le champ ${attr} "${field}" existe mais aucune valeur n'a été observée — rien à rendre.`,
      });
    }
  }
  return issues;
}

/**
 * Le schéma D'ENTRÉE d'un nœud : l'union des champs de ses amonts.
 *
 * Union et non intersection : un join lit deux schémas, un champ présent d'un
 * seul côté est parfaitement légitime. L'union ne peut donc que sous-signaler,
 * jamais inventer.
 */
function champsEnEntree(node: StageNode, states: Record<string, { fields?: Field[] }>): Field[] {
  const out: Field[] = [];
  const vus = new Set<string>();
  for (const up of node.upstream) {
    for (const f of states[up]?.fields ?? []) {
      if (vus.has(f.name)) continue;
      vus.add(f.name);
      out.push(f);
    }
  }
  return out;
}

/**
 * Les champs introuvables de tout un pipeline, par identifiant de nœud.
 *
 * Les nœuds sans amont (les sources) sont ignorés : leurs attributs décrivent
 * un jeu distant que la trace ne voit pas.
 */
export function fieldIssuesByNode(
  graph: DataflowGraph,
  states: Record<string, { fields?: Field[] }>
): Record<string, FieldIssue[]> {
  const out: Record<string, FieldIssue[]> = {};
  for (const node of graph.nodes) {
    if (node.upstream.length === 0) continue;
    const issues = checkNodeFields(node, champsEnEntree(node, states));
    if (issues.length > 0) out[node.id] = issues;
  }
  return out;
}
