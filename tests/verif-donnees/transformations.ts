/**
 * Contrôles DÉTERMINISTES du lot TRANSFORMATIONS — bloquants sur chaque PR,
 * zéro réseau (les lignes sont servies par l'attribut `data` inline).
 *
 * Ce que ce manifeste éprouve : chaque opérateur et chaque agrégation vaut ce
 * que l'oracle recalcule. `dsfr-data-query` (les douze opérateurs de `where`,
 * les regroupements simples et composites, les huit agrégations, le tri à
 * plusieurs clés, la limite), `dsfr-data-normalize` (typage, arrondi,
 * renommage, remplacements, découpe, repli, et toute la grammaire des
 * colonnes calculées), `dsfr-data-pivot`, `dsfr-data-unpivot`,
 * `dsfr-data-join` (les quatre types, clés composites, clés vides, écart de
 * graphie #792) et `dsfr-data-concat`.
 *
 * Le `pipeline` d'un `expect` décrit CE QUE LA PAGE DOIT MONTRER, pas comment
 * la bibliothèque s'y prend : quand l'oracle n'a pas l'opération de la lib
 * (une découpe en tableau, un repli de colonnes Oui/Non), il énonce le même
 * résultat affiché par un autre chemin — c'est le principe.
 *
 * Chaque famille a été vérifiée EN ÉCHEC sur un défaut injecté dans la lib
 * (voir `tools/oracle/README.md`, « prouver une mutation »).
 *
 * Ce qui n'est volontairement PAS contrôlé ici, et pourquoi :
 *   - l'égalité stricte de `where` et `compute` sur les TABLEAUX : décision
 *     produit en vigueur (#842) ;
 *   - `where="champ:eq:0"` face à une cellule VIDE : le `where` garde
 *     l'égalité lâche de JavaScript (`'' == 0`) là où `compute` ne l'a pas ;
 *     les deux sémantiques coexistent exprès, l'oracle en énonce une ;
 *   - un TRI dont la colonne mêle nombres et non-nombres : la bibliothèque y
 *     applique un ordre total à trois rangs (vide < nombre < chaîne) qui n'est
 *     pas celui de ses comparaisons de filtre ; les deux ne sont pas
 *     comparables, et aucun contrôle ne s'y appuie. Les COMPARAISONS d'ordre
 *     d'un `where`, elles, sont contrôlées sur une paire mixte
 *     (`where-paire-mixte-nombre-et-texte`) ;
 *   - les erreurs de configuration (collision de colonnes d'un pivot, schéma
 *     divergent d'un empilement) : elles n'émettent AUCUNE ligne, et l'oracle
 *     ne compare que ce qui s'affiche.
 */
import type { Check, Manifest, Row } from '../../tools/oracle/manifest.js';
import {
  BRUTES,
  CALCULS,
  COMPOSITE_DROITE,
  COMPOSITE_GAUCHE,
  DROITE,
  GAUCHE,
  GAUCHE_GRAPHIE,
  LARGE,
  LONG,
  PILE_2024,
  PILE_2025,
  TERRITOIRES,
  inline,
} from './fixtures-transformations.js';

/** Une source à données inline : aucun fetch, la page part des mêmes lignes que l'oracle. */
function source(id: string, rows: Row[]): string {
  return `  <dsfr-data-source id="${id}" data='${inline(rows)}'></dsfr-data-source>`;
}

/** Un KPI de comptage, le lecteur le plus court d'un filtre. */
function kpi(id: string, sourceId: string, valeur = 'count', label = 'Lignes'): string {
  return `  <dsfr-data-kpi id="${id}" source="${sourceId}" value="${valeur}" format="nombre" label="${label}"></dsfr-data-kpi>`;
}

const TERR = source('s-terr', TERRITOIRES);
const JEU_TERR = { main: TERRITOIRES };

// ---------------------------------------------------------------------------
// where — les douze opérateurs
// ---------------------------------------------------------------------------

const WHERE: Check[] = [
  {
    id: 'where-eq-neq',
    mode: 'deterministic',
    origin:
      'Les deux opérateurs d’égalité de `where`, comptés de part et d’autre : eq et neq partagent les douze lignes sans en perdre ni en compter deux fois.',
    feed: { kind: 'fixture', datasets: JEU_TERR },
    markup: `${TERR}
  <dsfr-data-query id="q-eq" source="s-terr" where="zone:eq:nord"></dsfr-data-query>
  <dsfr-data-query id="q-neq" source="s-terr" where="zone:neq:nord"></dsfr-data-query>
${kpi('k-eq', 'q-eq')}
${kpi('k-neq', 'q-neq')}`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-eq',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'zone', op: 'eq', value: 'nord' }] }],
      },
      {
        kind: 'kpi',
        id: 'k-neq',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'zone', op: 'neq', value: 'nord' }] }],
      },
    ],
  },

  {
    id: 'where-gt-gte',
    mode: 'deterministic',
    origin:
      'gt et gte sur une population : la borne elle-même fait la différence entre les deux, et une seule ligne la porte.',
    feed: { kind: 'fixture', datasets: JEU_TERR },
    markup: `${TERR}
  <dsfr-data-query id="q-gt" source="s-terr" where="population:gt:1400000"></dsfr-data-query>
  <dsfr-data-query id="q-gte" source="s-terr" where="population:gte:1400000"></dsfr-data-query>
${kpi('k-gt', 'q-gt')}
${kpi('k-gte', 'q-gte')}`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-gt',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'population', op: 'gt', value: 1400000 }] }],
      },
      {
        kind: 'kpi',
        id: 'k-gte',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'population', op: 'gte', value: 1400000 }] }],
      },
    ],
  },

  {
    id: 'where-lt-lte',
    mode: 'deterministic',
    origin:
      'lt et lte, symétriques des précédents : les quatre bornes ensemble recouvrent exactement le jeu.',
    feed: { kind: 'fixture', datasets: JEU_TERR },
    markup: `${TERR}
  <dsfr-data-query id="q-lt" source="s-terr" where="population:lt:1400000"></dsfr-data-query>
  <dsfr-data-query id="q-lte" source="s-terr" where="population:lte:1400000"></dsfr-data-query>
${kpi('k-lt', 'q-lt')}
${kpi('k-lte', 'q-lte')}`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-lt',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'population', op: 'lt', value: 1400000 }] }],
      },
      {
        kind: 'kpi',
        id: 'k-lte',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'population', op: 'lte', value: 1400000 }] }],
      },
    ],
  },

  {
    id: 'where-contains-notcontains',
    mode: 'deterministic',
    origin:
      'contains et notcontains sur un libellé ACCENTUÉ, cherché en minuscules : la comparaison ignore la casse mais pas l’accent.',
    feed: { kind: 'fixture', datasets: JEU_TERR },
    markup: `${TERR}
  <dsfr-data-query id="q-con" source="s-terr" where="nom:contains:rhône"></dsfr-data-query>
  <dsfr-data-query id="q-ncon" source="s-terr" where="nom:notcontains:rhône"></dsfr-data-query>
${kpi('k-con', 'q-con')}
${kpi('k-ncon', 'q-ncon')}`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-con',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'nom', op: 'contains', value: 'rhône' }] }],
      },
      {
        kind: 'kpi',
        id: 'k-ncon',
        agg: 'count',
        pipeline: [
          { op: 'filter', filters: [{ field: 'nom', op: 'notcontains', value: 'rhône' }] },
        ],
      },
    ],
  },

  {
    id: 'where-in-notin',
    mode: 'deterministic',
    origin:
      'in et notin, valeurs séparées par une barre verticale : le complément d’un in doit rendre les lignes qui restent, toutes les lignes qui restent.',
    feed: { kind: 'fixture', datasets: JEU_TERR },
    markup: `${TERR}
  <dsfr-data-query id="q-in" source="s-terr" where="zone:in:nord|est"></dsfr-data-query>
  <dsfr-data-query id="q-nin" source="s-terr" where="zone:notin:nord|est"></dsfr-data-query>
${kpi('k-in', 'q-in')}
${kpi('k-nin', 'q-nin')}`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-in',
        agg: 'count',
        pipeline: [
          { op: 'filter', filters: [{ field: 'zone', op: 'in', value: ['nord', 'est'] }] },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-nin',
        agg: 'count',
        pipeline: [
          { op: 'filter', filters: [{ field: 'zone', op: 'notin', value: ['nord', 'est'] }] },
        ],
      },
    ],
  },

  {
    id: 'where-isnull-isnotnull',
    mode: 'deterministic',
    origin:
      'isnull et isnotnull face à trois états : renseigné, chaîne VIDE, absent. Pour `where`, une chaîne vide est une valeur — une seule ligne du jeu est absente, deux sont vides.',
    feed: { kind: 'fixture', datasets: JEU_TERR },
    markup: `${TERR}
  <dsfr-data-query id="q-nul" source="s-terr" where="statut:isnull"></dsfr-data-query>
  <dsfr-data-query id="q-nnul" source="s-terr" where="statut:isnotnull"></dsfr-data-query>
${kpi('k-nul', 'q-nul')}
${kpi('k-nnul', 'q-nnul')}`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-nul',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'statut', op: 'isnull-strict' }] }],
      },
      {
        kind: 'kpi',
        id: 'k-nnul',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'statut', op: 'isnotnull-strict' }] }],
      },
    ],
  },

  {
    id: 'where-clauses-cumulees',
    mode: 'deterministic',
    origin:
      'Deux clauses dans un même `where` se cumulent en ET, jamais en OU : le compte doit tomber sous celui de chaque clause prise seule.',
    feed: { kind: 'fixture', datasets: JEU_TERR },
    markup: `${TERR}
  <dsfr-data-query id="q-et" source="s-terr" where="zone:eq:nord, categorie:eq:A"></dsfr-data-query>
  <dsfr-data-query id="q-zone" source="s-terr" where="zone:eq:nord"></dsfr-data-query>
${kpi('k-et', 'q-et')}
${kpi('k-zone', 'q-zone')}`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-et',
        agg: 'count',
        pipeline: [
          {
            op: 'filter',
            filters: [
              { field: 'zone', op: 'eq', value: 'nord' },
              { field: 'categorie', op: 'eq', value: 'A' },
            ],
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-zone',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'zone', op: 'eq', value: 'nord' }] }],
      },
    ],
  },

  {
    id: 'where-chaine-numerique',
    mode: 'deterministic',
    origin:
      'Égalité lâche entre un nombre et une chaîne numérique À ZÉRO DE TÊTE : `code:eq:42` doit retrouver la ligne dont le code s’écrit « 0042 ».',
    feed: { kind: 'fixture', datasets: JEU_TERR },
    markup: `${TERR}
  <dsfr-data-query id="q-num" source="s-terr" where="code:eq:42"></dsfr-data-query>
${kpi('k-num', 'q-num')}`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-num',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'code', op: 'eq', value: 42 }] }],
      },
    ],
  },

  {
    id: 'where-paire-mixte-nombre-et-texte',
    mode: 'deterministic',
    origin:
      'Une colonne qui MÊLE des nombres et des « NC » : le contrat documenté compare en nombre quand les deux côtés le sont, EN TEXTE sinon — « NC » se range donc après « 100 », et les deux bornes se partagent malgré tout les douze lignes sans en perdre.',
    feed: { kind: 'fixture', datasets: JEU_TERR },
    markup: `${TERR}
  <dsfr-data-query id="q-mixte-haut" source="s-terr" where="mesure:gte:100"></dsfr-data-query>
  <dsfr-data-query id="q-mixte-bas" source="s-terr" where="mesure:lt:100"></dsfr-data-query>
${kpi('k-mixte-haut', 'q-mixte-haut')}
${kpi('k-mixte-bas', 'q-mixte-bas')}`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-mixte-haut',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'mesure', op: 'gte', value: 100 }] }],
      },
      {
        kind: 'kpi',
        id: 'k-mixte-bas',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'mesure', op: 'lt', value: 100 }] }],
      },
    ],
  },

  {
    id: 'where-sur-agregat',
    mode: 'deterministic',
    origin:
      'Un filtre ne peut pas viser un alias d’agrégat dans la même requête : il faut une SECONDE requête en aval. C’est elle qu’on éprouve — regrouper, puis filtrer le résultat.',
    feed: { kind: 'fixture', datasets: JEU_TERR },
    markup: `${TERR}
  <dsfr-data-query id="q-grp" source="s-terr" group-by="zone"
    aggregate="population:sum:pop" order-by="pop:desc"></dsfr-data-query>
  <dsfr-data-query id="q-post" source="q-grp" where="pop:gt:5000000"
    order-by="pop:desc"></dsfr-data-query>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-post',
        key: 'zone',
        columns: ['pop'],
        pipeline: [
          { op: 'group-by', by: 'zone', columns: { pop: { agg: 'sum', field: 'population' } } },
          { op: 'order-by', column: 'pop', dir: 'desc' },
          { op: 'filter', filters: [{ field: 'pop', op: 'gt', value: 5000000 }] },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// aggregate, group-by, order-by, limit
// ---------------------------------------------------------------------------

const AGREGATS: Check[] = [
  {
    id: 'agregat-sum-count-avg',
    mode: 'deterministic',
    origin:
      'Les trois agrégations de base par zone, lues dans le cache de la requête : une somme, un compte de LIGNES, une moyenne.',
    feed: { kind: 'fixture', datasets: JEU_TERR },
    markup: `${TERR}
  <dsfr-data-query id="q-base" source="s-terr" group-by="zone"
    aggregate="population:sum:pop, code:count:nb, population:avg:moy"
    order-by="zone:asc"></dsfr-data-query>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-base',
        key: 'zone',
        columns: ['pop', 'nb', 'moy'],
        pipeline: [
          {
            op: 'group-by',
            by: 'zone',
            columns: {
              pop: { agg: 'sum', field: 'population' },
              nb: { agg: 'count' },
              moy: { agg: 'avg', field: 'population' },
            },
          },
          { op: 'order-by', column: 'zone', dir: 'asc' },
        ],
      },
    ],
  },

  {
    id: 'agregat-min-max',
    mode: 'deterministic',
    origin:
      'Le plus petit et le plus grand d’un groupe : deux agrégations qu’un tri mal placé confond avec la première et la dernière ligne.',
    feed: { kind: 'fixture', datasets: JEU_TERR },
    markup: `${TERR}
  <dsfr-data-query id="q-mm" source="s-terr" group-by="zone"
    aggregate="population:min:mini, population:max:maxi" order-by="zone:asc"></dsfr-data-query>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-mm',
        key: 'zone',
        columns: ['mini', 'maxi'],
        pipeline: [
          {
            op: 'group-by',
            by: 'zone',
            columns: {
              mini: { agg: 'min', field: 'population' },
              maxi: { agg: 'max', field: 'population' },
            },
          },
          { op: 'order-by', column: 'zone', dir: 'asc' },
        ],
      },
    ],
  },

  {
    id: 'agregat-distinct-exclut-les-vides',
    mode: 'deterministic',
    origin:
      'count(distinct) sur une colonne portant une chaîne VIDE et un ABSENT : ni l’une ni l’autre n’est une modalité.',
    feed: { kind: 'fixture', datasets: JEU_TERR },
    markup: `${TERR}
  <dsfr-data-query id="q-dist" source="s-terr" group-by="zone"
    aggregate="statut:distinct:modalites, code:count:nb" order-by="zone:asc"></dsfr-data-query>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-dist',
        key: 'zone',
        columns: ['modalites', 'nb'],
        pipeline: [
          {
            op: 'group-by',
            by: 'zone',
            columns: {
              modalites: { agg: 'distinct', field: 'statut' },
              nb: { agg: 'count' },
            },
          },
          { op: 'order-by', column: 'zone', dir: 'asc' },
        ],
      },
    ],
  },

  {
    id: 'agregat-global-sans-regroupement',
    mode: 'deterministic',
    origin:
      'Une agrégation SANS group-by replie tout le jeu en une seule ligne — la grammaire était acceptée sans rien faire (#278).',
    feed: { kind: 'fixture', datasets: JEU_TERR },
    markup: `${TERR}
  <dsfr-data-query id="q-glob" source="s-terr"
    aggregate="code:count:nb, population:sum:pop, statut:distinct:modalites"></dsfr-data-query>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-glob',
        key: 'nb',
        columns: ['pop', 'modalites'],
        pipeline: [
          {
            op: 'global',
            columns: {
              nb: { agg: 'count' },
              pop: { agg: 'sum', field: 'population' },
              modalites: { agg: 'distinct', field: 'statut' },
            },
          },
        ],
      },
    ],
  },

  {
    id: 'agregat-cumul-running-sum',
    mode: 'deterministic',
    origin:
      'Le cumul est calculé APRÈS le tri, sur les lignes de sortie (#738) : cumuler avant trier donnerait une courbe qui redescend.',
    feed: { kind: 'fixture', datasets: JEU_TERR },
    markup: `${TERR}
  <dsfr-data-query id="q-cumul" source="s-terr" group-by="mois"
    aggregate="flux:sum:total, total:running_sum:cumul" order-by="mois:asc"></dsfr-data-query>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-cumul',
        key: 'mois',
        columns: ['total', 'cumul'],
        pipeline: [
          { op: 'group-by', by: 'mois', columns: { total: { agg: 'sum', field: 'flux' } } },
          { op: 'order-by', column: 'mois', dir: 'asc' },
          { op: 'running', from: 'total', as: 'cumul', kind: 'running_sum' },
        ],
      },
    ],
  },

  {
    id: 'agregat-ecart-diff',
    mode: 'deterministic',
    origin:
      'L’écart à la ligne précédente (#775), inverse du cumul : la PREMIÈRE ligne vaut null, jamais 0 — un incrément inconnu n’est pas un incrément nul.',
    feed: { kind: 'fixture', datasets: JEU_TERR },
    markup: `${TERR}
  <dsfr-data-query id="q-ecart" source="s-terr" group-by="mois"
    aggregate="flux:sum:total, total:running_sum:cumul, cumul:diff:retour"
    order-by="mois:asc"></dsfr-data-query>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-ecart',
        key: 'mois',
        columns: ['total', 'cumul', 'retour'],
        pipeline: [
          { op: 'group-by', by: 'mois', columns: { total: { agg: 'sum', field: 'flux' } } },
          { op: 'order-by', column: 'mois', dir: 'asc' },
          { op: 'running', from: 'total', as: 'cumul', kind: 'running_sum' },
          { op: 'running', from: 'cumul', as: 'retour', kind: 'diff' },
        ],
      },
    ],
  },

  {
    id: 'regroupement-multi-champs',
    mode: 'deterministic',
    origin:
      'Un regroupement à DEUX champs : une ligne par combinaison, et pas une ligne par valeur de l’un ou de l’autre.',
    feed: { kind: 'fixture', datasets: JEU_TERR },
    markup: `${TERR}
  <dsfr-data-query id="q-multi" source="s-terr" group-by="zone, categorie"
    aggregate="population:sum:pop, code:count:nb"
    order-by="zone:asc, categorie:asc"></dsfr-data-query>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-multi',
        key: ['zone', 'categorie'],
        columns: ['pop', 'nb'],
        pipeline: [
          {
            op: 'group-by',
            by: ['zone', 'categorie'],
            columns: {
              pop: { agg: 'sum', field: 'population' },
              nb: { agg: 'count' },
            },
          },
          {
            op: 'order-by-keys',
            keys: [
              { column: 'zone', dir: 'asc' },
              { column: 'categorie', dir: 'asc' },
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'tri-multi-cles',
    mode: 'deterministic',
    origin:
      'Un tri à deux clés : la seconde ne départage que les ex æquo de la première. Deux territoires partagent exactement la même population — c’est là que l’ordre se voit.',
    feed: { kind: 'fixture', datasets: JEU_TERR },
    markup: `${TERR}
  <dsfr-data-query id="q-tri" source="s-terr"
    order-by="zone:asc, population:desc"></dsfr-data-query>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-tri',
        key: 'code',
        columns: ['population'],
        pipeline: [
          {
            op: 'order-by-keys',
            keys: [
              { column: 'zone', dir: 'asc' },
              { column: 'population', dir: 'desc' },
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'limite-apres-le-tri',
    mode: 'deterministic',
    origin:
      'La limite tranche APRÈS le tri : tronquer avant rendrait les quatre premières lignes reçues, pas les quatre plus peuplées.',
    feed: { kind: 'fixture', datasets: JEU_TERR },
    markup: `${TERR}
  <dsfr-data-query id="q-lim" source="s-terr" order-by="population:desc" limit="4"></dsfr-data-query>
  <dsfr-data-list id="l-lim" source="q-lim" columns="nom:Territoire, population:Population"></dsfr-data-list>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-lim',
        key: 'code',
        columns: ['population'],
        pipeline: [
          { op: 'order-by', column: 'population', dir: 'desc' },
          { op: 'limit', n: 4 },
        ],
      },
      {
        kind: 'list',
        id: 'l-lim',
        columns: [{ column: 'nom' }, { column: 'population', numeric: true }],
        pipeline: [
          { op: 'order-by', column: 'population', dir: 'desc' },
          { op: 'limit', n: 4 },
        ],
      },
    ],
  },

  {
    id: 'compte-de-lignes-contre-modalites',
    mode: 'deterministic',
    origin:
      'Un `count` compte des LIGNES, un `count(distinct)` des modalités : sur une colonne à deux modalités et douze lignes, les confondre se voit d’un coup d’œil.',
    feed: { kind: 'fixture', datasets: JEU_TERR },
    markup: `${TERR}
  <dsfr-data-query id="q-cmp" source="s-terr"
    aggregate="code:count:lignes, statut:distinct:modalites"></dsfr-data-query>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-cmp',
        key: 'lignes',
        columns: ['modalites'],
        pipeline: [
          {
            op: 'global',
            columns: { lignes: { agg: 'count' }, modalites: { agg: 'distinct', field: 'statut' } },
          },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// normalize — hors colonnes calculées
// ---------------------------------------------------------------------------

const NORMALISATION: Check[] = [
  {
    id: 'normalize-decimale-francaise',
    mode: 'deterministic',
    origin:
      'Un taux écrit « 12,5 » n’est un NOMBRE qu’après `numeric` : sans lui, `taux:gte:12` compare deux chaînes et range « 8,25 » au-dessus de « 12,5 ».',
    feed: { kind: 'fixture', datasets: JEU_TERR },
    markup: `${TERR}
  <dsfr-data-normalize id="n-taux" source="s-terr" numeric="taux"></dsfr-data-normalize>
  <dsfr-data-query id="q-taux" source="n-taux" where="taux:gte:12"
    order-by="taux:desc"></dsfr-data-query>
${kpi('k-taux', 'q-taux')}`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-taux',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'taux', op: 'gte', value: 12 }] }],
      },
      {
        kind: 'rows',
        id: 'q-taux',
        key: 'code',
        columns: ['taux'],
        pipeline: [
          { op: 'filter', filters: [{ field: 'taux', op: 'gte', value: 12 }] },
          { op: 'order-by', column: 'taux', dir: 'desc' },
        ],
      },
    ],
  },

  {
    id: 'normalize-numeric-vide-devient-absent',
    mode: 'deterministic',
    origin:
      'Sémantique stricte de `numeric` (#301) : une cellule vide devient ABSENTE, pas un zéro — sinon elle entre dans les sommes et dans les moyennes.',
    feed: { kind: 'fixture', datasets: { main: BRUTES } },
    markup: `${source('s-brut', BRUTES)}
  <dsfr-data-normalize id="n-num" source="s-brut" numeric="montant_txt"></dsfr-data-normalize>
  <dsfr-data-query id="q-num-nul" source="n-num" where="montant_txt:isnull"></dsfr-data-query>
  <dsfr-data-query id="q-num-somme" source="n-num"
    aggregate="montant_txt:sum:total, cle:count:lignes"></dsfr-data-query>
${kpi('k-num-nul', 'q-num-nul')}`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-num-nul',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'montant_txt', op: 'isnull' }] }],
      },
      {
        kind: 'rows',
        id: 'q-num-somme',
        key: 'lignes',
        columns: ['total'],
        pipeline: [
          {
            op: 'global',
            columns: {
              total: { agg: 'sum', field: 'montant_txt' },
              lignes: { agg: 'count' },
            },
          },
        ],
      },
    ],
  },

  {
    id: 'normalize-round',
    mode: 'deterministic',
    origin:
      '`round` arrondit à N décimales, sans jamais toucher aux valeurs non numériques ; l’oracle refait l’arrondi de son côté.',
    feed: { kind: 'fixture', datasets: { main: BRUTES } },
    markup: `${source('s-round', BRUTES)}
  <dsfr-data-normalize id="n-round" source="s-round" round="part:2"></dsfr-data-normalize>`,
    expects: [
      {
        kind: 'rows',
        id: 'n-round',
        key: 'cle',
        columns: ['part'],
        pipeline: [{ op: 'derive', expr: 'part = round(part, 2)' }],
      },
    ],
  },

  {
    id: 'normalize-rename',
    mode: 'deterministic',
    origin:
      'Un renommage de colonne doit déplacer la VALEUR avec le nom : une colonne renommée mais vide passerait inaperçue derrière un tableau.',
    feed: { kind: 'fixture', datasets: { main: BRUTES } },
    markup: `${source('s-ren', BRUTES)}
  <dsfr-data-normalize id="n-ren" source="s-ren"
    rename="lib_dep:departement"></dsfr-data-normalize>
  <dsfr-data-list id="l-ren" source="n-ren"
    columns="cle:Clé, departement:Département"></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-ren',
        columns: [{ column: 'cle' }, { column: 'departement' }],
        pipeline: [{ op: 'derive', expr: 'departement = lib_dep' }],
      },
    ],
  },

  {
    id: 'normalize-replace',
    mode: 'deterministic',
    origin:
      '`replace` récrit deux libellés d’absence (« N/A », « n.d. ») sur TOUS les champs : quatre lignes doivent basculer vers le libellé unique.',
    feed: { kind: 'fixture', datasets: { main: BRUTES } },
    markup: `${source('s-rep', BRUTES)}
  <dsfr-data-normalize id="n-rep" source="s-rep" replace="N/A:inconnu | n.d.:inconnu"></dsfr-data-normalize>
  <dsfr-data-query id="q-rep" source="n-rep" where="etat:eq:inconnu"></dsfr-data-query>
${kpi('k-rep', 'q-rep')}`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-rep',
        agg: 'count',
        pipeline: [
          {
            op: 'derive',
            expr: "etat = when etat = 'N/A' then 'inconnu' when etat = 'n.d.' then 'inconnu' else etat",
          },
          { op: 'filter', filters: [{ field: 'etat', op: 'eq', value: 'inconnu' }] },
        ],
      },
    ],
  },

  {
    id: 'normalize-replace-fields',
    mode: 'deterministic',
    origin:
      '`replace-fields` ne récrit QUE le champ visé : la même valeur portée par une autre colonne ne doit pas bouger (#730).',
    feed: { kind: 'fixture', datasets: { main: BRUTES } },
    markup: `${source('s-repf', BRUTES)}
  <dsfr-data-normalize id="n-repf" source="s-repf"
    replace-fields="annee:2024:2024-2025"></dsfr-data-normalize>
  <dsfr-data-list id="l-repf" source="n-repf"
    columns="cle:Clé, annee:Année"></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-repf',
        columns: [{ column: 'cle' }, { column: 'annee' }],
        pipeline: [
          { op: 'derive', expr: "annee = when annee = '2024' then '2024-2025' else annee" },
        ],
      },
    ],
  },

  {
    id: 'normalize-split',
    mode: 'deterministic',
    origin:
      'Un champ multivalué découpé en vrai TABLEAU : l’oracle n’a pas d’opération « découper », il énonce le même texte affiché par un autre chemin (un remplacement de séparateur).',
    feed: { kind: 'fixture', datasets: { main: BRUTES } },
    markup: `${source('s-split', BRUTES)}
  <dsfr-data-normalize id="n-split" source="s-split" split="axes:|"
    compute="axes_txt = join(axes, '+'); axes_n = len(axes)"></dsfr-data-normalize>
  <dsfr-data-list id="l-split" source="n-split"
    columns="cle:Clé, axes_txt:Axes, axes_n:Nombre"></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-split',
        columns: [{ column: 'cle' }, { column: 'axes_txt' }, { column: 'axes_n', numeric: true }],
        pipeline: [
          {
            op: 'derive',
            expr: "axes_txt = replace(axes, '|', '+'); axes_n = when axes = '' then 0 else len(axes) - len(replace(axes, '|', '')) + 1",
          },
        ],
      },
    ],
  },

  {
    id: 'normalize-fold',
    mode: 'deterministic',
    origin:
      'Le repli de colonnes Oui/Non parallèles en un champ multi-valeurs (#677) : l’oracle le réénonce en conditions, colonne par colonne.',
    feed: { kind: 'fixture', datasets: { main: BRUTES } },
    markup: `${source('s-fold', BRUTES)}
  <dsfr-data-normalize id="n-fold" source="s-fold" fold="acces_*:acces"
    compute="acces_txt = join(acces, '+')"></dsfr-data-normalize>
  <dsfr-data-list id="l-fold" source="n-fold"
    columns="cle:Clé, acces_txt:Accès"></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-fold',
        columns: [{ column: 'cle' }, { column: 'acces_txt' }],
        pipeline: [
          {
            op: 'derive',
            expr: "acces_txt = when acces_moteur = 'Oui' and acces_visuel = 'Oui' then 'moteur+visuel' when acces_moteur = 'Oui' then 'moteur' when acces_visuel = 'Oui' then 'visuel' else ''",
          },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// compute — la grammaire des colonnes calculées
// ---------------------------------------------------------------------------

const CALC = source('s-calc', CALCULS);
const JEU_CALC = { main: CALCULS };

/** L'arithmétique de la page, réécrite telle quelle pour l'oracle. */
const EXPR_ARITH =
  "quotient = a / b; ecart = a - b; produit = a * b; oppose = 0 - a; verdict = when is_null(quotient) then 'sans valeur' else 'valeur'";

const COMPUTE: Check[] = [
  {
    id: 'compute-arithmetique-absence-et-division-par-zero',
    mode: 'deterministic',
    origin:
      'Un opérande absent rend null (jamais un 0 plausible) et une division par zéro rend null (jamais l’infini) : deux lignes du jeu portent exactement ces deux cas.',
    feed: { kind: 'fixture', datasets: JEU_CALC },
    markup: `${CALC}
  <dsfr-data-normalize id="n-arith" source="s-calc"
    compute="quotient = a / b; ecart = a - b; produit = a * b; oppose = 0 - a; verdict = when is_null(quotient) then 'sans valeur' else 'valeur'"></dsfr-data-normalize>
  <dsfr-data-list id="l-arith" source="n-arith"
    columns="cle:Clé, verdict:Quotient"></dsfr-data-list>`,
    expects: [
      {
        kind: 'rows',
        id: 'n-arith',
        key: 'cle',
        columns: ['quotient', 'ecart', 'produit', 'oppose'],
        pipeline: [{ op: 'derive', expr: EXPR_ARITH }],
      },
      // Un quotient impossible rend NULL, et non l'infini. Le cache ne sait
      // pas les distinguer (l'infini ne survit pas à la sérialisation d'une
      // page) : c'est un libellé AFFICHÉ qui le dit, et lui seul peut tomber.
      {
        kind: 'list',
        id: 'l-arith',
        columns: [{ column: 'cle' }, { column: 'verdict' }],
        pipeline: [{ op: 'derive', expr: EXPR_ARITH }],
      },
    ],
  },

  {
    id: 'compute-plus-additionne-ou-concatene',
    mode: 'deterministic',
    origin:
      'Le `+` additionne quand les deux côtés sont numériques et CONCATÈNE dès que l’un ne l’est pas : le même signe, deux opérations.',
    feed: { kind: 'fixture', datasets: JEU_CALC },
    markup: `${CALC}
  <dsfr-data-normalize id="n-plus" source="s-calc"
    compute="somme = seuil + b; etiquette = cle + ' / ' + trim(texte)"></dsfr-data-normalize>`,
    expects: [
      {
        kind: 'rows',
        id: 'n-plus',
        key: 'etiquette',
        columns: ['somme'],
        pipeline: [
          { op: 'derive', expr: "somme = seuil + b; etiquette = cle + ' / ' + trim(texte)" },
        ],
      },
    ],
  },

  {
    id: 'compute-fonctions-de-date',
    mode: 'deterministic',
    origin: 'year, month et day sur une date ISO : trois nombres, et non trois morceaux de chaîne.',
    feed: { kind: 'fixture', datasets: JEU_CALC },
    markup: `${CALC}
  <dsfr-data-normalize id="n-date" source="s-calc"
    compute="an = year(date); mois = month(date); jour = day(date)"></dsfr-data-normalize>`,
    expects: [
      {
        kind: 'rows',
        id: 'n-date',
        key: 'cle',
        columns: ['an', 'mois', 'jour'],
        pipeline: [{ op: 'derive', expr: 'an = year(date); mois = month(date); jour = day(date)' }],
      },
    ],
  },

  {
    id: 'compute-fonctions-de-nombre',
    mode: 'deterministic',
    origin:
      'round, abs, floor et ceil : quatre fonctions qu’une valeur absente doit traverser en null, sans jamais retomber sur zéro.',
    feed: { kind: 'fixture', datasets: JEU_CALC },
    markup: `${CALC}
  <dsfr-data-normalize id="n-nb" source="s-calc"
    compute="r = round(a / b, 2); v = abs(0 - a); p = floor(a / b); h = ceil(a / b)"></dsfr-data-normalize>`,
    expects: [
      {
        kind: 'rows',
        id: 'n-nb',
        key: 'cle',
        columns: ['r', 'v', 'p', 'h'],
        pipeline: [
          {
            op: 'derive',
            expr: 'r = round(a / b, 2); v = abs(0 - a); p = floor(a / b); h = ceil(a / b)',
          },
        ],
      },
    ],
  },

  {
    id: 'compute-fonctions-de-texte',
    mode: 'deterministic',
    origin:
      'lower, upper, trim, len, concat et replace sur des libellés ACCENTUÉS : la longueur d’un libellé accentué ne doit pas changer selon le chemin.',
    feed: { kind: 'fixture', datasets: JEU_CALC },
    markup: `${CALC}
  <dsfr-data-normalize id="n-txt" source="s-calc"
    compute="net = trim(texte); bas = lower(net); haut = upper(net); taille = len(net); sans = replace(net, 'é', 'e'); ensemble = concat(cle, '-', bas)"></dsfr-data-normalize>
  <dsfr-data-list id="l-txt" source="n-txt"
    columns="cle:Clé, bas:Minuscules, haut:Majuscules, sans:Sans accent, ensemble:Ensemble, taille:Taille"></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-txt',
        columns: [
          { column: 'cle' },
          { column: 'bas' },
          { column: 'haut' },
          { column: 'sans' },
          { column: 'ensemble' },
          { column: 'taille', numeric: true },
        ],
        pipeline: [
          {
            op: 'derive',
            expr: "net = trim(texte); bas = lower(net); haut = upper(net); taille = len(net); sans = replace(net, 'é', 'e'); ensemble = concat(cle, '-', bas)",
          },
        ],
      },
    ],
  },

  {
    id: 'compute-absence-coalesce-is-null-is-empty',
    mode: 'deterministic',
    origin:
      'coalesce prend la première valeur NON ABSENTE, is_null dit l’absence et is_empty dit le vide — une chaîne vide n’est pas une absence, et un tableau vide non plus.',
    feed: { kind: 'fixture', datasets: JEU_CALC },
    markup: `${CALC}
  <dsfr-data-normalize id="n-abs" source="s-calc"
    compute="repli = coalesce(a, seuil); absent = when is_null(a) then 'absent' else 'present'; creux = when is_empty(vide) then 'vide' else 'rempli'; liste_creuse = when is_empty(liste) then 'vide' else 'remplie'"></dsfr-data-normalize>
  <dsfr-data-list id="l-abs" source="n-abs"
    columns="cle:Clé, absent:Absence, creux:Cellule, liste_creuse:Liste, repli:Repli"></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-abs',
        columns: [
          { column: 'cle' },
          { column: 'absent' },
          { column: 'creux' },
          { column: 'liste_creuse' },
          { column: 'repli', numeric: true },
        ],
        pipeline: [
          {
            op: 'derive',
            expr: "repli = coalesce(a, seuil); absent = when is_null(a) then 'absent' else 'present'; creux = when is_empty(vide) then 'vide' else 'rempli'; liste_creuse = when is_empty(liste) then 'vide' else 'remplie'",
          },
        ],
      },
    ],
  },

  {
    id: 'compute-tableaux-join-et-contains',
    mode: 'deterministic',
    origin:
      'join et contains sur un vrai champ TABLEAU : un tableau vide donne une chaîne vide, et ne contient rien.',
    feed: { kind: 'fixture', datasets: JEU_CALC },
    markup: `${CALC}
  <dsfr-data-normalize id="n-tab" source="s-calc"
    compute="texte_liste = join(liste, '+'); a_eau = when contains(liste, 'eau') then 'oui' else 'non'"></dsfr-data-normalize>
  <dsfr-data-list id="l-tab" source="n-tab"
    columns="cle:Clé, texte_liste:Liste, a_eau:Eau"></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-tab',
        columns: [{ column: 'cle' }, { column: 'texte_liste' }, { column: 'a_eau' }],
        pipeline: [
          {
            op: 'derive',
            expr: "texte_liste = join(liste, '+'); a_eau = when contains(liste, 'eau') then 'oui' else 'non'",
          },
        ],
      },
    ],
  },

  {
    id: 'compute-when-then-else',
    mode: 'deterministic',
    origin:
      'Une cascade de conditions : la PREMIÈRE branche vraie gagne, et une valeur absente ne matche aucune comparaison d’ordre — elle tombe donc dans le `else`.',
    feed: { kind: 'fixture', datasets: JEU_CALC },
    markup: `${CALC}
  <dsfr-data-normalize id="n-when" source="s-calc"
    compute="tranche = when a > 50 then 'haut' when a > 5 then 'moyen' else 'bas'"></dsfr-data-normalize>
  <dsfr-data-list id="l-when" source="n-when"
    columns="cle:Clé, tranche:Tranche"></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-when',
        columns: [{ column: 'cle' }, { column: 'tranche' }],
        pipeline: [
          {
            op: 'derive',
            expr: "tranche = when a > 50 then 'haut' when a > 5 then 'moyen' else 'bas'",
          },
        ],
      },
    ],
  },

  {
    id: 'compute-cellule-vide-nest-pas-zero',
    mode: 'deterministic',
    origin:
      '#846 — dans une colonne calculée, une cellule VIDE n’égale jamais un nombre : `vide = 0` ne doit classer aucune ligne, et surtout pas les trois lignes à cellule vide.',
    feed: { kind: 'fixture', datasets: JEU_CALC },
    markup: `${CALC}
  <dsfr-data-normalize id="n-vide" source="s-calc"
    compute="verdict = when vide = 0 then 'zero' else 'autre'"></dsfr-data-normalize>
  <dsfr-data-list id="l-vide" source="n-vide"
    columns="cle:Clé, verdict:Verdict"></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-vide',
        columns: [{ column: 'cle' }, { column: 'verdict' }],
        pipeline: [{ op: 'derive', expr: "verdict = when vide = 0 then 'zero' else 'autre'" }],
      },
    ],
  },

  {
    id: 'compute-and-or-not',
    mode: 'deterministic',
    origin:
      'Les trois connecteurs logiques, sur les mêmes lignes : `and` resserre, `or` élargit, `not` renverse — et une valeur absente ne satisfait aucune comparaison.',
    feed: { kind: 'fixture', datasets: JEU_CALC },
    markup: `${CALC}
  <dsfr-data-normalize id="n-log" source="s-calc"
    compute="et = when a > 5 and b > 3 then 'oui' else 'non'; ou = when a > 50 or b > 5 then 'oui' else 'non'; non = when not (a > 5) then 'oui' else 'non'"></dsfr-data-normalize>
  <dsfr-data-list id="l-log" source="n-log"
    columns="cle:Clé, et:Et, ou:Ou, non:Non"></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-log',
        columns: [{ column: 'cle' }, { column: 'et' }, { column: 'ou' }, { column: 'non' }],
        pipeline: [
          {
            op: 'derive',
            expr: "et = when a > 5 and b > 3 then 'oui' else 'non'; ou = when a > 50 or b > 5 then 'oui' else 'non'; non = when not (a > 5) then 'oui' else 'non'",
          },
        ],
      },
    ],
  },

  {
    id: 'compute-en-chaine',
    mode: 'deterministic',
    origin:
      'Une assignation suivante relit la colonne calculée avant elle, dans l’ordre déclaré : c’est ce qui permet d’écrire un calcul en plusieurs pas lisibles.',
    feed: { kind: 'fixture', datasets: JEU_CALC },
    markup: `${CALC}
  <dsfr-data-normalize id="n-chaine" source="s-calc"
    compute="pas1 = a * 2; pas2 = pas1 + b; pas3 = round(pas2 / 3, 2)"></dsfr-data-normalize>`,
    expects: [
      {
        kind: 'rows',
        id: 'n-chaine',
        key: 'cle',
        columns: ['pas1', 'pas2', 'pas3'],
        pipeline: [
          { op: 'derive', expr: 'pas1 = a * 2; pas2 = pas1 + b; pas3 = round(pas2 / 3, 2)' },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// pivot
// ---------------------------------------------------------------------------

const SRC_LONG = source('s-long', LONG);
const JEU_LONG = { main: LONG };

const PIVOT: Check[] = [
  {
    id: 'pivot-somme-et-cellule-sans-observation',
    mode: 'deterministic',
    origin:
      'Le pivot de base : une colonne par année, la somme dans chaque cellule, et une cellule SANS observation qui reste vide (#301) — jamais un zéro silencieux.',
    feed: { kind: 'fixture', datasets: JEU_LONG },
    markup: `${SRC_LONG}
  <dsfr-data-pivot id="p-somme" source="s-long" row="commune" column="annee"
    value="montant" aggregate="sum" column-format="a_{value}"></dsfr-data-pivot>`,
    expects: [
      {
        kind: 'rows',
        id: 'p-somme',
        key: 'commune',
        columns: ['a_2022', 'a_2023', 'a_2024'],
        pipeline: [
          {
            op: 'pivot',
            row: 'commune',
            column: 'annee',
            value: 'montant',
            aggregate: 'sum',
            columnFormat: 'a_{value}',
          },
        ],
      },
    ],
  },

  {
    id: 'pivot-count-et-avg',
    mode: 'deterministic',
    origin:
      'Deux réductions de cellule sur les mêmes lignes : un compte d’observations et leur moyenne — la cellule à DEUX observations les sépare.',
    feed: { kind: 'fixture', datasets: JEU_LONG },
    markup: `${SRC_LONG}
  <dsfr-data-pivot id="p-count" source="s-long" row="commune" column="annee"
    value="montant" aggregate="count" column-format="a_{value}"></dsfr-data-pivot>
  <dsfr-data-pivot id="p-avg" source="s-long" row="commune" column="annee"
    value="montant" aggregate="avg" column-format="a_{value}"></dsfr-data-pivot>`,
    expects: [
      {
        kind: 'rows',
        id: 'p-count',
        key: 'commune',
        columns: ['a_2022', 'a_2023', 'a_2024'],
        pipeline: [
          {
            op: 'pivot',
            row: 'commune',
            column: 'annee',
            value: 'montant',
            aggregate: 'count',
            columnFormat: 'a_{value}',
          },
        ],
      },
      {
        kind: 'rows',
        id: 'p-avg',
        key: 'commune',
        columns: ['a_2022', 'a_2023', 'a_2024'],
        pipeline: [
          {
            op: 'pivot',
            row: 'commune',
            column: 'annee',
            value: 'montant',
            aggregate: 'avg',
            columnFormat: 'a_{value}',
          },
        ],
      },
    ],
  },

  {
    id: 'pivot-min-max-sur-dates-iso',
    mode: 'deterministic',
    origin:
      '#667 — min et max sur une colonne de DATES ISO : l’ordre y est lexicographique, jamais numérique (une date lue comme un nombre vaudrait son millésime).',
    feed: { kind: 'fixture', datasets: JEU_LONG },
    markup: `${SRC_LONG}
  <dsfr-data-pivot id="p-min" source="s-long" row="commune" column="annee"
    value="ouverture" aggregate="min" column-format="a_{value}"></dsfr-data-pivot>
  <dsfr-data-pivot id="p-max" source="s-long" row="commune" column="annee"
    value="ouverture" aggregate="max" column-format="a_{value}"></dsfr-data-pivot>`,
    expects: [
      {
        kind: 'rows',
        id: 'p-min',
        key: ['commune', 'a_2022'],
        columns: [],
        pipeline: [
          {
            op: 'pivot',
            row: 'commune',
            column: 'annee',
            value: 'ouverture',
            aggregate: 'min',
            columnFormat: 'a_{value}',
          },
        ],
      },
      {
        kind: 'rows',
        id: 'p-max',
        key: ['commune', 'a_2022'],
        columns: [],
        pipeline: [
          {
            op: 'pivot',
            row: 'commune',
            column: 'annee',
            value: 'ouverture',
            aggregate: 'max',
            columnFormat: 'a_{value}',
          },
        ],
      },
    ],
  },

  {
    id: 'pivot-first-et-last',
    mode: 'deterministic',
    origin:
      'first et last ne réduisent rien : ils prennent la première et la dernière observation de la cellule, dans l’ordre reçu — la cellule à deux observations les sépare.',
    feed: { kind: 'fixture', datasets: JEU_LONG },
    markup: `${SRC_LONG}
  <dsfr-data-pivot id="p-first" source="s-long" row="commune" column="annee"
    value="montant" aggregate="first" column-format="a_{value}"></dsfr-data-pivot>
  <dsfr-data-pivot id="p-last" source="s-long" row="commune" column="annee"
    value="montant" aggregate="last" column-format="a_{value}"></dsfr-data-pivot>`,
    expects: [
      {
        kind: 'rows',
        id: 'p-first',
        key: 'commune',
        columns: ['a_2022', 'a_2023', 'a_2024'],
        pipeline: [
          {
            op: 'pivot',
            row: 'commune',
            column: 'annee',
            value: 'montant',
            aggregate: 'first',
            columnFormat: 'a_{value}',
          },
        ],
      },
      {
        kind: 'rows',
        id: 'p-last',
        key: 'commune',
        columns: ['a_2022', 'a_2023', 'a_2024'],
        pipeline: [
          {
            op: 'pivot',
            row: 'commune',
            column: 'annee',
            value: 'montant',
            aggregate: 'last',
            columnFormat: 'a_{value}',
          },
        ],
      },
    ],
  },

  {
    id: 'pivot-ordre-des-colonnes',
    mode: 'deterministic',
    origin:
      '`column-order="desc"` range les colonnes générées, et c’est le tableau qui le montre : les colonnes y sortent dans l’ordre demandé, cellules vides comprises.',
    feed: { kind: 'fixture', datasets: JEU_LONG },
    markup: `${SRC_LONG}
  <dsfr-data-pivot id="p-ordre" source="s-long" row="commune" column="annee"
    value="montant" aggregate="sum" column-order="desc"
    column-format="a_{value}"></dsfr-data-pivot>
  <dsfr-data-list id="l-ordre" source="p-ordre"></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-ordre',
        columns: [
          { column: 'commune' },
          { column: 'a_2024', numeric: true },
          { column: 'a_2023', numeric: true },
          { column: 'a_2022', numeric: true },
        ],
        pipeline: [
          {
            op: 'pivot',
            row: 'commune',
            column: 'annee',
            value: 'montant',
            aggregate: 'sum',
            columnOrder: 'desc',
            columnFormat: 'a_{value}',
          },
        ],
      },
    ],
  },

  {
    id: 'pivot-identite-composite',
    mode: 'deterministic',
    origin:
      'Une identité de ligne à DEUX champs : une ligne par combinaison, et la ligne dont le champ pivoté est vide n’en fait aucune.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `${TERR}
  <dsfr-data-pivot id="p-comp" source="s-terr" row="zone, categorie" column="mois"
    value="flux" aggregate="sum" column-format="m_{value}"></dsfr-data-pivot>`,
    expects: [
      {
        kind: 'rows',
        id: 'p-comp',
        key: ['zone', 'categorie'],
        columns: ['m_2026-01', 'm_2026-02', 'm_2026-03'],
        pipeline: [
          {
            op: 'pivot',
            row: ['zone', 'categorie'],
            column: 'mois',
            value: 'flux',
            aggregate: 'sum',
            columnFormat: 'm_{value}',
          },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// unpivot
// ---------------------------------------------------------------------------

const SRC_LARGE = source('s-large', LARGE);
const JEU_LARGE = { main: LARGE };
const COLONNES_LARGE = [
  { column: 'c2026_01', as: '2026-01' },
  { column: 'c2026_02', as: '2026-02' },
  { column: 'c2026_03', as: '2026-03' },
];

const UNPIVOT: Check[] = [
  {
    id: 'unpivot-colonnes-nommees',
    mode: 'deterministic',
    origin:
      'Le dépliage d’un tableau large : une ligne par cellule, la clé dépliée prenant le LIBELLÉ donné en alias (#668) plutôt que le nom technique de la colonne.',
    feed: { kind: 'fixture', datasets: JEU_LARGE },
    markup: `${SRC_LARGE}
  <dsfr-data-unpivot id="u-nom" source="s-large" id-cols="indicateur, unite"
    value-cols="c2026_01:2026-01, c2026_02:2026-02, c2026_03:2026-03"
    var-name="mois" value-name="valeur"></dsfr-data-unpivot>
${kpi('k-unpivot', 'u-nom')}`,
    expects: [
      {
        kind: 'rows',
        id: 'u-nom',
        key: ['indicateur', 'mois'],
        columns: ['valeur'],
        pipeline: [
          {
            op: 'unpivot',
            idCols: ['indicateur', 'unite'],
            valueCols: COLONNES_LARGE,
            varName: 'mois',
            valueName: 'valeur',
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-unpivot',
        agg: 'count',
        pipeline: [
          {
            op: 'unpivot',
            idCols: ['indicateur', 'unite'],
            valueCols: COLONNES_LARGE,
            varName: 'mois',
            valueName: 'valeur',
          },
        ],
      },
    ],
  },

  {
    id: 'unpivot-drop-empty',
    mode: 'deterministic',
    origin:
      '`drop-empty` n’émet aucune ligne pour une cellule vide : une ligne de moins que le dépliage complet, et pas une ligne à valeur nulle.',
    feed: { kind: 'fixture', datasets: JEU_LARGE },
    markup: `${SRC_LARGE}
  <dsfr-data-unpivot id="u-drop" source="s-large" id-cols="indicateur, unite"
    value-cols="c2026_01:2026-01, c2026_02:2026-02, c2026_03:2026-03"
    var-name="mois" value-name="valeur" drop-empty></dsfr-data-unpivot>
${kpi('k-drop', 'u-drop')}`,
    expects: [
      {
        kind: 'rows',
        id: 'u-drop',
        key: ['indicateur', 'mois'],
        columns: ['valeur'],
        pipeline: [
          {
            op: 'unpivot',
            idCols: ['indicateur', 'unite'],
            valueCols: COLONNES_LARGE,
            varName: 'mois',
            valueName: 'valeur',
            dropEmpty: true,
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-drop',
        agg: 'count',
        pipeline: [
          {
            op: 'unpivot',
            idCols: ['indicateur', 'unite'],
            valueCols: COLONNES_LARGE,
            varName: 'mois',
            valueName: 'valeur',
            dropEmpty: true,
          },
        ],
      },
    ],
  },

  {
    id: 'unpivot-puis-regroupement',
    mode: 'deterministic',
    origin:
      'Le dépliage sert à rendre un tableau large consommable par le pipeline : déplié puis regroupé par mois, le total mensuel doit tomber juste.',
    feed: { kind: 'fixture', datasets: JEU_LARGE },
    markup: `${SRC_LARGE}
  <dsfr-data-unpivot id="u-somme" source="s-large" id-cols="indicateur, unite"
    value-cols="c2026_01:2026-01, c2026_02:2026-02, c2026_03:2026-03"
    var-name="mois" value-name="valeur"></dsfr-data-unpivot>
  <dsfr-data-normalize id="n-somme" source="u-somme" numeric="valeur"></dsfr-data-normalize>
  <dsfr-data-query id="q-somme" source="n-somme" group-by="mois"
    aggregate="valeur:sum:total" order-by="mois:asc"></dsfr-data-query>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-somme',
        key: 'mois',
        columns: ['total'],
        pipeline: [
          {
            op: 'unpivot',
            idCols: ['indicateur', 'unite'],
            valueCols: COLONNES_LARGE,
            varName: 'mois',
            valueName: 'valeur',
          },
          { op: 'group-by', by: 'mois', columns: { total: { agg: 'sum', field: 'valeur' } } },
          { op: 'order-by', column: 'mois', dir: 'asc' },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// join
// ---------------------------------------------------------------------------

const SRC_JOIN = `${source('s-g', GAUCHE)}
${source('s-d', DROITE)}`;
const JEU_JOIN = { main: GAUCHE, droite: DROITE };

const JOINTURE: Check[] = [
  {
    id: 'jointure-inner',
    mode: 'deterministic',
    origin:
      'Jointure interne : les seules paires. Deux lignes gauche sans clé (chaîne vide, absente) et une clé sans correspondance ne doivent rien produire — une clé vide n’apparie rien, pas même une autre clé vide.',
    feed: { kind: 'fixture', datasets: JEU_JOIN },
    markup: `${SRC_JOIN}
  <dsfr-data-join id="j-inner" left="s-g" right="s-d" on="code" type="inner"></dsfr-data-join>
${kpi('k-inner', 'j-inner')}`,
    expects: [
      {
        kind: 'rows',
        id: 'j-inner',
        key: ['code', 'region'],
        columns: ['valeur', 'poids'],
        pipeline: [{ op: 'join', right: 'droite', on: 'code', type: 'inner' }],
      },
      {
        kind: 'kpi',
        id: 'k-inner',
        agg: 'count',
        pipeline: [{ op: 'join', right: 'droite', on: 'code', type: 'inner' }],
      },
    ],
  },

  {
    id: 'jointure-left',
    mode: 'deterministic',
    origin:
      '#660 — en `left`, autant de lignes sortent qu’il en entre : c’est justement ce qui fait passer une jointure à 50 % pour saine. Les lignes non appariées gardent leurs colonnes de gauche et rien de plus.',
    feed: { kind: 'fixture', datasets: JEU_JOIN },
    markup: `${SRC_JOIN}
  <dsfr-data-join id="j-left" left="s-g" right="s-d" on="code" type="left"></dsfr-data-join>
${kpi('k-left', 'j-left')}`,
    expects: [
      {
        kind: 'rows',
        id: 'j-left',
        key: ['libelle', 'region'],
        columns: ['valeur', 'poids'],
        pipeline: [{ op: 'join', right: 'droite', on: 'code', type: 'left' }],
      },
      {
        kind: 'kpi',
        id: 'k-left',
        agg: 'count',
        pipeline: [{ op: 'join', right: 'droite', on: 'code', type: 'left' }],
      },
    ],
  },

  {
    id: 'jointure-right',
    mode: 'deterministic',
    origin:
      'En `right`, ce sont les lignes de DROITE qui sortent toutes, dans leur ordre — y compris celle dont la clé est absente à gauche et celle dont la clé est vide.',
    feed: { kind: 'fixture', datasets: JEU_JOIN },
    markup: `${SRC_JOIN}
  <dsfr-data-join id="j-right" left="s-g" right="s-d" on="code" type="right"></dsfr-data-join>
${kpi('k-right', 'j-right')}`,
    expects: [
      {
        kind: 'rows',
        id: 'j-right',
        key: ['region', 'libelle'],
        columns: ['valeur', 'poids'],
        pipeline: [{ op: 'join', right: 'droite', on: 'code', type: 'right' }],
      },
      {
        kind: 'kpi',
        id: 'k-right',
        agg: 'count',
        pipeline: [{ op: 'join', right: 'droite', on: 'code', type: 'right' }],
      },
    ],
  },

  {
    id: 'jointure-full',
    mode: 'deterministic',
    origin:
      'En `full`, les lignes gauche puis les lignes droite restées seules : le total doit valoir les appariées plus les orphelines des deux bords, sans doublon.',
    feed: { kind: 'fixture', datasets: JEU_JOIN },
    markup: `${SRC_JOIN}
  <dsfr-data-join id="j-full" left="s-g" right="s-d" on="code" type="full"></dsfr-data-join>
${kpi('k-full', 'j-full')}`,
    expects: [
      {
        kind: 'rows',
        id: 'j-full',
        key: ['libelle', 'region'],
        columns: ['valeur', 'poids'],
        pipeline: [{ op: 'join', right: 'droite', on: 'code', type: 'full' }],
      },
      {
        kind: 'kpi',
        id: 'k-full',
        agg: 'count',
        pipeline: [{ op: 'join', right: 'droite', on: 'code', type: 'full' }],
      },
    ],
  },

  {
    id: 'jointure-cles-composites',
    mode: 'deterministic',
    origin:
      'Une clé à DEUX champs : l’année seule ou le code seul appariraient quatre lignes là où la paire n’en apparie que deux.',
    feed: { kind: 'fixture', datasets: { main: COMPOSITE_GAUCHE, droite: COMPOSITE_DROITE } },
    markup: `${source('s-cg', COMPOSITE_GAUCHE)}
${source('s-cd', COMPOSITE_DROITE)}
  <dsfr-data-join id="j-comp" left="s-cg" right="s-cd" on="annee, code" type="inner"></dsfr-data-join>
${kpi('k-comp', 'j-comp')}`,
    expects: [
      {
        kind: 'rows',
        id: 'j-comp',
        key: ['annee', 'code'],
        columns: ['valeur', 'budget'],
        pipeline: [{ op: 'join', right: 'droite', on: 'annee, code', type: 'inner' }],
      },
      {
        kind: 'kpi',
        id: 'k-comp',
        agg: 'count',
        pipeline: [{ op: 'join', right: 'droite', on: 'annee, code', type: 'inner' }],
      },
    ],
  },

  {
    id: 'jointure-ecart-de-graphie-792',
    mode: 'deterministic',
    origin:
      '#792 — les clés sont comparées EN CHAÎNE, sans trim ni complétion : « 1 » et « 01 » ne s’apparient pas. Deux lignes sur quatre seulement passent, et c’est un total plausible et faux si personne ne le compte.',
    feed: { kind: 'fixture', datasets: { main: GAUCHE_GRAPHIE, droite: DROITE } },
    markup: `${source('s-gg', GAUCHE_GRAPHIE)}
${source('s-dg', DROITE)}
  <dsfr-data-join id="j-graphie" left="s-gg" right="s-dg" on="code" type="inner"></dsfr-data-join>
${kpi('k-graphie', 'j-graphie')}`,
    expects: [
      {
        kind: 'rows',
        id: 'j-graphie',
        key: ['code', 'region'],
        columns: ['valeur', 'poids'],
        pipeline: [{ op: 'join', right: 'droite', on: 'code', type: 'inner' }],
      },
      {
        kind: 'kpi',
        id: 'k-graphie',
        agg: 'count',
        pipeline: [{ op: 'join', right: 'droite', on: 'code', type: 'inner' }],
      },
    ],
  },

  {
    id: 'jointure-puis-regroupement',
    mode: 'deterministic',
    origin:
      'Une jointure sert à enrichir avant de regrouper : la somme par région n’est juste que si l’appariement l’est.',
    feed: { kind: 'fixture', datasets: JEU_JOIN },
    markup: `${SRC_JOIN}
  <dsfr-data-join id="j-grp" left="s-g" right="s-d" on="code" type="inner"></dsfr-data-join>
  <dsfr-data-query id="q-grp-join" source="j-grp" group-by="region"
    aggregate="valeur:sum:total, code:count:nb" order-by="region:asc"></dsfr-data-query>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-grp-join',
        key: 'region',
        columns: ['total', 'nb'],
        pipeline: [
          { op: 'join', right: 'droite', on: 'code', type: 'inner' },
          {
            op: 'group-by',
            by: 'region',
            columns: { total: { agg: 'sum', field: 'valeur' }, nb: { agg: 'count' } },
          },
          { op: 'order-by', column: 'region', dir: 'asc' },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// concat
// ---------------------------------------------------------------------------

const SRC_PILE = `${source('s-p24', PILE_2024)}
${source('s-p25', PILE_2025)}`;
const JEU_PILE = { main: PILE_2024, p25: PILE_2025 };

const EMPILEMENT: Check[] = [
  {
    id: 'concat-schemas-identiques',
    mode: 'deterministic',
    origin:
      '#777 — deux séries de même schéma s’empilent dans l’ordre déclaré, et `origin-field` garde la trace de la provenance de chaque ligne.',
    feed: { kind: 'fixture', datasets: JEU_PILE },
    markup: `${SRC_PILE}
  <dsfr-data-concat id="c-pile" sources="s-p24, s-p25"
    origin-field="millesime" origin-labels="s-p24:2024 | s-p25:2025"></dsfr-data-concat>
${kpi('k-pile', 'c-pile')}`,
    expects: [
      {
        kind: 'rows',
        id: 'c-pile',
        key: ['millesime', 'mois'],
        columns: ['montant'],
        pipeline: [
          {
            op: 'concat',
            sources: ['main', 'p25'],
            originField: 'millesime',
            originLabels: { main: '2024', p25: '2025' },
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-pile',
        agg: 'count',
        pipeline: [{ op: 'concat', sources: ['main', 'p25'] }],
      },
    ],
  },

  {
    id: 'concat-puis-regroupement',
    mode: 'deterministic',
    origin:
      'Un empilement n’a d’intérêt que consommé : regroupé par mois, le total doit additionner les deux millésimes — et le mois que le second n’a pas ne doit pas disparaître.',
    feed: { kind: 'fixture', datasets: JEU_PILE },
    markup: `${SRC_PILE}
  <dsfr-data-concat id="c-grp" sources="s-p24, s-p25"></dsfr-data-concat>
  <dsfr-data-query id="q-pile" source="c-grp" group-by="mois"
    aggregate="montant:sum:total, mois:count:nb" order-by="mois:asc"></dsfr-data-query>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-pile',
        key: 'mois',
        columns: ['total', 'nb'],
        pipeline: [
          { op: 'concat', sources: ['main', 'p25'] },
          {
            op: 'group-by',
            by: 'mois',
            columns: { total: { agg: 'sum', field: 'montant' }, nb: { agg: 'count' } },
          },
          { op: 'order-by', column: 'mois', dir: 'asc' },
        ],
      },
    ],
  },

  {
    id: 'concat-puis-pivot',
    mode: 'deterministic',
    origin:
      'Empiler puis pivoter : c’est le chemin court que #777 remplace (quatre pivots, trois jointures et un dépliage). Le tableau croisé final doit porter une colonne par millésime.',
    feed: { kind: 'fixture', datasets: JEU_PILE },
    markup: `${SRC_PILE}
  <dsfr-data-concat id="c-piv" sources="s-p24, s-p25" origin-field="millesime"
    origin-labels="s-p24:2024 | s-p25:2025"></dsfr-data-concat>
  <dsfr-data-pivot id="p-piv" source="c-piv" row="mois" column="millesime"
    value="montant" aggregate="sum" column-format="an_{value}"></dsfr-data-pivot>`,
    expects: [
      {
        kind: 'rows',
        id: 'p-piv',
        key: 'mois',
        columns: ['an_2024', 'an_2025'],
        pipeline: [
          {
            op: 'concat',
            sources: ['main', 'p25'],
            originField: 'millesime',
            originLabels: { main: '2024', p25: '2025' },
          },
          {
            op: 'pivot',
            row: 'mois',
            column: 'millesime',
            value: 'montant',
            aggregate: 'sum',
            columnFormat: 'an_{value}',
          },
        ],
      },
    ],
  },
];

export const TRANSFORMATIONS: Manifest = {
  domain: 'transformations',
  checks: [
    ...WHERE,
    ...AGREGATS,
    ...NORMALISATION,
    ...COMPUTE,
    ...PIVOT,
    ...UNPIVOT,
    ...JOINTURE,
    ...EMPILEMENT,
  ],
};
