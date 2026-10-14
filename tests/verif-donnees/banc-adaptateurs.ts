/**
 * Contrôles VIVANTS du lot « adaptateurs et sources » — un par adaptateur
 * public, contre la vraie API.
 *
 * Les fixtures déterministes prouvent que l'adaptateur lit CE QU'ON LUI SERT ;
 * elles ne prouvent pas que c'est encore la forme que le portail sert
 * aujourd'hui. Un `links.next` qui devient absolu, une mesure qui perd son
 * suffixe, une page dont la taille change : rien de tout cela n'apparaît sur
 * une fixture, et tout cela casse un tableau de bord en production. D'où un
 * contrôle par adaptateur contre l'API réelle.
 *
 * L'oracle appelle la MÊME API, mais par une URL écrite à la main ici, sans
 * adaptateur : les clauses, la pagination et l'extraction du tableau de lignes
 * sont énoncées dans le manifeste (`rowsPath`, `nextPath`), jamais traduites
 * par la bibliothèque.
 *
 * Ces contrôles dépendent d'API tierces : ils tournent la nuit, à la demande,
 * ou sur une PR étiquetée `oracle` — jamais en bloquant
 * (`.github/workflows/oracle.yml`).
 *
 * Grist y figure depuis #1279, par un document PUBLIC de
 * grist.numerique.gouv.fr que le guide du dépôt cite déjà
 * (`guide/examples/exemple-masa-v2.html`, résultats d'un scrutin par
 * département) : lecture anonyme, sans jeton, en-têtes CORS ouverts. C'est
 * sur lui qu'ont été mesurés les deux défauts que ces contrôles gardent —
 * `/records` ignore `offset`, `/sql` rend des lignes `{ fields }`. Si le
 * document venait à être retiré ou fermé, les contrôles se requalifient
 * (`skip`, avec la raison) : ils ne disent rien de la bibliothèque.
 */
import type { Check, Manifest } from '../../tools/oracle/manifest.js';

/**
 * Opendatasoft — le même jeu que `banc.ts`, mais par le chemin d'EXPORT et
 * avec un `where` à parenthèses : les deux points que le déterministe éprouve
 * sur fixture (#689, #767), vérifiés contre le portail.
 */
const WHERE_IPS = "(rentree_scolaire = '2023-2024') and (secteur = 'public')";

/**
 * Tabular — communes de l'Ariège dans le Code officiel géographique.
 * 325 lignes, soit deux pages de 200 côté adaptateur (#1019) : la pagination
 * est réellement exercée. Le filtre est délégué (`DEP__exact`).
 */
const TABULAR_RESSOURCE = '91a95bee-c7c8-45f9-a8aa-f14cc4697545';
const TABULAR_URL =
  `https://tabular-api.data.gouv.fr/api/resources/${TABULAR_RESSOURCE}/data/` +
  `?DEP__exact=09&page_size=100`;

/**
 * Tabular — élus municipaux (RNE) de trois départements, par des colonnes à
 * espaces et accents (#985) : `Code du département`, `Libellé du
 * département`, `Code sexe`. 1 468 lignes au 2026-09-22, huit pages de 200
 * pour l'oracle. L'URL de l'oracle est écrite à la main, percent-encodée ; la
 * projection `columns=` n'y sert qu'à alléger le relevé (deux colonnes sur
 * quinze), elle ne change aucune ligne.
 */
const ELUS_RESSOURCE = '2876a346-d50c-4911-934e-19ee07b0e503';
const ELUS_URL =
  `https://tabular-api.data.gouv.fr/api/resources/${ELUS_RESSOURCE}/data/` +
  `?Code%20du%20d%C3%A9partement__in=01,02,03` +
  `&columns=Libell%C3%A9%20du%20d%C3%A9partement,Code%20sexe&page_size=200`;

/**
 * Tabular — base départementale de la délinquance (SSMSI), année 2025 : le
 * jeu sur lequel le banc a payé PG-033 et PG-034 (#1202, #1233). 1 818 lignes
 * au 2026-10-03 (101 départements × 18 indicateurs), dix pages de 200. L'URL
 * de l'oracle ne porte NI tri NI `__in` : l'ordre par défaut de l'API
 * (`__id`) est stable, et c'est l'oracle qui trie et filtre.
 */
const SSMSI_RESSOURCE = '2b27a675-e3bf-41ef-a852-5fb9ab483967';
const SSMSI_URL =
  `https://tabular-api.data.gouv.fr/api/resources/${SSMSI_RESSOURCE}/data/` +
  `?annee__exact=2025&page_size=200`;

/**
 * Tabular — la recherche serveur multi-colonnes (#1026) sur les mêmes élus,
 * relevés par nom et prénom. L'oracle ne délègue RIEN : il relève les lignes
 * brutes des trois départements et applique lui-même le OU entre les deux
 * colonnes. Sur la ressource entière, mesuré le 2026-09-23 :
 * `or=(Nom de l'élu__contains.MARTIN,Prénom de l'élu__contains.MARTIN)` →
 * 351 = 189 + 164 − 2.
 */
const ELUS_NOMS_URL =
  `https://tabular-api.data.gouv.fr/api/resources/${ELUS_RESSOURCE}/data/` +
  `?Code%20du%20d%C3%A9partement__in=01,02,03` +
  `&columns=Nom%20de%20l%27%C3%A9lu,Pr%C3%A9nom%20de%20l%27%C3%A9lu&page_size=200`;

/**
 * Tabular — export Parquet (#1055) : arrondissements du COG au 01/01/2025,
 * 333 lignes, millésime figé. L'oracle relève les lignes par l'API paginée
 * (deux pages de 200), la bibliothèque par l'export Parquet de la même
 * analyse. Le jeu est petit à dessein : le relevé de l'oracle ne coûte que
 * deux requêtes à l'API, qui a déjà bloqué une IP à ~250 requêtes en 15 s
 * (étude #1022).
 */
const ARR_RESSOURCE = 'e3bd015d-7593-4bc5-a236-8410167e4599';
const ARR_URL = `https://tabular-api.data.gouv.fr/api/resources/${ARR_RESSOURCE}/data/?page_size=200`;

/**
 * Tabular — les mêmes élus, relevés par les deux colonnes du lot 2 de
 * l'ADR-159 (#1285) : « Libellé de la collectivité à statut particulier »,
 * NULLE hors de Corse (34 328 lignes sur 34 826 au 2026-10-14), et « Libellé de
 * la catégorie socio-professionnelle », dont aucun libellé ne porte de « _ ».
 */
const ELUS_JOKERS_URL =
  `https://tabular-api.data.gouv.fr/api/resources/${ELUS_RESSOURCE}/data/` +
  `?Code%20du%20d%C3%A9partement__in=01,02,03` +
  `&columns=Libell%C3%A9%20de%20la%20collectivit%C3%A9%20%C3%A0%20statut%20particulier,` +
  `Libell%C3%A9%20de%20la%20cat%C3%A9gorie%20socio-professionnelle&page_size=200`;

/**
 * Tabular — les élus de l'Ain et des deux départements corses (#1312) : 718
 * lignes au 2026-10-14, « Libellé de la collectivité à statut particulier »
 * NULLE sur les 359 de l'Ain, « Corse » sur les 359 autres.
 */
const COLLECTIVITE = 'Libellé de la collectivité à statut particulier';
const ELUS_NEGATIONS_URL =
  `https://tabular-api.data.gouv.fr/api/resources/${ELUS_RESSOURCE}/data/` +
  `?Code%20du%20d%C3%A9partement__in=01,2A,2B` +
  `&columns=Libell%C3%A9%20de%20la%20collectivit%C3%A9%20%C3%A0%20statut%20particulier&page_size=200`;

/** Le OU entre les deux colonnes, pour l'oracle (Tabular : `ilike`, sans repliement d'accents). */
const MARTIN_NOM_OU_PRENOM = {
  op: 'or' as const,
  any: [
    { field: "Nom de l'élu", op: 'contains' as const, value: 'MARTIN' },
    { field: "Prénom de l'élu", op: 'contains' as const, value: 'MARTIN' },
  ],
};

/**
 * INSEE Melodi — décès quotidiens d'un département, pour une date figée.
 * L'oracle compte les OBSERVATIONS brutes ; la page compte les lignes
 * aplaties. Les deux doivent donner le même nombre : un aplatissement qui
 * perd ou duplique une observation se voit là, et nulle part ailleurs.
 */
const MELODI_DATASET = 'DS_EC_DECES';
const MELODI_GEO = '2025-DEP-01';
const MELODI_PERIODE = '2026-06-21';
const MELODI_URL =
  `https://api.insee.fr/melodi/data/${MELODI_DATASET}` +
  `?maxResult=1000&totalCount=TRUE&GEO=${MELODI_GEO}&TIME_PERIOD=${MELODI_PERIODE}`;

/**
 * INSEE Melodi — décès MENSUELS de trois départements : 1 678 observations au
 * 2026-10-13, donc deux pages de 1 000 côté adaptateur (#1279). L'API n'offre
 * aucun tri ; l'oracle relève les mêmes observations en UNE requête
 * (`maxResult=5000`), que la pagination ne touche pas, et ne garde que leurs
 * dimensions (`rowPath`).
 */
const MELODI_LONG_FILTRE = 'GEO=2025-DEP-01&GEO=2025-DEP-02&GEO=2025-DEP-03&FREQ=M';
const MELODI_LONG_URL =
  `https://api.insee.fr/melodi/data/${MELODI_DATASET}` +
  `?maxResult=5000&totalCount=TRUE&${MELODI_LONG_FILTRE}`;

/**
 * Grist — document public de grist.numerique.gouv.fr, table `Scrutin_c1` :
 * une ligne par département (101 au 2026-10-13), `code_dept` unique, `region`
 * sur treize valeurs. L'oracle lit la table entière par `/records`, en une
 * requête, et descend dans `fields`.
 */
const GRIST_DOC = 'https://grist.numerique.gouv.fr/api/docs/pU5HXX7VJC6jdgU6oBJRxn';
const GRIST_RECORDS = `${GRIST_DOC}/tables/Scrutin_c1/records`;
const GRIST_SOURCE = { url: GRIST_RECORDS, rowsPath: 'records', rowPath: 'fields' };
const GRIST_PAGE = 20;
const GRIST_COLONNES = [{ column: 'code_dept' }, { column: 'nom_dept' }];

/**
 * Opendatasoft — taux de change de chancellerie (DGFiP), Haïti, monnaies en
 * vigueur : le jeu sur lequel #1274 a été payé. 321 lignes au 2026-10-12,
 * deux monnaies (HTG, USD), donc quatre pages de 100 côté adaptateur.
 * L'oracle relève les lignes par l'export (`/exports/json`, une requête),
 * que le défaut ne touche pas.
 */
const CHANGE_PORTAIL = 'https://data.economie.gouv.fr';
const CHANGE_JEU = 'dgfip-taux-de-change';
const CHANGE_WHERE = 'monnaievigueur = 1 AND code_pays = "HT"';

/**
 * Opendatasoft — RappelConso (DGCCRF), le jeu sur lequel #1285 a été trouvé et
 * mesuré : `categorie_produit like "%aliment%"` y rend 0 ligne pour 14 366
 * « alimentation ». Quatre catégories, 836 lignes au 2026-10-13 — assez pour
 * que `sous_categorie_produit` porte des sous-chaînes qu'aucun mot entier ne
 * trouve (« smétiqu » dans « cosmétiques »), une apostrophe typographique,
 * des accents, des virgules, une parenthèse. La clause de l'oracle est écrite
 * à la main, sans `like`.
 */
const RAPPEL_PORTAIL = 'https://data.economie.gouv.fr';
const RAPPEL_JEU = 'rappelconso-v2-gtin-trie';
const RAPPEL_WHERE =
  'categorie_produit in ("hygiène-beauté", "sports-loisirs", ' +
  '"automobiles et moyens de déplacement", "equipements de communication")';
const RAPPEL_SOURCE = (id: string): string => `
  <dsfr-data-source id="${id}" api-type="opendatasoft"
    base-url="${RAPPEL_PORTAIL}" dataset-id="${RAPPEL_JEU}" max-records="2000"
    where="${RAPPEL_WHERE.replace(/"/g, '&quot;')}"></dsfr-data-source>`;
const rappelKpi = (id: string, source: string): string => `
  <dsfr-data-kpi id="${id}" source="${source}" value="count" format="nombre" label="${id}"></dsfr-data-kpi>`;
const sousCategorie = (op: 'contains' | 'notcontains', value: string) => [
  { op: 'filter' as const, filters: [{ field: 'sous_categorie_produit', op, value }] },
];

const CHECKS: Check[] = [
  {
    id: 'ods-rappelconso-contains-vivant',
    mode: 'live',
    origin:
      "data.economie.gouv.fr / RappelConso — #1285, ADR-159, contre le vrai portail. Le `like` d'Opendatasoft compare des MOTS, pas une sous-chaîne : la bibliothèque ne lui confie donc plus `contains` ni `notcontains`, qu'elle calcule dans le navigateur. Chaque clause est jouée par une requête seule lectrice de sa source — le chemin qui, avant #1285, partait au portail en `like \"%…%\"` — et recalculée par l'oracle depuis l'export. « smétiqu », pris au MILIEU d'un mot : `like \"%smétiqu%\"` rend ZÉRO ligne sur le portail, le navigateur retient les « cosmétiques ». « produits d », à cheval sur deux mots. `notcontains:smétiqu` : la négation, qui par `NOT like` gardait tout le jeu. Aucun `like` ne part. Si le défaut revenait, le premier chiffre tomberait à zéro contre le vrai portail — ce que le faux portail du dépôt, s'il redevenait complaisant, ne verrait pas.",
    feed: {
      kind: 'raw',
      source: { baseUrl: RAPPEL_PORTAIL, dataset: RAPPEL_JEU, where: RAPPEL_WHERE },
    },
    markup: `${RAPPEL_SOURCE('s-rc-milieu')}
  <dsfr-data-query id="q-rc-milieu" source="s-rc-milieu" where="sous_categorie_produit:contains:smétiqu"></dsfr-data-query>${rappelKpi('k-rc-milieu', 'q-rc-milieu')}${RAPPEL_SOURCE('s-rc-deux')}
  <dsfr-data-query id="q-rc-deux" source="s-rc-deux" where="sous_categorie_produit:contains:produits d"></dsfr-data-query>${rappelKpi('k-rc-deux', 'q-rc-deux')}${RAPPEL_SOURCE('s-rc-sans')}
  <dsfr-data-query id="q-rc-sans" source="s-rc-sans" where="sous_categorie_produit:notcontains:smétiqu"></dsfr-data-query>${rappelKpi('k-rc-sans', 'q-rc-sans')}`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-rc-milieu',
        agg: 'count',
        pipeline: sousCategorie('contains', 'smétiqu'),
      },
      {
        kind: 'kpi',
        id: 'k-rc-deux',
        agg: 'count',
        pipeline: sousCategorie('contains', 'produits d'),
      },
      {
        kind: 'kpi',
        id: 'k-rc-sans',
        agg: 'count',
        pipeline: sousCategorie('notcontains', 'smétiqu'),
      },
      {
        kind: 'urls',
        id: 'rappel-contains-jamais-en-like',
        among: `/datasets/${RAPPEL_JEU}/records`,
        contains: ' like ',
        verdict: 'none',
      },
    ],
  },

  {
    id: 'ods-rappelconso-recherche-contexte-vivant',
    mode: 'live',
    origin:
      "data.economie.gouv.fr / RappelConso — #1285, ADR-159 lot 3, contre le vrai portail. Une recherche `dsfr-data-search` en mode `context` n'est plus un filtre `contains` : vers une cible Opendatasoft, le contexte la confie au moteur de recherche du portail, borné au champ (`search(champ, \"terme\")`). Ce moteur cherche par DÉBUT DE MOT, sans casse ni accents — et c'est ce que l'oracle recalcule depuis l'export, sans rien lui emprunter. Trois montages. « cre » dans `libelle` : les libellés dont un mot COMMENCE par « cre » (113 le 2026-10-13), et non les 118 qui portent la sous-chaîne — l'écart de cinq est ce qui distingue la recherche du filtre. « VÉLOS » dans `sous_categorie_produit` : casse et accents ignorés. « cosm » vers une source en `server-side`, à côté de facettes `server-facets` : les deux montages que le lot 1 laissait en erreur de configuration — le total publié par la pagination et les compteurs des facettes comptent le même ensemble que l'oracle. Aucun `like` ne part. Ce contrôle garde aussi ce que le faux portail du dépôt ne sait pas voir : que le portail accepte la clause telle que la bibliothèque l'écrit.",
    feed: {
      kind: 'raw',
      source: { baseUrl: RAPPEL_PORTAIL, dataset: RAPPEL_JEU, where: RAPPEL_WHERE },
    },
    markup: `${RAPPEL_SOURCE('s-rr-mot')}
  <dsfr-data-context id="ctx-rr-mot" sources="s-rr-mot"></dsfr-data-context>
  <dsfr-data-search id="r-rr-mot" source="s-rr-mot" context="ctx-rr-mot" fields="libelle"
    debounce="0" min-length="0" label="Libellé"></dsfr-data-search>${rappelKpi('k-rr-mot', 's-rr-mot')}${RAPPEL_SOURCE('s-rr-accent')}
  <dsfr-data-context id="ctx-rr-accent" sources="s-rr-accent"></dsfr-data-context>
  <dsfr-data-search id="r-rr-accent" source="s-rr-accent" context="ctx-rr-accent"
    fields="sous_categorie_produit" debounce="0" min-length="0" label="Sous-catégorie"></dsfr-data-search>${rappelKpi('k-rr-accent', 's-rr-accent')}
  <dsfr-data-source id="s-rr-page" api-type="opendatasoft"
    base-url="${RAPPEL_PORTAIL}" dataset-id="${RAPPEL_JEU}" server-side page-size="20"
    where="${RAPPEL_WHERE.replace(/"/g, '&quot;')}"></dsfr-data-source>
  <dsfr-data-context id="ctx-rr-page" sources="s-rr-page"></dsfr-data-context>
  <dsfr-data-search id="r-rr-page" source="s-rr-page" context="ctx-rr-page"
    fields="sous_categorie_produit" debounce="0" min-length="0" count label="Sous-catégorie, paginée"></dsfr-data-search>
  <dsfr-data-kpi id="k-rr-total" source="s-rr-page" value="meta:total" format="nombre" label="Total publié"></dsfr-data-kpi>
  <dsfr-data-facets id="f-rr-page" source="s-rr-page" server-facets fields="categorie_produit"
    labels="categorie_produit:Catégorie"></dsfr-data-facets>`,
    actions: [
      { kind: 'fill', selector: '#r-rr-mot input', value: 'cre' },
      { kind: 'fill', selector: '#r-rr-accent input', value: 'VÉLOS' },
      { kind: 'fill', selector: '#r-rr-page input', value: 'cosm' },
    ],
    expects: [
      {
        kind: 'kpi',
        id: 'k-rr-mot',
        agg: 'count',
        pipeline: [
          { op: 'filter', filters: [{ op: 'word-prefix', fields: ['libelle'], value: 'cre' }] },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-rr-accent',
        agg: 'count',
        pipeline: [
          {
            op: 'filter',
            filters: [{ op: 'word-prefix', fields: ['sous_categorie_produit'], value: 'VÉLOS' }],
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-rr-total',
        agg: 'count',
        pipeline: [
          {
            op: 'filter',
            filters: [{ op: 'word-prefix', fields: ['sous_categorie_produit'], value: 'cosm' }],
          },
        ],
      },
      {
        kind: 'text',
        id: 'r-rr-page',
        selector: '.dsfr-data-search-count',
        numeric: true,
        agg: 'count',
        pipeline: [
          {
            op: 'filter',
            filters: [{ op: 'word-prefix', fields: ['sous_categorie_produit'], value: 'cosm' }],
          },
        ],
      },
      {
        kind: 'facets',
        id: 'f-rr-page',
        group: 'Catégorie',
        valueColumn: 'categorie_produit',
        countColumn: 'n',
        pipeline: [
          {
            op: 'filter',
            filters: [{ op: 'word-prefix', fields: ['sous_categorie_produit'], value: 'cosm' }],
          },
          { op: 'group-by', by: 'categorie_produit', columns: { n: { agg: 'count' } } },
          { op: 'order-by', column: 'n', dir: 'desc' },
        ],
      },
      { kind: 'diagnostic', id: 's-rr-page', expect: 'silence', contains: 'server-side' },
      { kind: 'diagnostic', id: 'f-rr-page', expect: 'silence', contains: 'server-facets' },
      {
        kind: 'urls',
        id: 'rappel-recherche-par-le-moteur',
        among: `/datasets/${RAPPEL_JEU}/`,
        contains: 'search(libelle, "cre")',
        verdict: 'some',
      },
      {
        kind: 'urls',
        id: 'rappel-recherche-jamais-en-like',
        among: `/datasets/${RAPPEL_JEU}/`,
        contains: ' like ',
        verdict: 'none',
      },
    ],
  },

  {
    id: 'ods-taux-de-change-pagination-vivant',
    mode: 'live',
    origin:
      "data.economie.gouv.fr / taux de change de chancellerie — #1274, contre le vrai portail. Au-delà de 100 lignes, `/records` pagine par offset sans garantir l'ordre : sur Haïti, 321 lignes reçues pour 297 à 303 distinctes, faux dix fois sur dix le jour de l'issue, juste cinq fois sur cinq le 2026-10-12 — le défaut est intermittent. L'adaptateur relit donc sur un ordre total, le tri de départage étant fait de toutes les colonnes triables du jeu. Trois chiffres que seul l'ENSEMBLE exact des lignes rend juste : les lignes elles-mêmes (monnaie, date, taux, dans l'ordre livré), le nombre de taux en gourdes — celui que la page affichait faux, 162 au lieu de 154 — et le nombre de dates distinctes. CE CONTRÔLE GARDE AUSSI LA CLÉ DE DÉPARTAGE : si le portail venait à refuser un tri sur toutes les colonnes, l'adaptateur replierait en le disant, et le silence exigé ici serait rompu.",
    feed: {
      kind: 'raw',
      source: { baseUrl: CHANGE_PORTAIL, dataset: CHANGE_JEU, where: CHANGE_WHERE },
    },
    markup: `
  <dsfr-data-source id="s-change" api-type="opendatasoft"
    base-url="${CHANGE_PORTAIL}" dataset-id="${CHANGE_JEU}"
    where="${CHANGE_WHERE.replace(/"/g, '&quot;')}"></dsfr-data-source>
  <dsfr-data-kpi id="k-change-n" source="s-change" value="count" format="nombre" label="Taux"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-change-htg" source="s-change" value="count{monnaie_source:eq:HTG}" format="nombre"
    label="Taux en gourdes"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-change-dates" source="s-change" value="date:distinct" format="nombre"
    label="Dates"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'rows',
        id: 's-change',
        key: ['monnaie_source', 'date'],
        columns: ['taux'],
        // L'ordre livré est celui de la clé de départage : les colonnes du
        // jeu dans l'ordre de ses champs. Pour un seul pays, la monnaie puis
        // la date suffisent à le dire.
        pipeline: [
          {
            op: 'order-by-keys',
            keys: [
              { column: 'monnaie_source', dir: 'asc' },
              { column: 'date', dir: 'asc' },
            ],
          },
        ],
      },
      { kind: 'kpi', id: 'k-change-n', agg: 'count' },
      {
        kind: 'kpi',
        id: 'k-change-htg',
        agg: 'count',
        pipeline: [
          { op: 'filter', filters: [{ field: 'monnaie_source', op: 'eq', value: 'HTG' }] },
        ],
      },
      { kind: 'kpi', id: 'k-change-dates', agg: 'distinct', field: 'date' },
      {
        kind: 'urls',
        id: 'change-pagine-sur-un-ordre-total',
        among: `/datasets/${CHANGE_JEU}/records`,
        // Le journal de la page consigne les URL DÉCODÉES
        contains:
          'order_by=monnaie_source, nom_monnaie_source, pays_principal, code_pays, date, taux, monnaievigueur',
        verdict: 'last',
      },
      { kind: 'diagnostic', id: 's-change', expect: 'silence', contains: 'sans ordre total' },
    ],
  },

  {
    id: 'ods-export-where-parenthese-vivant',
    mode: 'live',
    page: 'education/dataviz-ips-colleges',
    constats: ['AM-011'],
    origin:
      'education/dataviz-ips-colleges — `fetch-mode="export"` et un `where` ODSQL à parenthèses contre le portail réel (#689, #767) : ce que la fixture promet, le portail le fait-il encore ?',
    feed: {
      kind: 'raw',
      source: {
        baseUrl: 'https://data.education.gouv.fr',
        dataset: 'donnees-ips-colleges',
        where: WHERE_IPS,
      },
    },
    markup: `
  <dsfr-data-source id="s-ips" api-type="opendatasoft"
    base-url="https://data.education.gouv.fr" dataset-id="donnees-ips-colleges"
    fetch-mode="export" max-records="20000"
    where="${WHERE_IPS.replace(/"/g, '&quot;')}"></dsfr-data-source>
  <dsfr-data-kpi id="k-ips-n" source="s-ips" value="count" format="nombre" label="Colleges"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-ips-avg" source="s-ips" value="ips:avg" format="decimal" decimals="1" label="IPS moyen"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-ips-aca" source="s-ips" value="libelle_academie:distinct" format="nombre" label="Academies"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-ips-n', agg: 'count' },
      { kind: 'kpi', id: 'k-ips-avg', agg: 'avg', field: 'ips', decimals: 1 },
      { kind: 'kpi', id: 'k-ips-aca', agg: 'distinct', field: 'libelle_academie' },
    ],
  },

  {
    id: 'tabular-cog-communes-vivant',
    mode: 'live',
    origin:
      'data.gouv / Code officiel geographique — Tabular en vrai : filtre delegue, sept pages suivies par `links.next`, et un `meta.total` qui doit coller au nombre de lignes rendues.',
    feed: {
      kind: 'raw',
      source: { url: TABULAR_URL, rowsPath: 'data', nextPath: 'links.next' },
    },
    markup: `
  <dsfr-data-source id="s-cog" api-type="tabular" resource="${TABULAR_RESSOURCE}"
    where="DEP:eq:09"></dsfr-data-source>
  <dsfr-data-kpi id="k-cog-n" source="s-cog" value="count" format="nombre" label="Communes"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-cog-arr" source="s-cog" value="ARR:distinct" format="nombre" label="Arrondissements"></dsfr-data-kpi>
  <dsfr-data-query id="q-cog" source="s-cog" group-by="ARR"
    aggregate="COM:count:nb" order-by="nb:desc"></dsfr-data-query>`,
    expects: [
      { kind: 'kpi', id: 'k-cog-n', agg: 'count' },
      { kind: 'kpi', id: 'k-cog-arr', agg: 'distinct', field: 'ARR' },
      {
        kind: 'rows',
        id: 'q-cog',
        key: 'ARR',
        columns: ['nb'],
        pipeline: [
          { op: 'group-by', by: 'ARR', columns: { nb: { agg: 'count', field: 'COM' } } },
          { op: 'order-by', column: 'nb', dir: 'desc' },
        ],
      },
    ],
  },

  {
    id: 'tabular-elus-colonne-a-espaces-vivant',
    mode: 'live',
    origin:
      'data.gouv / Répertoire national des élus — #985 : des noms de colonnes à espaces et accents se délèguent à l’API réelle. Mesuré le 2026-09-22 : `Libellé du département__groupby&Code sexe__count` → 200 (le parseur accepte le nom nu, percent-encodé), là où l’ancien garde-fou (#244, #289) forçait le téléchargement de toutes les lignes. Le regroupement, le filtre `in` et la projection `select` → `columns=` partent au serveur ; l’oracle, lui, relève les lignes brutes et regroupe seul.',
    feed: {
      kind: 'raw',
      source: { url: ELUS_URL, rowsPath: 'data', nextPath: 'links.next' },
    },
    markup: `
  <dsfr-data-source id="s-elus" api-type="tabular" resource="${ELUS_RESSOURCE}"
    where="Code du département:in:01|02|03"
    select="Libellé du département, Code sexe"></dsfr-data-source>
  <dsfr-data-kpi id="k-elus-n" source="s-elus" value="count" format="nombre" label="Élus"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-elus-dep" source="s-elus" value="Libellé du département:distinct" format="nombre"
    label="Départements"></dsfr-data-kpi>
  <dsfr-data-source id="s-elus-g" api-type="tabular" resource="${ELUS_RESSOURCE}"
    where="Code du département:in:01|02|03"></dsfr-data-source>
  <dsfr-data-query id="q-elus" source="s-elus-g" group-by="Libellé du département"
    aggregate="Code sexe:count"></dsfr-data-query>
  <dsfr-data-list id="l-elus" source="q-elus"
    columns="Libellé du département:Département, Code sexe__count:Élus"></dsfr-data-list>`,
    expects: [
      { kind: 'kpi', id: 'k-elus-n', agg: 'count' },
      { kind: 'kpi', id: 'k-elus-dep', agg: 'distinct', field: 'Libellé du département' },
      {
        kind: 'rows',
        id: 'q-elus',
        key: 'Libellé du département',
        columns: ['Code sexe__count'],
        pipeline: [
          {
            op: 'group-by',
            by: 'Libellé du département',
            columns: { 'Code sexe__count': { agg: 'count', field: 'Code sexe' } },
          },
        ],
      },
      {
        kind: 'urls',
        id: 'elus-groupby-delegue',
        among: `/api/resources/${ELUS_RESSOURCE}/data/`,
        // Le journal de la page consigne les URL DÉCODÉES
        contains: 'Libellé du département__groupby',
        verdict: 'some',
      },
      {
        kind: 'urls',
        id: 'elus-projection',
        among: `/api/resources/${ELUS_RESSOURCE}/data/`,
        contains: 'columns=Libellé du département,Code sexe',
        verdict: 'some',
      },
    ],
  },

  {
    id: 'tabular-export-parquet-vivant',
    mode: 'live',
    origin:
      'data.gouv / Code officiel géographique, arrondissements au 01/01/2025 — #1055, étude #1022 : `fetch-mode="export"` lit le VRAI export Parquet (résolu par `/api/2/datasets/resources/{rid}/`, servi par `hydra.s3` par plages), là où l’oracle relève les lignes par l’API paginée. Même nombre de lignes, même somme, mêmes modalités : les deux sorties de la même analyse hydra doivent coller. Millésime figé, 333 lignes au 2026-09-23, deux pages pour l’oracle.',
    feed: {
      kind: 'raw',
      source: { url: ARR_URL, rowsPath: 'data', nextPath: 'links.next' },
    },
    markup: `
  <dsfr-data-source id="s-arr-pq" api-type="tabular" resource="${ARR_RESSOURCE}"
    fetch-mode="export"></dsfr-data-source>
  <dsfr-data-kpi id="k-arr-n" source="s-arr-pq" value="count" format="nombre" label="Arrondissements"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-arr-tncc" source="s-arr-pq" value="TNCC:sum" format="nombre" label="Somme TNCC"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-arr-dep" source="s-arr-pq" value="DEP:distinct" format="nombre" label="Départements"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-arr-n', agg: 'count' },
      { kind: 'kpi', id: 'k-arr-tncc', agg: 'sum', field: 'TNCC' },
      { kind: 'kpi', id: 'k-arr-dep', agg: 'distinct', field: 'DEP' },
      {
        kind: 'rows',
        id: 's-arr-pq',
        key: 'ARR',
        columns: ['DEP', 'REG', 'TNCC', 'LIBELLE'],
        pipeline: [],
      },
      {
        kind: 'urls',
        id: 'arr-parquet-lu',
        among: 'hydra.s3',
        contains: '.parquet',
        verdict: 'some',
      },
      {
        kind: 'urls',
        id: 'arr-sans-pagination',
        among: ARR_RESSOURCE,
        contains: '/data/',
        verdict: 'none',
      },
    ],
  },

  {
    id: 'tabular-elus-recherche-multi-colonnes-vivant',
    mode: 'live',
    origin:
      'data.gouv / Répertoire national des élus — #1026 : `dsfr-data-search fields="Nom de l’élu,Prénom de l’élu" server-search` part à l’API réelle en `or=(Nom de l’élu__contains.MARTIN,Prénom de l’élu__contains.MARTIN)`, en ET avec le filtre de la source. Le compteur lit `meta.total`, sur tout le jeu et non sur la page de 20 chargée. L’oracle relève les lignes brutes des trois départements et fait le OU lui-même.',
    feed: {
      kind: 'raw',
      source: { url: ELUS_NOMS_URL, rowsPath: 'data', nextPath: 'links.next' },
    },
    markup: `
  <dsfr-data-source id="s-elus-ou" api-type="tabular" resource="${ELUS_RESSOURCE}"
    where="Code du département:in:01|02|03" server-side page-size="20"></dsfr-data-source>
  <dsfr-data-search id="r-elus-ou" source="s-elus-ou" fields="Nom de l'élu,Prénom de l'élu"
    server-search count debounce="0" min-length="0" label="Rechercher un élu"></dsfr-data-search>
  <dsfr-data-kpi id="k-elus-ou" source="r-elus-ou" value="meta:total" format="nombre"
    label="Élus trouvés"></dsfr-data-kpi>`,
    actions: [{ kind: 'fill', selector: '#r-elus-ou input', value: 'MARTIN' }],
    expects: [
      {
        kind: 'text',
        id: 'r-elus-ou',
        selector: '.dsfr-data-search-count',
        numeric: true,
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [MARTIN_NOM_OU_PRENOM] }],
      },
      {
        kind: 'kpi',
        id: 'k-elus-ou',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [MARTIN_NOM_OU_PRENOM] }],
      },
      {
        kind: 'urls',
        id: 'elus-or-delegue',
        among: `/api/resources/${ELUS_RESSOURCE}/data/`,
        // Le journal de la page consigne les URL DÉCODÉES
        contains: "or=(Nom de l'élu__contains.MARTIN,Prénom de l'élu__contains.MARTIN)",
        verdict: 'last',
      },
    ],
  },

  {
    id: 'tabular-elus-top-agregat-vivant',
    mode: 'live',
    origin:
      'data.gouv / Répertoire national des élus — #1045 : un regroupement trié sur son AGRÉGAT (« top 2 » des départements par nombre d’élus). L’API ne trie pas une colonne d’agrégat : `NB_VP__sum__sort=desc` avec `EPCI__groupby&NB_VP__sum` → 400, 42703 « column …NB_VP__sum does not exist », mesuré le 2026-09-23, sans en-tête CORS. Le regroupement part au serveur, le tri non : l’adaptateur trie les groupes complets, en chargement complet comme en pagination serveur. L’oracle relève les lignes brutes, regroupe et trie seul.',
    feed: {
      kind: 'raw',
      source: { url: ELUS_URL, rowsPath: 'data', nextPath: 'links.next' },
    },
    markup: `
  <dsfr-data-source id="s-elus-top" api-type="tabular" resource="${ELUS_RESSOURCE}"
    where="Code du département:in:01|02|03"></dsfr-data-source>
  <dsfr-data-query id="q-elus-top" source="s-elus-top" group-by="Libellé du département"
    aggregate="Code sexe:count" order-by="Code sexe__count:desc" limit="2"></dsfr-data-query>
  <dsfr-data-list id="l-elus-top" source="q-elus-top"
    columns="Libellé du département:Département, Code sexe__count:Élus"></dsfr-data-list>
  <dsfr-data-source id="s-elus-page" api-type="tabular" resource="${ELUS_RESSOURCE}"
    where="Code du département:in:01|02|03" server-side page-size="2"></dsfr-data-source>
  <dsfr-data-query id="q-elus-page" source="s-elus-page" group-by="Libellé du département"
    aggregate="Code sexe:count" order-by="Code sexe__count:desc"></dsfr-data-query>
  <dsfr-data-list id="l-elus-page" source="q-elus-page" server-sort
    columns="Libellé du département:Département, Code sexe__count:Élus"></dsfr-data-list>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-elus-top',
        key: 'Libellé du département',
        columns: ['Code sexe__count'],
        pipeline: [
          {
            op: 'group-by',
            by: 'Libellé du département',
            columns: { 'Code sexe__count': { agg: 'count', field: 'Code sexe' } },
          },
          { op: 'order-by', column: 'Code sexe__count', dir: 'desc' },
          { op: 'limit', n: 2 },
        ],
      },
      {
        kind: 'list',
        id: 'l-elus-page',
        columns: [
          { column: 'Libellé du département' },
          { column: 'Code sexe__count', numeric: true },
        ],
        pipeline: [
          {
            op: 'group-by',
            by: 'Libellé du département',
            columns: { 'Code sexe__count': { agg: 'count', field: 'Code sexe' } },
          },
          { op: 'order-by', column: 'Code sexe__count', dir: 'desc' },
          { op: 'page', size: 2, number: 1 },
        ],
      },
      {
        kind: 'urls',
        id: 'elus-top-groupby-delegue',
        among: `/api/resources/${ELUS_RESSOURCE}/data/`,
        // Le journal de la page consigne les URL DÉCODÉES
        contains: 'Libellé du département__groupby',
        verdict: 'some',
      },
      {
        kind: 'urls',
        id: 'elus-top-tri-non-delegue',
        among: `/api/resources/${ELUS_RESSOURCE}/data/`,
        contains: '__sort',
        verdict: 'none',
      },
    ],
  },

  {
    id: 'tabular-ssmsi-pertes-silencieuses-vivant',
    mode: 'live',
    constats: ['PG-033', 'PG-034'],
    origin:
      'data.gouv / base départementale de la délinquance (SSMSI) — #1202, #1233, PG-033 et PG-034 du banc, contre la vraie API. Trois chargements, chacun avec un chiffre que seul l’ENSEMBLE exact des lignes rend juste. (1) Groupé et trié sur une colonne de regroupement non unique : 1 818 groupes, que l’API rend en 1 805 distincts quand le tri la suit de page en page — l’adaptateur les relit sans tri. (2) Tronqué à 600 et trié : l’API rend 550 lignes distinctes sur 600, et ignore un second `__sort` ; l’adaptateur compose un ordre total dans la VALEUR du tri (`Code_region__sort=asc,"__id".asc`), forme que l’API passe à PostgREST sans la documenter (mesuré le 2026-10-03 : 600 distinctes, les 600 premières). CE CONTRÔLE GARDE CETTE FORME : s’il rougit ici, l’API a cessé de l’honorer. (3) `in` / `notin` à parenthèse posés sur la source : la valeur part ENTRE GUILLEMETS (`indicateur__in=Homicides,"Usage de stupéfiants (AFD)"`), autre forme que l’API passe à PostgREST sans la documenter — 202 lignes en une requête, 101 quand la valeur part nue ; 1 717 pour `notin`, 1 818 quand plus rien n’est exclu (mesuré le 2026-10-04). CE CONTRÔLE GARDE AUSSI CETTE FORME : si l’API venait à l’ignorer sans erreur, rien d’autre ne rougirait (refusée, l’adaptateur replie sur le calcul côté client et le dit).',
    feed: {
      kind: 'raw',
      source: { url: SSMSI_URL, rowsPath: 'data', nextPath: 'links.next' },
    },
    markup: `
  <dsfr-data-source id="s-ssmsi-groupe" api-type="tabular" resource="${SSMSI_RESSOURCE}"
    where="annee:eq:2025" group-by="Code_departement, indicateur" aggregate="nombre:sum"
    order-by="Code_departement:asc"></dsfr-data-source>
  <dsfr-data-kpi id="k-ssmsi-groupes" source="s-ssmsi-groupe" value="count" format="nombre"
    label="Groupes"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-ssmsi-groupe-somme" source="s-ssmsi-groupe" value="nombre__sum:sum"
    format="nombre" label="Faits"></dsfr-data-kpi>
  <dsfr-data-source id="s-ssmsi-tronque" api-type="tabular" resource="${SSMSI_RESSOURCE}"
    where="annee:eq:2025" order-by="Code_region:asc" max-records="600"></dsfr-data-source>
  <dsfr-data-kpi id="k-ssmsi-tronque" source="s-ssmsi-tronque" value="__id:sum" format="nombre"
    label="Somme des identifiants de ligne"></dsfr-data-kpi>
  <dsfr-data-source id="s-ssmsi-in" api-type="tabular" resource="${SSMSI_RESSOURCE}"
    where="annee:eq:2025, indicateur:in:Homicides|Usage de stupéfiants (AFD)"></dsfr-data-source>
  <dsfr-data-kpi id="k-ssmsi-in" source="s-ssmsi-in" value="count" format="nombre"
    label="Lignes"></dsfr-data-kpi>
  <dsfr-data-source id="s-ssmsi-notin" api-type="tabular" resource="${SSMSI_RESSOURCE}"
    where="annee:eq:2025, indicateur:notin:Usage de stupéfiants (AFD)"></dsfr-data-source>
  <dsfr-data-kpi id="k-ssmsi-notin" source="s-ssmsi-notin" value="count" format="nombre"
    label="Lignes"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-ssmsi-groupes',
        agg: 'count',
        pipeline: [{ op: 'group-by', by: ['Code_departement', 'indicateur'], columns: {} }],
      },
      { kind: 'kpi', id: 'k-ssmsi-groupe-somme', agg: 'sum', field: 'nombre' },
      {
        kind: 'kpi',
        id: 'k-ssmsi-tronque',
        agg: 'sum',
        field: '__id',
        pipeline: [
          {
            op: 'order-by-keys',
            keys: [
              { column: 'Code_region', dir: 'asc' },
              { column: '__id', dir: 'asc' },
            ],
          },
          { op: 'limit', n: 600 },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-ssmsi-in',
        agg: 'count',
        pipeline: [
          {
            op: 'filter',
            filters: [
              {
                field: 'indicateur',
                op: 'in',
                values: ['Homicides', 'Usage de stupéfiants (AFD)'],
              },
            ],
          },
        ],
      },
      {
        kind: 'urls',
        id: 'ssmsi-ordre-total-dans-la-valeur-du-tri',
        among: `/api/resources/${SSMSI_RESSOURCE}/data/`,
        // Le journal de la page consigne les URL DÉCODÉES
        contains: 'Code_region__sort=asc,"__id".asc',
        verdict: 'some',
      },
      {
        kind: 'kpi',
        id: 'k-ssmsi-notin',
        agg: 'count',
        pipeline: [
          {
            op: 'filter',
            filters: [{ field: 'indicateur', op: 'notin', values: ['Usage de stupéfiants (AFD)'] }],
          },
        ],
      },
      {
        kind: 'urls',
        id: 'ssmsi-in-entre-guillemets',
        among: `/api/resources/${SSMSI_RESSOURCE}/data/`,
        contains: 'indicateur__in=Homicides,"Usage de stupéfiants (AFD)"',
        verdict: 'some',
      },
      {
        kind: 'urls',
        id: 'ssmsi-notin-entre-guillemets',
        among: `/api/resources/${SSMSI_RESSOURCE}/data/`,
        contains: 'indicateur__notin="Usage de stupéfiants (AFD)"',
        verdict: 'some',
      },
      // Acceptée, la forme n'appelle aucun repli : la bibliothèque se tait.
      { kind: 'diagnostic', id: 's-ssmsi-in', expect: 'silence', contains: 'guillemets' },
    ],
  },

  {
    id: 'insee-melodi-observations-vivant',
    mode: 'live',
    origin:
      'INSEE Melodi — deces quotidiens d’un departement a une date figee (#586). L’oracle compte les observations BRUTES, la page compte les lignes aplaties : un aplatissement qui en perd une ne se voit qu’ici.',
    feed: {
      kind: 'raw',
      source: { url: MELODI_URL, rowsPath: 'observations', nextPath: 'paging.next' },
    },
    markup: `
  <dsfr-data-source id="s-melodi" api-type="insee" dataset-id="${MELODI_DATASET}"
    where="GEO:eq:${MELODI_GEO}, TIME_PERIOD:eq:${MELODI_PERIODE}"></dsfr-data-source>
  <dsfr-data-kpi id="k-melodi-n" source="s-melodi" value="count" format="nombre" label="Observations"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-melodi-obs" source="s-melodi" value="OBS_VALUE:count" format="nombre" label="Valeurs"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-melodi-n', agg: 'count' },
      // L'oracle ne sait pas aplatir : il compte les observations qui PORTENT
      // une mesure, la page compte les lignes dont `OBS_VALUE` est renseignee.
      // Les deux comptes ne coincident que si l'aplatissement n'en perd aucune.
      { kind: 'kpi', id: 'k-melodi-obs', agg: 'count', field: 'measures' },
    ],
  },

  {
    id: 'insee-melodi-deux-pages-vivant',
    mode: 'live',
    origin:
      "INSEE Melodi — #1279, contre la vraie API. Au-delà de 1 000 observations l'adaptateur pagine par numéro de page, et Melodi n'offre aucun paramètre de tri : rien ne garantit qu'une observation ne revienne pas sur deux pages. Mesuré stable le 2026-10-13 (1 678 distinctes sur 1 678, cinq passages, pages de 1 000 et de 200) — ce contrôle le remesure chaque nuit. L'oracle lit les mêmes observations en une seule requête. Trois chiffres que seul l'ENSEMBLE exact des observations rend juste : le compte, le nombre de mois distincts, et le compte d'un mois ; et le silence de la bibliothèque, qui dirait une observation revenue d'une page à l'autre.",
    feed: {
      kind: 'raw',
      source: { url: MELODI_LONG_URL, rowsPath: 'observations', rowPath: 'dimensions' },
    },
    markup: `
  <dsfr-data-source id="s-melodi-long" api-type="insee" dataset-id="${MELODI_DATASET}"
    where="GEO:in:2025-DEP-01|2025-DEP-02|2025-DEP-03, FREQ:eq:M"></dsfr-data-source>
  <dsfr-data-kpi id="k-melodi-long-n" source="s-melodi-long" value="count" format="nombre" label="Observations"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-melodi-long-mois" source="s-melodi-long" value="TIME_PERIOD:distinct" format="nombre" label="Mois"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-melodi-long-janvier" source="s-melodi-long" value="count{TIME_PERIOD:eq:2024-01}" format="nombre" label="Janvier 2024"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-melodi-long-n', agg: 'count' },
      { kind: 'kpi', id: 'k-melodi-long-mois', agg: 'distinct', field: 'TIME_PERIOD' },
      {
        kind: 'kpi',
        id: 'k-melodi-long-janvier',
        agg: 'count',
        pipeline: [
          { op: 'filter', filters: [{ field: 'TIME_PERIOD', op: 'eq', value: '2024-01' }] },
        ],
      },
      {
        // Deux pages, la seconde demandée par son numéro
        kind: 'urls',
        id: 'melodi-deuxieme-page',
        among: `/melodi/data/${MELODI_DATASET}`,
        contains: 'page=2',
        verdict: 'last',
      },
      { kind: 'diagnostic', id: 's-melodi-long', expect: 'silence', contains: 'sont revenues' },
    ],
  },

  {
    id: 'grist-pagination-serveur-vivant',
    mode: 'live',
    origin:
      "Grist (grist.numerique.gouv.fr, document public) — #1279, contre la vraie API. `/records` ne connaît pas `offset` : `limit=5&offset=5` rend les lignes 1 à 5 (mesuré le 2026-10-13). Un tableau `server-side` montrait la première page à toutes les pages. Deux tableaux, pages de 20, lus à la page DEUX : sans tri (lignes 21 à 40 de la table), et trié sur `region`, clé non unique, complété par l'identifiant de ligne — que `code_dept`, croissant avec lui dans cette table, dit ici.",
    feed: { kind: 'raw', source: GRIST_SOURCE },
    markup: `
  <dsfr-data-source id="s-grist-vivant" api-type="grist" base-url="${GRIST_RECORDS}"
    server-side page-size="${GRIST_PAGE}"></dsfr-data-source>
  <dsfr-data-list id="l-grist-vivant" source="s-grist-vivant"
    columns="code_dept:Code, nom_dept:Département" server-sort></dsfr-data-list>
  <dsfr-data-source id="s-grist-vivant-trie" api-type="grist" base-url="${GRIST_RECORDS}"
    order-by="region:asc" server-side page-size="${GRIST_PAGE}"></dsfr-data-source>
  <dsfr-data-list id="l-grist-vivant-trie" source="s-grist-vivant-trie"
    columns="code_dept:Code, nom_dept:Département" server-sort></dsfr-data-list>`,
    actions: [
      { kind: 'click', selector: '#l-grist-vivant .fr-pagination__link--next' },
      { kind: 'click', selector: '#l-grist-vivant-trie .fr-pagination__link--next' },
    ],
    expects: [
      {
        kind: 'list',
        id: 'l-grist-vivant',
        columns: GRIST_COLONNES,
        pipeline: [{ op: 'page', size: GRIST_PAGE, number: 2 }],
      },
      {
        kind: 'list',
        id: 'l-grist-vivant-trie',
        columns: GRIST_COLONNES,
        pipeline: [
          {
            op: 'order-by-keys',
            keys: [
              { column: 'region', dir: 'asc' },
              { column: 'code_dept', dir: 'asc' },
            ],
          },
          { op: 'page', size: GRIST_PAGE, number: 2 },
        ],
      },
      {
        kind: 'urls',
        id: 'grist-aucun-offset',
        among: '/tables/Scrutin_c1/records',
        contains: 'offset=',
        verdict: 'none',
      },
    ],
  },

  {
    id: 'grist-sql-reponse-et-pagination-vivant',
    mode: 'live',
    origin:
      "Grist (grist.numerique.gouv.fr, document public) — #1279, contre la vraie API. L'endpoint SQL rend `{ records: [{ fields }] }` ; l'adaptateur lisait des lignes en tableaux, et chaque ligne d'un regroupement délégué ou d'une page filtrée devenait un objet vide (mesuré le 2026-10-13, GET et POST). Deux lectures par SQL : un regroupement délégué (inscrits et départements par région, triés sur les inscrits), et un tableau filtré par un opérateur que `/records` ne connaît pas (`nb_sieges:gte:0`, qui garde toutes les lignes), trié sur `nb_sieges`, clé non unique, paginé par `LIMIT` / `OFFSET` sur un ordre total et lu à la page DEUX. Les tris portent sur des NOMBRES : SQLite range les textes par code de caractère (« CVdL » avant « Corse »), ce qui n'est pas l'ordre de l'oracle et ne dit rien de la pagination.",
    feed: { kind: 'raw', source: GRIST_SOURCE },
    markup: `
  <dsfr-data-source id="s-grist-groupe-vivant" api-type="grist" base-url="${GRIST_RECORDS}"></dsfr-data-source>
  <dsfr-data-query id="q-grist-groupe-vivant" source="s-grist-groupe-vivant" group-by="region"
    aggregate="nb_inscrits:sum:inscrits, code_dept:count:departements" order-by="inscrits:desc"></dsfr-data-query>
  <dsfr-data-list id="l-grist-groupe-vivant" source="q-grist-groupe-vivant"
    columns="region:Région, inscrits:Inscrits, departements:Départements"></dsfr-data-list>
  <dsfr-data-source id="s-grist-sql-vivant" api-type="grist" base-url="${GRIST_RECORDS}"
    where="nb_sieges:gte:0" order-by="nb_sieges:desc" server-side page-size="${GRIST_PAGE}"></dsfr-data-source>
  <dsfr-data-list id="l-grist-sql-vivant" source="s-grist-sql-vivant"
    columns="code_dept:Code, nom_dept:Département" server-sort></dsfr-data-list>`,
    actions: [{ kind: 'click', selector: '#l-grist-sql-vivant .fr-pagination__link--next' }],
    expects: [
      {
        kind: 'rows',
        id: 'q-grist-groupe-vivant',
        key: 'region',
        columns: ['inscrits', 'departements'],
        pipeline: [
          {
            op: 'group-by',
            by: 'region',
            columns: {
              inscrits: { agg: 'sum', field: 'nb_inscrits' },
              departements: { agg: 'count', field: 'code_dept' },
            },
          },
          { op: 'order-by', column: 'inscrits', dir: 'desc' },
        ],
      },
      {
        kind: 'list',
        id: 'l-grist-sql-vivant',
        columns: GRIST_COLONNES,
        pipeline: [
          { op: 'filter', filters: [{ field: 'nb_sieges', op: 'gte', value: 0 }] },
          {
            // L'identifiant de ligne départage : `code_dept` croît avec lui
            op: 'order-by-keys',
            keys: [
              { column: 'nb_sieges', dir: 'desc' },
              { column: 'code_dept', dir: 'asc' },
            ],
          },
          { op: 'page', size: GRIST_PAGE, number: 2 },
        ],
      },
      {
        kind: 'urls',
        id: 'grist-par-sql',
        among: 'pU5HXX7VJC6jdgU6oBJRxn/sql',
        contains: '/sql',
        verdict: 'last',
      },
    ],
  },

  {
    id: 'tabular-elus-jokers-et-absents-vivant',
    mode: 'live',
    origin:
      'data.gouv / Répertoire national des élus — #1285, ADR-159 lot 2, contre la vraie API. Deux écarts mesurés le 2026-10-14. `__notcontains` part en `not.ilike`, qui écarte les valeurs ABSENTES : la colonne « Libellé de la collectivité à statut particulier » est nulle hors de Corse, `__notcontains=zzz` rend 498 élus sur 34 826. Et `__contains` part en `ilike.*valeur*`, où `_` est un joker : `contains:_` retenait tous les élus. Sur les trois départements du relevé : « sans Corse » doit garder tous les élus (le navigateur calcule la clause, l’API n’en rendrait aucun) ; « contient _ », écrit sur la source et confié à l’API ÉCHAPPÉ, n’en garde aucun (aucun libellé ne porte de « _ »). L’oracle relève les lignes brutes et filtre seul.',
    feed: {
      kind: 'raw',
      source: { url: ELUS_JOKERS_URL, rowsPath: 'data', nextPath: 'links.next' },
    },
    markup: `
  <dsfr-data-source id="s-elus-sans" api-type="tabular" resource="${ELUS_RESSOURCE}"
    where="Code du département:in:01|02|03"></dsfr-data-source>
  <dsfr-data-query id="q-elus-sans" source="s-elus-sans"
    where="Libellé de la collectivité à statut particulier:notcontains:Corse"></dsfr-data-query>
  <dsfr-data-kpi id="k-elus-sans" source="q-elus-sans" value="count" format="nombre" label="Hors Corse"></dsfr-data-kpi>
  <dsfr-data-source id="s-elus-joker" api-type="tabular" resource="${ELUS_RESSOURCE}"
    where="Code du département:in:01|02|03, Libellé de la catégorie socio-professionnelle:contains:_"></dsfr-data-source>
  <dsfr-data-kpi id="k-elus-joker" source="s-elus-joker" value="count" format="nombre" label="Souligné"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-elus-sans',
        agg: 'count',
        pipeline: [
          {
            op: 'filter',
            filters: [
              {
                field: 'Libellé de la collectivité à statut particulier',
                op: 'notcontains',
                value: 'Corse',
              },
            ],
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-elus-joker',
        agg: 'count',
        pipeline: [
          {
            op: 'filter',
            filters: [
              {
                field: 'Libellé de la catégorie socio-professionnelle',
                op: 'contains',
                value: '_',
              },
            ],
          },
        ],
      },
      {
        kind: 'urls',
        id: 'elus-notcontains-jamais-confie',
        among: `/api/resources/${ELUS_RESSOURCE}/data/`,
        contains: '__notcontains',
        verdict: 'none',
      },
      {
        kind: 'urls',
        id: 'elus-souligne-echappe',
        among: `/api/resources/${ELUS_RESSOURCE}/data/`,
        // Le journal de la page consigne les URL DÉCODÉES
        contains: 'socio-professionnelle__contains=\\_',
        verdict: 'some',
      },
    ],
  },

  {
    id: 'tabular-elus-negations-absents-vivant',
    mode: 'live',
    origin:
      'data.gouv / Répertoire national des élus — #1312, contre la vraie API. Mesuré le 2026-10-14 : « Libellé de la collectivité à statut particulier » est nulle hors de Corse ; sur l’Ain et les deux départements corses (718 élus), 359 nulles et 359 « Corse ». `__differs` est un `isdistinct` qui GARDE les nulles (`__differs=zzz` → 718), `__notin` les ÉCARTE (`__notin=Corse` → 0), et `champ:isnull` sans valeur n’était pas transmis (718). Le navigateur, lui, écarte les nulles sous `neq` et les garde sous `notin` : « ≠ zzz », « hors Corse » et « absente » valent chacun 359. `neq` part en `__differs` + `__isnotnull`, `notin` est calculé dans le navigateur, `isnull` part en `__isnull=`. L’oracle relève les lignes brutes et filtre seul.',
    feed: {
      kind: 'raw',
      source: { url: ELUS_NEGATIONS_URL, rowsPath: 'data', nextPath: 'links.next' },
    },
    markup: `
  <dsfr-data-source id="s-elus-neq" api-type="tabular" resource="${ELUS_RESSOURCE}"
    where="Code du département:in:01|2A|2B, ${COLLECTIVITE}:neq:zzz"></dsfr-data-source>
  <dsfr-data-kpi id="k-elus-neq" source="s-elus-neq" value="count" format="nombre" label="Différent de zzz"></dsfr-data-kpi>
  <dsfr-data-source id="s-elus-notin" api-type="tabular" resource="${ELUS_RESSOURCE}"
    where="Code du département:in:01|2A|2B, ${COLLECTIVITE}:notin:Corse"></dsfr-data-source>
  <dsfr-data-kpi id="k-elus-notin" source="s-elus-notin" value="count" format="nombre" label="Hors Corse"></dsfr-data-kpi>
  <dsfr-data-source id="s-elus-isnull" api-type="tabular" resource="${ELUS_RESSOURCE}"
    where="Code du département:in:01|2A|2B, ${COLLECTIVITE}:isnull"></dsfr-data-source>
  <dsfr-data-kpi id="k-elus-isnull" source="s-elus-isnull" value="count" format="nombre" label="Absente"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-elus-neq',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: COLLECTIVITE, op: 'neq', value: 'zzz' }] }],
      },
      {
        kind: 'kpi',
        id: 'k-elus-notin',
        agg: 'count',
        pipeline: [
          { op: 'filter', filters: [{ field: COLLECTIVITE, op: 'notin', values: ['Corse'] }] },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-elus-isnull',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: COLLECTIVITE, op: 'isnull-strict' }] }],
      },
      {
        kind: 'urls',
        id: 'elus-notin-jamais-confie',
        among: `/api/resources/${ELUS_RESSOURCE}/data/`,
        contains: '__notin',
        verdict: 'none',
      },
      {
        kind: 'urls',
        id: 'elus-neq-isnotnull',
        among: `/api/resources/${ELUS_RESSOURCE}/data/`,
        contains: 'particulier__isnotnull=',
        verdict: 'some',
      },
    ],
  },

  {
    id: 'grist-notin-forme-sql-vivant',
    mode: 'live',
    origin:
      "Grist (grist.numerique.gouv.fr, document public) — #1312, contre la vraie API. `notin` part désormais en `(champ IS NULL OR champ NOT IN (…))`, qui garde les valeurs absentes comme le navigateur (`NOT IN` seul les écarte : 89 lignes sur 101 quand 12 sont nulles, mesuré le 2026-10-14 par une colonne dérivée en SQL). Ce document n'a pas de valeur nulle : le contrôle garde que la forme parenthésée est lue par le vrai Grist et rend les lignes de l'oracle — 99 départements hors l'Ain et l'Aisne — et que `neq` (`!=`, inchangé) aussi. Le sort des nulles est tenu par le déterministe.",
    feed: { kind: 'raw', source: GRIST_SOURCE },
    markup: `
  <dsfr-data-source id="s-grist-notin" api-type="grist" base-url="${GRIST_RECORDS}"
    where="nom_dept:notin:Ain|Aisne"></dsfr-data-source>
  <dsfr-data-kpi id="k-grist-notin" source="s-grist-notin" value="count" format="nombre" label="Hors Ain et Aisne"></dsfr-data-kpi>
  <dsfr-data-source id="s-grist-neq" api-type="grist" base-url="${GRIST_RECORDS}"
    where="nom_dept:neq:Ain"></dsfr-data-source>
  <dsfr-data-kpi id="k-grist-neq" source="s-grist-neq" value="count" format="nombre" label="Sauf l'Ain"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-grist-notin',
        agg: 'count',
        pipeline: [
          { op: 'filter', filters: [{ field: 'nom_dept', op: 'notin', values: ['Ain', 'Aisne'] }] },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-grist-neq',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'nom_dept', op: 'neq', value: 'Ain' }] }],
      },
      {
        kind: 'urls',
        id: 'grist-negations-par-sql-vivant',
        among: 'pU5HXX7VJC6jdgU6oBJRxn',
        contains: '/sql',
        verdict: 'some',
      },
    ],
  },

  {
    id: 'grist-like-jokers-vivant',
    mode: 'live',
    origin:
      "Grist (grist.numerique.gouv.fr, document public) — #1285, ADR-159 lot 2, contre la vraie API. Le SQL `LIKE` de Grist lit `_` comme un joker (`nom_dept LIKE '%Co_se%'` → 2, mesuré le 2026-10-14), et n'échappe rien sans clause `ESCAPE` (`'%Co\\_se%'` → 0, même pour « Co_se »). Trois clauses écrites sur la source : « Co_se », que plus aucun département ne doit vérifier ; « Corse », que les deux départements corses vérifient, ce qui prouve que `ESCAPE '\\'` ne casse pas une valeur ordinaire ; et « sans Corse », calculé dans le navigateur. Si l'échappement disparaissait, le premier chiffre passerait à 2 ; si la clause `ESCAPE` disparaissait, le deuxième resterait juste mais le premier aussi — c'est le déterministe qui tient ce cas-là.",
    feed: { kind: 'raw', source: GRIST_SOURCE },
    markup: `
  <dsfr-data-source id="s-grist-joker" api-type="grist" base-url="${GRIST_RECORDS}"
    where="nom_dept:contains:Co_se"></dsfr-data-source>
  <dsfr-data-kpi id="k-grist-joker" source="s-grist-joker" value="count" format="nombre" label="Co_se"></dsfr-data-kpi>
  <dsfr-data-source id="s-grist-corse" api-type="grist" base-url="${GRIST_RECORDS}"
    where="nom_dept:contains:Corse"></dsfr-data-source>
  <dsfr-data-kpi id="k-grist-corse" source="s-grist-corse" value="count" format="nombre" label="Corse"></dsfr-data-kpi>
  <dsfr-data-source id="s-grist-sans" api-type="grist" base-url="${GRIST_RECORDS}"
    where="nom_dept:notcontains:Corse"></dsfr-data-source>
  <dsfr-data-kpi id="k-grist-sans" source="s-grist-sans" value="count" format="nombre" label="Sans Corse"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-grist-joker',
        agg: 'count',
        pipeline: [
          { op: 'filter', filters: [{ field: 'nom_dept', op: 'contains', value: 'Co_se' }] },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-grist-corse',
        agg: 'count',
        pipeline: [
          { op: 'filter', filters: [{ field: 'nom_dept', op: 'contains', value: 'Corse' }] },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-grist-sans',
        agg: 'count',
        pipeline: [
          { op: 'filter', filters: [{ field: 'nom_dept', op: 'notcontains', value: 'Corse' }] },
        ],
      },
    ],
  },
];

export const BANC_ADAPTATEURS: Manifest = { domain: 'banc-adaptateurs', checks: CHECKS };
