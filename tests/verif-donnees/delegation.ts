/**
 * Contrôles DÉTERMINISTES de l'INVARIANT DE DÉLÉGATION (#836, #838).
 *
 * Une `dsfr-data-query` peut faire calculer son regroupement par le serveur
 * (`group_by` ODSQL, `champ__groupby` Tabular) ou le calculer elle-même sur les
 * lignes reçues. Les deux chemins doivent donner LE MÊME CHIFFRE — et le choix
 * entre eux ne se lit nulle part dans la page : ni dans le balisage, ni dans ce
 * qui est affiché. C'est ce qui rend ses défauts silencieux, et c'est pour cela
 * que ce domaine contrôle deux choses à la fois :
 *
 *   - les chiffres affichés, recalculés par l'oracle depuis les lignes brutes ;
 *   - les URL réellement appelées, qui disent SI la délégation a eu lieu.
 *
 * Un contrôle qui ne regarderait que les chiffres serait vert sur une page où
 * la délégation a réécrit les lignes d'un voisin (#765) : le chiffre de la
 * query, lui, reste juste. Un contrôle qui ne regarderait que les URL serait
 * vert sur une délégation correcte au mauvais jeu.
 *
 * Chaque contrôle a été vérifié EN ÉCHEC sur un défaut injecté dans la lib
 * (voir `tools/oracle/README.md`, « prouver une mutation »).
 */
import type { Check, Expect, Manifest, Step } from '../../tools/oracle/manifest.js';
import {
  DATASET,
  EX_AEQUO,
  HOTE_ODS,
  MESURES,
  RELAIS,
  RESSOURCE_TABULAR,
  RESSOURCE_TABULAR_EX_AEQUO,
  TERRITOIRES,
  urlJeu,
  urlJeuPagine,
} from './fixtures.js';
import {
  pairePaginee,
  RECORDS_ODS,
  sourceOds,
  sourceTabular,
  TAILLE_PAGE,
  urlsDe,
  type Forme,
} from './fixtures-delegation.js';
import { GRIST_LIGNES, URL_GRIST } from './fixtures-adaptateurs.js';

// ---------------------------------------------------------------------------
// 1. L'invariant : la même forme de query, avec et sans `server-side`
// ---------------------------------------------------------------------------

/**
 * Les quatre formes de `dsfr-data-query` du lot. Chacune donne DEUX contrôles
 * (sans puis avec `server-side` sur la source) : `server-side` change la façon
 * dont les lignes arrivent, jamais les chiffres qu'on lit.
 *
 * Toutes sont agrégées ou bornées par un `limit` : leur résultat tient dans une
 * page, seule condition pour que l'invariant ait un sens.
 */
const FORMES_ODS: Array<{ forme: Forme; urls: Expect[] }> = [
  {
    forme: {
      id: 'ods-groupe-somme',
      api: 'ods',
      origin:
        'Regroupement + somme + tri delegues au serveur ODS, la query etant SEULE lectrice de sa source (#765).',
      query: 'group-by="academie" aggregate="population:sum:pop" order-by="pop:desc"',
      colonnes: 'academie:Académie, pop:Population',
      expects: [
        {
          kind: 'rows',
          id: 'q',
          key: 'academie',
          columns: ['pop'],
          pipeline: [
            {
              op: 'group-by',
              by: 'academie',
              columns: { pop: { agg: 'sum', field: 'population' } },
            },
            { op: 'order-by', column: 'pop', dir: 'desc' },
          ],
        },
        {
          kind: 'list',
          id: 'l',
          columns: [{ column: 'academie' }, { column: 'pop', numeric: true }],
          pipeline: [
            {
              op: 'group-by',
              by: 'academie',
              columns: { pop: { agg: 'sum', field: 'population' } },
            },
            { op: 'order-by', column: 'pop', dir: 'desc' },
          ],
        },
      ],
    },
    urls: [urlsDe('group-by-delegue', 'ods', 'group_by=', 'last')],
  },
  {
    forme: {
      id: 'ods-moyenne-comptage',
      api: 'ods',
      origin:
        'Moyenne et comptage par pays, delegues : deux agregats dans le meme select ODSQL, un tri sur l’alias.',
      query:
        'group-by="pays_iso2" aggregate="population:avg:moyenne, population:count:lignes" order-by="moyenne:desc"',
      colonnes: 'pays_iso2:Pays, moyenne:Population moyenne, lignes:Lignes',
      expects: [
        {
          kind: 'rows',
          id: 'q',
          key: 'pays_iso2',
          columns: ['moyenne', 'lignes'],
          pipeline: [
            {
              op: 'group-by',
              by: 'pays_iso2',
              columns: {
                moyenne: { agg: 'avg', field: 'population' },
                lignes: { agg: 'count', field: 'population' },
              },
            },
            { op: 'order-by', column: 'moyenne', dir: 'desc' },
          ],
        },
      ],
    },
    urls: [urlsDe('select-delegue', 'ods', 'avg(population) as moyenne', 'last')],
  },
  {
    forme: {
      id: 'ods-filtre-groupe-limite',
      api: 'ods',
      origin:
        'Filtre + regroupement + tri + limite : le `where` part en ODSQL, la limite reste cote client (elle n’est jamais deleguee).',
      query:
        'where="pays_iso2:eq:FR" group-by="code_reg" aggregate="population:sum:pop" order-by="pop:desc" limit="5"',
      colonnes: 'code_reg:Région, pop:Population',
      expects: [
        {
          kind: 'rows',
          id: 'q',
          key: 'code_reg',
          columns: ['pop'],
          pipeline: [
            { op: 'filter', filters: [{ field: 'pays_iso2', op: 'eq', value: 'FR' }] },
            {
              op: 'group-by',
              by: 'code_reg',
              columns: { pop: { agg: 'sum', field: 'population' } },
            },
            { op: 'order-by', column: 'pop', dir: 'desc' },
            { op: 'limit', n: 5 },
          ],
        },
        {
          kind: 'list',
          id: 'l',
          columns: [{ column: 'code_reg' }, { column: 'pop', numeric: true }],
          pipeline: [
            { op: 'filter', filters: [{ field: 'pays_iso2', op: 'eq', value: 'FR' }] },
            {
              op: 'group-by',
              by: 'code_reg',
              columns: { pop: { agg: 'sum', field: 'population' } },
            },
            { op: 'order-by', column: 'pop', dir: 'desc' },
            { op: 'limit', n: 5 },
          ],
        },
      ],
    },
    urls: [urlsDe('where-delegue', 'ods', 'where=pays_iso2 = "FR"', 'last')],
  },
  {
    forme: {
      id: 'ods-distinct-max',
      api: 'ods',
      origin:
        'count(distinct) et max delegues, tri ascendant sur la colonne de regroupement — l’ordre affiche est celui du serveur.',
      query:
        'group-by="academie" aggregate="code_dept:distinct:departements, population:max:plus_peuple" order-by="academie:asc"',
      colonnes: 'academie:Académie, departements:Départements, plus_peuple:Maximum',
      expects: [
        {
          kind: 'rows',
          id: 'q',
          key: 'academie',
          columns: ['departements', 'plus_peuple'],
          pipeline: [
            {
              op: 'group-by',
              by: 'academie',
              columns: {
                departements: { agg: 'distinct', field: 'code_dept' },
                plus_peuple: { agg: 'max', field: 'population' },
              },
            },
            { op: 'order-by', column: 'academie', dir: 'asc' },
          ],
        },
      ],
    },
    urls: [urlsDe('distinct-delegue', 'ods', 'count(distinct code_dept)', 'last')],
  },
];

/**
 * Les mêmes formes sur Tabular, dont la syntaxe de délégation est tout autre
 * (`champ__groupby`, `champ__sum`, `champ__sort`) et qui nomme lui-même les
 * colonnes agrégées `champ__fonction` — d'où les alias par défaut du pipeline
 * (#269) plutôt que des alias propres, que l'API ne sait pas porter.
 */
const FORMES_TABULAR: Array<{ forme: Forme; urls: Expect[] }> = [
  {
    forme: {
      id: 'tabular-groupe-somme',
      api: 'tabular',
      origin:
        'Meme regroupement, meme somme, meme tri — sur Tabular : une autre syntaxe de delegation, le meme chiffre.',
      query: 'group-by="academie" aggregate="population:sum" order-by="population__sum:desc"',
      colonnes: 'academie:Académie, population__sum:Population',
      expects: [
        {
          kind: 'rows',
          id: 'q',
          key: 'academie',
          columns: ['population__sum'],
          pipeline: [
            {
              op: 'group-by',
              by: 'academie',
              columns: { population__sum: { agg: 'sum', field: 'population' } },
            },
            { op: 'order-by', column: 'population__sum', dir: 'desc' },
          ],
        },
        {
          kind: 'list',
          id: 'l',
          columns: [{ column: 'academie' }, { column: 'population__sum', numeric: true }],
          pipeline: [
            {
              op: 'group-by',
              by: 'academie',
              columns: { population__sum: { agg: 'sum', field: 'population' } },
            },
            { op: 'order-by', column: 'population__sum', dir: 'desc' },
          ],
        },
      ],
    },
    urls: [urlsDe('groupby-delegue', 'tabular', 'academie__groupby', 'last')],
  },
  {
    forme: {
      id: 'tabular-filtre-limite',
      api: 'tabular',
      origin:
        'Filtre delegue en dialecte colon (`champ__exact`), regroupement, tri et limite cliente.',
      query:
        'where="pays_iso2:eq:FR" group-by="code_reg" aggregate="population:sum" order-by="population__sum:desc" limit="5"',
      colonnes: 'code_reg:Région, population__sum:Population',
      expects: [
        {
          kind: 'rows',
          id: 'q',
          key: 'code_reg',
          columns: ['population__sum'],
          pipeline: [
            { op: 'filter', filters: [{ field: 'pays_iso2', op: 'eq', value: 'FR' }] },
            {
              op: 'group-by',
              by: 'code_reg',
              columns: { population__sum: { agg: 'sum', field: 'population' } },
            },
            { op: 'order-by', column: 'population__sum', dir: 'desc' },
            { op: 'limit', n: 5 },
          ],
        },
      ],
    },
    urls: [urlsDe('where-delegue-tabular', 'tabular', 'pays_iso2__exact=FR', 'last')],
  },
];

const PAIRES: Check[] = [...FORMES_ODS, ...FORMES_TABULAR].flatMap(({ forme, urls }) =>
  pairePaginee(forme, urls)
);

// ---------------------------------------------------------------------------
// 2. Qui délègue, et qui ne délègue pas (#765)
// ---------------------------------------------------------------------------

/** Le regroupement par académie, écrit une fois : trois contrôles s'en servent. */
const GROUPE_ACADEMIE: Step[] = [
  { op: 'group-by', by: 'academie', columns: { pop: { agg: 'sum', field: 'population' } } },
  { op: 'order-by', column: 'pop', dir: 'desc' },
];

const GROUPE_PAYS: Step[] = [
  { op: 'group-by', by: 'pays_iso2', columns: { pop: { agg: 'sum', field: 'population' } } },
  { op: 'order-by', column: 'pop', dir: 'desc' },
];

const PARTAGE: Check[] = [
  {
    id: 'seule-lectrice-delegue',
    mode: 'deterministic',
    origin:
      '#765, le sens qu’on oublie : SEULE lectrice de sa source, la query DOIT deleguer — et le chiffre delegue vaut celui que l’oracle recalcule sur les lignes brutes.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceOds('s-seule')}
  <dsfr-data-query id="q-seule" source="s-seule" group-by="academie"
    aggregate="population:sum:pop" order-by="pop:desc"></dsfr-data-query>
  <dsfr-data-kpi id="k-seule" source="q-seule" value="pop:max" format="nombre"
    label="Académie la plus peuplée"></dsfr-data-kpi>`,
    expects: [
      { kind: 'rows', id: 'q-seule', key: 'academie', columns: ['pop'], pipeline: GROUPE_ACADEMIE },
      {
        kind: 'kpi',
        id: 'k-seule',
        agg: 'max',
        field: 'pop',
        pipeline: GROUPE_ACADEMIE,
      },
      urlsDe('delegation-effective', 'ods', 'group_by=academie', 'last'),
    ],
  },

  {
    id: 'source-partagee-ne-delegue-pas',
    mode: 'deterministic',
    origin:
      '#765 — deux regroupements et un KPI sur UNE source paginee : plus personne ne delegue, et AUCUNE URL ne porte group_by. Le defaut mesure valait 11 au lieu de 3 080.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceOds('s-part')}
  <dsfr-data-query id="q-part-aca" source="s-part" group-by="academie"
    aggregate="population:sum:pop" order-by="pop:desc"></dsfr-data-query>
  <dsfr-data-query id="q-part-pays" source="s-part" group-by="pays_iso2"
    aggregate="population:sum:pop" order-by="pop:desc"></dsfr-data-query>
  <dsfr-data-kpi id="k-part" source="s-part" value="population:sum" format="nombre"
    label="Population totale"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-part-aca',
        key: 'academie',
        columns: ['pop'],
        pipeline: GROUPE_ACADEMIE,
      },
      {
        kind: 'rows',
        id: 'q-part-pays',
        key: 'pays_iso2',
        columns: ['pop'],
        pipeline: GROUPE_PAYS,
      },
      { kind: 'kpi', id: 'k-part', agg: 'sum', field: 'population' },
      urlsDe('aucune-delegation', 'ods', 'group_by=', 'none'),
    ],
  },

  {
    id: 'un-seul-lecteur-suffit',
    mode: 'deterministic',
    origin:
      '#765, le cas minimal : UNE query agregee et UN KPI sur la meme source. Un seul autre lecteur suffit a interdire la delegation — sinon le KPI compterait des groupes.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceOds('s-duo')}
  <dsfr-data-query id="q-duo" source="s-duo" group-by="academie"
    aggregate="population:sum:pop" order-by="pop:desc"></dsfr-data-query>
  <dsfr-data-kpi id="k-duo" source="s-duo" value="count" format="nombre" label="Lignes"></dsfr-data-kpi>`,
    expects: [
      { kind: 'rows', id: 'q-duo', key: 'academie', columns: ['pop'], pipeline: GROUPE_ACADEMIE },
      { kind: 'kpi', id: 'k-duo', agg: 'count' },
      urlsDe('aucune-delegation-duo', 'ods', 'group_by=', 'none'),
    ],
  },

  {
    id: 'lecteur-tardif-renegociation',
    mode: 'deterministic',
    origin:
      '#765 — le lecteur arrive APRES l’initialisation : la query avait deja delegue. L’evenement `dsfr-data-delegation-contested` doit liberer l’overlay, et la source revenir a des lignes brutes.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceOds('s-tard')}
  <dsfr-data-query id="q-tard" source="s-tard" group-by="academie"
    aggregate="population:sum:pop" order-by="pop:desc"></dsfr-data-query>
  <div id="accueil-kpi"></div>
  <script>
    // Le KPI n'est pas dans le document au montage : la query est alors seule
    // lectrice et delegue. Son arrivee conteste la delegation — c'est le seul
    // moment ou la renegociation joue.
    window.addEventListener('load', function () {
      setTimeout(function () {
        document.getElementById('accueil-kpi').innerHTML =
          '<dsfr-data-kpi id="k-tard" source="s-tard" value="count" format="nombre" label="Lignes"></dsfr-data-kpi>';
      }, 400);
    });
  </script>`,
    expects: [
      { kind: 'kpi', id: 'k-tard', agg: 'count' },
      { kind: 'rows', id: 'q-tard', key: 'academie', columns: ['pop'], pipeline: GROUPE_ACADEMIE },
      // La delegation a bien eu lieu…
      urlsDe('delegation-tentee', 'ods', 'group_by=', 'some'),
      // … puis a ete retiree : la page s'arrete sur une requete NON groupee.
      urlsDe('delegation-retiree', 'ods', 'group_by=', 'notLast'),
    ],
  },

  {
    id: 'query-tardive-renegociation',
    mode: 'deterministic',
    origin:
      '#765 — la renegociation, par le chemin qui la declenche vraiment : une SECONDE query arrive apres l’initialisation, trouve la chaine partagee, emet `dsfr-data-delegation-contested`, et la premiere doit LIBERER son overlay. Sans cela la source servirait des lignes groupees par academie a tout le monde.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceOds('s-reneg')}
  <dsfr-data-query id="q-reneg-aca" source="s-reneg" group-by="academie"
    aggregate="population:sum:pop" order-by="pop:desc"></dsfr-data-query>
  <div id="accueil"></div>
  <script>
    // Au montage, q-reneg-aca est SEULE lectrice : elle delegue, et la source
    // ne detient plus que huit lignes agregees. L'arrivee de la seconde query
    // conteste cette delegation — c'est tout l'objet de la renegociation.
    window.addEventListener('load', function () {
      setTimeout(function () {
        document.getElementById('accueil').innerHTML =
          '<dsfr-data-query id="q-reneg-pays" source="s-reneg" group-by="pays_iso2"' +
          ' aggregate="population:sum:pop" order-by="pop:desc"></dsfr-data-query>' +
          '<dsfr-data-kpi id="k-reneg" source="s-reneg" value="count" format="nombre"' +
          ' label="Lignes"></dsfr-data-kpi>';
      }, 400);
    });
  </script>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-reneg-pays',
        key: 'pays_iso2',
        columns: ['pop'],
        pipeline: GROUPE_PAYS,
      },
      {
        kind: 'rows',
        id: 'q-reneg-aca',
        key: 'academie',
        columns: ['pop'],
        pipeline: GROUPE_ACADEMIE,
      },
      { kind: 'kpi', id: 'k-reneg', agg: 'count' },
      // La delegation a eu lieu, puis a ete retiree : la page s'arrete sur une
      // requete NON groupee.
      urlsDe('renegociation-tentee', 'ods', 'group_by=', 'some'),
      urlsDe('overlay-libere', 'ods', 'group_by=', 'notLast'),
    ],
  },

  {
    id: 'relais-normalize',
    mode: 'deterministic',
    origin:
      'La commande de delegation remonte a travers un `dsfr-data-normalize` (relais) : la query delegue a la source qui fetch, deux maillons plus haut.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceOds('s-norm')}
  <dsfr-data-normalize id="n-norm" source="s-norm" numeric="population"></dsfr-data-normalize>
  <dsfr-data-query id="q-norm" source="n-norm" group-by="academie"
    aggregate="population:sum:pop" order-by="pop:desc"></dsfr-data-query>`,
    expects: [
      // L'INVARIANT a travers un relais : les chiffres sont les memes que sans
      // relais, quelle que soit la façon dont les lignes arrivent. Que la
      // commande atteigne bien la source est controle juste en dessous, sur
      // les URL (#855) — ici on garde les chiffres.
      { kind: 'rows', id: 'q-norm', key: 'academie', columns: ['pop'], pipeline: GROUPE_ACADEMIE },
    ],
  },

  {
    id: 'relais-normalize-devrait-deleguer',
    mode: 'deterministic',
    origin:
      'La commande de delegation devrait remonter a travers un `dsfr-data-normalize` jusqu’a la source qui fetch.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceOds('s-norm3')}
  <dsfr-data-normalize id="n-norm3" source="s-norm3" numeric="population"></dsfr-data-normalize>
  <dsfr-data-query id="q-norm3" source="n-norm3" group-by="academie"
    aggregate="population:sum:pop" order-by="pop:desc"></dsfr-data-query>`,
    expects: [
      { kind: 'rows', id: 'q-norm3', key: 'academie', columns: ['pop'], pipeline: GROUPE_ACADEMIE },
      urlsDe('delegation-relayee', 'ods', 'group_by=academie', 'last'),
    ],
  },

  {
    id: 'relais-normalize-partage',
    mode: 'deterministic',
    origin:
      '#765 a travers un relais : un KPI lit le `normalize` par lequel la commande remonterait. La chaine est partagee, personne ne delegue.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceOds('s-norm2')}
  <dsfr-data-normalize id="n-norm2" source="s-norm2" numeric="population"></dsfr-data-normalize>
  <dsfr-data-query id="q-norm2" source="n-norm2" group-by="academie"
    aggregate="population:sum:pop" order-by="pop:desc"></dsfr-data-query>
  <dsfr-data-kpi id="k-norm2" source="n-norm2" value="population:sum" format="nombre"
    label="Population"></dsfr-data-kpi>`,
    expects: [
      { kind: 'rows', id: 'q-norm2', key: 'academie', columns: ['pop'], pipeline: GROUPE_ACADEMIE },
      { kind: 'kpi', id: 'k-norm2', agg: 'sum', field: 'population' },
      urlsDe('aucune-delegation-relais', 'ods', 'group_by=', 'none'),
    ],
  },
];

// ---------------------------------------------------------------------------
// 3. Le plafond `max-records` et le total publié par l'amont (#810, #659)
// ---------------------------------------------------------------------------

const PLAFOND: Check[] = [
  {
    id: 'plafond-max-records-et-meta-total',
    mode: 'deterministic',
    origin:
      '#810 / #659 — la source est plafonnee a 50 lignes : un `count` compte les lignes CHARGEES (50), `meta:total` rend le total annonce par l’API (137). Les deux sont justes, ils ne repondent pas a la meme question.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceOds('s-plafond', { maxRecords: 50 })}
  <dsfr-data-kpi id="k-charge" source="s-plafond" value="count" format="nombre"
    label="Lignes chargées"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-total" source="s-plafond" value="meta:total" format="nombre"
    label="Total annoncé"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-somme-plafonnee" source="s-plafond" value="population:sum" format="nombre"
    label="Population chargée"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-charge', agg: 'count', pipeline: [{ op: 'limit', n: 50 }] },
      { kind: 'kpi', id: 'k-total', agg: 'count' },
      {
        kind: 'kpi',
        id: 'k-somme-plafonnee',
        agg: 'sum',
        field: 'population',
        pipeline: [{ op: 'limit', n: 50 }],
      },
    ],
  },

  {
    id: 'agregat-serveur-passe-le-plafond',
    mode: 'deterministic',
    origin:
      '#810 — le remede au plafond : un `select` purement agrege fait calculer la somme par le serveur, sur le jeu ENTIER, en une requete d’une ligne. Le plafond de 50 lignes ne l’atteint pas.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceOds('s-agrege', { maxRecords: 50, select: 'sum(population) as population__sum' })}
  <dsfr-data-kpi id="k-agrege" source="s-agrege" value="population__sum" format="nombre"
    label="Population totale"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-agrege', agg: 'sum', field: 'population' },
      urlsDe('select-agrege', 'ods', 'select=sum(population) as population__sum', 'all'),
    ],
  },

  {
    id: 'meta-total-tabular',
    mode: 'deterministic',
    origin:
      '#659 — `meta:total` sur Tabular : le total vient de `meta.total` de l’enveloppe, pas d’un comptage des lignes recues.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceTabular('s-tab-total')}
  <dsfr-data-kpi id="k-tab-total" source="s-tab-total" value="meta:total" format="nombre"
    label="Total annoncé"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-tab-count" source="s-tab-total" value="count" format="nombre"
    label="Lignes chargées"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-tab-total', agg: 'count' },
      { kind: 'kpi', id: 'k-tab-count', agg: 'count' },
    ],
  },
];

// ---------------------------------------------------------------------------
// 4. `require-where` : la source en attente, puis filtrée
// ---------------------------------------------------------------------------

const ATTENTE: Check[] = [
  {
    id: 'where-seul-delegue',
    mode: 'deterministic',
    origin:
      'Un `where` SANS regroupement : la clause doit partir au serveur (ODSQL), sinon la source rapatrie le jeu entier pour le filtrer dans le navigateur.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceOds('s-where')}
  <dsfr-data-query id="q-where" source="s-where" where="pays_iso2:eq:FR"></dsfr-data-query>
  <dsfr-data-kpi id="k-where" source="q-where" value="count" format="nombre"
    label="Territoires FR"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-where',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'pays_iso2', op: 'eq', value: 'FR' }] }],
      },
    ],
  },

  {
    id: 'where-delegue-apres-regeneration',
    mode: 'deterministic',
    origin:
      "#1164 — le Builder carto reecrit son apercu par `innerHTML` a chaque « Générer » : source et query renaissent SOUS LES MEMES IDS, et Chrome connecte les nouvelles instances AVANT de deconnecter les anciennes. L'ancienne query, encore inscrite, faisait passer la chaine pour partagee (le `where` restait client, sur les 50 lignes chargees : 8 au lieu de 20), puis effacait par id la clause que la nouvelle venait de poser. Deux regenerations : filtre ajoute, puis filtre constant.",
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  <template id="t-regen-filtre">
    ${sourceOds('s-regen', { maxRecords: 50 })}
    <dsfr-data-query id="q-regen" source="s-regen" where="pays_iso2:eq:FR"></dsfr-data-query>
    <dsfr-data-kpi id="k-regen" source="q-regen" value="count" format="nombre"
      label="Territoires FR"></dsfr-data-kpi>
  </template>
  <button id="b-regen" type="button"
    onclick="document.getElementById('apercu-regen').innerHTML = document.getElementById('t-regen-filtre').innerHTML">
    Générer</button>
  <div id="apercu-regen">
    ${sourceOds('s-regen', { maxRecords: 50 })}
    <dsfr-data-kpi id="k-regen-avant" source="s-regen" value="count" format="nombre"
      label="Lignes chargées"></dsfr-data-kpi>
  </div>`,
    actions: [
      { kind: 'click', selector: '#b-regen' },
      { kind: 'click', selector: '#b-regen' },
    ],
    expects: [
      {
        kind: 'kpi',
        id: 'k-regen',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'pays_iso2', op: 'eq', value: 'FR' }] }],
      },
      urlsDe('where-apres-regeneration', 'ods', 'where=pays_iso2 = "FR"', 'last'),
    ],
  },

  {
    id: 'where-garde-quand-seule-la-query-renait',
    mode: 'deterministic',
    origin:
      "#1164 — variante : la source reste, SEULE la query (et son afficheur) renait sous le meme id. La nouvelle reprend la cle d'overlay `query-<id>` de l'ancienne ; en partant, l'ancienne ne doit effacer que ce que l'homonyme ne delegue pas, sinon la source repart sans filtre (50 lignes au lieu de 20).",
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceOds('s-renait', { maxRecords: 50 })}
  <template id="t-renait">
    <dsfr-data-query id="q-renait" source="s-renait" where="pays_iso2:eq:FR"></dsfr-data-query>
    <dsfr-data-kpi id="k-renait" source="q-renait" value="count" format="nombre"
      label="Territoires FR"></dsfr-data-kpi>
  </template>
  <button id="b-renait" type="button"
    onclick="document.getElementById('apercu-renait').innerHTML = document.getElementById('t-renait').innerHTML">
    Générer</button>
  <div id="apercu-renait">
    <dsfr-data-query id="q-renait" source="s-renait" where="pays_iso2:eq:FR"></dsfr-data-query>
    <dsfr-data-kpi id="k-renait" source="q-renait" value="count" format="nombre"
      label="Territoires FR"></dsfr-data-kpi>
  </div>`,
    actions: [{ kind: 'click', selector: '#b-renait' }],
    expects: [
      {
        kind: 'kpi',
        id: 'k-renait',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'pays_iso2', op: 'eq', value: 'FR' }] }],
      },
      urlsDe('where-garde-query-renait', 'ods', 'where=pays_iso2 = "FR"', 'last'),
    ],
  },

  {
    id: 'where-seul-devrait-etre-delegue',
    mode: 'deterministic',
    origin:
      'Un `where` sans regroupement pourrait partir au serveur : c’est la clause la moins chere a deleguer, et celle qui evite le plus de lignes.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceOds('s-where2')}
  <dsfr-data-query id="q-where2" source="s-where2" where="pays_iso2:eq:FR"></dsfr-data-query>
  <dsfr-data-kpi id="k-where2" source="q-where2" value="count" format="nombre"
    label="Territoires FR"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-where2',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'pays_iso2', op: 'eq', value: 'FR' }] }],
      },
      urlsDe('where-seul-au-serveur', 'ods', 'where=pays_iso2 = "FR"', 'all'),
    ],
  },

  {
    id: 'require-where-filtre-par-delegation',
    mode: 'deterministic',
    origin:
      '#690 — la source ne charge rien tant qu’aucun filtre n’est arrive. Le `where` delegue par la query EST ce filtre : toutes les requetes partent filtrees, aucune ne rapatrie le jeu entier.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceOds('s-attente', { requireWhere: true })}
  <dsfr-data-query id="q-attente" source="s-attente" where="pays_iso2:eq:FR"></dsfr-data-query>
  <dsfr-data-kpi id="k-attente" source="q-attente" value="count" format="nombre"
    label="Territoires FR"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-attente',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'pays_iso2', op: 'eq', value: 'FR' }] }],
      },
      urlsDe('jamais-de-requete-nue', 'ods', 'where=pays_iso2 = "FR"', 'all'),
    ],
  },

  {
    id: 'require-where-contexte',
    mode: 'deterministic',
    origin:
      '#690 — meme attente, filtre venu d’un `dsfr-data-context` dont le controle est deja rempli au montage : le premier chiffre affiche est le chiffre filtre.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  <select class="fr-select" id="ui-pays">
    <option value="">Tous</option>
    <option value="FR">FR</option>
    <option value="DE">DE</option>
  </select>
  <script>
    // Rempli AVANT que la bibliotheque ne soit chargee (le module qui la
    // definit est differe) : le filtre est donc pose au montage, et non par un
    // geste posterieur dont l'instant serait imprevisible.
    document.getElementById('ui-pays').value = 'DE';
  </script>
  ${sourceOds('s-ctx', { requireWhere: true })}
  <dsfr-data-context id="ctx" sources="s-ctx">
    <dsfr-data-context-filter field="pays_iso2" operator="eq" ui="ui-pays"></dsfr-data-context-filter>
  </dsfr-data-context>
  <dsfr-data-kpi id="k-ctx" source="s-ctx" value="count" format="nombre" label="Territoires DE"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-ctx',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'pays_iso2', op: 'eq', value: 'DE' }] }],
      },
      urlsDe('contexte-filtre-des-le-depart', 'ods', 'where=', 'all'),
    ],
  },
];

// ---------------------------------------------------------------------------
// 4 bis. Tri INITIAL d'une liste en pagination serveur (#1178)
// ---------------------------------------------------------------------------

/**
 * `sort` posé sur une `dsfr-data-list` en `server-sort` : la flèche de tri
 * s'affichait sur l'en-tête, mais seul le CLIC envoyait `orderBy` à la source.
 * La première page était donc celle de l'ordre du serveur, sous une flèche qui
 * annonçait un autre ordre. Le tableau à 137 lignes en pages de 40 rend le
 * défaut visible dès la page 1 : ses 40 lignes ne sont pas les 40 premières
 * du tri.
 */
const TRI_INITIAL: Check[] = [
  {
    id: 'liste-tri-initial-serveur',
    mode: 'deterministic',
    origin:
      '#1178 — liste en `server-sort` avec `sort="population:asc"` : la PREMIERE requete porte deja le tri (`order_by`), la page 1 montre les 40 territoires les MOINS peuples. Le jeu est livre par ordre decroissant : sans le tri transmis, la page 1 montre l’inverse. Le tri etait affiche sur l’en-tete sans etre transmis a l’API au chargement.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceOds('s-tri-init', { serverSide: true })}
  <dsfr-data-list id="l-tri-init" source="s-tri-init" columns="region:Région, population:Population"
    sort="population:asc" server-sort></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-tri-init',
        columns: [{ column: 'region' }, { column: 'population', numeric: true }],
        pipeline: [
          { op: 'order-by', column: 'population', dir: 'asc' },
          { op: 'page', size: TAILLE_PAGE, number: 1 },
        ],
      },
      urlsDe('tri-initial-delegue', 'ods', 'order_by=population ASC', 'all'),
    ],
  },
];

// ---------------------------------------------------------------------------
// 4 ter. La délégation à travers la chaîne (#1199)
// ---------------------------------------------------------------------------

/** Source ODS qui porte DÉJÀ son regroupement : une ligne par académie, `n` = son compte. */
const SOURCE_GROUPEE = (id: string): string => `
  <dsfr-data-source id="${id}" api-type="opendatasoft" base-url="${HOTE_ODS}" dataset-id="${DATASET}"
    select="academie, count(*) as n" group-by="academie"></dsfr-data-source>`;

const COMPTE_PAR_ACADEMIE: Step[] = [
  { op: 'group-by', by: 'academie', columns: { n: { agg: 'count' } } },
];

const TRANSIT: Check[] = [
  {
    id: 'source-groupee-garde-son-regroupement',
    mode: 'deterministic',
    constats: ['BUG-026'],
    origin:
      '#1199, BUG-026 du banc — la source porte DÉJÀ son regroupement (`select="academie, count(*) as n" group-by="academie"`), un `normalize` de valeurs s\'intercale, et une query regroupe à nouveau. La query déléguait son `group-by` À TRAVERS le normalize et remplaçait celui de la source : le serveur regroupait les lignes brutes, et le KPI affichait un chiffre faux de deux ordres de grandeur. La query regroupe désormais les GROUPES de la source, côté client.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `${SOURCE_GROUPEE('s-grp')}
  <dsfr-data-normalize id="n-grp" source="s-grp" trim></dsfr-data-normalize>
  <dsfr-data-query id="q-grp" source="n-grp" group-by="academie" aggregate="n:sum:n"></dsfr-data-query>
  <dsfr-data-kpi id="k-grp" source="q-grp" value="n:sum" format="nombre" label="Territoires"></dsfr-data-kpi>`,
    expects: [
      { kind: 'rows', id: 'q-grp', key: 'academie', columns: ['n'], pipeline: COMPTE_PAR_ACADEMIE },
      { kind: 'kpi', id: 'k-grp', agg: 'count' },
      urlsDe('regroupement-de-la-source', 'ods', 'group_by=academie', 'all'),
      urlsDe('select-de-la-source', 'ods', 'select=academie, count(*) as n', 'all'),
    ],
  },

  {
    id: 'where-sur-alias-reste-client',
    mode: 'deterministic',
    constats: ['BUG-027'],
    origin:
      "#1199, BUG-027 du banc — `where=\"n:gte:18\"` vise l'alias `n` que la source FABRIQUE (`count(*) as n`). Délégué, il partait au portail AVANT le regroupement, sur des colonnes brutes où `n` n'existe pas : HTTP 400, et l'export du jeu était condamné pour toute la page. La clause reste côté client, sur les groupes.",
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `${SOURCE_GROUPEE('s-alias')}
  <dsfr-data-query id="q-alias" source="s-alias" where="n:gte:18"></dsfr-data-query>
  <dsfr-data-kpi id="k-alias" source="q-alias" value="count" format="nombre" label="Académies"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-alias',
        agg: 'count',
        pipeline: [
          ...COMPTE_PAR_ACADEMIE,
          { op: 'filter', filters: [{ field: 'n', op: 'gte', value: 18 }] },
        ],
      },
      urlsDe('alias-jamais-au-portail', 'ods', 'where=', 'none'),
    ],
  },

  {
    id: 'query-qui-renomme-bloque-la-delegation',
    mode: 'deterministic',
    constats: ['BUG-036'],
    origin:
      "#1199, BUG-036 du banc — `normalize(rename) → query → normalize(valeurs) → query group-by`. La remontée de `transformsSchema()` s'arrêtait sur la query intermédiaire, qui ne l'implémentait pas : la dernière query déléguait son `group-by` sous le nom RENOMMÉ, et l'API Tabular recevait `Academie__groupby` (toute la source en échec). La query répond désormais à la question, et la dernière regroupe côté client.",
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceTabular('s-36')}
  <dsfr-data-normalize id="n-36a" source="s-36" rename="academie:Academie"></dsfr-data-normalize>
  <dsfr-data-query id="q-36a" source="n-36a" where="Academie:isnotnull"></dsfr-data-query>
  <dsfr-data-normalize id="n-36b" source="q-36a" trim></dsfr-data-normalize>
  <dsfr-data-query id="q-36b" source="n-36b" group-by="Academie" aggregate="population:sum"></dsfr-data-query>
  <dsfr-data-kpi id="k-36" source="q-36b" value="count" format="nombre" label="Académies"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-36',
        agg: 'count',
        pipeline: [{ op: 'group-by', by: 'academie', columns: {} }],
      },
      urlsDe('aucun-groupby-renomme', 'tabular', '__groupby', 'none'),
    ],
  },
];

// ---------------------------------------------------------------------------
// 4 quater. Ce que l'API Tabular perd en silence (#1202)
// ---------------------------------------------------------------------------

/** La source Tabular du jeu à ex-æquo : 450 lignes, trois pages de 200. */
const SOURCE_EX_AEQUO = (id: string): string =>
  `<dsfr-data-source id="${id}" api-type="tabular" resource="${RESSOURCE_TABULAR_EX_AEQUO}"></dsfr-data-source>`;

/** URL de données de cette ressource : les seules que les contrôles du lot regardent. */
const DATA_EX_AEQUO = `/api/resources/${RESSOURCE_TABULAR_EX_AEQUO}/data/`;

const TABULAR_PERTES: Check[] = [
  {
    id: 'tabular-tri-pagine-sans-perte',
    mode: 'deterministic',
    constats: ['PG-033'],
    origin:
      "#1202, PG-033 du banc — l'API Tabular pagine par offset et ne trie que sur une clé : sur un champ non unique (`nombre`, cinq valeurs pour 450 lignes), des lignes passent d'une page à l'autre, en double ou jamais (101 lues, 99 distinctes, rejoué le 2026-09-27). Le faux serveur l'imite. Le jeu tient sous le plafond : l'adaptateur relit sans `__sort` et trie lui-même — chaque ligne une fois, aucune perdue.",
    feed: { kind: 'fixture', datasets: { main: EX_AEQUO } },
    markup: `
  ${SOURCE_EX_AEQUO('s-exaequo')}
  <dsfr-data-query id="q-exaequo" source="s-exaequo" order-by="nombre:desc"></dsfr-data-query>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-exaequo',
        key: 'id',
        columns: ['nombre'],
        pipeline: [{ op: 'order-by', column: 'nombre', dir: 'desc' }],
      },
      {
        kind: 'urls',
        id: 'tri-final-local',
        among: DATA_EX_AEQUO,
        contains: 'nombre__sort',
        verdict: 'notLast',
      },
    ],
  },

  {
    id: 'tabular-in-a-parenthese-sur-la-query',
    mode: 'deterministic',
    constats: ['PG-034'],
    origin:
      "#1202, #1233, PG-034 du banc — `__in` écarte EN SILENCE (HTTP 200) toute valeur NUE à parenthèse : « Usage de stupéfiants (AFD) » est trouvé par `__exact` (101) et perdu par `__in` (0, rejoué le 2026-09-27) ; la même valeur ENTRE GUILLEMETS est lue (202 avec `Homicides`, mesuré le 2026-10-04). Le faux serveur imite les deux. La clause `in` d'une query part donc au serveur, la valeur à parenthèse citée et elle seule (arbitrage du 2026-10-04) : une requête filtrée au lieu du jeu entier — elle restait côté client depuis #1202.",
    feed: { kind: 'fixture', datasets: { main: EX_AEQUO } },
    markup: `
  ${SOURCE_EX_AEQUO('s-in-paren')}
  <dsfr-data-query id="q-in-paren" source="s-in-paren"
    where="categorie:in:Homicides|Usage de stupéfiants (AFD)"></dsfr-data-query>
  <dsfr-data-kpi id="k-in-paren" source="q-in-paren" value="count" format="nombre"
    label="Faits"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-in-paren',
        agg: 'count',
        pipeline: [
          {
            op: 'filter',
            filters: [
              {
                field: 'categorie',
                op: 'in',
                values: ['Homicides', 'Usage de stupéfiants (AFD)'],
              },
            ],
          },
        ],
      },
      {
        kind: 'urls',
        id: 'in-de-la-query-delegue-entre-guillemets',
        among: DATA_EX_AEQUO,
        contains: 'categorie__in=Homicides,"Usage de stupéfiants (AFD)"',
        verdict: 'last',
      },
      {
        kind: 'urls',
        id: 'in-de-la-query-jamais-nu',
        among: DATA_EX_AEQUO,
        contains: 'categorie__in=Homicides,Usage',
        verdict: 'none',
      },
    ],
  },

  {
    id: 'tabular-tri-groupe-pagine-sans-perte',
    mode: 'deterministic',
    constats: ['PG-033'],
    origin:
      "#1233, PG-033 du banc, suite de #1202 — un chargement GROUPÉ trié au serveur sur une colonne de regroupement non unique (`group-by` de deux colonnes, `order-by` sur une seule) perdait des groupes sans un mot dès la deuxième page : 1 818 groupes rendus, 1 805 distincts, rejoué le 2026-10-03 en 0.44.0. La clé de groupe est unique, pas la clé de tri. Ici 450 groupes (`categorie` × `id`), trois pages, triés sur `categorie` qui n'a que quatre valeurs ; le faux serveur ordonne les ex-æquo autrement d'une page à l'autre, comme l'API. L'adaptateur relit les groupes sans `__sort` et trie lui-même : chaque groupe une fois.",
    feed: { kind: 'fixture', datasets: { main: EX_AEQUO } },
    markup: `
  <dsfr-data-source id="s-groupe-trie" api-type="tabular" resource="${RESSOURCE_TABULAR_EX_AEQUO}"
    group-by="categorie, id" aggregate="nombre:sum" order-by="categorie:asc"></dsfr-data-source>
  <dsfr-data-kpi id="k-groupe-trie" source="s-groupe-trie" value="nombre__sum:sum{id:lte:150}" format="nombre"
    label="Faits des 150 premiers identifiants"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'rows',
        id: 's-groupe-trie',
        key: ['categorie', 'id'],
        columns: ['nombre__sum'],
        pipeline: [
          {
            op: 'group-by',
            by: ['categorie', 'id'],
            columns: { nombre__sum: { agg: 'sum', field: 'nombre' } },
          },
          {
            op: 'order-by-keys',
            keys: [
              { column: 'categorie', dir: 'asc' },
              { column: 'id', dir: 'asc' },
            ],
          },
        ],
      },
      // Le compte de groupes reste juste quand des groupes sont perdus : c'est
      // un chiffre calculé sur une PARTIE des groupes qui trahit ceux qui
      // manquent et ceux qui reviennent deux fois.
      {
        kind: 'kpi',
        id: 'k-groupe-trie',
        agg: 'sum',
        field: 'nombre',
        filter: [{ field: 'id', op: 'lte', value: 150 }],
      },
      {
        kind: 'urls',
        id: 'tri-des-groupes-final-local',
        among: DATA_EX_AEQUO,
        contains: 'categorie__sort',
        verdict: 'notLast',
      },
    ],
  },

  {
    id: 'tabular-tri-tronque-ordre-total',
    mode: 'deterministic',
    constats: ['PG-033'],
    origin:
      "#1233, PG-033 du banc — un chargement TRONQUÉ par `max-records` ne peut pas être relu en entier : le tri reste au serveur, seul à pouvoir donner les PREMIÈRES lignes. Sans clé de départage, 600 lignes rendues pour 550 distinctes (rejoué le 2026-10-03). Mesuré le même jour : un second `__sort` est ignoré par l'API (mêmes 550), mais la valeur du premier part telle quelle à PostgREST — `Code_region__sort=asc,\"__id\".asc` rend 600 lignes distinctes, les 600 premières du jeu trié. Ici 450 lignes, plafond à 400, tri sur `nombre` (cinq valeurs) : les 400 premières dans l'ordre (`nombre` décroissant, puis rang de la ligne), chacune une fois. Le faux serveur ne lit qu'un `__sort`, et sa valeur composée.",
    feed: { kind: 'fixture', datasets: { main: EX_AEQUO } },
    markup: `
  <dsfr-data-source id="s-tronque-trie" api-type="tabular" resource="${RESSOURCE_TABULAR_EX_AEQUO}"
    order-by="nombre:desc" max-records="400"></dsfr-data-source>
  <dsfr-data-kpi id="k-tronque-trie" source="s-tronque-trie" value="id:sum" format="nombre"
    label="Somme des identifiants"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'rows',
        id: 's-tronque-trie',
        key: 'id',
        columns: ['nombre'],
        pipeline: [
          {
            op: 'order-by-keys',
            keys: [
              { column: 'nombre', dir: 'desc' },
              { column: 'id', dir: 'asc' },
            ],
          },
          { op: 'limit', n: 400 },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-tronque-trie',
        agg: 'sum',
        field: 'id',
        pipeline: [
          {
            op: 'order-by-keys',
            keys: [
              { column: 'nombre', dir: 'desc' },
              { column: 'id', dir: 'asc' },
            ],
          },
          { op: 'limit', n: 400 },
        ],
      },
      {
        kind: 'urls',
        id: 'tri-tronque-avec-cle-de-departage',
        among: DATA_EX_AEQUO,
        contains: '__id',
        verdict: 'last',
      },
    ],
  },

  {
    id: 'tabular-in-a-parenthese-sur-la-source',
    mode: 'deterministic',
    constats: ['PG-034'],
    origin:
      "#1233, PG-034 du banc, suite de #1202 — le même `in` à parenthèse posé sur la SOURCE, sans query en aval pour le reprendre : `__in` partait au serveur avec un simple avertissement console, 101 lignes au lieu de 202 (rejoué le 2026-10-03 en 0.44.0) ; la 0.45.0 le calculait côté client, au prix du jeu entier. La clause part désormais ENTRE GUILLEMETS (arbitrage du 2026-10-04, mesuré sur l'API : 202 lignes en une requête, 1 717 pour `notin`), et seule la valeur qui en a besoin est citée. `notin` suit la même règle. Une clause ordinaire du même `where` reste déléguée, inchangée.",
    feed: { kind: 'fixture', datasets: { main: EX_AEQUO } },
    markup: `
  <dsfr-data-source id="s-in-source" api-type="tabular" resource="${RESSOURCE_TABULAR_EX_AEQUO}"
    where="nombre:gte:1, categorie:in:Homicides|Usage de stupéfiants (AFD)"></dsfr-data-source>
  <dsfr-data-kpi id="k-in-source" source="s-in-source" value="count" format="nombre"
    label="Faits"></dsfr-data-kpi>
  <dsfr-data-source id="s-notin-source" api-type="tabular" resource="${RESSOURCE_TABULAR_EX_AEQUO}"
    where="categorie:notin:Vols (avec violence)|Cambriolages"></dsfr-data-source>
  <dsfr-data-kpi id="k-notin-source" source="s-notin-source" value="nombre:sum" format="nombre"
    label="Faits"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-in-source',
        agg: 'count',
        pipeline: [
          {
            op: 'filter',
            filters: [
              { field: 'nombre', op: 'gte', value: 1 },
              {
                field: 'categorie',
                op: 'in',
                values: ['Homicides', 'Usage de stupéfiants (AFD)'],
              },
            ],
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-notin-source',
        agg: 'sum',
        field: 'nombre',
        pipeline: [
          {
            op: 'filter',
            filters: [
              {
                field: 'categorie',
                op: 'notin',
                values: ['Vols (avec violence)', 'Cambriolages'],
              },
            ],
          },
        ],
      },
      {
        kind: 'urls',
        id: 'in-de-la-source-entre-guillemets',
        among: DATA_EX_AEQUO,
        contains: 'categorie__in=Homicides,"Usage de stupéfiants (AFD)"',
        verdict: 'some',
      },
      {
        kind: 'urls',
        id: 'notin-de-la-source-entre-guillemets',
        among: DATA_EX_AEQUO,
        contains: 'categorie__notin="Vols (avec violence)",Cambriolages',
        verdict: 'some',
      },
      {
        kind: 'urls',
        id: 'in-de-la-source-jamais-nu',
        among: DATA_EX_AEQUO,
        contains: 'categorie__in=Homicides,Usage',
        verdict: 'none',
      },
      {
        kind: 'urls',
        id: 'notin-de-la-source-jamais-nu',
        among: DATA_EX_AEQUO,
        contains: 'categorie__notin=Vols',
        verdict: 'none',
      },
      {
        kind: 'urls',
        id: 'clause-ordinaire-toujours-deleguee',
        among: DATA_EX_AEQUO,
        contains: 'nombre__greater=1',
        verdict: 'some',
      },
    ],
  },

  {
    id: 'tabular-in-a-parenthese-server-side',
    mode: 'deterministic',
    constats: ['PG-034'],
    origin:
      "#1233, PG-034 du banc — le même `in` à parenthèse sur une source en PAGINATION SERVEUR (pages de 40), là où aucun calcul côté client ne peut le reprendre : la clause partait nue, la valeur à parenthèse était écartée par l'API (113 lignes annoncées au lieu de 226), avec un avertissement console et la réserve `in-values-dropped`. Elle part entre guillemets : le total annoncé et la page sont ceux des DEUX catégories, et la bibliothèque n'a rien à dire. `notin` de même.",
    feed: { kind: 'fixture', datasets: { main: EX_AEQUO } },
    markup: `
  <dsfr-data-source id="s-in-page" api-type="tabular" resource="${RESSOURCE_TABULAR_EX_AEQUO}"
    where="categorie:in:Homicides|Usage de stupéfiants (AFD)" server-side page-size="40"></dsfr-data-source>
  <dsfr-data-kpi id="k-in-page-total" source="s-in-page" value="meta:total" format="nombre"
    label="Faits annoncés"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-in-page-somme" source="s-in-page" value="id:sum" format="nombre"
    label="Somme des identifiants de la page"></dsfr-data-kpi>
  <dsfr-data-source id="s-notin-page" api-type="tabular" resource="${RESSOURCE_TABULAR_EX_AEQUO}"
    where="categorie:notin:Vols (avec violence)|Cambriolages" server-side page-size="40"></dsfr-data-source>
  <dsfr-data-kpi id="k-notin-page-total" source="s-notin-page" value="meta:total" format="nombre"
    label="Faits annoncés"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-in-page-total',
        agg: 'count',
        pipeline: [
          {
            op: 'filter',
            filters: [
              {
                field: 'categorie',
                op: 'in',
                values: ['Homicides', 'Usage de stupéfiants (AFD)'],
              },
            ],
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-in-page-somme',
        agg: 'sum',
        field: 'id',
        pipeline: [
          {
            op: 'filter',
            filters: [
              {
                field: 'categorie',
                op: 'in',
                values: ['Homicides', 'Usage de stupéfiants (AFD)'],
              },
            ],
          },
          { op: 'limit', n: TAILLE_PAGE },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-notin-page-total',
        agg: 'count',
        pipeline: [
          {
            op: 'filter',
            filters: [
              {
                field: 'categorie',
                op: 'notin',
                values: ['Vols (avec violence)', 'Cambriolages'],
              },
            ],
          },
        ],
      },
      {
        kind: 'urls',
        id: 'in-de-la-page-entre-guillemets',
        among: DATA_EX_AEQUO,
        contains: 'categorie__in=Homicides,"Usage de stupéfiants (AFD)"',
        verdict: 'some',
      },
      {
        kind: 'urls',
        id: 'notin-de-la-page-entre-guillemets',
        among: DATA_EX_AEQUO,
        contains: 'categorie__notin="Vols (avec violence)",Cambriolages',
        verdict: 'some',
      },
      // Plus rien n'est écarté : ni avertissement, ni réserve à dire.
      { kind: 'diagnostic', id: 's-in-page', expect: 'silence', contains: 'PG-034' },
    ],
  },
];

// ---------------------------------------------------------------------------
// 5. Sans adaptateur : le même balisage, tout côté client
// ---------------------------------------------------------------------------

const SANS_ADAPTATEUR: Check[] = [
  {
    id: 'url-nue-aucun-serveur',
    mode: 'deterministic',
    origin:
      'Le temoin : la MEME forme de query sur une source en mode URL brute, qui ne sait rien deleguer. Aucune URL ne porte de clause, et le chiffre est le meme qu’en delegation.',
    feed: { kind: 'fixture', datasets: { main: MESURES } },
    markup: `
  <dsfr-data-source id="s-url" url="${urlJeu('mesures')}"></dsfr-data-source>
  <dsfr-data-query id="q-url" source="s-url" group-by="zone"
    aggregate="flux:sum:total" order-by="total:desc"></dsfr-data-query>
  <dsfr-data-kpi id="k-url" source="q-url" value="total:sum" format="nombre" label="Flux"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-url',
        key: 'zone',
        columns: ['total'],
        pipeline: [
          { op: 'group-by', by: 'zone', columns: { total: { agg: 'sum', field: 'flux' } } },
          { op: 'order-by', column: 'total', dir: 'desc' },
        ],
      },
      { kind: 'kpi', id: 'k-url', agg: 'sum', field: 'flux' },
      {
        kind: 'urls',
        id: 'aucune-clause-en-mode-url',
        among: '/mesures',
        contains: 'group_by',
        verdict: 'none',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// 6. Tabular : ce que l'API ne fait pas, et ce qu'elle ne dit pas (#1025)
// ---------------------------------------------------------------------------

/** Population par département : 101 groupes, trois pages de 40. */
const PAR_DEPT: Step = {
  op: 'group-by',
  by: 'code_dept',
  columns: { population__sum: { agg: 'sum', field: 'population' } },
};

/**
 * Les départements, du MOINS peuplé au plus peuplé. Le jeu range ses lignes à
 * peu près par population décroissante : les dix premiers groupes rendus par
 * le serveur SONT les dix plus peuplés, et un faux « top 10 » décroissant
 * (dix groupes lus, puis triés) passerait inaperçu. Le « top 10 » croissant,
 * lui, ne tient que si les 101 groupes ont été lus.
 */
const GROUPE_DEPT_ASC: Step[] = [
  PAR_DEPT,
  { op: 'order-by', column: 'population__sum', dir: 'asc' },
];

/** Les départements, par code : un tri sur la colonne de regroupement. */
const GROUPE_DEPT_CLE: Step[] = [PAR_DEPT, { op: 'order-by', column: 'code_dept', dir: 'asc' }];

const TABULAR_API: Check[] = [
  {
    id: 'tabular-groupby-sans-agregat',
    mode: 'deterministic',
    origin:
      '#1025 — `champ__groupby` SEUL ne regroupe pas : l’API rend une ligne par ligne brute, réduite au champ (`Code sexe__groupby&page_size=5` → F, M, M, F, M, mesuré le 2026-09-22, api-tabular#119). Déléguer un `group-by` sans agrégat affichait donc 137 lignes répétées pour 8 académies. Il n’est plus délégué : la query regroupe les lignes brutes.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceTabular('s-modalites')}
  <dsfr-data-query id="q-modalites" source="s-modalites" group-by="academie"></dsfr-data-query>
  <dsfr-data-kpi id="k-modalites" source="q-modalites" value="count" format="nombre"
    label="Académies"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-modalites',
        key: 'academie',
        columns: [],
        pipeline: [{ op: 'group-by', by: 'academie', columns: {} }],
      },
      {
        kind: 'kpi',
        id: 'k-modalites',
        agg: 'count',
        pipeline: [{ op: 'group-by', by: 'academie', columns: {} }],
      },
      urlsDe('groupby-seul-non-delegue', 'tabular', 'academie__groupby', 'none'),
    ],
  },

  {
    id: 'tabular-groupes-page-deux',
    mode: 'deterministic',
    origin:
      '#1025 — une réponse Tabular agrégée ne porte pas de `meta.total` (`{page, page_size}` seulement, `links.next` pagine les groupes, mesuré le 2026-09-22). Lu comme un total de 0, il masquait la pagination d’une liste `server-side` : seuls les 40 premiers des 101 départements étaient atteignables. Total inconnu = `undefined` : la page suivante est proposée tant que la page est pleine, et la page 2 montre les groupes 41 à 80. Trié sur la colonne de REGROUPEMENT, que l’API sait trier (`EPCI__sort` → 200, mesuré le 2026-09-23) : c’est elle qui pagine les groupes. Un tri sur l’agrégat suit un autre chemin (#1045, `tabular-top-agregat-page-deux`).',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceTabular('s-dept', { serverSide: true })}
  <dsfr-data-query id="q-dept" source="s-dept" group-by="code_dept" aggregate="population:sum"
    order-by="code_dept:asc"></dsfr-data-query>
  <dsfr-data-list id="l-dept" source="q-dept" columns="code_dept:Département, population__sum:Population"
    server-sort></dsfr-data-list>`,
    actions: [{ kind: 'click', selector: '#l-dept .fr-pagination__link--next' }],
    expects: [
      {
        kind: 'list',
        id: 'l-dept',
        columns: [{ column: 'code_dept' }, { column: 'population__sum', numeric: true }],
        pipeline: [...GROUPE_DEPT_CLE, { op: 'page', size: TAILLE_PAGE, number: 2 }],
      },
      urlsDe('groupes-page-deux', 'tabular', 'page=2', 'last'),
      urlsDe('groupes-tri-sur-la-cle', 'tabular', 'code_dept__sort=asc', 'last'),
    ],
  },
];

// ---------------------------------------------------------------------------
// 6 bis. Tabular : un tri sur l'agrégat ne part pas au serveur (#1045)
// ---------------------------------------------------------------------------

/**
 * L'API Tabular ne trie pas une colonne d'agrégat : `NB_VP__sum__sort=desc`
 * avec `EPCI__groupby&NB_VP__sum` rend 400, 42703 « column …NB_VP__sum does
 * not exist » (mesuré le 2026-09-23), sans en-tête CORS. Le faux serveur
 * acceptait tout, et les contrôles qui délèguent ce tri passaient au vert.
 * L'adaptateur lit désormais les groupes COMPLETS et trie lui-même — jamais
 * une page de groupes, dont le tri ne serait pas un « top » du jeu.
 */
const TABULAR_TRI_AGREGAT: Check[] = [
  {
    id: 'tabular-top-n-source',
    mode: 'deterministic',
    origin:
      '#1045 — le « top 10 » posé sur la source elle-même : regroupement, agrégat, tri sur l’agrégat et `limit="10"` — ici les dix départements les MOINS peuplés. Le tri ne part plus au serveur (400 sur l’API réelle) ; les 101 groupes sont lus, triés, PUIS coupés à dix. Lire dix groupes et les trier rendrait un faux top 10 : les dix premiers groupes rendus, rangés par population.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  <dsfr-data-source id="s-top" api-type="tabular" resource="${RESSOURCE_TABULAR}"
    group-by="code_dept" aggregate="population:sum" order-by="population__sum:asc"
    limit="10"></dsfr-data-source>
  <dsfr-data-list id="l-top" source="s-top"
    columns="code_dept:Département, population__sum:Population"></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-top',
        columns: [{ column: 'code_dept' }, { column: 'population__sum', numeric: true }],
        pipeline: [...GROUPE_DEPT_ASC, { op: 'limit', n: 10 }],
      },
      urlsDe('top-n-regroupement-delegue', 'tabular', 'code_dept__groupby', 'all'),
      urlsDe('top-n-tri-non-delegue', 'tabular', '__sort', 'none'),
    ],
  },

  {
    id: 'tabular-top-agregat-serveur',
    mode: 'deterministic',
    origin:
      '#1045 — le même « top » en pagination serveur : la première page d’une liste `server-side` triée sur l’agrégat doit montrer les 40 départements les MOINS peuplés des 101, pas les 40 premiers groupes rendus par l’API rangés entre eux. Trier la page reçue donnerait un faux top 40.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceTabular('s-top-page', { serverSide: true })}
  <dsfr-data-query id="q-top-page" source="s-top-page" group-by="code_dept"
    aggregate="population:sum" order-by="population__sum:asc"></dsfr-data-query>
  <dsfr-data-list id="l-top-page" source="q-top-page"
    columns="code_dept:Département, population__sum:Population" server-sort></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-top-page',
        columns: [{ column: 'code_dept' }, { column: 'population__sum', numeric: true }],
        pipeline: [...GROUPE_DEPT_ASC, { op: 'page', size: TAILLE_PAGE, number: 1 }],
      },
      urlsDe('top-page-regroupement-delegue', 'tabular', 'code_dept__groupby', 'last'),
      urlsDe('top-page-tri-non-delegue', 'tabular', 'population__sum__sort', 'none'),
    ],
  },

  {
    id: 'tabular-top-agregat-page-deux',
    mode: 'deterministic',
    origin:
      '#1045 — la page 2 de la même liste : les départements classés 41 à 80 par population croissante, découpés dans les groupes complets triés. Le nombre de groupes est alors connu (101) : la pagination n’a plus à le deviner.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceTabular('s-top-p2', { serverSide: true })}
  <dsfr-data-query id="q-top-p2" source="s-top-p2" group-by="code_dept"
    aggregate="population:sum" order-by="population__sum:asc"></dsfr-data-query>
  <dsfr-data-list id="l-top-p2" source="q-top-p2"
    columns="code_dept:Département, population__sum:Population" server-sort></dsfr-data-list>`,
    actions: [{ kind: 'click', selector: '#l-top-p2 .fr-pagination__link--next' }],
    expects: [
      {
        kind: 'list',
        id: 'l-top-p2',
        columns: [{ column: 'code_dept' }, { column: 'population__sum', numeric: true }],
        pipeline: [...GROUPE_DEPT_ASC, { op: 'page', size: TAILLE_PAGE, number: 2 }],
      },
      urlsDe('top-page-deux-tri-non-delegue', 'tabular', 'population__sum__sort', 'none'),
    ],
  },
];

// ---------------------------------------------------------------------------
// 7. Tabular : moins d'octets, pas un chiffre de change (#985)
// ---------------------------------------------------------------------------

/** Le nom de colonne piégeux du jeu : apostrophe et espaces (#615). */
const HABITANTS = "Nombre d'habitants";

const TABULAR_VOLUME: Check[] = [
  {
    id: 'tabular-select-projection',
    mode: 'deterministic',
    origin:
      '#985 — le `select` d’une source Tabular devient `columns=` : l’API ne rend que les colonnes nommées (34 721 → 3 098 octets pour 50 élus à deux colonnes, 366 892 → 22 383 octets pour 200 bornes IRVE à trois colonnes, mesuré le 2026-09-22). La projection retire des colonnes, jamais des lignes : le compte, la somme et les modalités ne bougent pas — et une colonne oubliée dans la projection vide la somme.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceTabular('s-proj', { select: 'academie, population' })}
  <dsfr-data-kpi id="k-proj-n" source="s-proj" value="count" format="nombre"
    label="Lignes"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-proj-pop" source="s-proj" value="population:sum" format="nombre"
    label="Population"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-proj-aca" source="s-proj" value="academie:distinct" format="nombre"
    label="Académies"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-proj-n', agg: 'count' },
      { kind: 'kpi', id: 'k-proj-pop', agg: 'sum', field: 'population' },
      { kind: 'kpi', id: 'k-proj-aca', agg: 'distinct', field: 'academie' },
      urlsDe('select-projection', 'tabular', 'columns=academie,population', 'all'),
    ],
  },

  {
    id: 'tabular-select-projection-serveur',
    mode: 'deterministic',
    origin:
      '#985 — la même projection en pagination serveur (`fetchPage`) : la liste montre les mêmes valeurs, colonne pour colonne, avec deux colonnes au lieu de sept.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceTabular('s-proj-page', { serverSide: true, select: `region, ${HABITANTS}` })}
  <dsfr-data-list id="l-proj-page" source="s-proj-page"
    columns="region:Territoire, ${HABITANTS}:Habitants"></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-proj-page',
        columns: [{ column: 'region' }, { column: HABITANTS, numeric: true }],
        pipeline: [{ op: 'page', size: TAILLE_PAGE, number: 1 }],
      },
      // Le journal de la page consigne les URL DÉCODÉES
      urlsDe('select-projection-page', 'tabular', `columns=region,${HABITANTS}`, 'all'),
    ],
  },

  {
    id: 'tabular-select-et-regroupement',
    mode: 'deterministic',
    origin:
      '#985 — un regroupement délégué désactive la projection : l’API refuse `columns` à côté d’un agrégateur (400 « the argument `columns` cannot be set alongside aggregators », mesuré le 2026-09-22). Le `select` de la source reste posé, la query délègue quand même, et les sommes par académie sont justes.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceTabular('s-proj-g', { select: 'academie, population' })}
  <dsfr-data-query id="q-proj-g" source="s-proj-g" group-by="academie"
    aggregate="population:sum"></dsfr-data-query>
  <dsfr-data-kpi id="k-proj-g" source="q-proj-g" value="population__sum:sum" format="nombre"
    label="Population"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-proj-g',
        key: 'academie',
        columns: ['population__sum'],
        pipeline: [
          {
            op: 'group-by',
            by: 'academie',
            columns: { population__sum: { agg: 'sum', field: 'population' } },
          },
        ],
      },
      { kind: 'kpi', id: 'k-proj-g', agg: 'sum', field: 'population' },
      urlsDe('regroupement-delegue-avec-select', 'tabular', 'academie__groupby', 'last'),
      urlsDe('regroupement-sans-projection', 'tabular', 'columns=', 'none'),
    ],
  },

  {
    id: 'tabular-colonne-a-espaces-deleguee',
    mode: 'deterministic',
    origin:
      '#985 — un nom de colonne à espaces et apostrophe se délègue, percent-encodé : le parseur de l’API l’accepte (`Libellé du département__groupby&Code sexe__count` → 200, mesuré le 2026-09-22). L’ancien garde-fou (#244, #289) le refusait et faisait télécharger tout le jeu pour agréger dans le navigateur : même chiffre, jusqu’à 25 000 lignes. Le filtre du `where` part aussi au serveur.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceTabular('s-esp')}
  <dsfr-data-query id="q-esp" source="s-esp" where="${HABITANTS}:gt:900000"
    group-by="academie" aggregate="${HABITANTS}:sum"></dsfr-data-query>
  <dsfr-data-list id="l-esp" source="q-esp"
    columns="academie:Académie, ${HABITANTS}__sum:Habitants"></dsfr-data-list>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-esp',
        key: 'academie',
        columns: [`${HABITANTS}__sum`],
        pipeline: [
          { op: 'filter', filters: [{ field: HABITANTS, op: 'gt', value: 900000 }] },
          {
            op: 'group-by',
            by: 'academie',
            columns: { [`${HABITANTS}__sum`]: { agg: 'sum', field: HABITANTS } },
          },
        ],
      },
      urlsDe('colonne-a-espaces-groupby', 'tabular', 'academie__groupby', 'last'),
      // Le journal de la page consigne les URL DÉCODÉES
      urlsDe('colonne-a-espaces-agregat', 'tabular', `${HABITANTS}__sum`, 'last'),
      urlsDe(
        'colonne-a-espaces-filtre',
        'tabular',
        `${HABITANTS}__strictly_greater=900000`,
        'last'
      ),
    ],
  },
];

// ---------------------------------------------------------------------------
// 7. Le OU entre champs : `a|b:op:valeur` (#1026)
// ---------------------------------------------------------------------------

/**
 * La clause multi-champs de la bibliothèque, écrite pour l'oracle comme une
 * disjonction de filtres ordinaires. `contains` sans repliement : Tabular est
 * insensible à la casse et SENSIBLE aux accents (`ilike`, mesuré le
 * 2026-09-22 : `ELIE` → 48, `ÉLIE` → 3).
 */
function ou(fields: string[], op: 'contains' | 'eq', value: string) {
  return { op: 'or' as const, any: fields.map((field) => ({ field, op, value })) };
}

/** « a » dans la région OU l'académie : 3 + 52 lignes, 1 en commun → 54. */
const REGION_OU_ACADEMIE = ou(['region', 'academie'], 'contains', 'a');

const TABULAR_OU: Check[] = [
  // La recherche serveur multi-colonnes : l'objectif de #1026
  {
    id: 'tabular-recherche-serveur-multi-colonnes',
    mode: 'deterministic',
    origin:
      '#1026 — `dsfr-data-search fields="region,academie" server-search` sur Tabular : le terme part au serveur en `or=(region__contains.a,academie__contains.a)` (gabarit par défaut `{fields}:contains:{q}`), et le compteur lit `meta.total`, l’union VRAIE sur tout le jeu (mesuré sur l’API : 351 = 189 + 164 − 2 pour MARTIN chez les élus). La source pagine par 40 : un filtre resté client ne verrait que la première page et compterait au plus 40.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceTabular('s-rm', { serverSide: true })}
  <dsfr-data-search id="r-mc" source="s-rm" fields="region,academie" server-search count
    debounce="0" min-length="0" label="Rechercher un territoire"></dsfr-data-search>
  <dsfr-data-kpi id="k-rm-total" source="r-mc" value="meta:total" format="nombre"
    label="Territoires trouvés"></dsfr-data-kpi>`,
    actions: [{ kind: 'fill', selector: '#r-mc input', value: 'a' }],
    expects: [
      {
        kind: 'text',
        id: 'r-mc',
        selector: '.dsfr-data-search-count',
        numeric: true,
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [REGION_OU_ACADEMIE] }],
      },
      {
        kind: 'kpi',
        id: 'k-rm-total',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [REGION_OU_ACADEMIE] }],
      },
      urlsDe(
        'recherche-multi-colonnes-or',
        'tabular',
        'or=(region__contains.a,academie__contains.a)',
        'last'
      ),
    ],
  },

  // Le `where` d'une query, délégué en `or=` puis regroupé par le serveur
  ...pairePaginee(
    {
      id: 'tabular-where-multi-champs',
      api: 'tabular',
      origin:
        '#1026 — `where="region|academie:contains:a"` : même opérateur, même valeur sur deux champs, reliés par un OU. Délégué en `or=(…)` avec le regroupement, il doit donner les groupes que l’oracle recalcule sur l’union — ni l’intersection (1 ligne), ni le seul premier champ (3 lignes).',
      query:
        'where="region|academie:contains:a" group-by="academie" aggregate="population:sum" order-by="academie:asc"',
      colonnes: 'academie:Académie, population__sum:Population',
      expects: [
        {
          kind: 'rows',
          id: 'q',
          key: 'academie',
          columns: ['population__sum'],
          pipeline: [
            { op: 'filter', filters: [REGION_OU_ACADEMIE] },
            {
              op: 'group-by',
              by: 'academie',
              columns: { population__sum: { agg: 'sum', field: 'population' } },
            },
            { op: 'order-by', column: 'academie', dir: 'asc' },
          ],
        },
      ],
    },
    [
      urlsDe(
        'where-multi-champs-or',
        'tabular',
        'or=(region__contains.a,academie__contains.a)',
        'last'
      ),
    ]
  ),

  // La même grammaire sur Opendatasoft : `(… OR …)` en ODSQL
  ...pairePaginee(
    {
      id: 'ods-where-multi-champs',
      api: 'ods',
      origin:
        '#1026 — `where="code_dept|code_reg:eq:11"` sur Opendatasoft : la clause devient `(code_dept = "11" OR code_reg = "11")`, parenthésée parce que les clauses se joignent par AND. 2 départements + 11 lignes de la région 11 → 13.',
      query:
        'where="code_dept|code_reg:eq:11" group-by="pays_iso2" aggregate="population:sum:pop" order-by="pop:desc"',
      colonnes: 'pays_iso2:Pays, pop:Population',
      expects: [
        {
          kind: 'rows',
          id: 'q',
          key: 'pays_iso2',
          columns: ['pop'],
          pipeline: [
            { op: 'filter', filters: [ou(['code_dept', 'code_reg'], 'eq', '11')] },
            {
              op: 'group-by',
              by: 'pays_iso2',
              columns: { pop: { agg: 'sum', field: 'population' } },
            },
            { op: 'order-by', column: 'pop', dir: 'desc' },
          ],
        },
      ],
    },
    [urlsDe('where-multi-champs-odsql', 'ods', '(code_dept = "11" OR code_reg = "11")', 'last')]
  ),
];

// ---------------------------------------------------------------------------
// 8. La part par groupe (`share-by`, AM-110) ne se délègue pas
// ---------------------------------------------------------------------------

/**
 * La part de chaque académie DANS SON PAYS. Une part est une fonction de
 * fenêtre : aucune API du pipeline n'en a l'équivalent, et la query garde
 * alors tout le regroupement côté client — sur les lignes que la source a
 * chargées. Les deux contrôles tiennent les deux moitiés du contrat : aucune
 * URL ne porte de regroupement, et le chiffre est celui des lignes brutes.
 */
const PART_PAR_PAYS: Step[] = [
  {
    op: 'group-by',
    by: ['pays_iso2', 'academie'],
    columns: { pop: { agg: 'sum', field: 'population' } },
  },
  { op: 'order-by', column: 'pop', dir: 'desc' },
  { op: 'share', from: 'pop', as: 'part', scale: 100, by: 'pays_iso2' },
];

const BALISAGE_PART_PAR_PAYS = (id: string, sourceId: string): string => `
  <dsfr-data-query id="${id}" source="${sourceId}" group-by="pays_iso2, academie"
    aggregate="population:sum:pop, pop:share_percent:part" share-by="pays_iso2"
    order-by="pop:desc"></dsfr-data-query>`;

const PART_PAR_GROUPE: Check[] = [
  {
    id: 'part-par-groupe-ods-reste-client',
    mode: 'deterministic',
    origin:
      'AM-110 (#1228) — `share-by` sur une source Opendatasoft dont la query est SEULE lectrice : sans la part, ce regroupement partirait au serveur (`seule-lectrice-delegue`). Avec elle, aucune URL ne porte `group_by` — ODSQL n’a pas de part par partition — et la part de chaque académie dans son pays est calculée sur les 137 lignes rapatriées.',
    constats: ['AM-110'],
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceOds('s-part-ods')}${BALISAGE_PART_PAR_PAYS('q-part-ods', 's-part-ods')}`,
    expects: [
      {
        kind: 'rows',
        id: 'q-part-ods',
        key: ['pays_iso2', 'academie'],
        columns: ['pop', 'part'],
        pipeline: PART_PAR_PAYS,
      },
      urlsDe('part-ods-aucun-group-by', 'ods', 'group_by=', 'none'),
      urlsDe('part-ods-aucune-fonction-de-part', 'ods', 'share', 'none'),
    ],
  },

  {
    id: 'part-par-groupe-tabular-reste-client',
    mode: 'deterministic',
    origin:
      'AM-110 (#1228) — `share-by` sur une source Tabular. L’adaptateur se dit capable de toute fonction sauf `distinct` : c’est la query qui retient la part avant de l’interroger, sans quoi l’API recevrait `population__share_percent` et répondrait en erreur à tous les abonnés. Aucune URL ne porte `__groupby`, et le chiffre est celui des lignes brutes.',
    constats: ['AM-110'],
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceTabular('s-part-tab')}${BALISAGE_PART_PAR_PAYS('q-part-tab', 's-part-tab')}`,
    expects: [
      {
        kind: 'rows',
        id: 'q-part-tab',
        key: ['pays_iso2', 'academie'],
        columns: ['pop', 'part'],
        pipeline: PART_PAR_PAYS,
      },
      urlsDe('part-tabular-aucun-groupby', 'tabular', '__groupby', 'none'),
      urlsDe('part-tabular-aucune-fonction-de-part', 'tabular', 'share', 'none'),
    ],
  },

  {
    id: 'part-par-groupe-ods-server-side',
    mode: 'deterministic',
    origin:
      'AM-110 (#1228), #1242 — le même balisage sur une source en `server-side` (pagination serveur, pages de 40 lignes). Une part retient le regroupement côté client, sur les lignes chargées ; or la source n’en livre qu’UNE page. Mesuré avant #1242 : 40 lignes (les couples pays × académie de la première page, parts rapportées aux seuls territoires de cette page) pour 56 attendues, aucun marqueur, aucun message. Le montage se corrige par un attribut (sans `server-side`, le chiffre est juste : `part-par-groupe-ods-reste-client`) : la requête passe en ERREUR DE CONFIGURATION, qui nomme la source, `server-side` et la correction, et n’émet aucun chiffre. La source, elle, livre toujours sa page.',
    constats: ['AM-110'],
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceOds('s-part-page', { serverSide: true })}${BALISAGE_PART_PAR_PAYS('q-part-page', 's-part-page')}`,
    expects: [
      // La page est arrivée : la requête a donc été servie, et a refusé.
      {
        kind: 'rows',
        id: 's-part-page',
        key: 'region',
        columns: ['population'],
        pipeline: [{ op: 'limit', n: TAILLE_PAGE }],
      },
      {
        kind: 'diagnostic',
        id: 'q-part-page',
        expect: 'config-error',
        contains: 'Retirez server-side de dsfr-data-source "s-part-page"',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// 9. Un regroupement gardé côté client ne se calcule pas sur UNE page (#1242)
// ---------------------------------------------------------------------------

/**
 * La règle est conditionnelle (arbitrage du 2026-10-04) : erreur de
 * configuration là où des attributs corrigent le montage (`server-side` d'une
 * source en mode adaptateur), statu quo avec avertissement là où il n'y en a
 * pas (mode URL `paginate`). Un contrôle par verdict, un pour la correction
 * qui porte le regroupement sur la source, et `part-par-groupe-ods-server-side`
 * ci-dessus pour la part.
 */
const REGROUPEMENT_SUR_UNE_PAGE: Check[] = [
  {
    id: 'agregat-client-tabular-server-side-refuse',
    mode: 'deterministic',
    origin:
      '#1242, verdict ERREUR — le montage le plus banal de la famille : une source Tabular en `server-side` (elle alimente d’ordinaire un tableau paginé) et, sur la même source, une `dsfr-data-query` qui somme une colonne pour un KPI. Un agrégat sans `group-by` n’est jamais délégué : la requête sommait les 40 lignes de la page (39 220 000 pour 127 684 000), sans un mot. Elle passe en erreur de configuration ; la source garde sa pagination — total annoncé 137, 40 lignes reçues — c’est-à-dire ce dont une liste paginée a besoin.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceTabular('s-agg-page', { serverSide: true })}
  <dsfr-data-kpi id="k-agg-total" source="s-agg-page" value="meta:total" format="nombre"
    label="Territoires"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-agg-recues" source="s-agg-page" value="count" format="nombre"
    label="Lignes de la page"></dsfr-data-kpi>
  <dsfr-data-query id="q-agg-page" source="s-agg-page" aggregate="population:sum:pop"></dsfr-data-query>
  <dsfr-data-kpi id="k-agg-somme" source="q-agg-page" value="pop" format="nombre"
    label="Population"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-agg-total', agg: 'count' },
      {
        kind: 'kpi',
        id: 'k-agg-recues',
        agg: 'count',
        pipeline: [{ op: 'limit', n: TAILLE_PAGE }],
      },
      {
        kind: 'diagnostic',
        id: 'q-agg-page',
        expect: 'config-error',
        contains: 'Retirez server-side de dsfr-data-source "s-agg-page"',
      },
    ],
  },

  {
    id: 'part-par-groupe-regroupement-sur-la-source',
    mode: 'deterministic',
    origin:
      '#1242, la correction quand le jeu DÉPASSE `max-records` (ici plafonné à 100 lignes pour 137) : retirer `server-side` ne suffit plus, la query regrouperait un jeu tronqué. Le regroupement délégable est porté par la source — le serveur regroupe le jeu entier, 56 groupes qui tiennent sous le plafond — et la part se calcule en aval, sur les groupes. C’est la correction que nomme le message d’erreur ; elle doit rendre le chiffre du jeu entier.',
    constats: ['AM-110'],
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  <dsfr-data-source id="s-part-src" api-type="opendatasoft" base-url="${HOTE_ODS}"
    dataset-id="${DATASET}" max-records="100" group-by="pays_iso2, academie"
    aggregate="population:sum:pop"></dsfr-data-source>
  <dsfr-data-query id="q-part-src" source="s-part-src" aggregate="pop:share_percent:part"
    share-by="pays_iso2" order-by="pop:desc"></dsfr-data-query>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-part-src',
        key: ['pays_iso2', 'academie'],
        columns: ['pop', 'part'],
        pipeline: PART_PAR_PAYS,
      },
      urlsDe('part-regroupement-porte-par-la-source', 'ods', 'group_by=', 'all'),
      { kind: 'diagnostic', id: 'q-part-src', expect: 'silence' },
    ],
  },

  {
    id: 'agregat-client-url-paginate-averti',
    mode: 'deterministic',
    origin:
      '#1242, verdict AVERTISSEMENT — une source en mode URL avec `paginate` (API à la convention `page` / `page_size`, qui pagine toujours : 20 lignes sans paramètre). Aucun attribut ne lui fait charger le jeu entier — sans `paginate`, c’est la page par défaut de l’API qui revient —, et le mode URL ne délègue rien. La règle est donc le statu quo : le regroupement est calculé sur la page reçue (40 lignes sur 137), la page n’est pas cassée, et la bibliothèque le DIT (console, et réserve `aggregate-on-page` au volet Diagnostic). L’oracle recalcule ce que la doc promet : la somme par pays des 40 premières lignes.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  <dsfr-data-source id="s-url-page" url="${urlJeuPagine('territoires')}" paginate
    page-size="${TAILLE_PAGE}"></dsfr-data-source>
  <dsfr-data-query id="q-url-page" source="s-url-page" group-by="pays_iso2"
    aggregate="population:sum:pop"></dsfr-data-query>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-url-page',
        key: 'pays_iso2',
        columns: ['pop'],
        pipeline: [
          { op: 'limit', n: TAILLE_PAGE },
          {
            op: 'group-by',
            by: 'pays_iso2',
            columns: { pop: { agg: 'sum', field: 'population' } },
          },
        ],
      },
      {
        kind: 'diagnostic',
        id: 'q-url-page',
        expect: 'warning',
        contains: 'sur la seule page reçue (40 lignes sur 137)',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// 10. Le relais cachable du site hôte : relayé = direct (ADR-155, #1232)
// ---------------------------------------------------------------------------

/** Fragment d'URL que porte toute requête partie au relais vers le portail du lot. */
const PAR_LE_RELAIS = `${RELAIS}/${new URL(HOTE_ODS).hostname}/`;

/**
 * Avec `relay-url`, la source n'appelle plus le portail : elle appelle
 * `<relais>/<hôte>/<chemin>?<requête>` sur le site hôte, qui va chercher la
 * donnée. La réécriture ne doit RIEN changer à la requête — ni un paramètre
 * perdu, ni un ordre modifié, ni un réencodage : le relais transmet chemin et
 * requête octet pour octet, et c'est donc la bibliothèque qui en répond.
 *
 * Deux contrôles existants sont REJOUÉS à travers le relais, et l'oracle exige
 * les mêmes chiffres qu'en direct (il repart des mêmes lignes brutes) :
 *
 *   - `ods-groupe-somme` : regroupement, somme et tri DÉLÉGUÉS — la clause
 *     vit dans l'URL cible, que le relais doit recevoir intacte ;
 *   - `ods-records-pagination` : 137 lignes en deux pages (`offset=100`), la
 *     source relayée à côté de sa jumelle en direct, sur la même page.
 *
 * Le faux réseau joue le relais par la réécriture inverse (`cibleDuRelais`),
 * écrite à la main : un paramètre perdu par la bibliothèque change la réponse.
 * Le relais RÉEL (`proxy/relay/node/`) est éprouvé à part, hors navigateur
 * (`tests/relay/library-through-relay.test.ts`) et sous Playwright
 * (`e2e/relay-url.spec.ts`).
 *
 * Preuve de mutation — le paramètre `offset` retiré à la réécriture
 * (`resolveDataTransport`, `packages/shared/src/api/relay.ts`) :
 * `relais-ods-pagination` tombe — « affiché 200, recalculé 137 — écart 63 » et
 * « affiché 190 100 000, recalculé 127 684 000 » : la première page est servie
 * deux fois. La jumelle en direct reste juste, à 137 et 127 684 000.
 */
const RELAIS_CACHABLE: Check[] = [
  {
    id: 'relais-ods-groupe-somme',
    mode: 'deterministic',
    constats: ['AM-114'],
    origin:
      'AM-114, ADR-155, #1232 — le controle `ods-groupe-somme` rejoue A TRAVERS LE RELAIS (`relay-url`) : regroupement, somme et tri delegues au portail, la requete partant sur le site hote sous la forme <relais>/<hote>/<chemin>?<requete>. Memes chiffres qu’en direct, la clause `group_by` toujours dans l’URL, et pas une requete de donnees hors du relais.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceOds('s', { relais: true })}
  <dsfr-data-query id="q" source="s" ${FORMES_ODS[0].forme.query}></dsfr-data-query>
  <dsfr-data-list id="l" source="q" columns="${FORMES_ODS[0].forme.colonnes}"></dsfr-data-list>`,
    expects: [
      ...FORMES_ODS[0].forme.expects,
      urlsDe('group-by-delegue', 'ods', 'group_by=', 'last'),
      {
        kind: 'urls',
        id: 'par-le-relais',
        among: RECORDS_ODS,
        contains: PAR_LE_RELAIS,
        verdict: 'all',
      },
    ],
  },
  {
    id: 'relais-ods-pagination',
    mode: 'deterministic',
    constats: ['AM-114'],
    origin:
      'AM-114, ADR-155, #1232 — le controle `ods-records-pagination` rejoue A TRAVERS LE RELAIS, a cote de sa jumelle en direct : 137 lignes en deux pages de 100 (`offset` cumule). Chaque page est reconstruite puis reecrite ; un parametre perdu a la reecriture (l’`offset`) ferait servir deux fois la premiere page — 200 lignes au lieu de 137, population fausse. Relaye = direct, au chiffre pres.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceOds('s-rel', { relais: true, maxRecords: 500 })}
  ${sourceOds('s-dir', { maxRecords: 500 })}
  <dsfr-data-kpi id="k-rel-n" source="s-rel" value="count" format="nombre" label="Lignes (relais)"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-rel-pop" source="s-rel" value="population:sum" format="nombre" label="Population (relais)"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-rel-aca" source="s-rel" value="academie:distinct" format="nombre" label="Académies (relais)"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-dir-n" source="s-dir" value="count" format="nombre" label="Lignes (direct)"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-dir-pop" source="s-dir" value="population:sum" format="nombre" label="Population (direct)"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-rel-n', agg: 'count' },
      { kind: 'kpi', id: 'k-rel-pop', agg: 'sum', field: 'population' },
      { kind: 'kpi', id: 'k-rel-aca', agg: 'distinct', field: 'academie' },
      { kind: 'kpi', id: 'k-dir-n', agg: 'count' },
      { kind: 'kpi', id: 'k-dir-pop', agg: 'sum', field: 'population' },
      // La source relayee a bien pagine A TRAVERS le relais, et sa jumelle en direct
      {
        kind: 'urls',
        id: 'page-2-relayee',
        among: PAR_LE_RELAIS,
        contains: 'offset=100',
        verdict: 'some',
      },
      {
        kind: 'urls',
        id: 'jumelle-en-direct',
        among: RECORDS_ODS,
        contains: PAR_LE_RELAIS,
        verdict: 'some',
      },
      {
        kind: 'urls',
        id: 'direct-inchange',
        among: `${HOTE_ODS}/`,
        contains: RELAIS,
        verdict: 'none',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Tri sur une colonne PRODUITE CÔTÉ CLIENT (#1244)
// ---------------------------------------------------------------------------

/**
 * `order-by` sur une colonne que la query fabrique elle-même (part, cumul,
 * écart) ou qu'un `compute` en amont fabrique : aucun serveur ne la connaît.
 *
 * Mesuré contre les faux serveurs du dépôt avant correction (2026-10-04),
 * `aggregate="population:share_percent" order-by="population__share_percent:asc"`
 * sans `group-by` :
 *   - Opendatasoft recevait `order_by=population__share_percent ASC` (le faux
 *     serveur l'accepte, l'API réelle refuse un champ inconnu) ;
 *   - Tabular recevait `population__share_percent__sort=asc` et refusait la
 *     colonne, comme l'API (42703) : la query n'affichait plus aucune ligne ;
 *   - Grist recevait `sort=Population__share_percent` ;
 *   - et sur AUCUN des trois, ni sur une source sans adaptateur, ni après un
 *     `group-by`, les lignes n'étaient triées : le tri client passait avant
 *     le calcul de la colonne, et ne trouvait rien à trier.
 *
 * Chaque contrôle garde donc les deux moitiés : l'URL (aucun tri délégué) et
 * l'ORDRE des lignes rendues, relu dans un tableau — `rows` compare par clé et
 * ne verrait pas un tri sauté.
 *
 * Les 137 territoires arrivent par population DÉCROISSANTE : les tris demandés
 * sont croissants, pour qu'un tri sauté ne ressemble pas à un tri fait.
 */
const PART_CROISSANTE: Step[] = [
  { op: 'share', from: 'population', as: 'population__share_percent', scale: 100 },
  { op: 'order-by', column: 'population__share_percent', dir: 'asc' },
  { op: 'limit', n: 5 },
];

/** Les cinq plus petites parts, dans l'ordre : la liste, puis les chiffres. */
const ATTENTES_PART_CROISSANTE = (query: string, liste: string): Expect[] => [
  {
    kind: 'list',
    id: liste,
    columns: [{ column: 'region' }, { column: 'population', numeric: true }],
    pipeline: PART_CROISSANTE,
  },
  {
    kind: 'rows',
    id: query,
    key: 'region',
    columns: ['population__share_percent'],
    pipeline: PART_CROISSANTE,
  },
  { kind: 'diagnostic', id: query, expect: 'silence' },
];

const BALISAGE_PART_CROISSANTE = (source: string): string => `
  ${source}
  <dsfr-data-query id="q-tri-part" source="s-tri-part" aggregate="population:share_percent"
    order-by="population__share_percent:asc" limit="5"></dsfr-data-query>
  <dsfr-data-list id="l-tri-part" source="q-tri-part"
    columns="region:Région, population:Population"></dsfr-data-list>`;

const GRIST_PART_DECROISSANTE: Step[] = [
  { op: 'share', from: 'Population', as: 'Population__share_percent', scale: 100 },
  { op: 'order-by', column: 'Population__share_percent', dir: 'desc' },
];

const TRI_SUR_COLONNE_CLIENT: Check[] = [
  {
    id: 'tri-sur-part-jamais-delegue-ods',
    mode: 'deterministic',
    origin:
      '#1244 — Opendatasoft : un tri sur la colonne de PART que la query calcule ne part pas en `order_by` (le portail ne connaît pas `population__share_percent`), et il est appliqué côté client APRÈS le calcul. Avant : `order_by=population__share_percent ASC` dans l’URL, et les cinq lignes rendues étaient les cinq premières reçues — les plus GRANDES parts sous un tri croissant.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: BALISAGE_PART_CROISSANTE(sourceOds('s-tri-part')),
    expects: [
      ...ATTENTES_PART_CROISSANTE('q-tri-part', 'l-tri-part'),
      urlsDe('tri-sur-part-non-delegue', 'ods', 'order_by', 'none'),
    ],
  },

  {
    id: 'tri-sur-part-jamais-delegue-tabular',
    mode: 'deterministic',
    origin:
      '#1244 — Tabular : `population__share_percent__sort=asc` faisait REFUSER la requête (colonne inconnue, comme l’API : 42703), et la query n’affichait plus aucune ligne. Le tri sur une colonne de part reste côté client : aucune clé `__sort` dans l’URL, cinq lignes rendues, dans l’ordre.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: BALISAGE_PART_CROISSANTE(sourceTabular('s-tri-part')),
    expects: [
      ...ATTENTES_PART_CROISSANTE('q-tri-part', 'l-tri-part'),
      urlsDe('tri-sur-part-non-delegue', 'tabular', '__sort', 'none'),
    ],
  },

  {
    id: 'tri-sur-part-jamais-delegue-grist',
    mode: 'deterministic',
    origin:
      '#1244 — Grist : `sort=Population__share_percent` partait au serveur, qui ne porte pas cette colonne. Cinq villes, part décroissante : aucun paramètre `sort` dans l’URL, et Toulouse (35,9 %) en tête au lieu de Lille, première ligne reçue.',
    feed: { kind: 'fixture', datasets: { main: GRIST_LIGNES } },
    markup: `
  <dsfr-data-source id="s-tri-grist" api-type="grist" base-url="${URL_GRIST}"></dsfr-data-source>
  <dsfr-data-query id="q-tri-grist" source="s-tri-grist" aggregate="Population:share_percent"
    order-by="Population__share_percent:desc"></dsfr-data-query>
  <dsfr-data-list id="l-tri-grist" source="q-tri-grist"
    columns="Nom de l'unité:Unité, Population:Population"></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-tri-grist',
        columns: [{ column: "Nom de l'unité" }, { column: 'Population', numeric: true }],
        pipeline: GRIST_PART_DECROISSANTE,
      },
      {
        kind: 'rows',
        id: 'q-tri-grist',
        key: "Nom de l'unité",
        columns: ['Population__share_percent'],
        pipeline: GRIST_PART_DECROISSANTE,
      },
      {
        kind: 'urls',
        id: 'tri-sur-part-non-delegue',
        among: new URL(URL_GRIST).pathname,
        contains: 'sort=',
        verdict: 'none',
      },
    ],
  },

  {
    id: 'tri-sur-part-apres-regroupement',
    mode: 'deterministic',
    origin:
      '#1244 — après un `group-by`, rien n’était délégué (une part retient le regroupement côté client), mais le tri sur la part n’était pas appliqué non plus : sept pays rendus dans l’ordre du regroupement, la France (14,62 %) en tête d’un tri croissant. La part des groupes existe après le tri du pipeline ; le tri est rejoué après son calcul.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceOds('s-tri-groupe')}
  <dsfr-data-query id="q-tri-groupe" source="s-tri-groupe" group-by="pays_iso2"
    aggregate="population:sum:pop, pop:share_percent:part" order-by="part:asc"></dsfr-data-query>
  <dsfr-data-list id="l-tri-groupe" source="q-tri-groupe"
    columns="pays_iso2:Pays, pop:Population"></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-tri-groupe',
        columns: [{ column: 'pays_iso2' }, { column: 'pop', numeric: true }],
        pipeline: [
          {
            op: 'group-by',
            by: 'pays_iso2',
            columns: { pop: { agg: 'sum', field: 'population' } },
          },
          { op: 'share', from: 'pop', as: 'part', scale: 100 },
          { op: 'order-by', column: 'part', dir: 'asc' },
        ],
      },
      urlsDe('tri-sur-part-non-delegue', 'ods', 'order_by', 'none'),
    ],
  },

  {
    id: 'tri-sur-cumul-et-ecart-jamais-delegue',
    mode: 'deterministic',
    origin:
      '#1244 — même défaut sur les CUMULS : `order-by` sur `population__running_sum` ou `population__diff` partait au serveur et n’était pas appliqué. Un cumul trié sur lui-même est calculé dans l’ordre REÇU, puis trié : les cinq plus grands cumuls sont les cinq dernières lignes reçues, dans l’ordre inverse. La bibliothèque le dit (le cumul suit l’ordre des lignes reçues, faute d’une clé de tri qui le précède).',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceOds('s-tri-cumul')}
  <dsfr-data-query id="q-tri-cumul" source="s-tri-cumul" aggregate="population:running_sum"
    order-by="population__running_sum:desc" limit="5"></dsfr-data-query>
  <dsfr-data-list id="l-tri-cumul" source="q-tri-cumul"
    columns="region:Région, population__running_sum:Cumul"></dsfr-data-list>
  ${sourceTabular('s-tri-ecart')}
  <dsfr-data-query id="q-tri-ecart" source="s-tri-ecart" aggregate="population:running_sum, population__running_sum:diff:ecart"
    order-by="ecart:desc" limit="5"></dsfr-data-query>
  <dsfr-data-list id="l-tri-ecart" source="q-tri-ecart"
    columns="region:Région, ecart:Écart"></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-tri-cumul',
        columns: [{ column: 'region' }, { column: 'population__running_sum', numeric: true }],
        pipeline: [
          {
            op: 'running',
            from: 'population',
            as: 'population__running_sum',
            kind: 'running_sum',
          },
          { op: 'order-by', column: 'population__running_sum', dir: 'desc' },
          { op: 'limit', n: 5 },
        ],
      },
      {
        kind: 'diagnostic',
        id: 'q-tri-cumul',
        expect: 'warning',
        contains: 'ne nomme que des colonnes calculées par aggregate',
      },
      // Deux fenêtres enchaînées, triées sur la seconde : l'écart du cumul
      // redonne la population de la ligne, sauf pour la première reçue, qui
      // n'a pas de précédente — elle n'a pas d'écart et sort du classement.
      // Un tri sauté la laisserait en tête.
      {
        kind: 'list',
        id: 'l-tri-ecart',
        columns: [{ column: 'region' }, { column: 'ecart', numeric: true }],
        pipeline: [
          {
            op: 'running',
            from: 'population',
            as: 'population__running_sum',
            kind: 'running_sum',
          },
          { op: 'running', from: 'population__running_sum', as: 'ecart', kind: 'diff' },
          { op: 'order-by', column: 'ecart', dir: 'desc' },
          { op: 'limit', n: 5 },
        ],
      },
      urlsDe('tri-sur-cumul-non-delegue', 'ods', 'order_by', 'none'),
      urlsDe('tri-sur-ecart-non-delegue', 'tabular', '__sort', 'none'),
    ],
  },

  {
    id: 'tri-sur-colonne-de-compute-reste-client',
    mode: 'deterministic',
    origin:
      '#1244 — une colonne issue d’un `compute` (`dsfr-data-normalize` en amont) est, elle aussi, produite côté client. Ce cas n’était PAS en défaut : le relais déclare qu’il transforme le schéma (#394), la query ne délègue donc rien à travers lui et trie elle-même. Le contrôle le garde — un relais qui cesserait de le déclarer enverrait `order_by=double` à un portail qui n’a pas cette colonne.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceOds('s-tri-compute')}
  <dsfr-data-normalize id="n-tri-compute" source="s-tri-compute"
    compute="double = population * 2"></dsfr-data-normalize>
  <dsfr-data-query id="q-tri-compute" source="n-tri-compute" order-by="double:asc"
    limit="5"></dsfr-data-query>
  <dsfr-data-list id="l-tri-compute" source="q-tri-compute"
    columns="region:Région, double:Double"></dsfr-data-list>`,
    expects: [
      {
        kind: 'list',
        id: 'l-tri-compute',
        columns: [{ column: 'region' }, { column: 'double', numeric: true }],
        pipeline: [
          { op: 'derive', expr: 'double = population * 2' },
          { op: 'order-by', column: 'double', dir: 'asc' },
          { op: 'limit', n: 5 },
        ],
      },
      urlsDe('tri-sur-compute-non-delegue', 'ods', 'order_by', 'none'),
    ],
  },
];

export const DELEGATION: Manifest = {
  domain: 'delegation',
  checks: [
    ...PAIRES,
    ...PARTAGE,
    ...PLAFOND,
    ...ATTENTE,
    ...TRI_INITIAL,
    ...TRANSIT,
    ...TABULAR_PERTES,
    ...SANS_ADAPTATEUR,
    ...TABULAR_API,
    ...TABULAR_TRI_AGREGAT,
    ...TABULAR_VOLUME,
    ...TABULAR_OU,
    ...PART_PAR_GROUPE,
    ...REGROUPEMENT_SUR_UNE_PAGE,
    ...RELAIS_CACHABLE,
    ...TRI_SUR_COLONNE_CLIENT,
  ],
};
