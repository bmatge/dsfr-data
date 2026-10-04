/**
 * LE CANARI (#882) — un jeu, un contrôle par piège que le banc d'essai a payé.
 *
 * Le registre `public/data/retours.json` d'open-data-viz porte une famille de
 * pièges qui se ressemblent tous : une valeur qui A L'AIR d'une autre. `null`
 * et `0`, `'01'` et `1`, un libellé en NFC et en NFD, une clé qui apparaît deux
 * fois à droite, un champ multivalué, un jeu de 1 001 lignes derrière un
 * plafond de 1 000. Le dispositif en couvrait déjà une partie, dispersée dans
 * cinq domaines ; il manquait un jeu unique, petit, lisible, qu'on ouvre pour
 * comprendre en une minute ce que chaque ligne piège — et qui soit la
 * première chose qu'un contributeur rejoue.
 *
 * Chaque contrôle cite le registre (`constats`) et, quand un contrôle
 * existant couvre déjà le piège, le nomme dans `origin` plutôt que de le
 * dupliquer (règle du banc : fusionner avant d'ajouter). Les invariants du
 * lot 4 sont posés là où ils portent ; sur la jointure à doublon, `count` et
 * `sum-preserved` sont violés PAR LES DONNÉES et rendus en attente — c'est le
 * point. La troisième voix (Python) couvre toutes les attentes du canari :
 * aucun `derive`, le quotient passe par l'étape `ratio`.
 *
 * Les lignes : `jeux/canari.json` (40, chacune décrite dans `jeux/README.md`),
 * `jeux/canari-ref.json` (la droite, avec deux fois le code `02`),
 * `jeux/canari-volume.json` (1 001 lignes engendrées, graine 42),
 * `jeux/canari-facettes.json` (dix lignes : valeurs à virgule, cellules
 * tableau à élément répété).
 */
import type { Check, Manifest, Step } from '../../tools/oracle/manifest.js';
import {
  CANARI as LIGNES,
  CANARI_FACETTES,
  CANARI_REF,
  CANARI_VOLUME,
  DATASET_CANARI,
  DATASET_FACETTES,
  DATASET_VOLUME,
  HOTE_CANARI,
  urlCanari,
} from './fixtures-canari.js';
import { ABSENCES, urlAffichage } from './fixtures-affichages.js';
import { EX_AEQUO, RESSOURCE_TABULAR_EX_AEQUO } from './fixtures.js';

/** DSFR Chart depuis node_modules : la vraie bibliothèque, jamais le CDN. */
const TETE_CHART = `
  <link rel="stylesheet" href="/node_modules/@gouvfr/dsfr-chart/dist/DSFRChart/DSFRChart.css">
  <script type="module" src="/node_modules/@gouvfr/dsfr-chart/dist/DSFRChart/DSFRChart.js"></script>`;

const JEUX = { main: LIGNES, ref: CANARI_REF };

/** Le canari en tableau nu (API générique) : ce que filtre et regroupe le CLIENT. */
const SRC = `
  <dsfr-data-source id="s-canari" url="${urlCanari('canari')}"></dsfr-data-source>`;
const SRC_REF = `
  <dsfr-data-source id="s-ref" url="${urlCanari('ref')}"></dsfr-data-source>`;

/** Le canari en source Opendatasoft : ce qu'un contexte ou un regroupement SERVEUR touche. */
function sourceOds(id: string, dataset: string, attrs = ''): string {
  return `
  <dsfr-data-source id="${id}" api-type="opendatasoft" base-url="${HOTE_CANARI}"
    dataset-id="${dataset}" ${attrs}></dsfr-data-source>`;
}

function kpi(id: string, source: string, valeur: string, attrs = ''): string {
  return `
  <dsfr-data-kpi id="${id}" source="${source}" value="${valeur}" format="nombre" ${attrs} label="${id}"></dsfr-data-kpi>`;
}

const JOINTURE_GAUCHE: Step = { op: 'join', right: 'ref', on: 'code', type: 'left' };

/** Les dix lignes des pièges de facette, en tableau nu. */
const SRC_FACETTES = `
  <dsfr-data-source id="s-fac" url="${urlCanari('facettes')}"></dsfr-data-source>`;

/**
 * Cent cinquante fois le jeu de volume, empilées : 150 150 lignes sans qu'aucun
 * fichier n'en porte plus de 1 001. C'est au-delà du plafond d'arguments d'un
 * appel (entre 120 000 et 125 000 sous V8) que BUG-038 a payé.
 */
const COPIES_VOLUME = 150;
const IDS_VOLUME = Array.from(
  { length: COPIES_VOLUME },
  (_, i) => `s-v${String(i + 1).padStart(3, '0')}`
);
const SRC_VOLUME_EMPILE = `${IDS_VOLUME.map(
  (id) => `
  <dsfr-data-source id="${id}" url="${urlCanari('volume')}"></dsfr-data-source>`
).join('')}
  <dsfr-data-concat id="c-vol" sources="${IDS_VOLUME.join(', ')}"></dsfr-data-concat>`;
const EMPILER_VOLUME: Step = { op: 'concat', sources: IDS_VOLUME.map(() => 'main') };

const CHECKS: Check[] = [
  // -------------------------------------------------------------------------
  // null ≠ 0 ≠ ''
  // -------------------------------------------------------------------------
  {
    id: 'canari-absence-nest-pas-zero',
    mode: 'deterministic',
    constats: ['PG-020'],
    origin:
      'Canari — #301, PG-020 : `montant` porte des zéros, des `null`, des chaînes vides, une décimale française et un négatif. Une somme et une moyenne ne comptent que les nombres, un `count(champ)` ne compte que les renseignés, et un quotient dont l’opérande est absent reste absent (`compute-arithmetique-absence-et-division-par-zero` tient déjà la règle sur un jeu de six lignes ; ici, sur quarante).',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${SRC}
  ${kpi('k-somme', 's-canari', 'montant:sum', 'decimals="1"')}${kpi('k-moyenne', 's-canari', 'montant:avg', 'decimals="2"')}
  ${kpi('k-lignes', 's-canari', 'count')}
  <dsfr-data-query id="q-renseignes" source="s-canari" where="montant:isnotnull"></dsfr-data-query>
  ${kpi('k-renseignes', 'q-renseignes', 'count')}
  <dsfr-data-normalize id="n-ratio" source="s-canari" compute="ratio = montant / poids"></dsfr-data-normalize>`,
    expects: [
      { kind: 'kpi', id: 'k-somme', agg: 'sum', field: 'montant', decimals: 1 },
      { kind: 'kpi', id: 'k-moyenne', agg: 'avg', field: 'montant', decimals: 2 },
      { kind: 'kpi', id: 'k-lignes', agg: 'count' },
      // `isnotnull` du `where` ne voit que `null` : une chaîne vide est une
      // valeur renseignée (37 lignes, pas 34). Un KPI `montant:count`, lui,
      // compte TOUS les enregistrements (doc : « count → compte tous les
      // enregistrements ») — le canari l'a appris en le croyant filtrant.
      {
        kind: 'kpi',
        id: 'k-renseignes',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'montant', op: 'isnotnull-strict' }] }],
      },
      {
        kind: 'rows',
        id: 'n-ratio',
        key: 'id',
        columns: ['ratio'],
        pipeline: [{ op: 'ratio', numerator: 'montant', denominator: 'poids', as: 'ratio' }],
        // Un montant absent en amont ne devient jamais un quotient en aval.
        invariants: [{ kind: 'null-stays-null', field: 'ratio', rawField: 'montant', key: 'id' }],
      },
    ],
  },

  {
    id: 'canari-groupe-vide-null',
    mode: 'deterministic',
    constats: ['BUG-028', 'BUG-029'],
    origin:
      "Canari — #1198, BUG-028 et BUG-029 : un groupe sans AUCUNE valeur numérique rend `null` pour `sum`, `avg`, `min`, `max` (le 0 d'avant entrait dans les classements et les totaux), et une cellule absente d'un graphique reste absente. Le jeu `affichages-absences` porte les trois formes d'absence ; `affichages/query-groupe-sans-valeur-null`, `graphique-format-long-cellule-absente` et `graphique-format-large-valeur-absente` tiennent la règle sur la query et sur les deux formats du graphique.",
    feed: { kind: 'fixture', datasets: { main: ABSENCES } },
    markup: `
  <dsfr-data-source id="s-canari-abs" url="${urlAffichage('absences')}"></dsfr-data-source>
  <dsfr-data-query id="q-canari-abs" source="s-canari-abs" group-by="groupe"
    aggregate="valeur:sum:s, valeur:avg:m"></dsfr-data-query>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-canari-abs',
        key: 'groupe',
        columns: ['s', 'm'],
        pipeline: [
          {
            op: 'group-by',
            by: 'groupe',
            columns: {
              s: { agg: 'sum', field: 'valeur' },
              m: { agg: 'avg', field: 'valeur' },
            },
          },
        ],
      },
    ],
  },

  {
    id: 'canari-decimale-fr',
    mode: 'deterministic',
    constats: ['AM-033'],
    origin:
      "Canari — AM-033 : `'1 234,5'` et `'3,75'` sont des nombres écrits à la française, espace de milliers et virgule décimale. La somme les lit ; les lignes émises après `numeric` les portent en nombres.",
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${SRC}
  <dsfr-data-normalize id="n-num" source="s-canari" numeric="montant"></dsfr-data-normalize>
  ${kpi('k-num-somme', 'n-num', 'montant:sum', 'decimals="2"')}${kpi('k-num-max', 'n-num', 'montant:max', 'decimals="1"')}`,
    expects: [
      { kind: 'kpi', id: 'k-num-somme', agg: 'sum', field: 'montant', decimals: 2 },
      { kind: 'kpi', id: 'k-num-max', agg: 'max', field: 'montant', decimals: 1 },
      // Ligne à ligne : la chaîne française vaut le nombre qu'elle écrit.
      { kind: 'rows', id: 'n-num', key: 'id', columns: ['montant'], pipeline: [] },
    ],
  },

  // -------------------------------------------------------------------------
  // zéros de tête et types de clés
  // -------------------------------------------------------------------------
  {
    id: 'canari-zero-de-tete-jointure',
    mode: 'deterministic',
    constats: ['PG-030', 'BUG-014'],
    origin:
      "Canari — PG-030, BUG-014 (et `jointure-ecart-de-graphie-792`) : `'01'` n’est pas `'1'`. La table de droite porte les deux ; en jointure gauche, les quatre lignes à `'01'` prennent « Un », les deux à `'1'` prennent « Un sans zéro », et `'010'` ne prend rien. Une clé vide (`''`, `null`) n’apparie rien, pas même la ligne « Vide » de droite.",
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${SRC}${SRC_REF}
  <dsfr-data-join id="j-gauche" left="s-canari" right="s-ref" on="code" type="left"></dsfr-data-join>`,
    expects: [
      {
        kind: 'rows',
        id: 'j-gauche',
        key: ['id', 'nom'],
        columns: ['montant'],
        pipeline: [JOINTURE_GAUCHE],
      },
    ],
  },

  {
    id: 'canari-cles-types-differents',
    mode: 'deterministic',
    constats: ['FP-012'],
    origin:
      "Canari — FP-012, #792 : un nombre à gauche (`1`) et une chaîne à droite (`'1'`) s’apparient — la jointure convertit les deux côtés en chaîne. En jointure interne, quinze couples : quatre `'01'`, deux `'1'`, deux `1`, trois `'2A'`, et deux fois deux `'02'` (le doublon de droite). Un appariement nul vient du jeu, pas des types.",
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${SRC}${SRC_REF}
  <dsfr-data-join id="j-inner" left="s-canari" right="s-ref" on="code" type="inner"></dsfr-data-join>
  ${kpi('k-couples', 'j-inner', 'count')}`,
    expects: [
      {
        kind: 'rows',
        id: 'j-inner',
        key: ['id', 'nom'],
        columns: ['montant'],
        pipeline: [{ op: 'join', right: 'ref', on: 'code', type: 'inner' }],
        invariants: [{ kind: 'count-equals', n: 15 }],
      },
      {
        kind: 'kpi',
        id: 'k-couples',
        agg: 'count',
        pipeline: [{ op: 'join', right: 'ref', on: 'code', type: 'inner' }],
      },
    ],
  },

  {
    id: 'canari-zero-de-tete-contexte',
    mode: 'deterministic',
    constats: ['PG-030'],
    origin:
      "Canari — PG-030 : un filtre de contexte émet sa valeur EN TEXTE (`code = \"1\"`, vérifié sur `filterToOdsql`), et un serveur compare la FORME du code : `'1'` et `1` s’écrivent pareil (quatre lignes), `'01'` non (les quatre à zéro de tête restent dehors). L’oracle tient la même égalité de forme (`eq-strict`), pas l’égalité lâche du client pour qui `'01'` vaut `1` — huit lignes, et un chiffre faux.",
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceOds('s-ctx', DATASET_CANARI, 'fetch-mode="export" max-records="100"')}
  <dsfr-data-context id="ctx" sources="s-ctx">
    <dsfr-data-context-filter field="code" operator="eq" ui="ui-code" label="Code"></dsfr-data-context-filter>
  </dsfr-data-context>
  <label for="ui-code">Code</label>
  <select id="ui-code"><option value="">Tous</option><option value="1">1</option><option value="01">01</option></select>
  ${kpi('k-ctx', 's-ctx', 'count')}`,
    actions: [{ kind: 'select', selector: '#ui-code', value: '1' }],
    expects: [
      {
        kind: 'kpi',
        id: 'k-ctx',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'code', op: 'eq-strict', value: '1' }] }],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // le groupe null
  // -------------------------------------------------------------------------
  {
    id: 'canari-groupe-null-client',
    mode: 'deterministic',
    constats: ['PG-015'],
    origin:
      "Canari — PG-015 : six lignes sans région. Un regroupement CLIENT les rend sous la clé `''`, comptées, jamais fondues dans une autre région (`groupby-groupe-null-visible` tient la règle sur un jeu où vides et `null` se mêlent ; ici, six `null`).",
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${SRC}
  <dsfr-data-query id="q-region" source="s-canari" group-by="region" aggregate="id:count:nb"></dsfr-data-query>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-region',
        key: 'region',
        columns: ['nb'],
        pipeline: [
          { op: 'group-by', by: 'region', columns: { nb: { agg: 'count', field: 'id' } } },
        ],
        invariants: [{ kind: 'null-group', field: 'region', expect: 'visible', count: 'nb' }],
      },
    ],
  },

  {
    id: 'canari-groupe-null-serveur',
    mode: 'deterministic',
    constats: ['PG-015'],
    origin:
      'Canari — PG-015 : le même regroupement délégué au SERVEUR (`select` + `group-by` sur la source). Le portail rend le groupe des sans-région avec une clé `null`, et la bibliothèque doit le garder tel quel, avec son compte. `qualite-tourisme-group-by-null-exclu` tient le cas où la page l’exclut ; ici, on le garde.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceOds('s-grp', DATASET_CANARI, 'fetch-mode="export" max-records="100" select="count(id) as nb" group-by="region"')}
  ${kpi('k-grp', 's-grp', 'count')}`,
    expects: [
      {
        kind: 'rows',
        id: 's-grp',
        key: 'region',
        columns: ['nb'],
        pipeline: [
          { op: 'group-by', by: 'region', columns: { nb: { agg: 'count', field: 'id' } } },
        ],
        invariants: [{ kind: 'null-group', field: 'region', expect: 'visible', count: 'nb' }],
      },
      {
        kind: 'kpi',
        id: 'k-grp',
        agg: 'count',
        pipeline: [
          { op: 'group-by', by: 'region', columns: { nb: { agg: 'count', field: 'id' } } },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // accents et formes Unicode
  // -------------------------------------------------------------------------
  {
    id: 'canari-accents-nfc-nfd',
    mode: 'deterministic',
    constats: ['AM-033'],
    origin:
      'Canari — AM-033 (et `recherche-accents`) : « Élancourt » en NFC et « Élancourt » en NFD sont DEUX libellés pour un regroupement — aucune normalisation Unicode n’est promise, et l’oracle n’en fait pas non plus : c’est le piège à connaître, pas un défaut. La recherche, elle, replie accents, casse et formes : « elancourt » trouve les trois.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${SRC}
  <dsfr-data-query id="q-lib" source="s-canari" where="libelle:contains:lancourt" group-by="libelle" aggregate="id:count:nb"></dsfr-data-query>
  <dsfr-data-search id="r-lib" source="s-canari" fields="libelle" count count-label="ligne" debounce="0" min-length="0" label="Rechercher"></dsfr-data-search>`,
    actions: [{ kind: 'fill', selector: '#r-lib input', value: 'elancourt' }],
    expects: [
      {
        kind: 'rows',
        id: 'q-lib',
        key: 'libelle',
        columns: ['nb'],
        pipeline: [
          { op: 'filter', filters: [{ field: 'libelle', op: 'contains', value: 'lancourt' }] },
          { op: 'group-by', by: 'libelle', columns: { nb: { agg: 'count', field: 'id' } } },
        ],
        invariants: [{ kind: 'count-equals', n: 3 }],
      },
      {
        kind: 'text',
        id: 'r-lib',
        selector: '.dsfr-data-search-count',
        numeric: true,
        agg: 'count',
        pipeline: [
          {
            op: 'filter',
            filters: [{ field: 'libelle', op: 'contains', value: 'elancourt', fold: true }],
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // la jointure à doublon
  // -------------------------------------------------------------------------
  {
    id: 'canari-jointure-doublon',
    mode: 'deterministic',
    constats: ['PG-001'],
    origin:
      'Canari — PG-001, #792 : la table de droite porte DEUX fois le code `02`. La jointure gauche duplique les deux lignes à `02` (42 lignes pour 40) et gonfle la somme des montants de leur valeur (+20). Les invariants `count-preserved` et `sum-preserved` sont violés PAR LES DONNÉES — c’est le point, et ils sont rendus en attente avec les deux chiffres, pas cachés.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${SRC}${SRC_REF}
  <dsfr-data-join id="j-doublon" left="s-canari" right="s-ref" on="code" type="left"></dsfr-data-join>
  ${kpi('k-doublon-n', 'j-doublon', 'count')}${kpi('k-doublon-somme', 'j-doublon', 'montant:sum', 'decimals="1"')}`,
    expects: [
      {
        kind: 'rows',
        id: 'j-doublon',
        key: ['id', 'nom'],
        columns: ['montant'],
        pipeline: [JOINTURE_GAUCHE],
        invariants: [
          { kind: 'count-equals', n: 42 },
          {
            kind: 'count-preserved',
            skip: 'PG-001 — violé PAR LES DONNÉES, pas par la bibliothèque : 42 lignes émises pour 40 brutes, la table de droite portant deux fois le code 02. Rendu, pas caché.',
          },
          {
            kind: 'sum-preserved',
            field: 'montant',
            skip: 'PG-001 — violé PAR LES DONNÉES : la somme émise dépasse la somme brute de 20 (les montants 12 et 8 des deux lignes à `02`, comptés deux fois). C’est le 1,5 % d’écart plausible et faux du banc.',
          },
        ],
      },
      { kind: 'kpi', id: 'k-doublon-n', agg: 'count', pipeline: [JOINTURE_GAUCHE] },
      {
        kind: 'kpi',
        id: 'k-doublon-somme',
        agg: 'sum',
        field: 'montant',
        decimals: 1,
        pipeline: [JOINTURE_GAUCHE],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // le champ multivalué
  // -------------------------------------------------------------------------
  {
    id: 'canari-multivalue',
    mode: 'deterministic',
    constats: ['BUG-006'],
    origin:
      'Canari — BUG-006 : `tags` est un tableau. Une facette ÉCLATE les valeurs (eau 16, air 13, sol 10, par fréquence décroissante) ; un regroupement client compte les COMBINAISONS (« eau,air » est une clé, pas deux). Les deux sont justes, et ne se comparent pas.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${SRC}
  <dsfr-data-facets id="f-tags" source="s-canari" fields="tags" labels="tags:Tags"></dsfr-data-facets>
  <dsfr-data-query id="q-tags" source="s-canari" group-by="tags" aggregate="id:count:nb"></dsfr-data-query>`,
    expects: [
      {
        kind: 'facets',
        id: 'f-tags',
        group: 'Tags',
        valueColumn: 'tags',
        countColumn: 'n',
        pipeline: [
          { op: 'explode', field: 'tags' },
          { op: 'group-by', by: 'tags', columns: { n: { agg: 'count' } } },
          { op: 'order-by', column: 'n', dir: 'desc' },
        ],
      },
      {
        kind: 'rows',
        id: 'q-tags',
        key: 'tags',
        columns: ['nb'],
        pipeline: [{ op: 'group-by', by: 'tags', columns: { nb: { agg: 'count', field: 'id' } } }],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // le `where` sur le champ multivalué
  // -------------------------------------------------------------------------
  {
    id: 'canari-multivalue-where',
    mode: 'deterministic',
    constats: ['BUG-006'],
    origin:
      'Canari — #953 : un `where` sur `tags` (tableau) regarde DANS le tableau, comme le fait le portail sur une clause déléguée (mesuré : `where=themes_attendus = "Elèves"` → 124 lignes sur un élément, 0 sur le rendu texte complet). `tags:eq:eau` retient donc les 16 lignes où « eau » est un élément, et non les 7 dont le rendu texte vaut exactement « eau ». `neq` en est la négation, `in` l’union des `eq`, et les deux écritures du KPI (`count:tags:eau` et `count{tags:eq:eau}`) rendent enfin le même chiffre — c’était l’asymétrie de #842.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${SRC}
  <dsfr-data-query id="q-eq-eau" source="s-canari" where="tags:eq:eau"></dsfr-data-query>
  ${kpi('k-eq-eau', 'q-eq-eau', 'count')}
  <dsfr-data-query id="q-neq-eau" source="s-canari" where="tags:neq:eau"></dsfr-data-query>
  ${kpi('k-neq-eau', 'q-neq-eau', 'count')}
  <dsfr-data-query id="q-in-eau-sol" source="s-canari" where="tags:in:eau|sol"></dsfr-data-query>
  ${kpi('k-in-eau-sol', 'q-in-eau-sol', 'count')}
  ${kpi('k-count-champ', 's-canari', 'count:tags:eau')}
  ${kpi('k-count-accolades', 's-canari', 'count{tags:eq:eau}')}`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-eq-eau',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'tags', op: 'eq', value: 'eau' }] }],
      },
      // La négation ne garde PLUS les absents (#958) : `tags: null` sort du
      // `neq`, comme il sort du `!=` du portail — qui est à trois valeurs.
      // Le tableau VIDE `[]`, lui, reste : c'est une valeur, pas une absence.
      {
        kind: 'kpi',
        id: 'k-neq-eau',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'tags', op: 'neq', value: 'eau' }] }],
      },
      {
        kind: 'kpi',
        id: 'k-in-eau-sol',
        agg: 'count',
        pipeline: [
          { op: 'filter', filters: [{ field: 'tags', op: 'in', values: ['eau', 'sol'] }] },
        ],
      },
      // Les deux écritures du KPI, sur la MÊME source : un seul chiffre.
      {
        kind: 'kpi',
        id: 'k-count-champ',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'tags', op: 'eq', value: 'eau' }] }],
      },
      {
        kind: 'kpi',
        id: 'k-count-accolades',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'tags', op: 'eq', value: 'eau' }] }],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // le plafond
  // -------------------------------------------------------------------------
  {
    id: 'canari-plafond-export',
    mode: 'deterministic',
    constats: ['AM-002'],
    origin:
      'Canari — AM-002 : 1 001 lignes derrière `max-records="1000"` en `fetch-mode="export"`. La page charge mille, la somme porte sur mille : l’export n’a pas de total, le KPI `count` reste muet (voir `ods-plafond-sans-compteur` et `plan-de-relance-plafond-max-records`). Seule la SOURCE peut le dire ; elle avertissait en console sans nommer le composant (« [dsfr-data] opendatasoft: export JSON tronque »), donc sans être lue. Depuis #1032, l’avertissement cite « l’attribut max-records de dsfr-data-source » : l’invariant tient.',
    feed: { kind: 'fixture', datasets: { main: CANARI_VOLUME } },
    markup: `${sourceOds('s-vol', DATASET_VOLUME, 'fetch-mode="export" max-records="1000"')}
  ${kpi('k-vol-n', 's-vol', 'count')}${kpi('k-vol-somme', 's-vol', 'valeur:sum')}`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-vol-n',
        agg: 'count',
        pipeline: [{ op: 'limit', n: 1000 }],
        invariants: [{ kind: 'not-truncated' }],
      },
      {
        kind: 'kpi',
        id: 'k-vol-somme',
        agg: 'sum',
        field: 'valeur',
        pipeline: [{ op: 'limit', n: 1000 }],
      },
    ],
  },

  {
    id: 'canari-tableau-databox-coupe',
    mode: 'deterministic',
    constats: ['BUG-035'],
    origin:
      'Canari — #1230, BUG-035 : le tableau de la DataBox montre 100 lignes au plus. 1 001 lignes en entrée, 100 au tableau, et rien ne le disait : un lecteur comptait cent lignes et concluait à un jeu de cent. Le tableau reste coupé (même plafond que `dsfr-data-a11y`), mais il le DIT, avec le total — et les cent lignes montrées sont bien les cent premières.',
    feed: { kind: 'fixture', datasets: { main: CANARI_VOLUME } },
    head: TETE_CHART,
    markup: `
  <dsfr-data-source id="s-box-vol" url="${urlCanari('volume')}"></dsfr-data-source>
  <dsfr-data-chart id="g-box-vol" source="s-box-vol" type="bar"
    label-field="n" value-field="valeur" databox databox-title="Volume"></dsfr-data-chart>`,
    expects: [
      {
        kind: 'texts',
        id: 'g-box-vol',
        selector: '.fr-table tbody td:nth-child(2)',
        column: 'valeur',
        numeric: true,
        pipeline: [{ op: 'limit', n: 100 }],
      },
      // « Affichage limité aux 100 premières lignes sur 1 001. » : le SECOND
      // nombre est le total, recalculé — pas recopié dans le manifeste.
      {
        kind: 'text',
        id: 'g-box-vol',
        selector: '.dsfr-data-chart__databox-truncation',
        numeric: true,
        number: 1,
        agg: 'count',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // dates partielles
  // -------------------------------------------------------------------------
  {
    id: 'canari-date-partielle',
    mode: 'deterministic',
    constats: ['AM-029', 'BUG-005'],
    origin:
      'Canari — AM-029, BUG-005 : `date` mêle ISO complet, `AAAA-MM`, `AAAA`, vide et `null`. Un filtre d’ordre compare en TEXTE : « 2024 » ≤ « 2024-03 » ≤ « 2024-03-15 » < « 2025 », les vides ne matchent jamais. Trente-deux lignes en 2024, dates partielles comprises ; seize depuis « 2024-06 », qui s’inclut lui-même. (Piège payé en l’écrivant : les clauses d’un `where` se séparent par une VIRGULE, pas par `AND` — un `AND` devient la fin de la valeur, sans un mot, et deux dates de 2025 passaient.)',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${SRC}
  <dsfr-data-query id="q-2024" source="s-canari" where="date:gte:2024, date:lt:2025"></dsfr-data-query>
  <dsfr-data-query id="q-juin" source="s-canari" where="date:gte:2024-06, date:lt:2025"></dsfr-data-query>
  ${kpi('k-2024', 'q-2024', 'count')}${kpi('k-juin', 'q-juin', 'count')}`,
    expects: [
      {
        kind: 'rows',
        id: 'q-2024',
        key: 'id',
        columns: [],
        pipeline: [
          {
            op: 'filter',
            filters: [
              { field: 'date', op: 'gte', value: '2024' },
              { field: 'date', op: 'lt', value: '2025' },
            ],
          },
        ],
      },
      {
        kind: 'rows',
        id: 'q-juin',
        key: 'id',
        columns: [],
        pipeline: [
          {
            op: 'filter',
            filters: [
              { field: 'date', op: 'gte', value: '2024-06' },
              { field: 'date', op: 'lt', value: '2025' },
            ],
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-2024',
        agg: 'count',
        pipeline: [
          {
            op: 'filter',
            filters: [
              { field: 'date', op: 'gte', value: '2024' },
              { field: 'date', op: 'lt', value: '2025' },
            ],
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-juin',
        agg: 'count',
        pipeline: [
          {
            op: 'filter',
            filters: [
              { field: 'date', op: 'gte', value: '2024-06' },
              { field: 'date', op: 'lt', value: '2025' },
            ],
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // `neq` et les valeurs absentes : la logique à trois valeurs du portail
  // -------------------------------------------------------------------------
  {
    id: 'canari-neq-nuls-exclus',
    mode: 'deterministic',
    constats: ['PG-015'],
    origin:
      "Canari — #958 : `region` est nulle sur six lignes. Une ligne dont le champ est ABSENT ne satisfait NI `eq` NI `neq` — la logique SQL à trois valeurs qu'applique Opendatasoft, mesurée le 2026-09-20 sur `retours-formulaire-votre-avis-copie` de data.education.gouv.fr (176 lignes dont 21 nulles) : `= \"Elèves\"` → 124, `!= \"Elèves\"` → 31, c'est-à-dire 155 − 124 et non 176 − 124. `eq` les excluait déjà côté client, `neq` les gardait : le même `champ:neq:valeur` rendait donc deux comptes selon qu'il partait au serveur ou non. Ce contrôle exige que `eq` + `neq` = les RENSEIGNÉES, et que les six sans-région ne se retrouvent que par `isnull`. `notin` fait exception et garde les absents : ODSQL n'a pas d'infixe `not in`, il se délègue en `NOT region in (…)`, une négation booléenne que le portail rend à 52 = 176 − 124.",
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${SRC}
  <dsfr-data-query id="q-eq" source="s-canari" where="region:eq:Nord"></dsfr-data-query>
  <dsfr-data-query id="q-neq" source="s-canari" where="region:neq:Nord"></dsfr-data-query>
  <dsfr-data-query id="q-notin" source="s-canari" where="region:notin:Nord"></dsfr-data-query>
  <dsfr-data-query id="q-nulles" source="s-canari" where="region:isnull"></dsfr-data-query>
  ${kpi('k-eq', 'q-eq', 'count')}${kpi('k-neq', 'q-neq', 'count')}
  ${kpi('k-notin', 'q-notin', 'count')}${kpi('k-nulles', 'q-nulles', 'count')}`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-eq',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'region', op: 'eq', value: 'Nord' }] }],
      },
      {
        kind: 'kpi',
        id: 'k-neq',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'region', op: 'neq', value: 'Nord' }] }],
      },
      // `notin` garde les six nulles : 40 − (lignes « Nord »).
      {
        kind: 'kpi',
        id: 'k-notin',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'region', op: 'notin', values: ['Nord'] }] }],
      },
      // Et c'est `isnull` qui les nomme — la seule façon de les retrouver.
      {
        kind: 'kpi',
        id: 'k-nulles',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'region', op: 'isnull-strict' }] }],
      },
    ],
  },

  {
    id: 'canari-neq-nuls-exclus-delegue',
    mode: 'deterministic',
    constats: ['PG-015'],
    origin:
      "Canari — #958, l'autre moitié : le MÊME `where=\"region:neq:Nord\"`, mais sur une source Opendatasoft, donc traduit en `region != \"Nord\"` et évalué par le serveur. C'est le point de l'issue : ce qui décide du chemin n'est pas la balise mais le mode de la source, et les deux chiffres doivent être égaux. Le contrôle d'URL vérifie que la clause est bien PARTIE (sans quoi il serait vert en mesurant deux fois le client).",
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceOds('s-ods', DATASET_CANARI, 'max-records="100"')}
  <dsfr-data-query id="q-neq-ods" source="s-ods" where="region:neq:Nord"></dsfr-data-query>
  ${kpi('k-neq-ods', 'q-neq-ods', 'count')}`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-neq-ods',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'region', op: 'neq', value: 'Nord' }] }],
      },
      {
        kind: 'urls',
        id: 'neq-delegue',
        among: `/datasets/${DATASET_CANARI}/`,
        contains: 'region != "Nord"',
        verdict: 'last',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // distinct
  // -------------------------------------------------------------------------
  {
    id: 'canari-distinct',
    mode: 'deterministic',
    constats: ['AM-004', 'PG-026'],
    origin:
      "Canari — AM-004, PG-026 (et `agregat-distinct-exclut-les-vides`) : `count(distinct)` ne compte ni les vides ni les doublons — six régions, et pour `code` une modalité par graphie : `'1'` et `1` n’en font qu’une, `'01'` en fait une autre, `''` et `null` aucune.",
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${SRC}
  ${kpi('k-regions', 's-canari', 'region:distinct')}${kpi('k-codes', 's-canari', 'code:distinct')}`,
    expects: [
      { kind: 'kpi', id: 'k-regions', agg: 'distinct', field: 'region' },
      { kind: 'kpi', id: 'k-codes', agg: 'distinct', field: 'code' },
    ],
  },

  // -------------------------------------------------------------------------
  // la virgule DANS une valeur de facette
  // -------------------------------------------------------------------------
  {
    id: 'canari-facette-virgule-aller-retour',
    mode: 'deterministic',
    constats: ['BUG-031'],
    origin:
      'Canari — BUG-031, #1227 : une valeur de facette qui CONTIENT une virgule. `note` porte « 1,5 » à côté de « 1 » et de « 5 » — la décimale française, et le piège entier : écrite `?note=1,5` puis relue en « 1 » et « 5 », la sélection rendait SIX lignes au lieu de trois, un chiffre faux et plausible ; sur `intensite` (« 1,5 à 2 parcours »), deux cases fantômes et zéro ligne. Le contrôle se joue en DEUX navigations, comme `ctx-url-deux-navigations` : on coche, la synchro écrit, on recharge l’URL écrite. La virgule d’une valeur part échappée (`%2C`), et l’aller-retour est exact.',
    feed: { kind: 'fixture', datasets: { main: CANARI_FACETTES } },
    markup: `${SRC_FACETTES}
  <dsfr-data-facets id="f-note" source="s-fac" fields="note" labels="note:Note"
    url-params url-sync></dsfr-data-facets>
  <dsfr-data-facets id="f-int" source="s-fac" fields="intensite" labels="intensite:Intensité"
    url-params url-sync></dsfr-data-facets>
  ${kpi('k-note', 'f-note', 'count')}${kpi('k-int', 'f-int', 'count')}`,
    actions: [
      { kind: 'click', selector: '#f-note label:has-text("1,5")' },
      { kind: 'click', selector: '#f-int label:has-text("1,5 à 2 parcours")' },
      // Sans valeur : on recharge l'URL que la synchro vient d'écrire.
      { kind: 'goto' },
    ],
    expects: [
      {
        kind: 'kpi',
        id: 'k-note',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'note', op: 'eq-strict', value: '1,5' }] }],
      },
      {
        kind: 'kpi',
        id: 'k-int',
        agg: 'count',
        pipeline: [
          {
            op: 'filter',
            filters: [{ field: 'intensite', op: 'eq-strict', value: '1,5 à 2 parcours' }],
          },
        ],
      },
    ],
  },

  {
    id: 'canari-facette-virgule-lien-ancien',
    mode: 'deterministic',
    constats: ['BUG-031'],
    origin:
      'Canari — BUG-031, #1227 : le lien DÉJÀ partagé. Avant l’échappement, la facette écrivait la virgule nue (`?intensite=1%2C5+à+2+parcours`, une fois décodé « 1,5 à 2 parcours ») ; ces liens circulent. Relu morceau par morceau, il donne « 1 » et « 5 à 2 parcours », qu’aucune ligne ne porte. La facette client recolle un morceau INCONNU des données avec les suivants jusqu’à former une valeur connue : quatre lignes, et non zéro. Le témoin `?note=1,5` reste, lui, deux valeurs — « 1 » et « 5 » existent, un lien ancien les désignait bien toutes les deux.',
    feed: { kind: 'fixture', datasets: { main: CANARI_FACETTES } },
    markup: `${SRC_FACETTES}
  <dsfr-data-facets id="f-int" source="s-fac" fields="intensite" labels="intensite:Intensité"
    url-params></dsfr-data-facets>
  <dsfr-data-facets id="f-note" source="s-fac" fields="note" labels="note:Note"
    disjunctive="note" url-params></dsfr-data-facets>
  ${kpi('k-int', 'f-int', 'count')}${kpi('k-note', 'f-note', 'count')}`,
    actions: [{ kind: 'goto', value: '?intensite=1%2C5+%C3%A0+2+parcours&note=1,5' }],
    expects: [
      {
        kind: 'kpi',
        id: 'k-int',
        agg: 'count',
        pipeline: [
          {
            op: 'filter',
            filters: [{ field: 'intensite', op: 'eq-strict', value: '1,5 à 2 parcours' }],
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-note',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'note', op: 'in', values: ['1', '5'] }] }],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // la virgule DANS une valeur : les autres surfaces qui écrivent l'URL
  // -------------------------------------------------------------------------
  {
    id: 'canari-contexte-virgule-aller-retour',
    mode: 'deterministic',
    constats: ['BUG-031'],
    origin:
      'Canari — #1243, famille de BUG-031 : le filtre de CONTEXTE. `dsfr-data-context` découpait tout paramètre d’URL sur les virgules, quel que soit le filtre qui le lisait. Un `in` sur une liste à choix multiple coupait « 1,5 » en « 1 » et « 5 » — dès la clause, avant même le rechargement : SIX lignes au lieu de trois, le chiffre faux et plausible de BUG-031. Un `eq` sur une liste simple recollait les morceaux nettoyés : « Paris, France » revenait en « Paris,France », ne retrouvait plus son option, et le filtre disparaissait sans un mot — dix lignes au lieu de trois. Deux navigations : on choisit, la synchro écrit (`?note=1%252C5&lieu=Paris%252C+France`), on recharge l’URL écrite.',
    feed: { kind: 'fixture', datasets: { main: CANARI_FACETTES } },
    markup: `
${sourceOds('s-in', DATASET_FACETTES)}
${sourceOds('s-eq', DATASET_FACETTES)}
  <dsfr-data-context id="ctx" sources="s-in s-eq" url-sync>
    <dsfr-data-context-filter field="note" operator="in" ui="ui-note" apply-to="s-in" label="Note">
    </dsfr-data-context-filter>
    <dsfr-data-context-filter field="lieu" operator="eq" ui="ui-lieu" apply-to="s-eq" label="Lieu">
    </dsfr-data-context-filter>
  </dsfr-data-context>
  <label for="ui-note">Note</label>
  <select id="ui-note" multiple>
    <option value="1">1</option><option value="5">5</option>
    <option value="1,5">1,5</option><option value="2,5">2,5</option>
  </select>
  <label for="ui-lieu">Lieu</label>
  <select id="ui-lieu">
    <option value="">Tous</option><option value="Paris, France">Paris, France</option>
    <option value="Lyon, France">Lyon, France</option><option value="Paris">Paris</option>
  </select>
  ${kpi('k-in', 's-in', 'count')}${kpi('k-eq', 's-eq', 'count')}`,
    actions: [
      { kind: 'select', selector: '#ui-note', values: ['1,5'] },
      { kind: 'select', selector: '#ui-lieu', value: 'Paris, France' },
      // Sans valeur : on recharge l'URL que la synchro vient d'écrire.
      { kind: 'goto' },
    ],
    expects: [
      {
        kind: 'kpi',
        id: 'k-in',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'note', op: 'eq-strict', value: '1,5' }] }],
      },
      {
        kind: 'kpi',
        id: 'k-eq',
        agg: 'count',
        pipeline: [
          { op: 'filter', filters: [{ field: 'lieu', op: 'eq-strict', value: 'Paris, France' }] },
        ],
      },
    ],
  },

  {
    id: 'canari-selection-virgule-aller-retour',
    mode: 'deterministic',
    constats: ['BUG-031'],
    origin:
      'Canari — #1243, famille de BUG-031 : la SÉLECTION AU CLIC (`refine-on-click`, liste, fiche et carte par le même mixin). La valeur cliquée part dans l’URL du contexte ; relue, elle était découpée sur les virgules et seul le premier morceau gardé : « 1,5 à 2 parcours » revenait en « 1 », un filtre sur une valeur qu’aucune ligne ne porte — zéro ligne au lieu de quatre, sans erreur. Deux navigations : on clique la ligne, la synchro écrit, on recharge.',
    feed: { kind: 'fixture', datasets: { main: CANARI_FACETTES } },
    markup: `${SRC_FACETTES}
${sourceOds('s-cible', DATASET_FACETTES)}
  <dsfr-data-context id="ctx" sources="s-cible" url-sync></dsfr-data-context>
  <dsfr-data-list id="l-sel" source="s-fac" columns="id:Id, intensite:Intensité"
    refine-on-click="intensite" context="ctx" label="Intensité"></dsfr-data-list>
  ${kpi('k-sel', 's-cible', 'count')}`,
    actions: [{ kind: 'click', selector: '#l-sel tbody tr:first-child button' }, { kind: 'goto' }],
    expects: [
      {
        kind: 'kpi',
        id: 'k-sel',
        agg: 'count',
        pipeline: [
          {
            op: 'filter',
            filters: [{ field: 'intensite', op: 'eq-strict', value: '1,5 à 2 parcours' }],
          },
        ],
      },
    ],
  },

  {
    id: 'canari-recherche-virgule-aller-retour',
    mode: 'deterministic',
    constats: ['BUG-031'],
    origin:
      'Canari — #1243, famille de BUG-031 : la RECHERCHE en mode `context`. Le terme part dans l’URL du contexte ; relu, il était découpé sur les virgules, chaque morceau nettoyé, puis recollé : « Paris, France » revenait en « Paris,France ». `lieu` porte les deux écritures — trois lignes avec le blanc, une sans — : le terme relu trouvait UNE ligne au lieu de trois, un chiffre faux et plausible. Deux navigations : on saisit, la synchro écrit, on recharge.',
    feed: { kind: 'fixture', datasets: { main: CANARI_FACETTES } },
    markup: `${sourceOds('s-lieu', DATASET_FACETTES, 'fetch-mode="export" max-records="100"')}
  <dsfr-data-context id="ctx" sources="s-lieu" url-sync></dsfr-data-context>
  <dsfr-data-search id="r-lieu" source="s-lieu" context="ctx" fields="lieu" debounce="0"
    min-length="0" label="Rechercher un lieu"></dsfr-data-search>
  ${kpi('k-lieu', 's-lieu', 'count')}`,
    actions: [
      { kind: 'fill', selector: '#r-lieu input', value: 'Paris, France' },
      // Le bouton applique le terme SANS attendre la temporisation de frappe :
      // l'URL est écrite quand le clic rend la main, avant le rechargement.
      { kind: 'click', selector: '#r-lieu button' },
      { kind: 'goto' },
    ],
    expects: [
      {
        kind: 'kpi',
        id: 'k-lieu',
        agg: 'count',
        pipeline: [
          { op: 'filter', filters: [{ field: 'lieu', op: 'contains', value: 'Paris, France' }] },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // l'élément répété dans une cellule tableau
  // -------------------------------------------------------------------------
  {
    id: 'canari-facette-element-repete',
    mode: 'deterministic',
    constats: ['BUG-037'],
    origin:
      'Canari — BUG-037, #1227 : `domaines` répète un élément dans la cellule (`["Patrimoine","Patrimoine"]`, tableaux recollés de PG-073). Le compteur d’une facette annonce des LIGNES : une ligne compte une fois par valeur distincte — Patrimoine 4, Musée 3, Archives 2, Spectacle vivant 1 — et cocher « Patrimoine » rend bien quatre lignes. Compté par élément, la facette annonçait 5, 5, 2 et 3, dans un autre ordre, pour une sélection qui en rendait 4. `explode` de `dsfr-data-query` garde, lui, son compte par ÉLÉMENT (arbitrage du 2026-10-03) : Patrimoine 5 sur le même champ, et c’est écrit dans son JSDoc. Les deux chiffres sont tenus ici côte à côte, pour qu’aucun des deux ne glisse vers l’autre.',
    feed: { kind: 'fixture', datasets: { main: CANARI_FACETTES } },
    markup: `${SRC_FACETTES}
  <dsfr-data-facets id="f-dom" source="s-fac" fields="domaines" labels="domaines:Domaines"></dsfr-data-facets>
  ${kpi('k-dom', 'f-dom', 'count')}
  <dsfr-data-query id="q-dom" source="s-fac" explode="domaines" group-by="domaines"
    aggregate="id:count:nb"></dsfr-data-query>`,
    actions: [{ kind: 'click', selector: '#f-dom label:has-text("Patrimoine")' }],
    expects: [
      {
        kind: 'facets',
        id: 'f-dom',
        group: 'Domaines',
        valueColumn: 'domaines',
        countColumn: 'n',
        pipeline: [
          { op: 'explode', field: 'domaines', distinct: true },
          { op: 'group-by', by: 'domaines', columns: { n: { agg: 'count' } } },
          { op: 'order-by', column: 'n', dir: 'desc' },
        ],
      },
      // Le compteur est une promesse : cocher rend ce nombre de lignes.
      {
        kind: 'kpi',
        id: 'k-dom',
        agg: 'count',
        pipeline: [
          { op: 'filter', filters: [{ field: 'domaines', op: 'eq', value: 'Patrimoine' }] },
        ],
      },
      // L'éclatement d'une query compte les ÉLÉMENTS : pas de `distinct`.
      {
        kind: 'rows',
        id: 'q-dom',
        key: 'domaines',
        columns: ['nb'],
        pipeline: [
          { op: 'explode', field: 'domaines' },
          { op: 'group-by', by: 'domaines', columns: { nb: { agg: 'count', field: 'id' } } },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // le volume : un minimum sur plus de valeurs qu'un appel n'a d'arguments
  // -------------------------------------------------------------------------
  {
    id: 'canari-volume-min-max',
    mode: 'deterministic',
    constats: ['BUG-038'],
    origin:
      'Canari — BUG-038, #1228 : `min` et `max` sur 150 150 valeurs (le jeu de volume empilé cent cinquante fois par `dsfr-data-concat`). `Math.min(...values)` passe chaque valeur en ARGUMENT : au-delà de 120 000 à 125 000 sous V8, l’appel lève « RangeError: Maximum call stack size exceeded », le KPI reste vide et la query garde son ancien résultat, sans un mot à l’écran. Les deux chemins sont tenus — le KPI direct et l’agrégat global d’une query, relu par un KPI —, avec le compte, qui dit que les 150 150 lignes sont bien arrivées.',
    feed: { kind: 'fixture', datasets: { main: CANARI_VOLUME } },
    markup: `${SRC_VOLUME_EMPILE}
  ${kpi('k-n', 'c-vol', 'count')}${kpi('k-min', 'c-vol', 'valeur:min')}${kpi('k-max', 'c-vol', 'valeur:max')}
  <dsfr-data-query id="q-ext" source="c-vol" aggregate="valeur:min:mini, valeur:max:maxi"></dsfr-data-query>
  ${kpi('k-q-min', 'q-ext', 'mini:min')}${kpi('k-q-max', 'q-ext', 'maxi:max')}`,
    expects: [
      { kind: 'kpi', id: 'k-n', agg: 'count', pipeline: [EMPILER_VOLUME] },
      { kind: 'kpi', id: 'k-min', agg: 'min', field: 'valeur', pipeline: [EMPILER_VOLUME] },
      { kind: 'kpi', id: 'k-max', agg: 'max', field: 'valeur', pipeline: [EMPILER_VOLUME] },
      { kind: 'kpi', id: 'k-q-min', agg: 'min', field: 'valeur', pipeline: [EMPILER_VOLUME] },
      { kind: 'kpi', id: 'k-q-max', agg: 'max', field: 'valeur', pipeline: [EMPILER_VOLUME] },
    ],
  },

  // -------------------------------------------------------------------------
  // Le compte est juste, les lignes non : ce que l'API Tabular perd en silence
  // -------------------------------------------------------------------------
  {
    id: 'canari-tabular-tri-pagine',
    mode: 'deterministic',
    constats: ['PG-033'],
    origin:
      "Canari — #1202, #1233, PG-033 : l'API Tabular pagine par offset et ne trie que sur UNE clé ; sur une clé non unique, des lignes reviennent deux fois et d'autres jamais, avec un compte juste. Le piège est payé trois fois : lignes brutes (1 818 rendues, 1 718 distinctes), groupes (1 818 / 1 805), chargement tronqué (600 / 550). Ici les trois sur une même page, par un chiffre que seul l'ENSEMBLE exact des lignes rend juste : la somme des identifiants. `delegation/tabular-tri-pagine-sans-perte`, `tabular-tri-groupe-pagine-sans-perte` et `tabular-tri-tronque-ordre-total` tiennent chaque cas ligne à ligne.",
    feed: { kind: 'fixture', datasets: { main: EX_AEQUO } },
    markup: `
  <dsfr-data-source id="s-canari-tri" api-type="tabular" resource="${RESSOURCE_TABULAR_EX_AEQUO}"
    order-by="nombre:asc"></dsfr-data-source>
  ${kpi('k-canari-tri', 's-canari-tri', 'id:sum')}
  <dsfr-data-source id="s-canari-tri-groupe" api-type="tabular" resource="${RESSOURCE_TABULAR_EX_AEQUO}"
    group-by="nombre, id" aggregate="id:max" order-by="nombre:asc"></dsfr-data-source>
  ${kpi('k-canari-tri-groupe', 's-canari-tri-groupe', 'id__max:sum')}
  <dsfr-data-source id="s-canari-tri-tronque" api-type="tabular" resource="${RESSOURCE_TABULAR_EX_AEQUO}"
    order-by="categorie:asc" max-records="400"></dsfr-data-source>
  ${kpi('k-canari-tri-tronque', 's-canari-tri-tronque', 'id:sum')}`,
    expects: [
      { kind: 'kpi', id: 'k-canari-tri', agg: 'sum', field: 'id' },
      { kind: 'kpi', id: 'k-canari-tri-groupe', agg: 'sum', field: 'id' },
      {
        kind: 'kpi',
        id: 'k-canari-tri-tronque',
        agg: 'sum',
        field: 'id',
        pipeline: [
          {
            op: 'order-by-keys',
            keys: [
              { column: 'categorie', dir: 'asc' },
              { column: 'id', dir: 'asc' },
            ],
          },
          { op: 'limit', n: 400 },
        ],
      },
    ],
  },

  {
    id: 'canari-tabular-in-parenthese',
    mode: 'deterministic',
    constats: ['PG-034'],
    origin:
      "Canari — #1202, #1233, PG-034 : `__in` de l'API Tabular écarte sans erreur toute valeur NUE à parenthèse (`__exact` la trouve : 101 ; `__in` : 0), et les libellés à parenthèse sont banals en open data. La clause part ENTRE GUILLEMETS, seule forme que l'API lise (mesuré le 2026-10-04 : 202 lignes) : sur une query comme sur la source, le compte est celui des deux catégories. `delegation/tabular-in-a-parenthese-sur-la-query`, `tabular-in-a-parenthese-sur-la-source` et `tabular-in-a-parenthese-server-side` tiennent les trois poses, URL comprises.",
    feed: { kind: 'fixture', datasets: { main: EX_AEQUO } },
    markup: `
  <dsfr-data-source id="s-canari-in" api-type="tabular" resource="${RESSOURCE_TABULAR_EX_AEQUO}"
    where="categorie:in:Vols (avec violence)|Cambriolages"></dsfr-data-source>
  ${kpi('k-canari-in', 's-canari-in', 'count')}
  <dsfr-data-source id="s-canari-in-q" api-type="tabular" resource="${RESSOURCE_TABULAR_EX_AEQUO}"></dsfr-data-source>
  <dsfr-data-query id="q-canari-in" source="s-canari-in-q"
    where="categorie:in:Vols (avec violence)|Cambriolages"></dsfr-data-query>
  ${kpi('k-canari-in-q', 'q-canari-in', 'count')}`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-canari-in',
        agg: 'count',
        pipeline: [
          {
            op: 'filter',
            filters: [
              { field: 'categorie', op: 'in', values: ['Vols (avec violence)', 'Cambriolages'] },
            ],
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-canari-in-q',
        agg: 'count',
        pipeline: [
          {
            op: 'filter',
            filters: [
              { field: 'categorie', op: 'in', values: ['Vols (avec violence)', 'Cambriolages'] },
            ],
          },
        ],
      },
    ],
  },
];

export const CANARI: Manifest = { domain: 'canari', checks: CHECKS };
