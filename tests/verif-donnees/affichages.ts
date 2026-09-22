/**
 * Contrôles DÉTERMINISTES du lot AFFICHAGES (L5) — ce qui est MONTRÉ vaut le
 * nombre recalculé, format compris.
 *
 * Les contrôles de `query.ts` éprouvent le calcul ; ceux-ci éprouvent la
 * dernière marche, celle que personne ne regarde : le chiffre juste rendu dans
 * la mauvaise unité (« 0,25 » pour 25 %), la classe de couleur qui ne suit pas
 * le seuil, la page 2 qui reprend les lignes de la page 1, la légende dont les
 * bornes ne sont pas celles de la discrétisation annoncée, le résumé de carte
 * qui moyenne des taux au lieu de les pondérer (#763), l'export CSV qui ne
 * porte pas les lignes affichées.
 *
 * Deux choses sont donc comparées à chaque fois : le CHIFFRE, relu depuis le
 * texte rendu, et la FORME fr-FR, décrite par un motif. Le motif dit la forme,
 * jamais la valeur — sinon il ne garderait plus rien du calcul.
 *
 * L'oracle ne connaît pas `formatters.ts` : il recalcule un nombre et relit
 * celui que la page affiche. Le seul formatage qu'il écrive lui-même est la
 * conversion d'une date ISO en JJ/MM/AAAA, quatre caractères déplacés.
 *
 * Chaque contrôle a été vérifié EN ÉCHEC sur un défaut injecté dans la lib
 * (voir `tools/oracle/README.md`, « prouver une mutation »).
 */
import type { Check, Manifest } from '../../tools/oracle/manifest.js';
import { DATASET, HOTE_ODS, RESSOURCE_TABULAR, TERRITOIRES } from './fixtures.js';
import {
  COMMUNES,
  LIBELLES,
  LONG,
  RESSOURCE_TABULAR_AFFICHAGES,
  SERIE,
  urlAffichage,
} from './fixtures-affichages.js';

/** DSFR Chart depuis node_modules : la vraie bibliothèque, jamais le CDN. */
const TETE_CHART = `
  <link rel="stylesheet" href="/node_modules/@gouvfr/dsfr-chart/dist/DSFRChart/DSFRChart.css">
  <script type="module" src="/node_modules/@gouvfr/dsfr-chart/dist/DSFRChart/DSFRChart.js"></script>`;

// --- Motifs de forme -------------------------------------------------------
// Un séparateur de milliers fr-FR est une espace fine insécable (U+202F), un
// symbole d'unité est précédé d'une insécable (U+00A0) — et `textContent`
// normalisé rend les deux en espace ordinaire. Les trois sont donc acceptées :
// ce qui est gardé, c'est la présence du séparateur, pas son codet.
const ESP = '[\\s\\u202f\\u00a0]';
/** Entier avec séparateurs de milliers : « 15 909 531 ». */
const MILLIERS = `^-?\\d{1,3}(?:${ESP}\\d{3})*$`;
/** Décimal à N décimales, séparateurs de milliers compris : « 331 448,56 ». */
const decimales = (n: number): string => `^-?\\d{1,3}(?:${ESP}\\d{3})*,\\d{${n}}$`;
/** Pourcentage : le symbole, après une espace. */
const POURCENT = `${ESP}%$`;
/** Montant en euros : le symbole, après une espace. */
const EURO = `${ESP}€$`;
/** Notation compacte en millions : « 15,9 M ». */
const COMPACT_M = `^\\d+,\\d${ESP}M$`;
/** Date calendaire française. */
const DATE_FR = '^\\d{2}/\\d{2}/\\d{4}$';

/** Classes de couleur du KPI, telles que le composant les pose. */
const CLASSES_KPI = {
  vert: 'dsfr-data-kpi--success',
  orange: 'dsfr-data-kpi--warning',
  rouge: 'dsfr-data-kpi--error',
  bleu: 'dsfr-data-kpi--info',
};

/** Une source qui sert un jeu du lot, en tableau nu. */
const source = (id: string, jeu: 'communes' | 'serie' | 'libelles' | 'long'): string =>
  `<dsfr-data-source id="${id}" url="${urlAffichage(jeu)}"></dsfr-data-source>`;

const CHECKS: Check[] = [
  // ---------------------------------------------------------------- KPI ----
  {
    id: 'kpi-agregats-affiches',
    mode: 'deterministic',
    origin:
      'Les cinq agrégats d’un KPI relus dans le texte rendu : count, sum, avg (2 décimales), min et max.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-agg', 'communes')}
  <dsfr-data-kpi id="k-count" source="s-agg" value="count" format="nombre" label="Communes"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-somme" source="s-agg" value="population:sum" format="nombre" label="Population"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-moyenne" source="s-agg" value="population:avg" format="decimal" decimals="2" label="Moyenne"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-min" source="s-agg" value="population:min" format="nombre" label="Minimum"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-max" source="s-agg" value="population:max" format="nombre" label="Maximum"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-count', agg: 'count', pattern: MILLIERS },
      { kind: 'kpi', id: 'k-somme', agg: 'sum', field: 'population', pattern: MILLIERS },
      {
        kind: 'kpi',
        id: 'k-moyenne',
        agg: 'avg',
        field: 'population',
        decimals: 2,
        pattern: decimales(2),
      },
      { kind: 'kpi', id: 'k-min', agg: 'min', field: 'population', pattern: MILLIERS },
      { kind: 'kpi', id: 'k-max', agg: 'max', field: 'population', pattern: MILLIERS },
    ],
  },

  {
    id: 'kpi-distinct-et-count-filtre',
    mode: 'deterministic',
    origin:
      '#672 / #764 — `champ:distinct` et la forme filtrée `count:champ:valeur`, la seule que la lib accepte avec une valeur.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-dist', 'communes')}
  <dsfr-data-kpi id="k-zones" source="s-dist" value="zone:distinct" format="nombre" label="Zones"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-nord" source="s-dist" value="count:zone:Nord" format="nombre" label="Communes du Nord"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-zones', agg: 'distinct', field: 'zone' },
      {
        kind: 'kpi',
        id: 'k-nord',
        agg: 'count',
        filter: [{ field: 'zone', op: 'eq', value: 'Nord' }],
      },
    ],
  },

  {
    id: 'kpi-premiere-et-derniere-ligne',
    mode: 'deterministic',
    origin:
      '`champ:first` et `champ:last` : la valeur du bout de la série, DANS L’ORDRE COURANT — pas le minimum ni le maximum.',
    feed: { kind: 'fixture', datasets: { main: SERIE } },
    markup: `
  ${source('s-bornes', 'serie')}
  <dsfr-data-kpi id="k-premiere" source="s-bornes" value="valeur:first" format="nombre" label="Janvier"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-derniere" source="s-bornes" value="valeur:last" format="nombre" label="Décembre"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-premiere', agg: 'first', field: 'valeur' },
      { kind: 'kpi', id: 'k-derniere', agg: 'last', field: 'valeur' },
    ],
  },

  {
    id: 'kpi-evolution-en-pourcentage',
    mode: 'deterministic',
    origin:
      '#675 — `champ:evolution` rend une FRACTION ; `format="pourcentage"` la met à l’échelle. Le chiffre juste dans la mauvaise unité (« 0,4 » pour 40 %) est exactement ce qu’un contrôle de valeur seule laisse passer.',
    feed: { kind: 'fixture', datasets: { main: SERIE } },
    markup: `
  ${source('s-evol', 'serie')}
  <dsfr-data-kpi id="k-evolution" source="s-evol" value="valeur:evolution"
    format="pourcentage" decimals="1" label="Évolution sur l’année"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-evolution',
        agg: 'evolution',
        field: 'valeur',
        scale: 100,
        decimals: 1,
        pattern: POURCENT,
      },
    ],
  },

  {
    id: 'kpi-ratio-en-pourcentage',
    mode: 'deterministic',
    origin:
      '#673 — un ratio `count:champ:valeur / count` : fraction calculée, pourcentage affiché.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-ratio', 'communes')}
  <dsfr-data-kpi id="k-part-nord" source="s-ratio" value="count:zone:Nord / count"
    format="pourcentage" decimals="1" label="Part du Nord"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-part-nord',
        agg: 'first',
        field: 'part',
        scale: 100,
        decimals: 1,
        pattern: POURCENT,
        pipeline: [
          {
            op: 'global',
            columns: {
              num: { agg: 'count', filter: [{ field: 'zone', op: 'eq', value: 'Nord' }] },
              den: { agg: 'count' },
            },
          },
          { op: 'ratio', numerator: 'num', denominator: 'den', as: 'part' },
        ],
      },
    ],
  },

  {
    id: 'kpi-filtre-entre-accolades-776',
    mode: 'deterministic',
    origin:
      '#776 — le filtre entre accolades ne vaut que pour SON côté du ratio, là où `where` filtrerait les deux : une part de SOMMES, et la somme filtrée seule.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-acc', 'communes')}
  <dsfr-data-kpi id="k-part-somme" source="s-acc"
    value="population:sum{zone:eq:Nord} / population:sum"
    format="pourcentage" decimals="2" label="Part du Nord dans la population"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-somme-sud" source="s-acc" value="population:sum{zone:eq:Sud}"
    format="nombre" label="Population du Sud"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-part-somme',
        agg: 'first',
        field: 'part',
        scale: 100,
        decimals: 2,
        pattern: POURCENT,
        pipeline: [
          {
            op: 'global',
            columns: {
              num: {
                agg: 'sum',
                field: 'population',
                filter: [{ field: 'zone', op: 'eq', value: 'Nord' }],
              },
              den: { agg: 'sum', field: 'population' },
            },
          },
          { op: 'ratio', numerator: 'num', denominator: 'den', as: 'part' },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-somme-sud',
        agg: 'sum',
        field: 'population',
        filter: [{ field: 'zone', op: 'eq', value: 'Sud' }],
        pattern: MILLIERS,
      },
    ],
  },

  {
    id: 'kpi-where-client',
    mode: 'deterministic',
    origin:
      '#674 — le `where` du KPI filtre les lignes reçues avant l’agrégat, et il filtre les DEUX côtés d’un même tableau de bord.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-where', 'communes')}
  <dsfr-data-kpi id="k-w-count" source="s-where" where="zone:eq:Est, taux:gte:40"
    value="count" format="nombre" label="Communes de l’Est au-dessus de 40"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-w-moyenne" source="s-where" where="zone:eq:Est, taux:gte:40"
    value="taux:avg" format="decimal" decimals="2" label="Taux moyen"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-w-count',
        agg: 'count',
        filter: [
          { field: 'zone', op: 'eq', value: 'Est' },
          { field: 'taux', op: 'gte', value: 40 },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-w-moyenne',
        agg: 'avg',
        field: 'taux',
        decimals: 2,
        pattern: decimales(2),
        filter: [
          { field: 'zone', op: 'eq', value: 'Est' },
          { field: 'taux', op: 'gte', value: 40 },
        ],
      },
    ],
  },

  {
    id: 'kpi-meta-total-contre-count',
    mode: 'deterministic',
    origin:
      '#659 — derrière une page serveur, `count` compte les lignes REÇUES et `meta:total` le total publié par l’amont. Les confondre, c’est annoncer « 20 » pour 137.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  <dsfr-data-source id="s-page" api-type="opendatasoft"
    base-url="${HOTE_ODS}" dataset-id="${DATASET}"
    server-side page-size="20"></dsfr-data-source>
  <dsfr-data-kpi id="k-total" source="s-page" value="meta:total" format="nombre" label="Total"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-recues" source="s-page" value="count" format="nombre" label="Lignes reçues"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-total', agg: 'count' },
      { kind: 'kpi', id: 'k-recues', agg: 'count', pipeline: [{ op: 'limit', n: 20 }] },
    ],
  },

  {
    id: 'kpi-meta-total-inconnu',
    mode: 'deterministic',
    origin:
      '#1046 — une page Tabular AGRÉGÉE ne porte pas de `meta.total` (`{page, page_size}` seulement, mesuré le 2026-09-22, #1033) : le total des groupes est inconnu. `meta:total` retombait alors sur les lignes reçues et annonçait « 40 » (la taille de la page) pour 101 départements. Total inconnu → « — » ; les 40 groupes de la page restent comptés par `count`, qui dit bien ce qu’il compte.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  <dsfr-data-source id="s-groupes" api-type="tabular" resource="${RESSOURCE_TABULAR}"
    server-side page-size="40"></dsfr-data-source>
  <dsfr-data-query id="q-groupes" source="s-groupes" group-by="code_dept"
    aggregate="population:sum" order-by="code_dept:asc"></dsfr-data-query>
  <dsfr-data-kpi id="k-groupes-total" source="q-groupes" value="meta:total" format="nombre"
    label="Départements"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-groupes-recus" source="q-groupes" value="count" format="nombre"
    label="Groupes de la page"></dsfr-data-kpi>`,
    expects: [
      // La page est bien arrivée : ses 40 groupes, recalculés.
      {
        kind: 'kpi',
        id: 'k-groupes-recus',
        agg: 'count',
        pipeline: [
          {
            op: 'group-by',
            by: 'code_dept',
            columns: { population__sum: { agg: 'sum', field: 'population' } },
          },
          { op: 'order-by', column: 'code_dept', dir: 'asc' },
          { op: 'limit', n: 40 },
        ],
      },
      // Total inconnu : le tiret du composant, jamais un chiffre. Le texte
      // attendu n'est pas un résultat de calcul — l'oracle ne sait pas plus
      // que la page combien de groupes l'API détient, et c'est le constat.
      // Lu APRÈS le comptage : la page est chargée, le tiret n'est pas celui
      // d'un composant qui attend encore ses lignes.
      { kind: 'text', id: 'k-groupes-total', selector: '.dsfr-data-kpi__value', prefix: '—' },
      // Le regroupement est bien parti au serveur : c'est la page agrégée.
      {
        kind: 'urls',
        id: 'meta-total-page-agregee',
        among: `/api/resources/${RESSOURCE_TABULAR}/data/`,
        contains: 'code_dept__groupby',
        verdict: 'all',
      },
    ],
  },

  // ------------------------------------------------------------ Formats ----
  {
    id: 'format-pourcentage-et-unite',
    mode: 'deterministic',
    origin:
      '#665 — `format="pourcentage"` accole le symbole, `unit` accole un suffixe après une insécable. Un nombre nu à la place, et le lecteur lit des communes là où il y a des points de pourcentage.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-fmt', 'communes')}
  <dsfr-data-kpi id="k-pct" source="s-fmt" value="taux:avg" format="pourcentage"
    decimals="1" label="Taux moyen"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-unite" source="s-fmt" value="agents:sum" format="nombre"
    unit="agents" label="Effectif"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-pct',
        agg: 'avg',
        field: 'taux',
        decimals: 1,
        pattern: POURCENT,
        // Un taux moyen affiché en pourcentage reste entre 0 et 100 (#881) :
        // une mise à l'échelle appliquée deux fois se voit ici, pas ailleurs.
        invariants: [{ kind: 'bounded', min: 0, max: 100 }],
      },
      {
        kind: 'kpi',
        id: 'k-unite',
        agg: 'sum',
        field: 'agents',
        pattern: `${ESP}agents$`,
      },
    ],
  },

  {
    id: 'format-euro-et-decimales',
    mode: 'deterministic',
    origin:
      '#665 — `format="euro"` sans décimale par défaut, `decimals="3"` en fixe trois. La grammaire `euro:3` est refusée : les décimales passent par l’attribut.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-euro', 'communes')}
  <dsfr-data-kpi id="k-euro" source="s-euro" value="budget:sum" format="euro" label="Budget"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-euro3" source="s-euro" value="budget:avg" format="euro"
    decimals="3" label="Budget moyen"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-euro', agg: 'sum', field: 'budget', pattern: EURO },
      {
        kind: 'kpi',
        id: 'k-euro3',
        agg: 'avg',
        field: 'budget',
        decimals: 3,
        pattern: `,\\d{3}${ESP}€$`,
      },
    ],
  },

  {
    id: 'format-compact',
    mode: 'deterministic',
    origin:
      'La notation compacte (« 15,9 M ») affiche un nombre CENT MILLE fois plus petit que la donnée : le relire sans tenir compte du suffixe donnerait un écart de six ordres de grandeur, et un contrôle qui n’exige pas le suffixe ne verrait pas la différence.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-compact', 'communes')}
  <dsfr-data-kpi id="k-compact" source="s-compact" value="population:sum"
    format="compact" label="Population"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-compact-unite" source="s-compact" value="population:sum"
    format="compact" unit="hab" label="Population"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-compact',
        agg: 'sum',
        field: 'population',
        scale: 1e-6,
        decimals: 1,
        pattern: COMPACT_M,
      },
      {
        kind: 'kpi',
        id: 'k-compact-unite',
        agg: 'sum',
        field: 'population',
        scale: 1e-6,
        decimals: 1,
        pattern: `^\\d+,\\d${ESP}M${ESP}hab$`,
      },
    ],
  },

  {
    id: 'format-date',
    mode: 'deterministic',
    origin:
      '#667 — `format="date"` lit une chaîne ISO et rend JJ/MM/AAAA. Rien de chiffré à comparer : c’est le TEXTE qui est relu, contre la date que l’oracle retient.',
    feed: { kind: 'fixture', datasets: { main: SERIE } },
    markup: `
  ${source('s-date', 'serie')}
  <dsfr-data-kpi id="k-date-fin" source="s-date" value="jour:last" format="date"
    label="Dernière mise à jour"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-date-debut" source="s-date" value="jour:min" format="date"
    label="Première mise à jour"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-date-fin', agg: 'last', field: 'jour', as: 'date', pattern: DATE_FR },
      { kind: 'kpi', id: 'k-date-debut', agg: 'min', field: 'jour', as: 'date', pattern: DATE_FR },
    ],
  },

  {
    id: 'format-nombre-milliers',
    mode: 'deterministic',
    origin:
      '`format="nombre"` arrondit à l’entier et pose les séparateurs de milliers : « 331 448 », pas « 331448.5625 ».',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-mille', 'communes')}
  <dsfr-data-kpi id="k-entier" source="s-mille" value="population:avg" format="nombre"
    label="Population moyenne"></dsfr-data-kpi>`,
    expects: [{ kind: 'kpi', id: 'k-entier', agg: 'avg', field: 'population', pattern: MILLIERS }],
  },

  {
    id: 'format-decimales-par-defaut',
    mode: 'deterministic',
    origin:
      'Sans `decimals`, chaque format garde SON défaut historique : `decimal` rend une à deux décimales, `pourcentage` zéro à une. Les previews des apps consomment la même famille — un défaut qui bouge décale tout.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-defaut', 'communes')}
  <dsfr-data-kpi id="k-dec-defaut" source="s-defaut" value="taux:avg" format="decimal"
    label="Taux moyen"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-pct-defaut" source="s-defaut" value="taux:avg" format="pourcentage"
    label="Taux moyen"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-dec-defaut',
        agg: 'avg',
        field: 'taux',
        decimals: 2,
        pattern: '^-?\\d+,\\d{1,2}$',
      },
      {
        kind: 'kpi',
        id: 'k-pct-defaut',
        agg: 'avg',
        field: 'taux',
        decimals: 1,
        pattern: `^-?\\d+(?:,\\d)?${ESP}%$`,
      },
    ],
  },

  {
    id: 'kpi-evolution-negative',
    mode: 'deterministic',
    origin:
      'Une évolution NÉGATIVE : le signe est porté par le chiffre, et la ligne secondaire signée ne doit pas afficher un « + » devant une baisse.',
    feed: { kind: 'fixture', datasets: { main: LIBELLES } },
    markup: `
  ${source('s-baisse', 'libelles')}
  <dsfr-data-query id="q-baisse" source="s-baisse" order-by="score:desc"></dsfr-data-query>
  <dsfr-data-kpi id="k-baisse" source="q-baisse" value="score:evolution"
    format="pourcentage" decimals="1" label="Évolution"
    lines='[{"value":"score:evolution","sign":true,"suffix":"sur la période"}]'></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-baisse',
        agg: 'evolution',
        field: 'score',
        scale: 100,
        decimals: 1,
        pattern: `^-\\d+(?:,\\d)?${ESP}%$`,
        pipeline: [{ op: 'order-by', column: 'score', dir: 'desc' }],
      },
      {
        kind: 'texts',
        id: 'k-baisse',
        selector: '.dsfr-data-kpi__line',
        column: 'v',
        numeric: true,
        scale: 100,
        decimals: 1,
        pattern: '^-\\d+(?:,\\d+)?\\s%\\ssur la période$',
        pipeline: [
          { op: 'order-by', column: 'score', dir: 'desc' },
          { op: 'global', columns: { v: { agg: 'evolution', field: 'score' } } },
        ],
      },
    ],
  },

  {
    id: 'kpi-group-agregats',
    mode: 'deterministic',
    origin:
      'Deux KPI rangés dans un `dsfr-data-kpi-group` : la mise en grille ne doit rien changer aux chiffres qu’ils portent.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-groupe', 'communes')}
  <dsfr-data-kpi-group id="grp" cols="2">
    <dsfr-data-kpi id="k-g-1" source="s-groupe" value="population:sum" format="nombre"
      span="6" label="Population"></dsfr-data-kpi>
    <dsfr-data-kpi id="k-g-2" source="s-groupe" value="eleves:sum" format="nombre"
      span="6" label="Élèves"></dsfr-data-kpi>
  </dsfr-data-kpi-group>`,
    expects: [
      { kind: 'kpi', id: 'k-g-1', agg: 'sum', field: 'population', pattern: MILLIERS },
      { kind: 'kpi', id: 'k-g-2', agg: 'sum', field: 'eleves', pattern: MILLIERS },
    ],
  },

  // --------------------------------------------------- Seuils et couleur ----
  {
    id: 'kpi-seuils-de-couleur',
    mode: 'deterministic',
    origin:
      'La couleur d’un KPI est une lecture du chiffre : au-dessus du seuil vert c’est vert, au-dessus du seuil orange c’est orange, en dessous des deux c’est rouge. Un habillage qui ne suit pas la valeur ment autant qu’une valeur fausse, et aucune lecture de nombre ne l’attrape.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-seuils', 'communes')}
  <dsfr-data-kpi id="k-vert" source="s-seuils" value="taux:avg" format="decimal"
    threshold-green="40" threshold-orange="20" label="Taux moyen"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-orange" source="s-seuils" value="taux:avg" format="decimal"
    threshold-green="60" threshold-orange="30" label="Taux moyen"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-rouge" source="s-seuils" value="taux:min" format="decimal"
    threshold-green="40" threshold-orange="20" label="Taux minimum"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-neutre" source="s-seuils" value="taux:avg" format="decimal"
    label="Taux moyen"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'class',
        id: 'k-vert',
        selector: '.dsfr-data-kpi',
        ready: '.dsfr-data-kpi__value',
        pipeline: [{ op: 'global', columns: { v: { agg: 'avg', field: 'taux' } } }],
        column: 'v',
        thresholds: { green: 40, orange: 20 },
        classes: CLASSES_KPI,
      },
      {
        kind: 'class',
        id: 'k-orange',
        selector: '.dsfr-data-kpi',
        ready: '.dsfr-data-kpi__value',
        pipeline: [{ op: 'global', columns: { v: { agg: 'avg', field: 'taux' } } }],
        column: 'v',
        thresholds: { green: 60, orange: 30 },
        classes: CLASSES_KPI,
      },
      {
        kind: 'class',
        id: 'k-rouge',
        selector: '.dsfr-data-kpi',
        ready: '.dsfr-data-kpi__value',
        pipeline: [{ op: 'global', columns: { v: { agg: 'min', field: 'taux' } } }],
        column: 'v',
        thresholds: { green: 40, orange: 20 },
        classes: CLASSES_KPI,
      },
      {
        kind: 'class',
        id: 'k-neutre',
        selector: '.dsfr-data-kpi',
        ready: '.dsfr-data-kpi__value',
        pipeline: [{ op: 'global', columns: { v: { agg: 'avg', field: 'taux' } } }],
        column: 'v',
        classes: CLASSES_KPI,
      },
    ],
  },

  {
    id: 'kpi-couleur-forcee',
    mode: 'deterministic',
    origin:
      '#367 — `color-token` force la couleur : la valeur ne décide plus, et un seuil posé à côté ne doit pas reprendre la main.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-token', 'communes')}
  <dsfr-data-kpi id="k-force" source="s-token" value="taux:avg" format="decimal"
    color-token="rouge" threshold-green="1" label="Taux moyen"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'class',
        id: 'k-force',
        selector: '.dsfr-data-kpi',
        ready: '.dsfr-data-kpi__value',
        forced: 'rouge',
        classes: CLASSES_KPI,
      },
    ],
  },

  // ------------------------------------------ Lignes secondaires, tendance --
  {
    id: 'kpi-lignes-secondaires',
    mode: 'deterministic',
    origin:
      'Les `lines` d’un KPI portent un chiffre calculé au même titre que la valeur principale — avec leur signe et leur suffixe. Un KPI par ligne : chacune se relit seule.',
    feed: { kind: 'fixture', datasets: { main: SERIE } },
    markup: `
  ${source('s-lignes', 'serie')}
  <dsfr-data-kpi id="k-ligne-valeur" source="s-lignes" value="valeur:last" format="nombre"
    label="Volume" lines='[{"value":"valeur:evolution","sign":true,"suffix":"vs janvier"}]'></dsfr-data-kpi>
  <dsfr-data-kpi id="k-ligne-objectif" source="s-lignes" value="objectif:last" format="nombre"
    label="Objectif" lines='[{"value":"objectif:evolution","sign":true,"suffix":"vs janvier"}]'></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'texts',
        id: 'k-ligne-valeur',
        selector: '.dsfr-data-kpi__line',
        column: 'v',
        numeric: true,
        scale: 100,
        decimals: 1,
        pattern: '^\\+\\d+(?:,\\d+)?\\s%\\svs janvier$',
        pipeline: [{ op: 'global', columns: { v: { agg: 'evolution', field: 'valeur' } } }],
      },
      {
        kind: 'texts',
        id: 'k-ligne-objectif',
        selector: '.dsfr-data-kpi__line',
        column: 'v',
        numeric: true,
        scale: 100,
        decimals: 1,
        pattern: '^\\+\\d+(?:,\\d+)?\\s%\\svs janvier$',
        pipeline: [{ op: 'global', columns: { v: { agg: 'evolution', field: 'objectif' } } }],
      },
    ],
  },

  {
    id: 'kpi-tendance',
    mode: 'deterministic',
    origin:
      '#675 — `trend` rend TOUJOURS un pourcentage, flèche comprise. La flèche dit le sens, le chiffre dit l’ampleur : les deux viennent du même calcul.',
    feed: { kind: 'fixture', datasets: { main: SERIE } },
    markup: `
  ${source('s-trend', 'serie')}
  <dsfr-data-kpi id="k-trend" source="s-trend" value="valeur:last" format="nombre"
    trend="valeur:evolution" label="Volume"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'texts',
        id: 'k-trend',
        selector: '.dsfr-data-kpi__tendance',
        column: 'v',
        numeric: true,
        scale: 100,
        decimals: 1,
        pattern: '^↑\\s\\d+(?:,\\d+)?\\s%$',
        pipeline: [{ op: 'global', columns: { v: { agg: 'evolution', field: 'valeur' } } }],
      },
    ],
  },

  // --------------------------------------------------------- Graphiques ----
  {
    id: 'graphique-barres-horizontales-empilees',
    mode: 'deterministic',
    origin:
      'Deux séries passées à un `<bar-chart>` horizontal et empilé : les valeurs, et les deux options de rendu, lues sur l’élément réellement monté.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    head: TETE_CHART,
    markup: `
  ${source('s-barres', 'communes')}
  <dsfr-data-query id="q-barres" source="s-barres" group-by="zone"
    aggregate="population:sum:pop, eleves:sum:eleves" order-by="pop:desc"></dsfr-data-query>
  <dsfr-data-chart id="g-barres" source="q-barres" type="bar" horizontal stacked
    label-field="zone" value-fields="pop,eleves" name='["Population","Élèves"]'></dsfr-data-chart>`,
    expects: [
      {
        kind: 'chart',
        id: 'g-barres',
        labelColumn: 'zone',
        valueColumns: ['pop', 'eleves'],
        pipeline: [
          {
            op: 'group-by',
            by: 'zone',
            columns: {
              pop: { agg: 'sum', field: 'population' },
              eleves: { agg: 'sum', field: 'eleves' },
            },
          },
          { op: 'order-by', column: 'pop', dir: 'desc' },
        ],
      },
      { kind: 'attr', id: 'g-barres', attr: 'horizontal', literal: 'true' },
      { kind: 'attr', id: 'g-barres', attr: 'stacked', literal: 'true' },
    ],
  },

  {
    id: 'graphique-courbe-deux-series',
    mode: 'deterministic',
    origin:
      'Deux colonnes de valeurs (`value-fields`) sur une courbe : les douze points de chaque série, dans l’ordre.',
    feed: { kind: 'fixture', datasets: { main: SERIE } },
    head: TETE_CHART,
    markup: `
  ${source('s-courbe', 'serie')}
  <dsfr-data-chart id="g-courbe" source="s-courbe" type="line"
    label-field="mois" value-fields="valeur,objectif" name='["Réalisé","Objectif"]'></dsfr-data-chart>`,
    expects: [
      {
        kind: 'chart',
        id: 'g-courbe',
        labelColumn: 'mois',
        valueColumns: ['valeur', 'objectif'],
        pipeline: [],
      },
    ],
  },

  {
    id: 'graphique-camembert',
    mode: 'deterministic',
    origin:
      'Un camembert : une part par zone, dans l’ordre du regroupement. Les parts sont des valeurs, pas des angles — c’est ce qui est passé à l’élément qui est lu.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    head: TETE_CHART,
    markup: `
  ${source('s-pie', 'communes')}
  <dsfr-data-query id="q-pie" source="s-pie" group-by="zone"
    aggregate="population:sum:pop" order-by="pop:desc"></dsfr-data-query>
  <dsfr-data-chart id="g-pie" source="q-pie" type="pie" fill
    label-field="zone" value-field="pop"></dsfr-data-chart>`,
    expects: [
      {
        kind: 'chart',
        id: 'g-pie',
        labelColumn: 'zone',
        valueColumns: ['pop'],
        pipeline: [
          { op: 'group-by', by: 'zone', columns: { pop: { agg: 'sum', field: 'population' } } },
          { op: 'order-by', column: 'pop', dir: 'desc' },
        ],
      },
    ],
  },

  {
    id: 'graphique-radar',
    mode: 'deterministic',
    origin:
      'Un radar : mêmes valeurs, autre géométrie. L’échelle radiale est relayée par `scale-min` / `scale-max`, qui doivent porter les bornes déclarées.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    head: TETE_CHART,
    markup: `
  ${source('s-radar', 'communes')}
  <dsfr-data-query id="q-radar" source="s-radar" group-by="zone"
    aggregate="taux:avg:moyenne"></dsfr-data-query>
  <dsfr-data-chart id="g-radar" source="q-radar" type="radar"
    label-field="zone" value-field="moyenne" y-min="0" y-max="100" name="Taux"></dsfr-data-chart>`,
    expects: [
      {
        kind: 'chart',
        id: 'g-radar',
        labelColumn: 'zone',
        valueColumns: ['moyenne'],
        pipeline: [
          { op: 'group-by', by: 'zone', columns: { moyenne: { agg: 'avg', field: 'taux' } } },
        ],
      },
      { kind: 'attr', id: 'g-radar', attr: 'scale-min', literal: '0' },
      { kind: 'attr', id: 'g-radar', attr: 'scale-max', literal: '100' },
    ],
  },

  {
    id: 'graphique-series-field-format-long',
    mode: 'deterministic',
    origin:
      '`series-field` pivote des données au format long : une série par valeur distincte de la clé. Une cellule aiguillée sur la mauvaise série se lit sur le graphique, jamais sur le cache amont.',
    feed: { kind: 'fixture', datasets: { main: LONG } },
    head: TETE_CHART,
    markup: `
  ${source('s-long', 'long')}
  <dsfr-data-chart id="g-long" source="s-long" type="bar"
    label-field="mois" series-field="groupe" value-field="valeur"></dsfr-data-chart>`,
    expects: [
      {
        kind: 'chart',
        id: 'g-long',
        labelColumn: 'mois',
        valueColumns: ['cadres', 'agents'],
        pipeline: [
          {
            op: 'group-by',
            by: 'mois',
            columns: {
              cadres: {
                agg: 'sum',
                field: 'valeur',
                filter: [{ field: 'groupe', op: 'eq', value: 'Cadres' }],
              },
              agents: {
                agg: 'sum',
                field: 'valeur',
                filter: [{ field: 'groupe', op: 'eq', value: 'Agents' }],
              },
            },
          },
        ],
      },
    ],
  },

  {
    id: 'graphique-bornes-des-axes',
    mode: 'deterministic',
    origin:
      'Les bornes d’axes déclarées sont relayées telles quelles à l’élément DSFR Chart : une borne perdue en route change la lecture d’une courbe sans toucher à une seule valeur.',
    feed: { kind: 'fixture', datasets: { main: SERIE } },
    head: TETE_CHART,
    markup: `
  ${source('s-bornes-axes', 'serie')}
  <dsfr-data-chart id="g-bornes" source="s-bornes-axes" type="line"
    label-field="mois" value-field="valeur" name="Volume"
    x-min="0" x-max="11" y-min="100" y-max="200"></dsfr-data-chart>`,
    expects: [
      { kind: 'attr', id: 'g-bornes', attr: 'x-min', literal: '0' },
      { kind: 'attr', id: 'g-bornes', attr: 'x-max', literal: '11' },
      { kind: 'attr', id: 'g-bornes', attr: 'y-min', literal: '100' },
      { kind: 'attr', id: 'g-bornes', attr: 'y-max', literal: '200' },
    ],
  },

  {
    id: 'graphique-color-map-pastilles-databox',
    mode: 'deterministic',
    origin:
      '#732 / #813 — sous `databox`, les pastilles de légende doivent porter les couleurs de `color-map` : une légende qui garde la palette CONTREDIT le tracé recoloré à côté d’elle.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    head: TETE_CHART,
    markup: `
  ${source('s-couleurs', 'communes')}
  <dsfr-data-query id="q-couleurs" source="s-couleurs" group-by="zone"
    aggregate="population:sum:pop" order-by="pop:desc"></dsfr-data-query>
  <dsfr-data-chart id="g-couleurs" source="q-couleurs" type="pie"
    label-field="zone" value-field="pop" databox databox-title="Population par zone"
    color-map="Ouest:#e1000f,Est:#000091,Sud:#00a95f"></dsfr-data-chart>`,
    expects: [
      {
        kind: 'dots',
        id: 'g-couleurs',
        labelColumn: 'zone',
        colorMap: { Ouest: '#e1000f', Est: '#000091', Sud: '#00a95f' },
        pipeline: [
          { op: 'group-by', by: 'zone', columns: { pop: { agg: 'sum', field: 'population' } } },
          { op: 'order-by', column: 'pop', dir: 'desc' },
        ],
      },
    ],
  },

  {
    id: 'carte-resume-non-pondere-763',
    mode: 'deterministic',
    origin:
      '#763 — sans champ d’effectif, le résumé affiché sous le titre d’une carte est la moyenne NON pondérée des valeurs dessinées. C’est le calcul historique, et il doit rester exactement celui-là.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    head: TETE_CHART,
    markup: `
  ${source('s-carte-simple', 'communes')}
  <dsfr-data-chart id="g-carte-simple" source="s-carte-simple" type="map"
    code-field="dept" value-field="taux" name="Taux"></dsfr-data-chart>`,
    expects: [
      {
        kind: 'attr',
        id: 'g-carte-simple',
        attr: 'value',
        decimals: 2,
        column: 'v',
        pipeline: [{ op: 'global', columns: { v: { agg: 'avg', field: 'taux' } } }],
      },
    ],
  },

  {
    id: 'carte-resume-pondere-763',
    mode: 'deterministic',
    origin:
      '#763 — avec `map-summary-weight`, le résumé devient Σ(valeur × effectif) / Σ(effectif) : le taux national, et non la moyenne des taux territoriaux. Deux chiffres différents pour les mêmes lignes, et c’est le second qui fait autorité.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    head: TETE_CHART,
    markup: `
  ${source('s-carte-pond', 'communes')}
  <dsfr-data-chart id="g-carte-pond" source="s-carte-pond" type="map"
    code-field="dept" value-field="taux" map-summary-weight="eleves" name="Taux"></dsfr-data-chart>`,
    expects: [
      {
        kind: 'attr',
        id: 'g-carte-pond',
        attr: 'value',
        decimals: 2,
        column: 'v',
        pipeline: [
          { op: 'global', columns: { v: { agg: 'wavg', field: 'taux', weight: 'eleves' } } },
        ],
      },
    ],
  },

  {
    id: 'carte-resume-champ-de-calcul-929',
    mode: 'deterministic',
    origin:
      '#929 (PG-031) — un arrondi posé EN AMONT réécrit la colonne dans la donnée : la pondération porte alors sur des valeurs arrondies, et le taux national est faux de peu — donc invisible (4,5331 au lieu de 4,5368 sur 101 départements). `map-summary-field` calcule sur la colonne brute pendant que la carte affiche l’arrondie. Le contrôle garde le CHIFFRE : sans l’attribut, le résumé vaudrait la pondérée des valeurs arrondies, qui n’est pas celle-ci.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    head: TETE_CHART,
    markup: `
  ${source('s-carte-calcul', 'communes')}
  <dsfr-data-normalize id="n-carte-calcul" source="s-carte-calcul"
    compute="taux_aff = round(taux, 0)"></dsfr-data-normalize>
  <dsfr-data-chart id="g-carte-calcul" source="n-carte-calcul" type="map"
    code-field="dept" value-field="taux_aff" map-summary-weight="eleves"
    map-summary-field="taux" name="Taux"></dsfr-data-chart>`,
    expects: [
      {
        kind: 'attr',
        id: 'g-carte-calcul',
        attr: 'value',
        decimals: 2,
        column: 'v',
        pipeline: [
          { op: 'global', columns: { v: { agg: 'wavg', field: 'taux', weight: 'eleves' } } },
        ],
      },
    ],
  },

  {
    id: 'carte-resume-somme-927',
    mode: 'deterministic',
    origin:
      '#927 — le résumé d’une carte de VOLUMES est la SOMME, jamais la moyenne : « 3 074,06 en France » pour 310 480 licences était la moyenne de 101 volumes, un chiffre sans signification (AM-079). `map-summary="sum"` la calcule depuis la donnée, donc suit les filtres — là où un littéral reste juste pour un seul jeu.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    head: TETE_CHART,
    markup: `
  ${source('s-carte-somme', 'communes')}
  <dsfr-data-chart id="g-carte-somme" source="s-carte-somme" type="map"
    code-field="dept" value-field="population" map-summary="sum"
    name="Habitants"></dsfr-data-chart>`,
    expects: [
      {
        kind: 'attr',
        id: 'g-carte-somme',
        attr: 'value',
        decimals: 2,
        column: 'v',
        pipeline: [{ op: 'global', columns: { v: { agg: 'sum', field: 'population' } } }],
      },
    ],
  },

  {
    id: 'graphique-nuage-de-points',
    mode: 'deterministic',
    origin:
      'Un nuage de points : chaque point est un couple, et c’est le couple qui est passé à l’élément — un décalage d’un rang entre abscisses et ordonnées ne se voit sur aucun total.',
    feed: { kind: 'fixture', datasets: { main: SERIE } },
    head: TETE_CHART,
    markup: `
  ${source('s-nuage', 'serie')}
  <dsfr-data-chart id="g-nuage" source="s-nuage" type="scatter"
    label-field="mois" value-field="valeur" name="Volume"></dsfr-data-chart>`,
    expects: [
      { kind: 'chart', id: 'g-nuage', labelColumn: 'mois', valueColumns: ['valeur'], pipeline: [] },
    ],
  },

  {
    id: 'graphique-cumul-affiche',
    mode: 'deterministic',
    origin:
      '#738 / #775 — un cumul transmis à un graphique : la dernière barre vaut le total de la série. Le cache amont peut être juste et le tracé ne pas l’être.',
    feed: { kind: 'fixture', datasets: { main: SERIE } },
    head: TETE_CHART,
    markup: `
  ${source('s-cumul', 'serie')}
  <dsfr-data-query id="q-cumul" source="s-cumul" group-by="mois"
    aggregate="valeur:sum:total, total:running_sum:cumul" order-by="mois:asc"></dsfr-data-query>
  <dsfr-data-chart id="g-cumul" source="q-cumul" type="bar"
    label-field="mois" value-field="cumul" name="Cumul"></dsfr-data-chart>`,
    expects: [
      {
        kind: 'chart',
        id: 'g-cumul',
        labelColumn: 'mois',
        valueColumns: ['cumul'],
        pipeline: [
          { op: 'group-by', by: 'mois', columns: { total: { agg: 'sum', field: 'valeur' } } },
          { op: 'order-by', column: 'mois', dir: 'asc' },
          { op: 'running', from: 'total', as: 'cumul', kind: 'running_sum' },
        ],
      },
    ],
  },

  // ------------------------------------------------- Carte : choroplèthe ----
  {
    id: 'carte-classes-intervalles-egaux',
    mode: 'deterministic',
    origin:
      '#685 — cinq classes à intervalles égaux : l’étendue découpée en tranches de même largeur, extrémités comprises.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-choro-eq', 'communes')}
  <dsfr-data-map id="carte-eq" center="46.6,2.3" zoom="5" height="300px" tiles="osm">
    <dsfr-data-map-layer id="couche-eq" source="s-choro-eq" type="circle"
      lat-field="lat" lon-field="lon" fill-field="taux"
      classes="5" method="equal"></dsfr-data-map-layer>
    <dsfr-data-map-legend for="couche-eq" label="Taux"></dsfr-data-map-legend>
  </dsfr-data-map>`,
    expects: [{ kind: 'legend', id: 'couche-eq', field: 'taux', classes: 5, method: 'equal' }],
  },

  {
    id: 'carte-classes-quantiles',
    mode: 'deterministic',
    origin:
      '#685 — quatre classes par QUANTILES : mêmes valeurs, autres bornes. Confondre les deux méthodes donne une carte qui se lit à l’envers sans qu’aucun chiffre ne bouge.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-choro-q', 'communes')}
  <dsfr-data-map id="carte-q" center="46.6,2.3" zoom="5" height="300px" tiles="osm">
    <dsfr-data-map-layer id="couche-q" source="s-choro-q" type="circle"
      lat-field="lat" lon-field="lon" fill-field="taux"
      classes="4" method="quantile"></dsfr-data-map-layer>
    <dsfr-data-map-legend for="couche-q" label="Taux"></dsfr-data-map-legend>
  </dsfr-data-map>`,
    expects: [{ kind: 'legend', id: 'couche-q', field: 'taux', classes: 4, method: 'quantile' }],
  },

  {
    id: 'carte-bornes-manuelles',
    mode: 'deterministic',
    origin:
      '#685 — `breaks="20,40,60"` impose quatre classes aux bornes choisies par la page ; les extrémités restent celles des données.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-choro-m', 'communes')}
  <dsfr-data-map id="carte-m" center="46.6,2.3" zoom="5" height="300px" tiles="osm">
    <dsfr-data-map-layer id="couche-m" source="s-choro-m" type="circle"
      lat-field="lat" lon-field="lon" fill-field="taux"
      breaks="20,40,60"></dsfr-data-map-layer>
    <dsfr-data-map-legend for="couche-m" label="Taux"></dsfr-data-map-legend>
  </dsfr-data-map>`,
    expects: [
      {
        kind: 'legend',
        id: 'couche-m',
        field: 'taux',
        classes: 4,
        method: 'manual',
        breaks: [20, 40, 60],
      },
    ],
  },

  // --------------------------------------- Carte : bandeau de troncature ----
  {
    id: 'carte-bandeau-troncature-amont',
    mode: 'deterministic',
    origin:
      '#1020 — `limit` de la source aligné sur `max-items` (le défaut de la Carto) : la couche reçoit exactement son plafond, rien ne dépasse, et le bandeau disparaissait alors que la carte ne montre que les 10 premiers enregistrements sur 48. Il relit désormais la meta de la source et donne les DEUX chiffres — affichés et total du jeu —, chacun relu seul.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  <dsfr-data-source id="s-plafond" api-type="tabular"
    resource="${RESSOURCE_TABULAR_AFFICHAGES}" limit="10"></dsfr-data-source>
  <dsfr-data-map id="carte-plafond" center="46.6,2.3" zoom="5" height="300px" tiles="osm">
    <dsfr-data-map-layer id="couche-plafond" source="s-plafond" type="circle"
      lat-field="lat" lon-field="lon" max-items="10"></dsfr-data-map-layer>
  </dsfr-data-map>`,
    expects: [
      {
        // Affichés : les 10 PREMIERS enregistrements, dans l'ordre du fichier.
        kind: 'text',
        id: 'carte-plafond',
        selector: '.dsfr-data-map__max-items-shown',
        numeric: true,
        agg: 'count',
        pipeline: [{ op: 'limit', n: 10 }],
      },
      {
        // Total : le jeu entier, que seule la meta de la source connaît.
        kind: 'text',
        id: 'carte-plafond',
        selector: '.dsfr-data-map__max-items-total',
        numeric: true,
        agg: 'count',
      },
    ],
  },

  {
    id: 'carte-agregat-par-territoire',
    mode: 'deterministic',
    origin:
      'Une choroplèthe posée sur un AGRÉGAT par territoire : les classes portent alors sur les moyennes de zone, pas sur les valeurs de départ. Le tableau à côté montre les mêmes agrégats.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-terr-agg', 'communes')}
  <dsfr-data-query id="q-terr" source="s-terr-agg" group-by="zone"
    aggregate="taux:avg:moyenne, lat:avg:lat, lon:avg:lon, code:count:nb"
    order-by="moyenne:desc"></dsfr-data-query>
  <dsfr-data-list id="l-terr" source="q-terr"
    columns="zone:Zone, moyenne:Taux moyen, nb:Communes" decimals="2"></dsfr-data-list>
  <dsfr-data-map id="carte-terr" center="46.6,2.3" zoom="5" height="300px" tiles="osm">
    <dsfr-data-map-layer id="couche-terr" source="q-terr" type="circle"
      lat-field="lat" lon-field="lon" fill-field="moyenne"
      classes="2" method="quantile"></dsfr-data-map-layer>
    <dsfr-data-map-legend for="couche-terr" label="Taux moyen"></dsfr-data-map-legend>
  </dsfr-data-map>`,
    expects: [
      {
        kind: 'list',
        id: 'l-terr',
        decimals: 2,
        columns: [
          { column: 'zone' },
          { column: 'moyenne', numeric: true },
          { column: 'nb', numeric: true },
        ],
        pipeline: [
          {
            op: 'group-by',
            by: 'zone',
            columns: {
              moyenne: { agg: 'avg', field: 'taux' },
              nb: { agg: 'count', field: 'code' },
            },
          },
          { op: 'order-by', column: 'moyenne', dir: 'desc' },
        ],
      },
      {
        kind: 'legend',
        id: 'couche-terr',
        field: 'moyenne',
        classes: 2,
        method: 'quantile',
        pipeline: [
          {
            op: 'group-by',
            by: 'zone',
            columns: { moyenne: { agg: 'avg', field: 'taux' } },
          },
          { op: 'order-by', column: 'moyenne', dir: 'desc' },
        ],
      },
    ],
  },

  // -------------------------------------------------------------- Liste ----
  {
    id: 'liste-page-deux',
    mode: 'deterministic',
    origin:
      'La page 2 d’un tableau de 48 lignes paginé par 20 : ce sont les lignes 21 à 40 de l’ordre attendu. Une pagination fausse (décalage d’une ligne, page recalculée depuis le début) ne se voit JAMAIS sur la page 1.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    query: 'page=2',
    markup: `
  ${source('s-page2', 'communes')}
  <dsfr-data-list id="l-page2" source="s-page2" columns="nom:Commune, population:Habitants"
    sort="population:desc" pagination="20" url-sync></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-page2',
        columns: [{ column: 'nom' }, { column: 'population', numeric: true }],
        pipeline: [
          { op: 'order-by', column: 'population', dir: 'desc' },
          { op: 'page', size: 20, number: 2 },
        ],
      },
    ],
  },

  {
    id: 'liste-tri-numerique',
    mode: 'deterministic',
    origin:
      'Tri décroissant d’une colonne NUMÉRIQUE : 641 915 passe avant 99 999, ce qu’un tri de chaînes fait exactement à l’envers.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-tri-num', 'communes')}
  <dsfr-data-list id="l-tri-num" source="s-tri-num" columns="nom:Commune, population:Habitants"
    sort="population:desc" pagination="8"></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-tri-num',
        columns: [{ column: 'nom' }, { column: 'population', numeric: true }],
        pipeline: [
          { op: 'order-by', column: 'population', dir: 'desc' },
          { op: 'page', size: 8, number: 1 },
        ],
      },
    ],
  },

  {
    id: 'liste-tri-texte-accentue',
    mode: 'deterministic',
    origin:
      'Tri alphabétique FRANÇAIS : « Écully » se range entre « Avignon » et « Étampes », pas après « Zutkerque ». Un tri par codes de caractères renvoie tous les accents en fin de liste.',
    feed: { kind: 'fixture', datasets: { main: LIBELLES } },
    markup: `
  ${source('s-tri-txt', 'libelles')}
  <dsfr-data-list id="l-tri-txt" source="s-tri-txt" columns="nom:Libellé, score:Score"
    sort="nom:asc"></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-tri-txt',
        columns: [{ column: 'nom' }, { column: 'score', numeric: true }],
        pipeline: [{ op: 'order-by', column: 'nom', dir: 'asc' }],
      },
    ],
  },

  {
    id: 'liste-tri-croissant',
    mode: 'deterministic',
    origin:
      'Le sens du tri est une donnée d’affichage à part entière : `asc` et `desc` sur la même colonne ne montrent pas les mêmes lignes en tête de page. La colonne triée n’est PAS croissante dans l’ordre des lignes reçues — sinon un tri absent rendrait exactement le même tableau.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-tri-asc', 'communes')}
  <dsfr-data-list id="l-tri-asc" source="s-tri-asc" columns="nom:Commune, taux:Taux"
    sort="taux:asc" pagination="6" decimals="2"></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-tri-asc',
        decimals: 2,
        columns: [{ column: 'nom' }, { column: 'taux', numeric: true }],
        pipeline: [
          { op: 'order-by', column: 'taux', dir: 'asc' },
          { op: 'page', size: 6, number: 1 },
        ],
      },
    ],
  },

  {
    id: 'liste-colonnes-auto',
    mode: 'deterministic',
    origin:
      '#255 — `columns-auto` complète les colonnes déclarées par les clés des données, dans leur ordre d’apparition : le schéma dynamique ne doit ni perdre ni réordonner une colonne.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-auto', 'communes')}
  <dsfr-data-query id="q-auto" source="s-auto" group-by="zone"
    aggregate="population:sum:pop, taux:avg:moyenne" order-by="pop:desc"></dsfr-data-query>
  <dsfr-data-list id="l-auto" source="q-auto" columns="zone:Zone" columns-auto decimals="2"></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-auto',
        decimals: 2,
        columns: [
          { column: 'zone' },
          { column: 'pop', numeric: true },
          { column: 'moyenne', numeric: true },
        ],
        pipeline: [
          {
            op: 'group-by',
            by: 'zone',
            columns: {
              pop: { agg: 'sum', field: 'population' },
              moyenne: { agg: 'avg', field: 'taux' },
            },
          },
          { op: 'order-by', column: 'pop', dir: 'desc' },
        ],
      },
    ],
  },

  {
    id: 'liste-decimales-des-cellules',
    mode: 'deterministic',
    origin:
      '#666 — `decimals` fixe les décimales des cellules numériques : des colonnes alignées, et un arrondi qui doit rester celui de la valeur.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-dec', 'communes')}
  <dsfr-data-query id="q-dec" source="s-dec" group-by="zone"
    aggregate="taux:avg:moyenne" order-by="moyenne:desc"></dsfr-data-query>
  <dsfr-data-list id="l-dec" source="q-dec" columns="zone:Zone, moyenne:Taux moyen"
    decimals="3"></dsfr-data-list>`,
    expects: [
      {
        kind: 'texts',
        id: 'l-dec',
        selector: 'tbody td:nth-child(2)',
        column: 'moyenne',
        numeric: true,
        decimals: 3,
        pattern: '^-?\\d+,\\d{3}$',
        pipeline: [
          { op: 'group-by', by: 'zone', columns: { moyenne: { agg: 'avg', field: 'taux' } } },
          { op: 'order-by', column: 'moyenne', dir: 'desc' },
        ],
      },
    ],
  },

  {
    id: 'liste-export-csv',
    mode: 'deterministic',
    origin:
      'Le FICHIER exporté, pas le tableau dont il part : en-tête aux libellés déclarés, une ligne par ligne affichée, dans l’ordre affiché. C’est ce fichier-là qu’un lecteur rouvrira six mois plus tard.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-csv', 'communes')}
  <dsfr-data-query id="q-csv" source="s-csv" group-by="zone"
    aggregate="population:sum:pop, code:count:nb" order-by="pop:desc"></dsfr-data-query>
  <dsfr-data-list id="l-csv" source="q-csv" columns="zone:Zone, pop:Habitants, nb:Communes"
    export="csv"></dsfr-data-list>`,
    expects: [
      {
        kind: 'csv',
        id: 'l-csv',
        columns: [
          { column: 'zone', label: 'Zone' },
          { column: 'pop', label: 'Habitants' },
          { column: 'nb', label: 'Communes' },
        ],
        pipeline: [
          {
            op: 'group-by',
            by: 'zone',
            columns: {
              pop: { agg: 'sum', field: 'population' },
              nb: { agg: 'count', field: 'code' },
            },
          },
          { op: 'order-by', column: 'pop', dir: 'desc' },
        ],
      },
    ],
  },

  // ------------------------------------------------- Podium et affichage ----
  {
    id: 'podium-classement',
    mode: 'deterministic',
    origin:
      'Un podium est un tri plus une troncature : les cinq premières valeurs, décroissantes, avec leurs libellés en face. Un décalage d’un rang met le bon chiffre sous le mauvais nom.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-podium', 'communes')}
  <dsfr-data-podium id="p-communes" source="s-podium"
    label-field="nom" value-field="population" max-items="5"></dsfr-data-podium>`,
    expects: [
      {
        kind: 'texts',
        id: 'p-communes',
        selector: '.dsfr-data-podium__label',
        column: 'nom',
        pipeline: [
          { op: 'order-by', column: 'population', dir: 'desc' },
          { op: 'limit', n: 5 },
        ],
      },
      {
        kind: 'texts',
        id: 'p-communes',
        selector: '.dsfr-data-podium__value',
        column: 'population',
        numeric: true,
        pattern: `^\\d{1,3}(?:${ESP}\\d{3})*$`,
        pipeline: [
          { op: 'order-by', column: 'population', dir: 'desc' },
          { op: 'limit', n: 5 },
        ],
      },
    ],
  },

  {
    id: 'podium-sans-tri',
    mode: 'deterministic',
    origin:
      '`no-sort` garde l’ordre reçu : le podium cesse de classer et se contente d’afficher. Un tri qui subsisterait malgré l’attribut mettrait les barres dans le désordre du contrat.',
    feed: { kind: 'fixture', datasets: { main: LIBELLES } },
    markup: `
  ${source('s-podium-brut', 'libelles')}
  <dsfr-data-podium id="p-brut" source="s-podium-brut" no-sort
    label-field="nom" value-field="score" max-items="4"></dsfr-data-podium>`,
    expects: [
      {
        kind: 'texts',
        id: 'p-brut',
        selector: '.dsfr-data-podium__label',
        column: 'nom',
        pipeline: [{ op: 'limit', n: 4 }],
      },
      {
        kind: 'texts',
        id: 'p-brut',
        selector: '.dsfr-data-podium__value',
        column: 'score',
        numeric: true,
        pipeline: [{ op: 'limit', n: 4 }],
      },
    ],
  },

  {
    id: 'display-gabarit-et-format',
    mode: 'deterministic',
    origin:
      '#663 — un gabarit `{{champ}}` rend la valeur brute, `{{champ:number}}` la met au format fr-FR. Les deux sortent de la même ligne et doivent désigner la même commune.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    markup: `
  ${source('s-display', 'communes')}
  <dsfr-data-query id="q-display" source="s-display"
    where="zone:eq:Nord" order-by="population:desc" limit="6"></dsfr-data-query>
  <dsfr-data-display id="d-communes" source="q-display" cols="3">
    <template>
      <div class="fr-card">
        <p data-cellule-nom>{{nom}}</p>
        <p data-cellule-pop>{{population:number}}</p>
      </div>
    </template>
  </dsfr-data-display>`,
    expects: [
      {
        kind: 'texts',
        id: 'd-communes',
        selector: '[data-cellule-nom]',
        column: 'nom',
        pipeline: [
          { op: 'filter', filters: [{ field: 'zone', op: 'eq', value: 'Nord' }] },
          { op: 'order-by', column: 'population', dir: 'desc' },
          { op: 'limit', n: 6 },
        ],
      },
      {
        kind: 'texts',
        id: 'd-communes',
        selector: '[data-cellule-pop]',
        column: 'population',
        numeric: true,
        pattern: `^\\d{1,3}(?:${ESP}\\d{3})*$`,
        pipeline: [
          { op: 'filter', filters: [{ field: 'zone', op: 'eq', value: 'Nord' }] },
          { op: 'order-by', column: 'population', dir: 'desc' },
          { op: 'limit', n: 6 },
        ],
      },
    ],
  },

  {
    id: 'display-page-deux',
    mode: 'deterministic',
    origin:
      'La page 2 d’un affichage par gabarit : mêmes règles que le tableau, autre composant — et le même défaut y serait invisible en page 1.',
    feed: { kind: 'fixture', datasets: { main: COMMUNES } },
    query: 'page=2',
    markup: `
  ${source('s-display2', 'communes')}
  <dsfr-data-display id="d-page2" source="s-display2" cols="3" pagination="6" url-sync>
    <template>
      <p data-cellule-nom>{{nom}}</p>
    </template>
  </dsfr-data-display>`,
    expects: [
      {
        kind: 'texts',
        id: 'd-page2',
        selector: '[data-cellule-nom]',
        column: 'nom',
        pipeline: [{ op: 'page', size: 6, number: 2 }],
      },
    ],
  },
];

export const AFFICHAGES: Manifest = { domain: 'affichages', checks: CHECKS };
