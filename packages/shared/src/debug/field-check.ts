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
import { CHAMPS_DES_COMPOSANTS } from './field-attrs.generated.js';

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
export const FIELD_ATTR_KINDS = [
  'nom',
  'liste',
  'liste-alias',
  'pipe-alias',
  'clauses',
  'paires',
  'chemin',
  'expression',
] as const;
export type FieldAttrKind = (typeof FIELD_ATTR_KINDS)[number];

/**
 * Inventaire des attributs qui désignent un champ des données, par balise.
 *
 * GÉNÉRÉ depuis le JSDoc des composants (#1141) : tag `@champ <grammaire>`
 * sur la propriété, relu dans le manifeste par `build:component-contract`
 * (`field-attrs.generated.ts`). Un attribut ajouté à un composant avec son
 * `@champ` est contrôlé ici, par le bloc libre du Studio, et figure au
 * contrat des composants, sans autre geste.
 *
 * `SHAPE_ATTRS` (graph.ts) est complété depuis cette table : un attribut
 * marqué est automatiquement collecté par `snapshotGraph`, il n'y a pas
 * deux listes à tenir d'accord.
 *
 * Ce qui n'est volontairement PAS marqué est listé, avec sa raison, dans
 * `ATTRIBUTS_CHAMP_NON_MARQUES` — un test-garde exige que tout attribut du
 * manifeste qui ressemble à un champ soit marqué ou y figure.
 */
export const FIELD_ATTRS: Record<string, Record<string, FieldAttrKind>> = CHAMPS_DES_COMPOSANTS;

/**
 * Attributs qui ont l'air de désigner un champ et ne sont PAS marqués
 * `@champ`, avec la raison. Clé : `balise attribut`.
 *
 * Règle commune : on ne marque que ce qui nomme un champ de l'ENTRÉE du
 * composant, sans ambiguïté — un marquage faux ferait refuser au Studio un
 * bloc correct.
 */
export const ATTRIBUTS_CHAMP_NON_MARQUES: Readonly<Record<string, string>> = {
  'dsfr-data-source where':
    'nomme un champ du jeu DISTANT, avant tout aller-retour : rien dans la trace ne peut le contredire',
  'dsfr-data-source select': 'jeu distant (et expressions ODS)',
  'dsfr-data-source group-by': 'jeu distant (et expressions ODS)',
  'dsfr-data-source aggregate': 'jeu distant, grammaire propre au fournisseur',
  'dsfr-data-source order-by': 'jeu distant, peut viser un alias d’agrégat',
  'dsfr-data-query aggregate':
    'peut nommer l’alias produit par l’agrégation elle-même (`total_pop`), absent de l’entrée',
  'dsfr-data-query order-by':
    'peut viser un alias d’agrégat (`population__sum`), absent de l’entrée',
  'dsfr-data-concat origin-field': 'CRÉE une colonne, n’en lit aucune',
  'dsfr-data-concat origin-labels': 'ids de sources et libellés, pas des champs',
  'dsfr-data-unpivot value-cols-pattern': 'motif à jokers `{TOKEN}`, pas un nom',
  'dsfr-data-unpivot var-name': 'nom de la colonne CRÉÉE',
  'dsfr-data-unpivot value-name': 'nom de la colonne CRÉÉE',
  'dsfr-data-normalize fold': 'motif de colonnes booléennes, pas un nom',
  'dsfr-data-pivot labels': 'libellés des VALEURS du pivot, pas des champs',
  'dsfr-data-pivot aggregate': 'fonction de réduction (`sum`, `count`…), pas un champ',
  'dsfr-data-facets labels':
    'table `champ:libellé` dont la forme change selon l’écriture ; le champ est déjà dans `fields`',
  'dsfr-data-facets value-labels': 'libellés des VALEURS d’une facette',
  'dsfr-data-facets display': 'table `champ:mode` ; le champ est déjà dans `fields`',
  'dsfr-data-facets cols': '`cols="6"` est un nombre global, ou une table par facette',
  'dsfr-data-facets sort': 'critère de tri des valeurs (`count:desc`), pas un champ',
  'dsfr-data-context-filter field':
    'colonne des SOURCES ciblées telle que l’API la connaît (filtre poussé au serveur)',
  'dsfr-data-context-value field': 'champ du CONTEXTE (filtre courant), pas d’une ligne de données',
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
