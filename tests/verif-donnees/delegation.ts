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
import { MESURES, TERRITOIRES, urlJeu } from './fixtures.js';
import {
  pairePaginee,
  sourceOds,
  sourceTabular,
  TAILLE_PAGE,
  urlsDe,
  type Forme,
} from './fixtures-delegation.js';

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

/** Les départements, par population décroissante : 101 groupes, trois pages de 40. */
const GROUPE_DEPT: Step[] = [
  {
    op: 'group-by',
    by: 'code_dept',
    columns: { population__sum: { agg: 'sum', field: 'population' } },
  },
  { op: 'order-by', column: 'population__sum', dir: 'desc' },
];

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
      '#1025 — une réponse Tabular agrégée ne porte pas de `meta.total` (`{page, page_size}` seulement, `links.next` pagine les groupes, mesuré le 2026-09-22). Lu comme un total de 0, il masquait la pagination d’une liste `server-side` : seuls les 40 premiers des 101 départements étaient atteignables. Total inconnu = `undefined` : la page suivante est proposée tant que la page est pleine, et la page 2 montre les groupes 41 à 80.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  ${sourceTabular('s-dept', { serverSide: true })}
  <dsfr-data-query id="q-dept" source="s-dept" group-by="code_dept" aggregate="population:sum"
    order-by="population__sum:desc"></dsfr-data-query>
  <dsfr-data-list id="l-dept" source="q-dept" columns="code_dept:Département, population__sum:Population"
    server-sort></dsfr-data-list>`,
    actions: [{ kind: 'click', selector: '#l-dept .fr-pagination__link--next' }],
    expects: [
      {
        kind: 'list',
        id: 'l-dept',
        columns: [{ column: 'code_dept' }, { column: 'population__sum', numeric: true }],
        pipeline: [...GROUPE_DEPT, { op: 'page', size: TAILLE_PAGE, number: 2 }],
      },
      urlsDe('groupes-page-deux', 'tabular', 'page=2', 'last'),
    ],
  },
];

export const DELEGATION: Manifest = {
  domain: 'delegation',
  checks: [...PAIRES, ...PARTAGE, ...PLAFOND, ...ATTENTE, ...SANS_ADAPTATEUR, ...TABULAR_API],
};
