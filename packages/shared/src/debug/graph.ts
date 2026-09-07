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
 * Aligné sur l'usage réel des mixins par `tests/debug/roles-alignment.test.ts`.
 */
export const STAGE_ROLES: Record<string, StageRole> = {
  'dsfr-data-source': 'source',

  'dsfr-data-facets': 'transform',
  'dsfr-data-join': 'transform',
  'dsfr-data-normalize': 'transform',
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
 */
const SHAPE_ATTRS: Record<string, string[]> = {
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
    'use-proxy',
    'proxy-url',
    'transform',
  ],
  'dsfr-data-query': ['where', 'filter', 'group-by', 'aggregate', 'order-by', 'limit'],
  'dsfr-data-normalize': ['rules', 'trim', 'flatten', 'split', 'rename'],
  'dsfr-data-join': ['left', 'right', 'on', 'type', 'prefix-left', 'prefix-right'],
  'dsfr-data-unpivot': ['cols', 'name-field', 'value-field'],
  'dsfr-data-facets': ['fields', 'multi'],
  'dsfr-data-search': ['fields', 'placeholder'],
  'dsfr-data-chart': ['type', 'label-field', 'value-field', 'series-field', 'selected-palette'],
  'dsfr-data-list': ['columns', 'search', 'pagination', 'sortable'],
  'dsfr-data-kpi': ['value', 'label', 'format', 'field', 'aggregate'],
  'dsfr-data-podium': ['label-field', 'value-field'],
  'dsfr-data-display': ['fields', 'template'],
  'dsfr-data-map-layer': ['type', 'lat-field', 'lon-field', 'geo-field', 'value-field'],
  'dsfr-data-a11y': ['label-field', 'value-field'],
};

export interface StageNode {
  /** Clé sur le bus : l'attribut `id`, ou une clé synthétique. */
  id: string;
  tag: string;
  role: StageRole;
  /** True quand l'id a été fabriqué : ce nœud n'émet rien sur le bus. */
  synthetic: boolean;
  /** Ids des étapes amont (join : [left, right]). */
  upstream: string[];
  /** Attributs de forme, dans l'ordre déclaré par SHAPE_ATTRS. */
  attrs: Record<string, string>;
  /** Message posé par `reportConfigError` (attribut requis manquant…). */
  configError?: string;
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

function readShapeAttrs(el: Element, tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const name of SHAPE_ATTRS[tag] ?? []) {
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
      synthetic = true;
    }
    seenIds.add(id);

    const configError = el.getAttribute('data-dsfr-config-error');

    nodes.push({
      id,
      tag,
      role,
      synthetic,
      upstream: readUpstream(el, tag),
      attrs: readShapeAttrs(el, tag),
      ...(configError ? { configError } : {}),
    });
  }

  const known = new Set(nodes.filter((n) => !n.synthetic).map((n) => n.id));
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
