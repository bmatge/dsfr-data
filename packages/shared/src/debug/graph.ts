/**
 * Reconstruction de la topologie du pipeline depuis le DOM (#604).
 *
 * Le bus de données est PLAT : `dsfr-data-loaded` dit qui a émis, jamais qui
 * consomme. Les arêtes n'existent que dans le DOM — l'`id` d'un composant et
 * l'attribut `source` (ou `left`/`right` pour un join) de son voisin. Ce
 * module les relit.
 *
 * Deux subtilités qui coûtent cher si on les découvre tard :
 *
 * 1. **Les afficheurs n'ont pas forcément d'`id`.** `validateTransformerConfig`
 *    l'impose aux transformateurs (ils doivent réémettre sous un nom), pas aux
 *    feuilles. Sans clé synthétique, le graphe perdrait exactement ce que
 *    l'utilisateur regarde.
 * 2. **Un amont déclaré peut ne pas exister.** `source="q1"` sans `q1` dans la
 *    page est une panne fréquente et parfaitement silencieuse : le composant
 *    attend un événement qui ne viendra jamais. On la détecte ici.
 */

import { FIELD_ATTRS } from './field-check.js';

export type StageRole = 'source' | 'transform' | 'display';

/**
 * Rôle de chaque balise dans le flux de données.
 *
 * - `source` : produit les données (fetch, adapter, inline).
 * - `transform` : les six composants-tuyaux (TransformerMixin) — consomment
 *   un amont et **réémettent** sous leur propre id.
 * - `display` : les feuilles (SourceSubscriberMixin) — consomment sans
 *   réémettre.
 *
 * Les balises absentes de cette table (contexte, carte conteneur, popup,
 * beacon…) ne portent pas de données et ne sont pas des étapes.
 *
 * Aligné sur l'usage réel des mixins par `tests/debug/alignment.test.ts`.
 */
export const STAGE_ROLES: Record<string, StageRole> = {
  'dsfr-data-source': 'source',

  'dsfr-data-facets': 'transform',
  'dsfr-data-join': 'transform',
  'dsfr-data-normalize': 'transform',
  'dsfr-data-pivot': 'transform',
  'dsfr-data-query': 'transform',
  'dsfr-data-search': 'transform',
  'dsfr-data-unpivot': 'transform',

  'dsfr-data-a11y': 'display',
  'dsfr-data-chart': 'display',
  'dsfr-data-display': 'display',
  'dsfr-data-kpi': 'display',
  'dsfr-data-list': 'display',
  'dsfr-data-map-layer': 'display',
  'dsfr-data-podium': 'display',
};

/**
 * Attributs retenus par balise pour l'affichage et le résumé textuel — ceux
 * qui expliquent la FORME du résultat. Inutile de recracher trente attributs
 * de style : ce qu'on veut lire, c'est ce qui filtre, groupe et projette.
 *
 * Cette table ne porte QUE les attributs de cadrage (requête, pagination,
 * jointure…). Ceux qui nomment un champ des données viennent de `FIELD_ATTRS`
 * et sont ajoutés automatiquement par `attrsDeForme` : sans quoi il faudrait
 * tenir deux listes d'accord, et l'oubli d'un `geo-field` ici rendrait le
 * contrôle de nommage aveugle là-bas (#727).
 */
export const SHAPE_ATTRS: Record<string, string[]> = {
  'dsfr-data-source': [
    'api-type',
    'base-url',
    'url',
    'dataset-id',
    'resource',
    'where',
    'group-by',
    'aggregate',
    'order-by',
    'page-size',
    'paginate',
    'server-side',
    'limit',
    'max-records',
    'use-proxy',
    'proxy-url',
    'transform',
  ],
  'dsfr-data-query': [
    'where',
    'filter',
    'group-by',
    'aggregate',
    'order-by',
    'limit',
    'require-where',
  ],
  'dsfr-data-normalize': [
    'numeric',
    'numeric-auto',
    'trim',
    'rename',
    'flatten',
    'split',
    'compute',
  ],
  'dsfr-data-join': ['left', 'right', 'on', 'type', 'prefix-left', 'prefix-right'],
  'dsfr-data-unpivot': ['id-cols', 'value-cols', 'value-cols-pattern', 'var-name', 'value-name'],
  'dsfr-data-pivot': ['row', 'column', 'value', 'aggregate', 'column-order', 'column-format'],
  'dsfr-data-facets': ['fields', 'server-facets', 'context'],
  'dsfr-data-search': ['fields', 'placeholder', 'server-search', 'context'],
  'dsfr-data-chart': ['type', 'label-field', 'value-field', 'series-field', 'selected-palette'],
  'dsfr-data-list': ['columns', 'columns-auto', 'search', 'pagination', 'server-sort'],
  'dsfr-data-kpi': ['value', 'label', 'format', 'unit'],
  'dsfr-data-podium': ['label-field', 'value-field', 'max-items'],
  'dsfr-data-display': ['cols', 'pagination', 'uid-field'],
  'dsfr-data-map-layer': ['type', 'lat-field', 'lon-field', 'geo-field'],
  'dsfr-data-a11y': ['label-field', 'value-field', 'for', 'table'],
};

/**
 * Attributs collectés pour une balise : le cadrage, plus tout attribut qui
 * nomme un champ (#727). Mémorisé — `snapshotGraph` repasse sur chaque nœud à
 * chaque instantané, et l'union est stable pour la durée du programme.
 */
const attrsParTag = new Map<string, string[]>();

function attrsDeForme(tag: string): string[] {
  const connu = attrsParTag.get(tag);
  if (connu) return connu;
  const union = Array.from(
    new Set([...(SHAPE_ATTRS[tag] ?? []), ...Object.keys(FIELD_ATTRS[tag] ?? {})])
  );
  attrsParTag.set(tag, union);
  return union;
}

export interface StageNode {
  /** Clé sur le bus : l'attribut `id`, ou une clé synthétique. */
  id: string;
  tag: string;
  role: StageRole;
  /**
   * True quand l'id a été fabriqué faute d'attribut `id` : ce nœud **n'émet
   * rien** sur le bus, aucun événement n'est à attendre sous cette clé.
   */
  synthetic: boolean;
  /**
   * True quand plusieurs composants déclarent le MÊME `id`.
   *
   * Distinct de `synthetic` : ces nœuds-là émettent bel et bien, mais sous
   * une clé partagée — ils écrasent mutuellement leur cache. Les confondre
   * ferait conclure à tort « ce nœud ne parle pas » à un consommateur qui
   * lit `synthetic`.
   */
  ambiguous: boolean;
  /** Ids des étapes amont (join : [left, right]). */
  upstream: string[];
  /** Attributs de forme, dans l'ordre déclaré par SHAPE_ATTRS. */
  attrs: Record<string, string>;
  /** Message posé par `reportConfigError` (attribut requis manquant…). */
  configError?: string;
  /**
   * Attributs écrits sur la balise mais INCONNUS du bundle réellement chargé
   * (#727) — ils seront ignorés en silence.
   *
   * Posés au runtime par les mixins du cœur dans `data-dsfr-unknown-attrs`,
   * seul endroit d'où l'on voie la version chargée : le lint statique compare
   * au manifeste du dépôt, il ne verra jamais qu'une page est écrite contre
   * une documentation plus récente que sa bibliothèque. Le banc d'essai a
   * vécu quatre versions mineures de retard sans s'en apercevoir.
   */
  unknownAttrs?: string[];
  /**
   * Lignes reçues mais écartées du rendu par un afficheur cartographique —
   * code ou coordonnées géographiques absents ou invalides (#648). Lu sur
   * `getSkippedCount()` du composant rehaussé ; absent quand rien n'est
   * ignoré ou quand le composant ne l'expose pas.
   */
  skippedRows?: number;
  /**
   * Colonnes dérivées par l'attribut `compute` d'un normalize (#671), avec
   * la valeur de la première ligne en exemple — ce qu'un recodage a produit,
   * visible sans ouvrir l'échantillon. Lu sur `getComputedColumns()` du
   * composant rehaussé ; absent sans compute ou quand rien n'a été traité.
   */
  computedColumns?: ComputedColumn[];
}

/** Une colonne produite par `compute` et un exemple de valeur (première ligne). */
export interface ComputedColumn {
  name: string;
  sample: unknown;
}

export interface DataflowGraph {
  nodes: StageNode[];
  /** Amonts déclarés mais introuvables dans le DOM — panne silencieuse. */
  dangling: Array<{ node: string; missing: string }>;
}

/** Amonts déclarés par une balise, selon sa nature. */
function readUpstream(el: Element, tag: string): string[] {
  if (tag === 'dsfr-data-join') {
    // transformerSources() renvoie [left, right] — un join sans les deux est
    // invalide, mais on relaie ce qui est déclaré pour que l'erreur se voie.
    return [el.getAttribute('left') ?? '', el.getAttribute('right') ?? ''].filter(Boolean);
  }
  const source = el.getAttribute('source');
  return source ? [source] : [];
}

/** Composant qui sait dire combien de lignes il a écartées (#648). */
interface SkipCountingElement extends Element {
  getSkippedCount?: () => number;
}

/**
 * Lignes écartées par un afficheur, si le composant est rehaussé et l'expose.
 *
 * Même doctrine que la délégation des `dsfr-data-query` : on lit une méthode
 * publique du composant plutôt qu'un événement du bus — un afficheur ne
 * réémet rien, c'est le seul endroit où cette information existe. Un
 * composant non rehaussé (bundle absent, tag inconnu) rend `undefined`.
 */
function readSkippedRows(el: Element): number | undefined {
  const counting = el as SkipCountingElement;
  if (typeof counting.getSkippedCount !== 'function') return undefined;
  try {
    const n = counting.getSkippedCount();
    return typeof n === 'number' && n > 0 ? n : undefined;
  } catch {
    // Un composant à moitié initialisé ne doit jamais casser la trace.
    return undefined;
  }
}

/** Transformateur qui sait lister ses colonnes dérivées (#671). */
interface ComputingElement extends Element {
  getComputedColumns?: () => ComputedColumn[];
}

/**
 * Colonnes dérivées par `compute`, si le composant est rehaussé et les
 * expose — même doctrine que `readSkippedRows` : une méthode publique du
 * composant, pas un événement du bus (le bus transporte les lignes, pas la
 * provenance des colonnes).
 */
function readComputedColumns(el: Element): ComputedColumn[] | undefined {
  const computing = el as ComputingElement;
  if (typeof computing.getComputedColumns !== 'function') return undefined;
  try {
    const columns = computing.getComputedColumns();
    return Array.isArray(columns) && columns.length > 0 ? columns : undefined;
  } catch {
    // Un composant à moitié initialisé ne doit jamais casser la trace.
    return undefined;
  }
}

function readShapeAttrs(el: Element, tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const name of attrsDeForme(tag)) {
    const value = el.getAttribute(name);
    // Un attribut booléen présent vaut chaîne vide : on le note quand même,
    // `paginate` ou `search` changent le comportement par leur seule présence.
    if (value !== null) attrs[name] = value;
  }
  return attrs;
}

/**
 * Parcourt le DOM et reconstruit le graphe du pipeline.
 *
 * L'ordre des nœuds suit l'ordre du document : c'est celui que l'intégrateur
 * a écrit, donc celui qu'il reconnaît.
 */
export function snapshotGraph(root: ParentNode): DataflowGraph {
  const nodes: StageNode[] = [];
  const seenIds = new Set<string>();
  let syntheticSeq = 0;

  for (const el of Array.from(root.querySelectorAll('*'))) {
    const tag = el.tagName.toLowerCase();
    const role = STAGE_ROLES[tag];
    if (!role) continue;

    const declaredId = el.id;
    let id = declaredId;
    let synthetic = false;
    let ambiguous = false;

    if (!id) {
      // Une feuille sans id ne parle pas sur le bus : on lui fabrique une clé
      // stable dans le rendu courant pour ne pas la perdre du graphe.
      syntheticSeq += 1;
      id = `${tag.replace('dsfr-data-', '')}@${syntheticSeq}`;
      synthetic = true;
    }

    // Deux composants qui partagent un id, c'est deux étapes qui écrasent
    // mutuellement leur cache. On désambiguïse plutôt que de perdre l'un.
    if (seenIds.has(id)) {
      syntheticSeq += 1;
      id = `${id}#${syntheticSeq}`;
      ambiguous = true;
    }
    seenIds.add(id);

    const configError = el.getAttribute('data-dsfr-config-error');
    // Marqueur posé par `checkUnknownAttributes`
    // (packages/core/src/utils/unknown-attributes.ts) — même doctrine que
    // `data-dsfr-config-error` : le cœur écrit, le collecteur relit, aucune
    // dépendance de module entre les deux.
    const unknownAttrs = (el.getAttribute('data-dsfr-unknown-attrs') ?? '')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);
    const skippedRows = role === 'display' ? readSkippedRows(el) : undefined;
    const computedColumns = role === 'transform' ? readComputedColumns(el) : undefined;

    nodes.push({
      id,
      tag,
      role,
      synthetic,
      ambiguous,
      upstream: readUpstream(el, tag),
      attrs: readShapeAttrs(el, tag),
      ...(configError ? { configError } : {}),
      ...(unknownAttrs.length > 0 ? { unknownAttrs } : {}),
      ...(skippedRows !== undefined ? { skippedRows } : {}),
      ...(computedColumns !== undefined ? { computedColumns } : {}),
    });
  }

  const known = new Set(nodes.filter((n) => !n.synthetic && !n.ambiguous).map((n) => n.id));
  const dangling: Array<{ node: string; missing: string }> = [];
  for (const node of nodes) {
    for (const up of node.upstream) {
      if (!known.has(up)) dangling.push({ node: node.id, missing: up });
    }
  }

  return { nodes, dangling };
}

/** Les étapes qui consomment la sortie de `id`. */
export function downstreamOf(graph: DataflowGraph, id: string): StageNode[] {
  return graph.nodes.filter((n) => n.upstream.includes(id));
}

/**
 * Ordre topologique du graphe (amont avant aval).
 *
 * Un cycle — `a` source de `b` source de `a` — n'est pas une erreur à lever :
 * c'est une page cassée qu'il faut quand même pouvoir afficher. Les nœuds non
 * ordonnables sont donc rendus en fin de liste plutôt qu'omis.
 */
export function topoOrder(graph: DataflowGraph): StageNode[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const sorted: StageNode[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (node: StageNode): void => {
    const status = state.get(node.id);
    if (status === 'done' || status === 'visiting') return;
    state.set(node.id, 'visiting');
    for (const up of node.upstream) {
      const parent = byId.get(up);
      if (parent) visit(parent);
    }
    state.set(node.id, 'done');
    sorted.push(node);
  };

  for (const node of graph.nodes) visit(node);
  return sorted;
}
