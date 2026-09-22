/**
 * Contrôles DÉTERMINISTES du lot « adaptateurs et sources » — bloquants sur
 * chaque PR, zéro réseau.
 *
 * Ce qui est éprouvé ici n'est pas le calcul (c'est `query.ts`) mais le
 * CHEMIN D'ENTRÉE : chaque adaptateur doit rendre les mêmes lignes et les
 * mêmes agrégats que l'oracle qui lit la fixture brute, quelles que soient la
 * pagination, l'enveloppe, le plafond, l'aplatissement ou le format des
 * nombres qu'il a fallu traverser. Les travers réels des API sont dans les
 * fixtures : `total_count` menteur sur un `group_by` (#641), `results: []` sur
 * un filtre qui ne garde rien, `where` ODSQL à parenthèses et guillemets
 * imbriqués (#767), observations SDMX et libellés en DEUX ressources (#586),
 * champs Grist sous `fields`, nombres écrits à la française.
 *
 * L'oracle n'aplatit rien et ne pagine rien : les fixtures sont écrites à
 * l'envers (lignes plates d'abord, enveloppe ensuite, voir
 * `fixtures-adaptateurs.ts`), de sorte qu'un aplatissement manqué ou une page
 * oubliée se voie comme un écart, pas comme une commodité partagée.
 *
 * Chaque contrôle a été vérifié EN ÉCHEC sur un défaut injecté dans la lib
 * (voir `tools/oracle/README.md`, « prouver une mutation »).
 */
import type { Check, Manifest } from '../../tools/oracle/manifest.js';
import {
  CLE_ODS,
  DATASET_ADAPT,
  DATASET_INSEE,
  GRIST_LIGNES,
  HOTE_INSEE,
  HOTE_JSON,
  HOTE_ODS_ADAPT,
  JSON_LIGNES,
  MELODI_LIGNES,
  RESSOURCE_TABULAR,
  RESSOURCE_TABULAR_LONGUE,
  TERRITOIRES_ADAPT,
  TERRITOIRES_TABULAR_LONG,
  URL_GRIST,
} from './fixtures-adaptateurs.js';

/** La source Opendatasoft du lot, sans le mode de chargement. */
const SOURCE_ODS = `api-type="opendatasoft" base-url="${HOTE_ODS_ADAPT}" dataset-id="${DATASET_ADAPT}"`;

const CHECKS: Check[] = [
  // -------------------------------------------------------------------------
  // Opendatasoft
  // -------------------------------------------------------------------------
  {
    id: 'ods-records-pagination',
    mode: 'deterministic',
    origin:
      'Opendatasoft `/records` : 137 lignes servies en deux pages de 100 (`offset` cumulé). Une pagination qui s’arrête à la première page rend un compte plausible et faux.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES_ADAPT } },
    markup: `
  <dsfr-data-source id="s-pag" ${SOURCE_ODS} max-records="500"></dsfr-data-source>
  <dsfr-data-kpi id="k-pag-n" source="s-pag" value="count" format="nombre" label="Lignes"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-pag-pop" source="s-pag" value="population:sum" format="nombre" label="Population"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-pag-aca" source="s-pag" value="academie:distinct" format="nombre" label="Académies"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-pag-n', agg: 'count' },
      { kind: 'kpi', id: 'k-pag-pop', agg: 'sum', field: 'population' },
      { kind: 'kpi', id: 'k-pag-aca', agg: 'distinct', field: 'academie' },
    ],
  },

  {
    id: 'ods-plafond-max-records',
    mode: 'deterministic',
    origin:
      '#233 — `max-records` borne la requête ENTIÈRE : la seconde page ne demande que le reste (100 + 20), et la page n’affiche jamais plus que le plafond.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES_ADAPT } },
    markup: `
  <dsfr-data-source id="s-cap" ${SOURCE_ODS} max-records="120"></dsfr-data-source>
  <dsfr-data-kpi id="k-cap-n" source="s-cap" value="count" format="nombre" label="Lignes"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-cap-pop" source="s-cap" value="population:sum" format="nombre" label="Population"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-cap-n',
        agg: 'count',
        pipeline: [{ op: 'limit', n: 120 }],
        // Le plafond tronque, la valeur affichée est celle du tronçon, et la
        // bibliothèque le DIT : « value="count" sur "s-cap" compte 120 lignes
        // reçues, mais l'amont en détient 137 » (#881 ; AM-002 répondu pour
        // un KPI `count`). L'invariant tient par le diagnostic.
        invariants: [{ kind: 'not-truncated' }],
      },
      {
        kind: 'kpi',
        id: 'k-cap-pop',
        agg: 'sum',
        field: 'population',
        pipeline: [{ op: 'limit', n: 120 }],
      },
    ],
  },

  {
    id: 'ods-plafond-sans-compteur',
    mode: 'deterministic',
    origin:
      '#881, AM-002 — le même plafond, mais SANS KPI `count` en aval : c’est le KPI qui avertissait (« compte 120 lignes reçues, mais l’amont en détient 137 »), pas la source. Une page qui ne compte pas — une somme, un graphique — charge un tronçon sans qu’un mot ne soit dit. L’invariant `not-truncated` lit les lignes émises par la source et les silences de la page.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES_ADAPT } },
    markup: `
  <dsfr-data-source id="s-cap2" ${SOURCE_ODS} max-records="120"></dsfr-data-source>
  <dsfr-data-kpi id="k-cap2-pop" source="s-cap2" value="population:sum" format="nombre" label="Population"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'rows',
        id: 's-cap2',
        key: 'code_dept',
        columns: ['population'],
        pipeline: [{ op: 'limit', n: 120 }],
        invariants: [
          {
            kind: 'not-truncated',
            skip: 'DÉFAUT (AM-002, #881) — `max-records="120"` sur 137 lignes, sans KPI `count` : 120 lignes émises par la source, et aucun diagnostic (ni marqueur, ni console). Seul un KPI `count` avertit ; une somme ou un graphique charge un tronçon en silence. Attendu : un mot de la SOURCE quand `max-records` borne un jeu qui le dépasse. Issue à ouvrir par la supervision.',
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-cap2-pop',
        agg: 'sum',
        field: 'population',
        pipeline: [{ op: 'limit', n: 120 }],
      },
    ],
  },

  {
    id: 'ods-export-plafond-et-troncature',
    mode: 'deterministic',
    origin:
      '#689 / ADR-106 — `fetch-mode="export"` charge tout en une requête et demande `plafond + 1` pour détecter la troncature : la ligne excédentaire sert à SAVOIR, jamais à être affichée.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES_ADAPT } },
    markup: `
  <dsfr-data-source id="s-exp" ${SOURCE_ODS} fetch-mode="export" max-records="50"></dsfr-data-source>
  <dsfr-data-kpi id="k-exp-n" source="s-exp" value="count" format="nombre" label="Lignes"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-exp-pop" source="s-exp" value="population:sum" format="nombre" label="Population"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-exp-n', agg: 'count', pipeline: [{ op: 'limit', n: 50 }] },
      {
        kind: 'kpi',
        id: 'k-exp-pop',
        agg: 'sum',
        field: 'population',
        pipeline: [{ op: 'limit', n: 50 }],
      },
    ],
  },

  {
    id: 'ods-group-by-total-count-menteur',
    mode: 'deterministic',
    origin:
      '#641 — sur une requête `group_by`, Opendatasoft renvoie un `total_count` égal à la TAILLE DE PAGE, pas au nombre de groupes. Le prendre pour argent comptant arrête la pagination à 100 groupes sur 137, et rien ne le dit.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES_ADAPT } },
    markup: `
  <dsfr-data-source id="s-grp" ${SOURCE_ODS}
    group-by="region" aggregate="population:sum:pop"></dsfr-data-source>
  <dsfr-data-kpi id="k-grp-n" source="s-grp" value="count" format="nombre" label="Groupes"></dsfr-data-kpi>
  <dsfr-data-query id="q-grp" source="s-grp"></dsfr-data-query>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-grp-n',
        agg: 'count',
        pipeline: [
          { op: 'group-by', by: 'region', columns: { pop: { agg: 'sum', field: 'population' } } },
        ],
      },
      {
        kind: 'rows',
        id: 'q-grp',
        key: 'region',
        columns: ['pop'],
        pipeline: [
          { op: 'group-by', by: 'region', columns: { pop: { agg: 'sum', field: 'population' } } },
        ],
      },
    ],
  },

  {
    id: 'ods-agregat-seul-et-filtre-vide',
    mode: 'deterministic',
    origin:
      '#810 — `select="count(*) as n"` sans `group-by` : une seule requête, une seule ligne. Et quand le filtre ne garde rien, le portail renvoie `[]` — la ligne est SYNTHÉTISÉE (`count` à 0), sinon le KPI n’affiche rien du tout.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES_ADAPT } },
    markup: `
  <dsfr-data-source id="s-agg" ${SOURCE_ODS}
    select="count(*) as n, sum(population) as pop"></dsfr-data-source>
  <dsfr-data-kpi id="k-agg-n" source="s-agg" value="n:sum" format="nombre" label="Lignes"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-agg-pop" source="s-agg" value="pop:sum" format="nombre" label="Population"></dsfr-data-kpi>
  <dsfr-data-source id="s-agg-vide" ${SOURCE_ODS}
    select="count(*) as n" where="pays_iso2 = &quot;ZZ&quot;"></dsfr-data-source>
  <dsfr-data-kpi id="k-agg-vide" source="s-agg-vide" value="n:min" format="nombre" label="Aucun"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-agg-n',
        agg: 'sum',
        field: 'n',
        pipeline: [{ op: 'global', columns: { n: { agg: 'count' } } }],
      },
      {
        kind: 'kpi',
        id: 'k-agg-pop',
        agg: 'sum',
        field: 'pop',
        pipeline: [{ op: 'global', columns: { pop: { agg: 'sum', field: 'population' } } }],
      },
      {
        // `min` et non `sum` : sans la ligne synthétisée, une somme de rien
        // vaut encore zéro et le contrôle ne verrait pas la différence. Un
        // minimum de rien, lui, n'existe pas — et le KPI n'affiche plus rien.
        kind: 'kpi',
        id: 'k-agg-vide',
        agg: 'min',
        field: 'n',
        pipeline: [
          { op: 'filter', filters: [{ field: 'pays_iso2', op: 'eq', value: 'ZZ' }] },
          { op: 'global', columns: { n: { agg: 'count' } } },
        ],
      },
    ],
  },

  {
    id: 'ods-where-odsql-parentheses',
    mode: 'deterministic',
    origin:
      '#767 — un `where` ODSQL brut part TEL QUEL : ses parenthèses groupent, et l’apostrophe d’un libellé à l’intérieur d’un littéral entre guillemets n’a rien à voir avec la fin du littéral. Sur-échapper la clause entière la rend illisible au portail.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES_ADAPT } },
    markup: `
  <dsfr-data-source id="s-ou" ${SOURCE_ODS} max-records="500"
    where="((region = &quot;Val-d'Oise&quot;) and (pays_iso2 = &quot;FR&quot;)) and (population > 500000)"></dsfr-data-source>
  <dsfr-data-kpi id="k-ou-n" source="s-ou" value="count" format="nombre" label="Lignes"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-ou-pop" source="s-ou" value="population:sum" format="nombre" label="Population"></dsfr-data-kpi>`,
    expects: (
      [
        ['k-ou-n', 'count', undefined],
        ['k-ou-pop', 'sum', 'population'],
      ] as const
    ).map(([id, agg, field]) => ({
      kind: 'kpi' as const,
      id,
      agg,
      field,
      pipeline: [
        {
          op: 'filter' as const,
          filters: [
            { field: 'region', op: 'eq' as const, value: "Val-d'Oise" },
            { field: 'pays_iso2', op: 'eq' as const, value: 'FR' },
            { field: 'population', op: 'gt' as const, value: 500000 },
          ],
        },
      ],
    })),
  },

  {
    id: 'ods-facettes-serveur-et-cle-en-entete',
    mode: 'deterministic',
    origin:
      '#655 — facettes calculées par le serveur (`/facets`) sur une source authentifiée : les lignes affichées restent celles du jeu entier, et la clé voyage en EN-TÊTE. Le faux serveur REFUSE toute URL qui la porterait — une clé dans une query string finit dans les journaux du proxy.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES_ADAPT } },
    markup: `
  <dsfr-data-source id="s-cle" ${SOURCE_ODS} max-records="500"
    headers='{"apikey":"${CLE_ODS}"}'></dsfr-data-source>
  <dsfr-data-facets id="f-cle" source="s-cle" fields="pays_iso2, academie" server-facets></dsfr-data-facets>
  <dsfr-data-kpi id="k-cle-n" source="s-cle" value="count" format="nombre" label="Lignes"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-cle-pop" source="s-cle" value="population:sum" format="nombre" label="Population"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-cle-n', agg: 'count' },
      { kind: 'kpi', id: 'k-cle-pop', agg: 'sum', field: 'population' },
    ],
  },

  // -------------------------------------------------------------------------
  // Tabular (tabular-api.data.gouv.fr)
  // -------------------------------------------------------------------------
  {
    id: 'tabular-pagination-links-next',
    mode: 'deterministic',
    origin:
      'Tabular pagine par `page` et annonce la suite dans `links.next` : 411 lignes en trois pages de 200, le maximum de l’API (#1019). `meta.total` est un repère, pas une autorisation d’arrêter.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES_TABULAR_LONG } },
    markup: `
  <dsfr-data-source id="s-tab" api-type="tabular" resource="${RESSOURCE_TABULAR_LONGUE}"></dsfr-data-source>
  <dsfr-data-kpi id="k-tab-n" source="s-tab" value="count" format="nombre" label="Lignes"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-tab-pop" source="s-tab" value="population:sum" format="nombre" label="Population"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-tab-dept" source="s-tab" value="code_dept:distinct" format="nombre" label="Départements"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-tab-n', agg: 'count' },
      { kind: 'kpi', id: 'k-tab-pop', agg: 'sum', field: 'population' },
      { kind: 'kpi', id: 'k-tab-dept', agg: 'distinct', field: 'code_dept' },
    ],
  },

  {
    id: 'tabular-filtres-delegues',
    mode: 'deterministic',
    origin:
      'Les opérateurs colon sont traduits en paramètres Tabular : `gt` devient `__strictly_greater`, pas `__greater`. Un seuil qui glisse d’un cran ne change qu’une ligne — et ne se voit sur aucun écran.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES_ADAPT } },
    markup: `
  <dsfr-data-source id="s-tab-f" api-type="tabular" resource="${RESSOURCE_TABULAR}"
    where="pays_iso2:eq:FR, population:gt:902000"></dsfr-data-source>
  <dsfr-data-kpi id="k-tab-f-n" source="s-tab-f" value="count" format="nombre" label="Lignes"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-tab-f-min" source="s-tab-f" value="population:min" format="nombre" label="Minimum"></dsfr-data-kpi>`,
    expects: (
      [
        ['k-tab-f-n', 'count', undefined],
        ['k-tab-f-min', 'min', 'population'],
      ] as const
    ).map(([id, agg, field]) => ({
      kind: 'kpi' as const,
      id,
      agg,
      field,
      pipeline: [
        {
          op: 'filter' as const,
          filters: [
            { field: 'pays_iso2', op: 'eq' as const, value: 'FR' },
            { field: 'population', op: 'gt' as const, value: 902000 },
          ],
        },
      ],
    })),
  },

  {
    id: 'tabular-group-by-non-delegable',
    mode: 'deterministic',
    origin:
      '#289 — Tabular ne sait pas compter des valeurs distinctes : l’adaptateur REFUSE de déléguer, rapatrie les lignes brutes et laisse le client regrouper. Déléguer quand même rendrait des colonnes muettes.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES_ADAPT } },
    markup: `
  <dsfr-data-source id="s-tab-g" api-type="tabular" resource="${RESSOURCE_TABULAR}"></dsfr-data-source>
  <dsfr-data-query id="q-tab-g" source="s-tab-g" group-by="academie"
    aggregate="code_dept:distinct:nb, population:sum:pop" order-by="pop:desc"></dsfr-data-query>
  <dsfr-data-list id="l-tab-g" source="q-tab-g"
    columns="academie:Académie, pop:Population, nb:Départements"></dsfr-data-list>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-tab-g',
        key: 'academie',
        columns: ['nb', 'pop'],
        pipeline: [
          {
            op: 'group-by',
            by: 'academie',
            columns: {
              nb: { agg: 'distinct', field: 'code_dept' },
              pop: { agg: 'sum', field: 'population' },
            },
          },
          { op: 'order-by', column: 'pop', dir: 'desc' },
        ],
      },
      {
        kind: 'list',
        id: 'l-tab-g',
        columns: [
          { column: 'academie' },
          { column: 'pop', numeric: true },
          { column: 'nb', numeric: true },
        ],
        pipeline: [
          {
            op: 'group-by',
            by: 'academie',
            columns: {
              nb: { agg: 'distinct', field: 'code_dept' },
              pop: { agg: 'sum', field: 'population' },
            },
          },
          { op: 'order-by', column: 'pop', dir: 'desc' },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // INSEE Melodi — deux ressources, un seul aplatissement
  // -------------------------------------------------------------------------
  {
    id: 'insee-melodi-aplatissement-et-libelles',
    mode: 'deterministic',
    origin:
      '#586 — les observations SDMX sont aplaties (`measures.OBS_VALUE_NIVEAU.value` devient `OBS_VALUE`) et leurs codes traduits depuis une SECONDE ressource, `/range`, jointe sur l’`id` géographique (`2025-DEP-01`) et non sur le code court. Un code sans libellé reste tel quel et n’ouvre pas de colonne `_CODE`.',
    feed: { kind: 'fixture', datasets: { main: MELODI_LIGNES } },
    markup: `
  <dsfr-data-source id="s-insee" api-type="insee"
    base-url="${HOTE_INSEE}" dataset-id="${DATASET_INSEE}"></dsfr-data-source>
  <dsfr-data-kpi id="k-insee-obs" source="s-insee" value="OBS_VALUE:sum" format="nombre" label="Décès"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-insee-geo" source="s-insee" value="GEO:distinct" format="nombre" label="Territoires"></dsfr-data-kpi>
  <dsfr-data-query id="q-insee" source="s-insee" group-by="GEO"
    aggregate="OBS_VALUE:sum:total, GEO_CODE:distinct:codes" order-by="total:desc"></dsfr-data-query>
  <dsfr-data-list id="l-insee" source="q-insee"
    columns="GEO:Territoire, total:Deces, codes:Codes"></dsfr-data-list>`,
    expects: [
      { kind: 'kpi', id: 'k-insee-obs', agg: 'sum', field: 'OBS_VALUE' },
      { kind: 'kpi', id: 'k-insee-geo', agg: 'distinct', field: 'GEO' },
      {
        kind: 'rows',
        id: 'q-insee',
        key: 'GEO',
        columns: ['total', 'codes'],
        pipeline: [
          {
            op: 'group-by',
            by: 'GEO',
            columns: {
              total: { agg: 'sum', field: 'OBS_VALUE' },
              codes: { agg: 'distinct', field: 'GEO_CODE' },
            },
          },
          { op: 'order-by', column: 'total', dir: 'desc' },
        ],
      },
      {
        kind: 'list',
        id: 'l-insee',
        columns: [
          { column: 'GEO' },
          { column: 'total', numeric: true },
          { column: 'codes', numeric: true },
        ],
        pipeline: [
          {
            op: 'group-by',
            by: 'GEO',
            columns: {
              total: { agg: 'sum', field: 'OBS_VALUE' },
              codes: { agg: 'distinct', field: 'GEO_CODE' },
            },
          },
          { op: 'order-by', column: 'total', dir: 'desc' },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Grist — des champs imbriqués sous `fields`
  // -------------------------------------------------------------------------
  {
    id: 'grist-champs-imbriques',
    mode: 'deterministic',
    origin:
      '#482 — les colonnes Grist vivent sous `fields` : l’aplatissement doit recopier leurs noms tels quels, apostrophes, espaces et accents compris. Une clé reconstruite plutôt que recopiée rend une colonne vide, pas une erreur.',
    feed: { kind: 'fixture', datasets: { main: GRIST_LIGNES } },
    markup: `
  <dsfr-data-source id="s-grist" api-type="grist" base-url="${URL_GRIST}"></dsfr-data-source>
  <dsfr-data-kpi id="k-grist-n" source="s-grist" value="count" format="nombre" label="Lignes"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-grist-pop" source="s-grist" value="Population:sum" format="nombre" label="Population"></dsfr-data-kpi>
  <dsfr-data-list id="l-grist" source="s-grist"
    columns="Region:Region, Nom de l'unité:Unite, Population:Population"></dsfr-data-list>`,
    expects: [
      { kind: 'kpi', id: 'k-grist-n', agg: 'count' },
      { kind: 'kpi', id: 'k-grist-pop', agg: 'sum', field: 'Population' },
      {
        kind: 'list',
        id: 'l-grist',
        pipeline: [],
        columns: [
          { column: 'Region' },
          { column: "Nom de l'unité" },
          { column: 'Population', numeric: true },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // JSON générique
  // -------------------------------------------------------------------------
  {
    id: 'json-generique-enveloppe-et-decimale-francaise',
    mode: 'deterministic',
    origin:
      'Une API quelconque rend son tableau au fond d’une enveloppe (`transform`), et ses colonnes numériques EN CHAÎNES, à la française : « 12 000,05 ». Lue comme un point décimal, la somme est fausse d’un facteur cent sans le moindre message.',
    feed: { kind: 'fixture', datasets: { main: JSON_LIGNES } },
    markup: `
  <dsfr-data-source id="s-json" url="${HOTE_JSON}/enveloppe" transform="resultats.lignes"></dsfr-data-source>
  <dsfr-data-kpi id="k-json-n" source="s-json" value="count" format="nombre" label="Lignes"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-json-mt" source="s-json" value="montant:sum" format="decimal" decimals="2" label="Montant"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-json-eff" source="s-json" value="effectif:sum" format="nombre" label="Effectif"></dsfr-data-kpi>
  <dsfr-data-query id="q-json" source="s-json" group-by="zone"
    aggregate="montant:sum:total, effectif:sum:eff" order-by="total:desc"></dsfr-data-query>`,
    expects: [
      { kind: 'kpi', id: 'k-json-n', agg: 'count' },
      { kind: 'kpi', id: 'k-json-mt', agg: 'sum', field: 'montant', decimals: 2 },
      { kind: 'kpi', id: 'k-json-eff', agg: 'sum', field: 'effectif' },
      {
        kind: 'rows',
        id: 'q-json',
        key: 'zone',
        columns: ['total', 'eff'],
        pipeline: [
          {
            op: 'group-by',
            by: 'zone',
            columns: {
              total: { agg: 'sum', field: 'montant' },
              eff: { agg: 'sum', field: 'effectif' },
            },
          },
          { op: 'order-by', column: 'total', dir: 'desc' },
        ],
      },
    ],
  },
];

export const ADAPTATEURS: Manifest = { domain: 'adaptateurs', checks: CHECKS };
