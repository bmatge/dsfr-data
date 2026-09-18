/**
 * Contrôles VIVANTS repris des reproductions du banc d'essai open-data-viz.
 *
 * `banc.ts` éprouve trois cas emblématiques, `banc-adaptateurs.ts` un chemin
 * d'entrée par adaptateur. Ce fichier-ci part de l'autre bout : des PAGES que
 * le banc a réellement construites, et des CONSTATS qu'il y a déposés
 * (`AM-0XX`, `BUG-0XX`, `PG-0XX` du registre `public/data/retours.json`).
 *
 * Chaque contrôle reprend le balisage RÉEL de sa page — mêmes sources, mêmes
 * clauses, mêmes agrégats — réduit au strict nécessaire de ce qu'il vérifie, et
 * sans changer aucun attribut. En face, l'oracle retélécharge les lignes brutes
 * du même jeu, avec des clauses ODSQL ÉCRITES À LA MAIN ici, et recalcule en
 * tableaux nus. Rien n'est figé : un jeu qui vit change les deux côtés au même
 * instant, et l'écart reste un défaut.
 *
 * Pourquoi ce lot existe : un constat du banc marqué « corrigé » ne l'est que
 * dans le dépôt. Personne ne rejoue le cas sur la vraie API, et c'est ce que
 * #746 a mesuré dans l'autre sens — onze constats sur seize visaient une
 * capacité qui existait déjà. Ici, chaque `constats` rejoué produit un chiffre
 * daté dans `tools/oracle/out/banc.md`.
 *
 * Économie d'API : les lignes brutes sont mises en cache PAR URL pour la durée
 * du run (`tools/oracle/raw.ts`), donc un jeu partagé par plusieurs contrôles
 * n'est tiré qu'une fois. Les clauses `select=` des URL brutes ne servent qu'à
 * ne pas rapatrier des colonnes de texte long (le `contenu` du BOFiP, la
 * description d'un projet) : elles ne filtrent aucune ligne.
 *
 * Ces contrôles dépendent d'API tierces : la nuit, à la demande, ou sur une PR
 * étiquetée `oracle` — jamais bloquants (`.github/workflows/oracle.yml`).
 */
import type { Check, Manifest, RawUrlSource } from '../../tools/oracle/manifest.js';

/** Racine de l'export JSON d'un portail Opendatasoft. */
function exportJson(hote: string, jeu: string): string {
  return `https://${hote}/api/explore/v2.1/catalog/datasets/${jeu}/exports/json`;
}

const MEF = 'data.economie.gouv.fr';
const EDU = 'data.education.gouv.fr';
const SPORTS = 'data.sports.gouv.fr';

// ---------------------------------------------------------------------------
// viz/qualite-tourisme — PG-017 (un KPI `count` sur une query limitée compte la
// limite), PG-015 (un group-by rend un groupe null que `count` inclut), AM-004
// (agrégat « valeurs distinctes »).
// ---------------------------------------------------------------------------

const QT_CHAMPS = 'nom_du_professionnel, activite_du_professionnel, ville, region, departement';

const QT_BRUT: RawUrlSource = {
  url: `${exportJson(MEF, 'etablissements-labellises-qualite-tourisme')}?select=${encodeURIComponent(QT_CHAMPS)}`,
};

const QT_SOURCE = `
  <dsfr-data-source id="qt" api-type="opendatasoft"
    base-url="https://${MEF}" dataset-id="etablissements-labellises-qualite-tourisme"
    fetch-mode="export" max-records="5000"
    select="${QT_CHAMPS}"></dsfr-data-source>`;

// ---------------------------------------------------------------------------
// viz/plan-de-relance — AM-002 (`max-records` tronque en silence : il doit
// tronquer, et le chiffre affiché doit être celui du tronçon), AM-004.
// ---------------------------------------------------------------------------

const PDR_CHAMPS =
  'entreprise, type_entreprise, volet_relance, filiere, nom_region, nom_departement';

const PDR_BRUT: RawUrlSource = {
  url: `${exportJson(MEF, 'plan-de-relance')}?select=${encodeURIComponent(PDR_CHAMPS)}`,
};

const PDR_SOURCE = (maxRecords: number): string => `
  <dsfr-data-source id="pdr" api-type="opendatasoft"
    base-url="https://${MEF}" dataset-id="plan-de-relance"
    fetch-mode="export" max-records="${maxRecords}"
    select="${PDR_CHAMPS}"></dsfr-data-source>`;

// ---------------------------------------------------------------------------
// viz/comptabilite-generale — AM-019 (un KPI ne savait pas filtrer sa source),
// AM-018 (arithmétique entre séries). La source de la page agrège CÔTÉ SERVEUR
// (`select=sum(...)` + `group-by`) ; l'oracle repart des écritures brutes.
// ---------------------------------------------------------------------------

const CG_WHERE = 'year(annee) = 2025 and categorie in ("Actif","Passif")';

const CG_BRUT: RawUrlSource = {
  url:
    `${exportJson(MEF, 'balances_des_comptes_etat')}` +
    `?select=${encodeURIComponent('categorie, balance_sortie_3')}` +
    `&where=${encodeURIComponent(CG_WHERE)}`,
};

// ---------------------------------------------------------------------------
// viz/bofip — AM-034 (un KPI ne pouvait pas lire le total d'une source en mode
// serveur : `meta:total`). `server-side` ne charge que la page courante, et le
// compteur doit pourtant annoncer le total du jeu.
// ---------------------------------------------------------------------------

const BOFIP_BRUT: RawUrlSource = {
  url:
    `${exportJson(MEF, 'bofip-vigueur')}` +
    `?select=${encodeURIComponent('type, serie, division, identifiant_juridique')}`,
};

// ---------------------------------------------------------------------------
// viz/barometre-france-num — AM-026 (aucun indicateur de couverture sur une
// jointure) et l'écart de graphie #792 : `code_unifie` est un NOMBRE dans les
// réponses et une CHAÎNE dans la table de correspondance. Deux jeux bruts.
// ---------------------------------------------------------------------------

const BFN_WHERE =
  'region = "Toutes régions" and secteur = "Tous secteurs" and taille = "Toutes tailles"';

const BFN_SCORES: RawUrlSource = {
  url:
    `${exportJson(MEF, 'questions-reponses')}` +
    `?select=${encodeURIComponent('code_unifie, libelle_reponse, score, annee')}` +
    `&where=${encodeURIComponent(BFN_WHERE)}`,
};

// ---------------------------------------------------------------------------
// viz/barometre-france-num-v2 — #878, cas 3 du 18/09 : la source de détail
// d'une question (`det-prof`) devait suivre le contexte `profil` (région,
// secteur, taille) et n'y était pas déclarée. Elle chargeait donc SANS ce
// filtre : `sum(score)` cumulait toutes les régions, tous les secteurs, toutes
// les tailles, et affichait « 5 724 % » pour une part de répondants. Aucune
// erreur : une source hors contexte est une erreur d'auteur que la
// bibliothèque ne peut pas deviner. Ce que le dispositif garde, c'est le
// CHIFFRE de la page réelle, après le geste de filtre.
// ---------------------------------------------------------------------------

/** La question par défaut de la page (923, authentification multi-facteurs). */
const BFNV2_QUESTION = '923';

/** Le profil choisi par le geste : une région, secteur et taille au défaut. */
const BFNV2_PROFIL =
  'region = "Bretagne" and secteur = "Tous secteurs" and taille = "Toutes tailles"';

/** Lignes brutes du détail, clause ODSQL écrite à la main. */
const BFNV2_DETAIL: RawUrlSource = {
  url:
    `${exportJson(MEF, 'questions-reponses')}` +
    `?select=${encodeURIComponent('code_unifie, libelle_reponse, score, annee')}` +
    `&where=${encodeURIComponent(
      `code_unifie = ${BFNV2_QUESTION} and ${BFNV2_PROFIL} and year(annee) = 2025 and libelle_reponse != "Sans réponse"`
    )}`,
};

/**
 * Le balisage RÉEL de la page, réduit aux deux sources de détail (nationale,
 * profil) et aux deux contextes qui les pilotent. `sources` du contexte
 * `profil` porte — ou non — la source de profil : c'est la seule différence
 * entre la page juste et la page fausse, et c'est la mutation du contrôle
 * (`'det-nat'` à la place de `'det-prof'` : une source du document, mais pas
 * la bonne — aucune erreur, un chiffre à cinq chiffres).
 */
function bfnv2Markup(sourcesProfil: string): string {
  return `
  <dsfr-data-source id="det-nat" api-type="opendatasoft"
    base-url="https://${MEF}" dataset-id="questions-reponses"
    fetch-mode="export" max-records="200" require-where
    select="sum(score) as France" group-by="libelle_reponse"
    where="region = &quot;Toutes régions&quot; and secteur = &quot;Tous secteurs&quot; and taille = &quot;Toutes tailles&quot; and year(annee) = 2025 and libelle_reponse != &quot;Sans réponse&quot;"></dsfr-data-source>
  <dsfr-data-source id="det-prof" api-type="opendatasoft"
    base-url="https://${MEF}" dataset-id="questions-reponses"
    fetch-mode="export" max-records="200" require-where
    select="sum(score) as Profil" group-by="libelle_reponse"
    where="year(annee) = 2025 and libelle_reponse != &quot;Sans réponse&quot;"></dsfr-data-source>
  <dsfr-data-context id="profil" sources="${sourcesProfil}">
    <dsfr-data-context-filter field="region"  ui="f-region"  default="Toutes régions"></dsfr-data-context-filter>
    <dsfr-data-context-filter field="secteur" ui="f-secteur" default="Tous secteurs"></dsfr-data-context-filter>
    <dsfr-data-context-filter field="taille"  ui="f-taille"  default="Toutes tailles"></dsfr-data-context-filter>
  </dsfr-data-context>
  <dsfr-data-context id="ctx-question" sources="det-nat det-prof">
    <dsfr-data-context-filter field="code_unifie" ui="f-question" default="${BFNV2_QUESTION}"></dsfr-data-context-filter>
  </dsfr-data-context>
  <label for="f-region">Région</label>
  <select id="f-region">
    <option value="Toutes régions">Toutes régions</option>
    <option value="Bretagne">Bretagne</option>
    <option value="Occitanie">Occitanie</option>
  </select>
  <label for="f-secteur">Secteur</label>
  <select id="f-secteur"><option value="Tous secteurs">Tous secteurs</option></select>
  <label for="f-taille">Taille</label>
  <select id="f-taille"><option value="Toutes tailles">Toutes tailles</option></select>
  <label for="f-question">Question</label>
  <select id="f-question">
    <option value="923">Authentification multi-facteurs</option>
    <option value="501">Le numérique est un bénéfice réel</option>
  </select>
  <dsfr-data-kpi id="k-part" source="det-prof" value="Profil:sum" format="pourcentage" decimals="1"
    label="Part des répondants"></dsfr-data-kpi>`;
}

const BFN_CORR: RawUrlSource = {
  url:
    `${exportJson(MEF, 'bfn-table-de-correspondance')}` +
    `?select=${encodeURIComponent('code_unifie, libelle_unifie, chapitre')}`,
};

// ---------------------------------------------------------------------------
// education/personnels-colleges — LIM-014 / #763 (le résumé « en France » d'une
// choroplèthe était une moyenne NON pondérée) et AM-070 (le ratio d'un KPI ne
// savait filtrer qu'un `count`, pas une `sum`). La part nationale d'agrégés est
// un rapport de deux sommes, jamais une moyenne de parts départementales.
// ---------------------------------------------------------------------------

const P2D_WHERE = "nature_de_l_etablissement like 'Collège'";

const P2D_CHAMPS = [
  'code_departement',
  'libelle_departement',
  'etp_total',
  'etp_enseignants_hommes_et_femmes',
  'etp_de_femmes_enseignantes',
  'etp_d_enseignants_agreges',
  'etp_d_enseignants_de_moins_de_35_ans',
  'etp_d_enseignants_de_35_a_moins_de_50_ans',
  'etp_d_enseignants_de_50_ans_ou_plus',
].join(', ');

const P2D_BRUT: RawUrlSource = {
  url:
    `${exportJson(EDU, 'fr-en-indicateurs_personnels_etablissements2d')}` +
    `?select=${encodeURIComponent(P2D_CHAMPS)}` +
    `&where=${encodeURIComponent(P2D_WHERE)}`,
};

const P2D_SOURCE = `
  <dsfr-data-source id="p2d" api-type="opendatasoft"
    base-url="https://${EDU}" dataset-id="fr-en-indicateurs_personnels_etablissements2d"
    fetch-mode="export" max-records="12000"
    where="${P2D_WHERE}"
    select="${P2D_CHAMPS}"></dsfr-data-source>`;

// ---------------------------------------------------------------------------
// education/etablissements-euroscol — BUG-007 (`replace-fields` sans effet sur
// une valeur NUMÉRIQUE). Les colonnes `rep` / `rep_plus` valent 0 ou 1 : une
// colonne calculée qui les lit doit voir des nombres, pas des chaînes.
// ---------------------------------------------------------------------------

const EURO_CHAMPS =
  'rne, nom_etablissement, academie, ville, niveau_etablissement_simplifie, libelle_region_2016, rep, rep_plus';

const EURO_BRUT: RawUrlSource = {
  url: `${exportJson(EDU, 'fr-en-etablissements-labellises-euroscol')}?select=${encodeURIComponent(EURO_CHAMPS)}`,
};

const EURO_SOURCE = `
  <dsfr-data-source id="euro" api-type="opendatasoft"
    base-url="https://${EDU}" dataset-id="fr-en-etablissements-labellises-euroscol"
    fetch-mode="export" max-records="3000"
    select="${EURO_CHAMPS}"></dsfr-data-source>`;

// ---------------------------------------------------------------------------
// education/tne-dashboard — AM-068 (le cumul existait, son inverse manquait :
// `diff`) et AM-076 (les agrégats `first` / `last` d'un KPI).
// ---------------------------------------------------------------------------

const TNE_AUDIENCES_WHERE = 'mois_saisie is not null';

const TNE_AUDIENCES: RawUrlSource = {
  url:
    `${exportJson(EDU, 'fr-en-tne_suivi_audiences')}` +
    `?select=${encodeURIComponent('mois_saisie, nombre_de_connexion_a_la_plateforme_tne, nombre_de_visiteurs_uniques_a_la_plateforme_tne')}` +
    `&where=${encodeURIComponent(TNE_AUDIENCES_WHERE)}`,
};

const TNE_FORMES_WHERE = "date_de_saisie = date'2025-03-01'";

const TNE_FORMES: RawUrlSource = {
  url:
    `${exportJson(EDU, 'fr-en-tne_personnels_formes_par_departement_secteur_type_etablissement')}` +
    `?select=${encodeURIComponent('departement, nombre_total_de_participants, etablissement_1er_degre, etablissement_2nd_degre, formes_non_connus')}` +
    `&where=${encodeURIComponent(TNE_FORMES_WHERE)}`,
};

// ---------------------------------------------------------------------------
// education/fei-chiffres-cles — BUG-010 / PG-014 : un alias de `group-by` était
// entouré d'accents graves et valait un HTTP 400. Ici `periode as an`, un alias
// SANS parenthèse — le cas exact du constat.
// ---------------------------------------------------------------------------

const ASLVE_BRUT: RawUrlSource = {
  url:
    `${exportJson(EDU, 'fr-en-assistants_langues_vivantes_etrangeres')}` +
    `?select=${encodeURIComponent('pays, iso2_pays, periode, postes_offerts, langue')}`,
};

// ---------------------------------------------------------------------------
// education/dataviz-ips-ecoles — AM-067 (une facette bâtie sur une source
// PRÉ-AGRÉGÉE affichait « 1 » partout : `weight-field`) et la grammaire des
// colonnes calculées (`when … then`) de `dsfr-data-normalize`.
//
// Les deux contrôles réduisent le périmètre de la page à une académie et à un
// département : le jeu complet dépasse 30 000 lignes, et l'oracle comme la
// page filtrent EXACTEMENT de la même façon, côté serveur.
// ---------------------------------------------------------------------------

const IPS_ECOLES_CHAMPS =
  'uai, appellation_officielle, ips, secteur, libelle_commune, libelle_departement, libelle_academie, ips_departemental';

const IPS_GIRONDE_WHERE = "rentree_scolaire = '2023-2024' and libelle_departement = 'Gironde'";

const IPS_GIRONDE: RawUrlSource = {
  url:
    `${exportJson(EDU, 'donnees-ips-ecoles')}` +
    `?select=${encodeURIComponent(IPS_ECOLES_CHAMPS)}` +
    `&where=${encodeURIComponent(IPS_GIRONDE_WHERE)}`,
};

const IPS_BORDEAUX_WHERE = "rentree_scolaire = '2023-2024' and libelle_academie = 'Bordeaux'";

const IPS_BORDEAUX: RawUrlSource = {
  url:
    `${exportJson(EDU, 'donnees-ips-ecoles')}` +
    `?select=${encodeURIComponent('uai, libelle_departement')}` +
    `&where=${encodeURIComponent(IPS_BORDEAUX_WHERE)}`,
};

/** La même expression que l'attribut `compute` de la page, réévaluée à part. */
const TRANCHES =
  "tranche_ips = when ips < 90 then 'Moins de 90' when ips < 100 then '90 à 100' " +
  "when ips < 110 then '100 à 110' when ips < 125 then '110 à 125' else '125 et plus'";

// ---------------------------------------------------------------------------
// viz/centres-controle-technique — PG-015 : un `group_by` rend un groupe null,
// que `count` inclut. La page écarte les vides côté query ; l'oracle doit les
// écarter de la même façon, et le compte des groupes doit coller.
// ---------------------------------------------------------------------------

const CCT_BRUT: RawUrlSource = {
  url:
    `${exportJson(MEF, 'annuaire-centres-controle-technique')}` +
    `?select=${encodeURIComponent('cct_siret, cct_denomination, code_departement, nom_departement, nom_region')}`,
};

// ---------------------------------------------------------------------------
// viz/tourisme-et-handicap — PG-012 (`sort="-count"` triait à l'envers) : ce
// que le contrôle tient ici, c'est l'ORDRE AFFICHÉ des facettes, pas seulement
// leurs compteurs.
// ---------------------------------------------------------------------------

const TH_BRUT: RawUrlSource = {
  url:
    `${exportJson(MEF, 'etablissements-labellises-tourisme-et-handicap')}` +
    `?select=${encodeURIComponent('nom_du_professionnel, filiere, activite, region, departement')}`,
};

// ---------------------------------------------------------------------------
// sports/portrait-federation — AM-074 (aucune union dans le pipeline : empiler
// deux séries demandait pivots et jointures) et LIM-014 / #763 (la part des
// licenciées est un rapport de deux sommes, pas une moyenne de parts).
// ---------------------------------------------------------------------------

const FEDE_CHAMPS =
  'federation, fede_gp, lics_h_semidef, lics_f_semidef, lics_tot_semidef, clubs_semidef';

const fedeBrut = (where: string): RawUrlSource => ({
  url:
    `${exportJson(SPORTS, 'indicateurs_cles_fede')}` +
    `?select=${encodeURIComponent(FEDE_CHAMPS)}` +
    `&where=${encodeURIComponent(where)}`,
});

const FEDE_OLYMPIQUES = "fede_gp = '1. Olympique'";
const FEDE_AUTRES = "fede_gp != '1. Olympique'";

const fedeSource = (id: string, where: string): string => `
  <dsfr-data-source id="${id}" api-type="opendatasoft"
    base-url="https://${SPORTS}" dataset-id="indicateurs_cles_fede"
    fetch-mode="export" max-records="200"
    where="${where}"
    select="${FEDE_CHAMPS}"></dsfr-data-source>`;

const CHECKS: Check[] = [
  // -------------------------------------------------------------------------
  // viz/qualite-tourisme
  // -------------------------------------------------------------------------
  {
    id: 'qualite-tourisme-kpi-sur-query-limitee',
    mode: 'live',
    page: 'viz/qualite-tourisme',
    constats: ['PG-017', 'AM-004'],
    origin:
      'viz/qualite-tourisme — PG-017 : un KPI `count` branché sur une query LIMITÉE compte la limite, pas la population. Les deux queries sont identiques à la limite près, et les deux KPI doivent donc afficher deux chiffres DIFFÉRENTS — celui de la limite, et celui des activités réellement présentes. AM-004 : l’agrégat « valeurs distinctes ».',
    feed: { kind: 'raw', source: QT_BRUT },
    markup: `${QT_SOURCE}
  <dsfr-data-query id="qt-activites" source="qt" group-by="activite_du_professionnel"
    aggregate="nom_du_professionnel:count:nb" order-by="nb:desc" limit="12"></dsfr-data-query>
  <dsfr-data-query id="qt-activites-toutes" source="qt" group-by="activite_du_professionnel"
    aggregate="nom_du_professionnel:count:nb"></dsfr-data-query>
  <dsfr-data-kpi id="k-etabs" source="qt" value="count" format="nombre" label="Établissements"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-activites" source="qt-activites-toutes" value="count" format="nombre" label="Activités"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-activites-top" source="qt-activites" value="count" format="nombre" label="Activités affichées"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-villes" source="qt" value="ville:distinct" format="nombre" label="Communes"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-etabs', agg: 'count' },
      {
        kind: 'kpi',
        id: 'k-activites',
        agg: 'count',
        pipeline: [
          {
            op: 'group-by',
            by: 'activite_du_professionnel',
            columns: { nb: { agg: 'count', field: 'nom_du_professionnel' } },
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-activites-top',
        agg: 'count',
        pipeline: [
          {
            op: 'group-by',
            by: 'activite_du_professionnel',
            columns: { nb: { agg: 'count', field: 'nom_du_professionnel' } },
          },
          { op: 'order-by', column: 'nb', dir: 'desc' },
          { op: 'limit', n: 12 },
        ],
      },
      { kind: 'kpi', id: 'k-villes', agg: 'distinct', field: 'ville' },
    ],
  },

  {
    id: 'qualite-tourisme-group-by-null-exclu',
    mode: 'live',
    page: 'viz/qualite-tourisme',
    constats: ['PG-015'],
    origin:
      'viz/qualite-tourisme — PG-015 : un `group_by` rend un groupe NULL que `count` inclut. La query de la page écarte les départements vides (`where="departement:isnotnull"`) ; le compte des groupes, la somme des compteurs et le plus gros groupe doivent tous coller à un recalcul qui écarte les mêmes lignes. Comme sur la page, la source a un SECOND lecteur (le compteur d’établissements) : la query ne peut donc pas réécrire la source pour son propre compte, et regroupe côté client (#765).',
    feed: { kind: 'raw', source: QT_BRUT },
    markup: `${QT_SOURCE}
  <dsfr-data-query id="qt-departements" source="qt" group-by="departement"
    where="departement:isnotnull" aggregate="nom_du_professionnel:count:nb"></dsfr-data-query>
  <dsfr-data-kpi id="k-tous" source="qt" value="count" format="nombre" label="Établissements"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-deps" source="qt-departements" value="count" format="nombre" label="Départements"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-deps-total" source="qt-departements" value="nb:sum" format="nombre" label="Établissements situés"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-deps-max" source="qt-departements" value="nb:max" format="nombre" label="Plus gros département"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-tous', agg: 'count' },
      {
        kind: 'kpi',
        id: 'k-deps',
        agg: 'count',
        pipeline: [
          { op: 'filter', filters: [{ field: 'departement', op: 'isnotnull' }] },
          {
            op: 'group-by',
            by: 'departement',
            columns: { nb: { agg: 'count', field: 'nom_du_professionnel' } },
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-deps-total',
        agg: 'sum',
        field: 'nb',
        pipeline: [
          { op: 'filter', filters: [{ field: 'departement', op: 'isnotnull' }] },
          {
            op: 'group-by',
            by: 'departement',
            columns: { nb: { agg: 'count', field: 'nom_du_professionnel' } },
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-deps-max',
        agg: 'max',
        field: 'nb',
        pipeline: [
          { op: 'filter', filters: [{ field: 'departement', op: 'isnotnull' }] },
          {
            op: 'group-by',
            by: 'departement',
            columns: { nb: { agg: 'count', field: 'nom_du_professionnel' } },
          },
        ],
      },
    ],
  },

  {
    id: 'qualite-tourisme-group-by-delegue-garde-son-alias',
    mode: 'live',
    page: 'viz/qualite-tourisme',
    constats: ['BUG-009', 'PG-015'],
    origin:
      'viz/qualite-tourisme — BUG-009 : une `dsfr-data-query group-by` branchée sur une source Opendatasoft réécrit la source. Le contrôle tient que la réécriture doit emporter les AGRÉGATS avec elle : `nb` est un alias déclaré par `aggregate`, et la somme des `nb` doit refaire le nombre d’établissements situés.',
    feed: { kind: 'raw', source: QT_BRUT },
    markup: `${QT_SOURCE}
  <dsfr-data-query id="qt-deps-seul" source="qt" group-by="departement"
    where="departement:isnotnull" aggregate="nom_du_professionnel:count:nb"></dsfr-data-query>
  <dsfr-data-kpi id="k-seul-total" source="qt-deps-seul" value="nb:sum" format="nombre" label="Établissements situés"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-seul-max" source="qt-deps-seul" value="nb:max" format="nombre" label="Plus gros département"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-seul-total',
        agg: 'sum',
        field: 'nb',
        pipeline: [
          { op: 'filter', filters: [{ field: 'departement', op: 'isnotnull' }] },
          {
            op: 'group-by',
            by: 'departement',
            columns: { nb: { agg: 'count', field: 'nom_du_professionnel' } },
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-seul-max',
        agg: 'max',
        field: 'nb',
        pipeline: [
          { op: 'filter', filters: [{ field: 'departement', op: 'isnotnull' }] },
          {
            op: 'group-by',
            by: 'departement',
            columns: { nb: { agg: 'count', field: 'nom_du_professionnel' } },
          },
        ],
      },
    ],
  },

  {
    id: 'qualite-tourisme-facettes-region',
    mode: 'live',
    page: 'viz/qualite-tourisme',
    constats: ['PG-012', 'PG-016'],
    origin:
      'viz/qualite-tourisme — PG-012 / PG-016 : le tri des facettes. Les six premières régions affichées, dans leur ordre de rendu et avec leurs compteurs, contre un group-by recalculé et rangé par compteur décroissant.',
    feed: { kind: 'raw', source: QT_BRUT },
    markup: `${QT_SOURCE}
  <dsfr-data-facets id="qt-f" source="qt" fields="region"
    labels="region:Région" max-values="6"></dsfr-data-facets>`,
    expects: [
      {
        kind: 'facets',
        id: 'qt-f',
        group: 'Région',
        valueColumn: 'region',
        countColumn: 'n',
        pipeline: [
          { op: 'filter', filters: [{ field: 'region', op: 'isnotnull' }] },
          { op: 'group-by', by: 'region', columns: { n: { agg: 'count' } } },
          { op: 'order-by', column: 'n', dir: 'desc' },
          { op: 'limit', n: 6 },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // viz/plan-de-relance
  // -------------------------------------------------------------------------
  {
    id: 'plan-de-relance-couverture-et-distincts',
    mode: 'live',
    page: 'viz/plan-de-relance',
    constats: ['AM-004'],
    origin:
      'viz/plan-de-relance — AM-004 : les trois compteurs de tête de la page (« projets soutenus », « départements concernés », « filières représentées ») reposent sur l’agrégat « valeurs distinctes » et sur deux group-by. Trois chemins différents vers le même jeu, recalculés à part.',
    feed: { kind: 'raw', source: PDR_BRUT },
    markup: `${PDR_SOURCE(3500)}
  <dsfr-data-query id="pdr-departements" source="pdr" group-by="nom_departement"
    aggregate="entreprise:count:nb"></dsfr-data-query>
  <dsfr-data-kpi id="k-projets" source="pdr" value="count" format="nombre" label="Projets"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-deps" source="pdr-departements" value="count" format="nombre" label="Départements"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-filieres" source="pdr" value="filiere:distinct" format="nombre" label="Filières"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-regions" source="pdr" value="nom_region:distinct" format="nombre" label="Régions"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-projets', agg: 'count' },
      {
        kind: 'kpi',
        id: 'k-deps',
        agg: 'count',
        pipeline: [
          {
            op: 'group-by',
            by: 'nom_departement',
            columns: { nb: { agg: 'count', field: 'entreprise' } },
          },
        ],
      },
      { kind: 'kpi', id: 'k-filieres', agg: 'distinct', field: 'filiere' },
      { kind: 'kpi', id: 'k-regions', agg: 'distinct', field: 'nom_region' },
    ],
  },

  {
    id: 'plan-de-relance-plafond-max-records',
    mode: 'live',
    page: 'viz/plan-de-relance',
    constats: ['AM-002'],
    origin:
      'viz/plan-de-relance — AM-002 / #810 : `max-records` tronque. Le jeu dépasse le plafond posé ici, et le KPI doit afficher le PLAFOND, pas le total du jeu — une troncature qui ne se verrait pas ferait mentir tous les chiffres de la page. L’oracle applique la même borne.',
    feed: { kind: 'raw', source: PDR_BRUT },
    markup: `${PDR_SOURCE(1000)}
  <dsfr-data-kpi id="k-charges" source="pdr" value="count" format="nombre" label="Projets chargés"></dsfr-data-kpi>`,
    expects: [{ kind: 'kpi', id: 'k-charges', agg: 'count', pipeline: [{ op: 'limit', n: 1000 }] }],
  },

  {
    id: 'plan-de-relance-facettes-type-entreprise',
    mode: 'live',
    page: 'viz/plan-de-relance',
    constats: ['PG-012'],
    origin:
      'viz/plan-de-relance — PG-012 : les compteurs affichés à côté de chaque case de facette, dans leur ordre de rendu. Le champ n’a que quelques modalités très inégales : l’ordre y est sans ambiguïté.',
    feed: { kind: 'raw', source: PDR_BRUT },
    markup: `${PDR_SOURCE(3500)}
  <dsfr-data-facets id="pdr-f" source="pdr" fields="type_entreprise"
    labels="type_entreprise:Type d'entreprise" max-values="6"></dsfr-data-facets>`,
    expects: [
      {
        kind: 'facets',
        id: 'pdr-f',
        group: "Type d'entreprise",
        valueColumn: 'type_entreprise',
        countColumn: 'n',
        pipeline: [
          { op: 'filter', filters: [{ field: 'type_entreprise', op: 'isnotnull' }] },
          { op: 'group-by', by: 'type_entreprise', columns: { n: { agg: 'count' } } },
          { op: 'order-by', column: 'n', dir: 'desc' },
          { op: 'limit', n: 6 },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // viz/comptabilite-generale
  // -------------------------------------------------------------------------
  {
    id: 'comptabilite-generale-kpi-filtre-sur-agregat-serveur',
    mode: 'live',
    page: 'viz/comptabilite-generale',
    constats: ['AM-019', 'AM-018'],
    origin:
      'viz/comptabilite-generale — AM-019 : un KPI filtre sa source. La source agrège CÔTÉ SERVEUR (`select="categorie, sum(balance_sortie_3) as montant"` + `group-by`) et deux KPI en extraient l’actif et le passif par leur `where`. L’oracle, lui, part des ÉCRITURES brutes de l’exercice et somme lui-même : c’est l’agrégation du portail qui est vérifiée en même temps que le filtre du KPI. AM-018 : la situation nette est une soustraction entre deux séries.',
    feed: { kind: 'raw', source: CG_BRUT },
    markup: `
  <dsfr-data-source id="cg" api-type="opendatasoft"
    base-url="https://${MEF}" dataset-id="balances_des_comptes_etat"
    fetch-mode="export" max-records="200"
    select="categorie, sum(balance_sortie_3) as montant"
    group-by="categorie"
    where="${CG_WHERE.replace(/"/g, '&quot;')}"></dsfr-data-source>
  <dsfr-data-kpi id="k-actif" source="cg" value="montant:sum" where="categorie:eq:Actif"
    format="nombre" decimals="0" label="Actif"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-passif" source="cg" value="montant:sum" where="categorie:eq:Passif"
    format="nombre" decimals="0" label="Passif"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-postes" source="cg" value="count" format="nombre" label="Catégories"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-actif',
        agg: 'sum',
        field: 'balance_sortie_3',
        filter: [{ field: 'categorie', op: 'eq', value: 'Actif' }],
      },
      {
        kind: 'kpi',
        id: 'k-passif',
        agg: 'sum',
        field: 'balance_sortie_3',
        filter: [{ field: 'categorie', op: 'eq', value: 'Passif' }],
      },
      {
        kind: 'kpi',
        id: 'k-postes',
        agg: 'count',
        pipeline: [
          {
            op: 'group-by',
            by: 'categorie',
            columns: { montant: { agg: 'sum', field: 'balance_sortie_3' } },
          },
        ],
      },
    ],
  },

  {
    id: 'comptabilite-generale-solde-calcule',
    mode: 'live',
    page: 'viz/comptabilite-generale',
    constats: ['AM-018'],
    origin:
      'viz/comptabilite-generale — AM-018 : l’arithmétique entre séries (actif − passif). Le pivot remet les deux catégories EN COLONNES et la colonne calculée en fait la différence ; l’oracle refait le même pivot sur les écritures brutes et réévalue l’expression à part (grammaire ADR-105).',
    feed: { kind: 'raw', source: CG_BRUT },
    markup: `
  <dsfr-data-source id="cg2" api-type="opendatasoft"
    base-url="https://${MEF}" dataset-id="balances_des_comptes_etat"
    fetch-mode="export" max-records="200"
    select="categorie, sum(balance_sortie_3) as montant"
    group-by="categorie"
    where="${CG_WHERE.replace(/"/g, '&quot;')}"></dsfr-data-source>
  <dsfr-data-normalize id="cg2-cle" source="cg2" compute="exercice = 2025"></dsfr-data-normalize>
  <dsfr-data-pivot id="cg2-p" source="cg2-cle" row="exercice"
    column="categorie" value="montant" aggregate="sum"></dsfr-data-pivot>
  <dsfr-data-normalize id="cg2-solde" source="cg2-p"
    compute="situation_nette = Actif - Passif"></dsfr-data-normalize>
  <dsfr-data-kpi id="k-solde" source="cg2-solde" value="situation_nette:max"
    format="nombre" decimals="0" label="Situation nette"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-solde',
        agg: 'max',
        field: 'situation_nette',
        pipeline: [
          { op: 'derive', expr: 'exercice = 2025' },
          {
            op: 'pivot',
            row: 'exercice',
            column: 'categorie',
            value: 'balance_sortie_3',
            aggregate: 'sum',
          },
          { op: 'derive', expr: 'situation_nette = Actif - Passif' },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // viz/bofip
  // -------------------------------------------------------------------------
  {
    id: 'bofip-total-publie-par-la-source-serveur',
    mode: 'live',
    page: 'viz/bofip',
    constats: ['AM-034'],
    origin:
      'viz/bofip — AM-034 : un KPI ne pouvait pas lire le total d’une source en mode SERVEUR. `server-side` ne charge que la page courante (dix lignes) ; `meta:total` doit pourtant annoncer le total du jeu, que l’oracle recompte sur l’export brut. Les deux chiffres du contrôle sont donc volontairement discordants : dix lignes chargées, plusieurs milliers annoncés.',
    feed: { kind: 'raw', source: BOFIP_BRUT },
    markup: `
  <dsfr-data-source id="bofip" api-type="opendatasoft"
    base-url="https://${MEF}" dataset-id="bofip-vigueur"
    server-side page-size="10"
    select="type, titre, serie, division, identifiant_juridique"
    order-by="debut_de_validite:desc"></dsfr-data-source>
  <dsfr-data-kpi id="k-bofip-total" source="bofip" value="meta:total" format="nombre"
    label="Documents en vigueur"></dsfr-data-kpi>`,
    expects: [{ kind: 'kpi', id: 'k-bofip-total', agg: 'count' }],
  },

  {
    id: 'bofip-facettes-serie',
    mode: 'live',
    page: 'viz/bofip',
    constats: ['AM-003', 'PG-012'],
    origin:
      'viz/bofip — AM-003 / PG-012 : les facettes SERVEUR (`server-facets`) lisent l’endpoint `/facets` du portail ; leurs compteurs doivent coller à un group-by recalculé sur les lignes brutes, et leur ordre d’affichage à un tri par compteur décroissant.',
    feed: { kind: 'raw', source: BOFIP_BRUT },
    markup: `
  <dsfr-data-source id="bofip2" api-type="opendatasoft"
    base-url="https://${MEF}" dataset-id="bofip-vigueur"
    server-side page-size="10" select="type, titre, serie, division"></dsfr-data-source>
  <dsfr-data-facets id="bofip-f" source="bofip2" server-facets fields="serie"
    labels="serie:Série" max-values="8"></dsfr-data-facets>`,
    expects: [
      {
        kind: 'facets',
        id: 'bofip-f',
        group: 'Série',
        valueColumn: 'serie',
        countColumn: 'n',
        pipeline: [
          { op: 'filter', filters: [{ field: 'serie', op: 'isnotnull' }] },
          { op: 'group-by', by: 'serie', columns: { n: { agg: 'count' } } },
          { op: 'order-by', column: 'n', dir: 'desc' },
          { op: 'limit', n: 8 },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // viz/barometre-france-num
  // -------------------------------------------------------------------------
  {
    id: 'barometre-jointure-couverture',
    mode: 'live',
    page: 'viz/barometre-france-num',
    constats: ['AM-026'],
    origin:
      'viz/barometre-france-num — AM-026 : aucun indicateur de couverture sur une jointure. La jointure à GAUCHE doit garder toutes les réponses et n’en apparier qu’une partie ; le contrôle compare le nombre de lignes émises ET le nombre de lignes appariées. C’est aussi un écart de graphie #792 : `code_unifie` est un NOMBRE côté réponses et une CHAÎNE côté table de correspondance.',
    feed: { kind: 'raw', source: BFN_SCORES, sources: { corr: BFN_CORR } },
    markup: `
  <dsfr-data-source id="bfn-scores" api-type="opendatasoft"
    base-url="https://${MEF}" dataset-id="questions-reponses"
    fetch-mode="export" max-records="5000"
    select="code_unifie, libelle_reponse, score, annee"
    where="${BFN_WHERE.replace(/"/g, '&quot;')}"></dsfr-data-source>
  <dsfr-data-source id="bfn-corr" api-type="opendatasoft"
    base-url="https://${MEF}" dataset-id="bfn-table-de-correspondance"
    fetch-mode="export" max-records="500"
    select="code_unifie, libelle_unifie, chapitre"></dsfr-data-source>
  <dsfr-data-join id="bfn-j" left="bfn-scores" right="bfn-corr"
    on="code_unifie" type="left"></dsfr-data-join>
  <dsfr-data-kpi id="k-j-lignes" source="bfn-j" value="count" format="nombre" label="Couples"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-j-apparies" source="bfn-j" value="libelle_unifie:distinct" format="nombre" label="Questions appariées"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-j-questions" source="bfn-j" value="chapitre:distinct" format="nombre" label="Chapitres"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-j-lignes',
        agg: 'count',
        pipeline: [{ op: 'join', right: 'corr', on: 'code_unifie', type: 'left' }],
      },
      {
        kind: 'kpi',
        id: 'k-j-apparies',
        agg: 'distinct',
        field: 'libelle_unifie',
        pipeline: [{ op: 'join', right: 'corr', on: 'code_unifie', type: 'left' }],
      },
      {
        kind: 'kpi',
        id: 'k-j-questions',
        agg: 'distinct',
        field: 'chapitre',
        pipeline: [{ op: 'join', right: 'corr', on: 'code_unifie', type: 'left' }],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // viz/barometre-france-num-v2 — les silences du 18/09 (#878)
  // -------------------------------------------------------------------------
  {
    id: 'barometre-v2-source-suit-son-contexte',
    mode: 'live',
    page: 'viz/barometre-france-num-v2',
    constats: ['PG-022'],
    origin:
      'viz/barometre-france-num-v2 — #878, cas 3 du 18/09 : la source de détail `det-prof` devait suivre le contexte `profil` et n’y était pas déclarée ; elle chargeait sans filtre de région, secteur ni taille, et la part affichée montait à « 5 724 % ». Zéro erreur console. Le contrôle reprend le balisage réel, joue le choix d’une région, et compare la part à l’oracle qui recalcule depuis l’export brut avec la clause ODSQL écrite à la main. La preuve de mutation se fait PAR LE BALISAGE (`sources="det-prof"` retiré) et non par le code : une source hors contexte est une erreur d’auteur, pas de bibliothèque (PG-022, grammaire fausse silencieuse).',
    feed: { kind: 'raw', source: BFNV2_DETAIL },
    markup: bfnv2Markup('det-prof'),
    actions: [{ kind: 'select', selector: '#f-region', value: 'Bretagne' }],
    expects: [
      // La part d'un profil ne peut pas dépasser 100 : c'est la somme des
      // scores des réponses de LA question, pour CE profil.
      { kind: 'kpi', id: 'k-part', agg: 'sum', field: 'score', decimals: 1, pattern: '%' },
      // Et réponse par réponse, ce que la source a émis.
      {
        kind: 'rows',
        id: 'det-prof',
        key: 'libelle_reponse',
        columns: ['Profil'],
        pipeline: [
          {
            op: 'group-by',
            by: 'libelle_reponse',
            columns: { Profil: { agg: 'sum', field: 'score' } },
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // education/personnels-colleges
  // -------------------------------------------------------------------------
  {
    id: 'personnels-colleges-part-ponderee',
    mode: 'live',
    page: 'education/personnels-colleges',
    constats: ['LIM-014', 'AM-070'],
    origin:
      'education/personnels-colleges — LIM-014 / #763 : une part nationale est un RAPPORT DE DEUX SOMMES, jamais une moyenne des parts établissement par établissement. Les deux ne donnent pas le même chiffre dès que les établissements n’ont pas la même taille, et c’est exactement ce que le résumé non pondéré d’une choroplèthe donnait à lire. AM-070 : le ratio d’un KPI porte sur des sommes.',
    feed: { kind: 'raw', source: P2D_BRUT },
    markup: `${P2D_SOURCE}
  <dsfr-data-kpi id="k-etp" source="p2d" value="etp_total:sum" format="nombre" decimals="0"
    label="ETP"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-femmes" source="p2d"
    value="etp_de_femmes_enseignantes:sum / etp_enseignants_hommes_et_femmes:sum"
    format="pourcentage" decimals="1" label="Femmes parmi les ETP enseignants"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-agreges" source="p2d"
    value="etp_d_enseignants_agreges:sum / etp_enseignants_hommes_et_femmes:sum"
    format="pourcentage" decimals="1" label="Agrégés"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-etp', agg: 'sum', field: 'etp_total' },
      {
        kind: 'kpi',
        id: 'k-femmes',
        agg: 'max',
        field: 'part',
        decimals: 1,
        pipeline: [
          {
            op: 'global',
            columns: {
              femmes: { agg: 'sum', field: 'etp_de_femmes_enseignantes' },
              ens: { agg: 'sum', field: 'etp_enseignants_hommes_et_femmes' },
            },
          },
          { op: 'derive', expr: 'part = femmes / ens * 100' },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-agreges',
        agg: 'max',
        field: 'part',
        decimals: 1,
        pipeline: [
          {
            op: 'global',
            columns: {
              agreges: { agg: 'sum', field: 'etp_d_enseignants_agreges' },
              ens: { agg: 'sum', field: 'etp_enseignants_hommes_et_femmes' },
            },
          },
          { op: 'derive', expr: 'part = agreges / ens * 100' },
        ],
      },
    ],
  },

  {
    id: 'personnels-colleges-unpivot-tranches-age',
    mode: 'live',
    page: 'education/personnels-colleges',
    constats: ['AM-014', 'AM-020'],
    origin:
      'education/personnels-colleges — AM-014 / AM-020 : replier des colonnes PARALLÈLES en une seule série. Les trois tranches d’âge sont trois colonnes du jeu ; dépliées puis ré-agrégées, elles doivent redonner exactement les trois sommes, avec les libellés déclarés et dans l’ordre déclaré.',
    feed: { kind: 'raw', source: P2D_BRUT },
    markup: `${P2D_SOURCE}
  <dsfr-data-unpivot id="age" source="p2d"
    value-cols="etp_d_enseignants_de_moins_de_35_ans:Moins de 35 ans, etp_d_enseignants_de_35_a_moins_de_50_ans:35 à 50 ans, etp_d_enseignants_de_50_ans_ou_plus:Plus de 50 ans"
    var-name="tranche" value-name="etp_brut"></dsfr-data-unpivot>
  <dsfr-data-query id="age-agg" source="age" group-by="tranche"
    aggregate="etp_brut:sum:etp"></dsfr-data-query>
  <dsfr-data-kpi id="k-age-total" source="age-agg" value="etp:sum" format="nombre" decimals="0"
    label="ETP enseignants répartis"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'rows',
        id: 'age-agg',
        key: 'tranche',
        columns: ['etp'],
        pipeline: [
          {
            op: 'unpivot',
            idCols: ['code_departement'],
            valueCols: [
              { column: 'etp_d_enseignants_de_moins_de_35_ans', as: 'Moins de 35 ans' },
              { column: 'etp_d_enseignants_de_35_a_moins_de_50_ans', as: '35 à 50 ans' },
              { column: 'etp_d_enseignants_de_50_ans_ou_plus', as: 'Plus de 50 ans' },
            ],
            varName: 'tranche',
            valueName: 'etp_brut',
          },
          { op: 'group-by', by: 'tranche', columns: { etp: { agg: 'sum', field: 'etp_brut' } } },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-age-total',
        agg: 'sum',
        field: 'etp',
        pipeline: [
          {
            op: 'unpivot',
            idCols: ['code_departement'],
            valueCols: [
              { column: 'etp_d_enseignants_de_moins_de_35_ans', as: 'Moins de 35 ans' },
              { column: 'etp_d_enseignants_de_35_a_moins_de_50_ans', as: '35 à 50 ans' },
              { column: 'etp_d_enseignants_de_50_ans_ou_plus', as: 'Plus de 50 ans' },
            ],
            varName: 'tranche',
            valueName: 'etp_brut',
          },
          { op: 'group-by', by: 'tranche', columns: { etp: { agg: 'sum', field: 'etp_brut' } } },
        ],
      },
    ],
  },

  {
    id: 'personnels-colleges-parts-departementales',
    mode: 'live',
    page: 'education/personnels-colleges',
    constats: ['LIM-014'],
    origin:
      'education/personnels-colleges — LIM-014 : les parts DÉPARTEMENTALES qui alimentent la choroplèthe. Un group-by par département, deux sommes, une colonne calculée arrondie à la décimale : c’est la série que la carte affiche, et le plus haut de ses points. Comme sur la page, la source garde un lecteur direct (le compteur d’établissements) : la query regroupe donc côté client, sans réécrire la source (#765).',
    feed: { kind: 'raw', source: P2D_BRUT },
    markup: `${P2D_SOURCE}
  <dsfr-data-kpi id="k-dep-etabs" source="p2d" value="count" format="nombre"
    label="Collèges"></dsfr-data-kpi>
  <dsfr-data-query id="c-dep" source="p2d" group-by="code_departement"
    aggregate="etp_d_enseignants_agreges:sum:agr, etp_enseignants_hommes_et_femmes:sum:ens"
    where="code_departement:isnotnull"></dsfr-data-query>
  <dsfr-data-normalize id="c-dep-n" source="c-dep"
    compute="pct_agreges = agr / ens * 100" round="pct_agreges:1"></dsfr-data-normalize>
  <dsfr-data-kpi id="k-dep-n" source="c-dep-n" value="count" format="nombre"
    label="Départements"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-dep-max" source="c-dep-n" value="pct_agreges:max" format="decimal"
    decimals="1" label="Part la plus haute"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-dep-ens" source="c-dep-n" value="ens:sum" format="nombre" decimals="0"
    label="ETP enseignants"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-dep-etabs', agg: 'count' },
      {
        kind: 'kpi',
        id: 'k-dep-n',
        agg: 'count',
        pipeline: [
          { op: 'filter', filters: [{ field: 'code_departement', op: 'isnotnull' }] },
          {
            op: 'group-by',
            by: 'code_departement',
            columns: {
              agr: { agg: 'sum', field: 'etp_d_enseignants_agreges' },
              ens: { agg: 'sum', field: 'etp_enseignants_hommes_et_femmes' },
            },
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-dep-max',
        agg: 'max',
        field: 'pct_agreges',
        decimals: 1,
        pipeline: [
          { op: 'filter', filters: [{ field: 'code_departement', op: 'isnotnull' }] },
          {
            op: 'group-by',
            by: 'code_departement',
            columns: {
              agr: { agg: 'sum', field: 'etp_d_enseignants_agreges' },
              ens: { agg: 'sum', field: 'etp_enseignants_hommes_et_femmes' },
            },
          },
          { op: 'derive', expr: 'pct_agreges = round(agr / ens * 100, 1)' },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-dep-ens',
        agg: 'sum',
        field: 'ens',
        pipeline: [
          { op: 'filter', filters: [{ field: 'code_departement', op: 'isnotnull' }] },
          {
            op: 'group-by',
            by: 'code_departement',
            columns: {
              agr: { agg: 'sum', field: 'etp_d_enseignants_agreges' },
              ens: { agg: 'sum', field: 'etp_enseignants_hommes_et_femmes' },
            },
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // education/etablissements-euroscol
  // -------------------------------------------------------------------------
  {
    id: 'euroscol-colonne-calculee-sur-valeurs-numeriques',
    mode: 'live',
    page: 'education/etablissements-euroscol',
    constats: ['BUG-007'],
    origin:
      'education/etablissements-euroscol — BUG-007 : une récriture de valeur restait sans effet sur une valeur NUMÉRIQUE. Les colonnes `rep` / `rep_plus` valent 0 ou 1 : une colonne calculée qui les teste doit voir des nombres, et les trois catégories qu’elle produit doivent se retrouver ligne pour ligne dans un recalcul de la même expression.',
    feed: { kind: 'raw', source: EURO_BRUT },
    markup: `${EURO_SOURCE}
  <dsfr-data-normalize id="euro-n" source="euro"
    compute="prioritaire = when rep_plus = 1 then 'REP+' when rep = 1 then 'REP' else 'Hors education prioritaire'"></dsfr-data-normalize>
  <dsfr-data-query id="euro-prio" source="euro-n" group-by="prioritaire"
    aggregate="rne:count:nb" order-by="prioritaire:asc"></dsfr-data-query>
  <dsfr-data-kpi id="k-euro" source="euro" value="count" format="nombre" label="Établissements"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-euro-aca" source="euro" value="academie:distinct" format="nombre" label="Académies"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-euro', agg: 'count' },
      { kind: 'kpi', id: 'k-euro-aca', agg: 'distinct', field: 'academie' },
      {
        kind: 'rows',
        id: 'euro-prio',
        key: 'prioritaire',
        columns: ['nb'],
        pipeline: [
          {
            op: 'derive',
            expr: "prioritaire = when rep_plus = 1 then 'REP+' when rep = 1 then 'REP' else 'Hors education prioritaire'",
          },
          { op: 'group-by', by: 'prioritaire', columns: { nb: { agg: 'count', field: 'rne' } } },
          { op: 'order-by', column: 'prioritaire', dir: 'asc' },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // education/tne-dashboard
  // -------------------------------------------------------------------------
  {
    id: 'tne-audiences-ecart-mensuel',
    mode: 'live',
    page: 'education/tne-dashboard',
    constats: ['AM-068', 'AM-076'],
    origin:
      'education/tne-dashboard — AM-068 : le cumul existait, son inverse manquait. `:diff` retrouve le flux d’une série déjà cumulée ; l’écart de chaque mois se recalcule à part sur la même série triée. AM-076 : les agrégats `first` et `last` d’un KPI — ici la dernière valeur de la série, celle qu’aucun autre agrégat ne donne.',
    feed: { kind: 'raw', source: TNE_AUDIENCES },
    markup: `
  <dsfr-data-source id="tne-audiences" api-type="opendatasoft"
    base-url="https://${EDU}" dataset-id="fr-en-tne_suivi_audiences"
    fetch-mode="export" max-records="200"
    where="${TNE_AUDIENCES_WHERE}"
    select="mois_saisie, nombre_de_connexion_a_la_plateforme_tne, nombre_de_visiteurs_uniques_a_la_plateforme_tne"></dsfr-data-source>
  <dsfr-data-query id="tne-audiences-f" source="tne-audiences" order-by="mois_saisie:asc"
    aggregate="nombre_de_connexion_a_la_plateforme_tne:diff"></dsfr-data-query>
  <dsfr-data-kpi id="k-tne-dernier" source="tne-audiences-f"
    value="nombre_de_visiteurs_uniques_a_la_plateforme_tne:last" format="nombre"
    label="Visiteurs uniques du dernier mois"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-tne-mois" source="tne-audiences-f" value="count" format="nombre"
    label="Mois observés"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'rows',
        id: 'tne-audiences-f',
        key: 'mois_saisie',
        columns: ['nombre_de_connexion_a_la_plateforme_tne__diff'],
        pipeline: [
          { op: 'order-by', column: 'mois_saisie', dir: 'asc' },
          {
            op: 'running',
            kind: 'diff',
            from: 'nombre_de_connexion_a_la_plateforme_tne',
            as: 'nombre_de_connexion_a_la_plateforme_tne__diff',
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-tne-dernier',
        agg: 'last',
        field: 'nombre_de_visiteurs_uniques_a_la_plateforme_tne',
        pipeline: [{ op: 'order-by', column: 'mois_saisie', dir: 'asc' }],
      },
      { kind: 'kpi', id: 'k-tne-mois', agg: 'count' },
    ],
  },

  {
    id: 'tne-personnels-formes-unpivot',
    mode: 'live',
    page: 'education/tne-dashboard',
    constats: ['AM-014', 'BUG-009'],
    origin:
      'education/tne-dashboard — BUG-009 : une agrégation globale et un group-by branchés sur la MÊME source, plus le dépliage des deux colonnes de degré. Le total des participants doit rester le total, quel que soit le nombre de lecteurs de la source.',
    feed: { kind: 'raw', source: TNE_FORMES },
    markup: `
  <dsfr-data-source id="tne-formes" api-type="opendatasoft"
    base-url="https://${EDU}" dataset-id="fr-en-tne_personnels_formes_par_departement_secteur_type_etablissement"
    fetch-mode="export" max-records="1000"
    where="${TNE_FORMES_WHERE.replace(/'/g, '&#39;')}"
    select="departement, nombre_total_de_participants, etablissement_1er_degre, etablissement_2nd_degre, formes_non_connus"></dsfr-data-source>
  <dsfr-data-query id="tne-totaux" source="tne-formes"
    aggregate="etablissement_1er_degre:sum:d1, etablissement_2nd_degre:sum:d2, nombre_total_de_participants:sum:tot"></dsfr-data-query>
  <dsfr-data-unpivot id="tne-degre" source="tne-totaux"
    value-cols="d1:Premier degré, d2:Second degré"
    var-name="categorie" value-name="valeur"></dsfr-data-unpivot>
  <dsfr-data-query id="tne-dept" source="tne-formes" group-by="departement"
    aggregate="nombre_total_de_participants:sum:n"></dsfr-data-query>
  <dsfr-data-kpi id="k-tne-participants" source="tne-formes"
    value="nombre_total_de_participants:sum" format="nombre" label="Participants"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-tne-depts" source="tne-dept" value="count" format="nombre"
    label="Départements"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-tne-participants', agg: 'sum', field: 'nombre_total_de_participants' },
      {
        kind: 'kpi',
        id: 'k-tne-depts',
        agg: 'count',
        pipeline: [
          {
            op: 'group-by',
            by: 'departement',
            columns: { n: { agg: 'sum', field: 'nombre_total_de_participants' } },
          },
        ],
      },
      {
        kind: 'rows',
        id: 'tne-degre',
        key: 'categorie',
        columns: ['valeur'],
        pipeline: [
          {
            op: 'global',
            columns: {
              d1: { agg: 'sum', field: 'etablissement_1er_degre' },
              d2: { agg: 'sum', field: 'etablissement_2nd_degre' },
              tot: { agg: 'sum', field: 'nombre_total_de_participants' },
            },
          },
          {
            op: 'unpivot',
            idCols: ['tot'],
            valueCols: [
              { column: 'd1', as: 'Premier degré' },
              { column: 'd2', as: 'Second degré' },
            ],
            varName: 'categorie',
            valueName: 'valeur',
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // education/fei-chiffres-cles
  // -------------------------------------------------------------------------
  {
    id: 'fei-alias-group-by-sans-parenthese',
    mode: 'live',
    page: 'education/fei-chiffres-cles',
    constats: ['BUG-010', 'PG-014'],
    origin:
      'education/fei-chiffres-cles — BUG-010 / PG-014 : un alias de `group-by` SANS parenthèse (`periode as an`) était entouré d’accents graves et valait un HTTP 400 silencieux. Si la requête repart, les chiffres sortent ; si elle est encore mal formée, la page n’affiche rien et le contrôle tombe avant même de comparer.',
    feed: { kind: 'raw', source: ASLVE_BRUT },
    markup: `
  <dsfr-data-source id="aslve" api-type="opendatasoft"
    base-url="https://${EDU}" dataset-id="fr-en-assistants_langues_vivantes_etrangeres"
    group-by="pays, iso2_pays, periode as an"
    select="iso2_pays, sum(postes_offerts) as v" max-records="2000"></dsfr-data-source>
  <dsfr-data-kpi id="k-aslve-postes" source="aslve" value="v:sum" format="nombre"
    label="Postes offerts"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-aslve-pays" source="aslve" value="iso2_pays:distinct" format="nombre"
    label="Pays"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-aslve-lignes" source="aslve" value="count" format="nombre"
    label="Couples pays-période"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-aslve-postes', agg: 'sum', field: 'postes_offerts' },
      { kind: 'kpi', id: 'k-aslve-pays', agg: 'distinct', field: 'iso2_pays' },
      {
        kind: 'kpi',
        id: 'k-aslve-lignes',
        agg: 'count',
        pipeline: [
          {
            op: 'group-by',
            by: ['pays', 'iso2_pays', 'periode'],
            columns: { v: { agg: 'sum', field: 'postes_offerts' } },
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // education/dataviz-ips-ecoles
  // -------------------------------------------------------------------------
  {
    id: 'ips-ecoles-tranches-calculees',
    mode: 'live',
    page: 'education/dataviz-ips-ecoles',
    constats: ['AM-018'],
    origin:
      'education/dataviz-ips-ecoles — la grammaire des colonnes calculées (ADR-105) contre de vraies données : `when … then` range chaque école dans sa tranche d’IPS, et l’écart au département est une soustraction arrondie. L’oracle réévalue les MÊMES expressions dans sa propre implémentation de la grammaire. Périmètre réduit à un département : le jeu complet dépasse 30 000 lignes, et les deux côtés filtrent identiquement côté serveur.',
    feed: { kind: 'raw', source: IPS_GIRONDE },
    markup: `
  <dsfr-data-source id="ecoles" api-type="opendatasoft"
    base-url="https://${EDU}" dataset-id="donnees-ips-ecoles"
    fetch-mode="export" max-records="5000"
    where="${IPS_GIRONDE_WHERE}"
    select="${IPS_ECOLES_CHAMPS}"></dsfr-data-source>
  <dsfr-data-normalize id="ecoles-n" source="ecoles"
    compute="ecart_dep = round(ips - ips_departemental, 1); ${TRANCHES}"></dsfr-data-normalize>
  <dsfr-data-query id="ecoles-tranches" source="ecoles-n" group-by="tranche_ips"
    aggregate="uai:count:nb, ips:avg:ips_moyen" order-by="tranche_ips:asc"></dsfr-data-query>
  <dsfr-data-kpi id="k-ecoles" source="ecoles" value="count" format="nombre" label="Écoles"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-ecoles-ips" source="ecoles" value="ips:avg" format="decimal" decimals="1"
    label="IPS moyen"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-ecart-max" source="ecoles-n" value="ecart_dep:max" format="decimal"
    decimals="1" label="Écart au département le plus haut"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-ecoles', agg: 'count' },
      { kind: 'kpi', id: 'k-ecoles-ips', agg: 'avg', field: 'ips', decimals: 1 },
      {
        kind: 'kpi',
        id: 'k-ecart-max',
        agg: 'max',
        field: 'ecart_dep',
        decimals: 1,
        pipeline: [{ op: 'derive', expr: 'ecart_dep = round(ips - ips_departemental, 1)' }],
      },
      {
        kind: 'rows',
        id: 'ecoles-tranches',
        key: 'tranche_ips',
        columns: ['nb'],
        pipeline: [
          { op: 'derive', expr: TRANCHES },
          {
            op: 'group-by',
            by: 'tranche_ips',
            columns: { nb: { agg: 'count', field: 'uai' } },
          },
          { op: 'order-by', column: 'tranche_ips', dir: 'asc' },
        ],
      },
    ],
  },

  {
    id: 'ips-ecoles-facettes-ponderees',
    mode: 'live',
    page: 'education/dataviz-ips-ecoles',
    constats: ['AM-067'],
    origin:
      'education/dataviz-ips-ecoles — AM-067 : une facette bâtie sur une source PRÉ-AGRÉGÉE affichait « 1 » partout, faute d’un attribut lui disant où lire le poids de chaque ligne. Ici la source agrège côté serveur (une ligne par département, avec son compte) et `weight-field` fait annoncer à la facette la SOMME, pas le nombre de lignes reçues — qui vaudrait 1.',
    feed: { kind: 'raw', source: IPS_BORDEAUX },
    markup: `
  <dsfr-data-source id="ecoles-deps" api-type="opendatasoft"
    base-url="https://${EDU}" dataset-id="donnees-ips-ecoles"
    group-by="libelle_departement" select="libelle_departement, count(*) as n"
    where="${IPS_BORDEAUX_WHERE}" max-records="200"></dsfr-data-source>
  <dsfr-data-facets id="ecoles-dep-f" source="ecoles-deps" fields="libelle_departement"
    labels="libelle_departement:Département" weight-field="n" max-values="8"></dsfr-data-facets>
  <dsfr-data-kpi id="k-bordeaux" source="ecoles-deps" value="n:sum" format="nombre"
    label="Écoles de l'académie"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-bordeaux', agg: 'count' },
      {
        kind: 'facets',
        id: 'ecoles-dep-f',
        group: 'Département',
        valueColumn: 'libelle_departement',
        countColumn: 'n',
        pipeline: [
          { op: 'filter', filters: [{ field: 'libelle_departement', op: 'isnotnull' }] },
          { op: 'group-by', by: 'libelle_departement', columns: { n: { agg: 'count' } } },
          { op: 'order-by', column: 'n', dir: 'desc' },
          { op: 'limit', n: 8 },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // viz/centres-controle-technique
  // -------------------------------------------------------------------------
  {
    id: 'centres-controle-technique-group-by-regions',
    mode: 'live',
    page: 'viz/centres-controle-technique',
    constats: ['PG-015', 'PG-013'],
    origin:
      'viz/centres-controle-technique — PG-015 : les lignes sans code géographique. Le group-by de la page écarte les régions vides ; le nombre de groupes, la somme des compteurs et le plus gros groupe sont recalculés en écartant exactement les mêmes lignes. PG-013 : le plafond de chargement est posé au-dessus du jeu, donc aucune ligne ne doit manquer.',
    feed: { kind: 'raw', source: CCT_BRUT },
    markup: `
  <dsfr-data-source id="cct" api-type="opendatasoft"
    base-url="https://${MEF}" dataset-id="annuaire-centres-controle-technique"
    fetch-mode="export" max-records="10000"
    select="cct_siret, cct_denomination, code_departement, nom_departement, nom_region"></dsfr-data-source>
  <dsfr-data-query id="cct-regions" source="cct" group-by="nom_region"
    where="nom_region:isnotnull" aggregate="cct_siret:count:nb"></dsfr-data-query>
  <dsfr-data-kpi id="k-cct" source="cct" value="count" format="nombre" label="Centres"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-cct-regions" source="cct-regions" value="count" format="nombre" label="Régions"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-cct-situes" source="cct-regions" value="nb:sum" format="nombre" label="Centres situés"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-cct-max" source="cct-regions" value="nb:max" format="nombre" label="Plus grosse région"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-cct', agg: 'count' },
      {
        kind: 'kpi',
        id: 'k-cct-regions',
        agg: 'count',
        pipeline: [
          { op: 'filter', filters: [{ field: 'nom_region', op: 'isnotnull' }] },
          {
            op: 'group-by',
            by: 'nom_region',
            columns: { nb: { agg: 'count', field: 'cct_siret' } },
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-cct-situes',
        agg: 'sum',
        field: 'nb',
        pipeline: [
          { op: 'filter', filters: [{ field: 'nom_region', op: 'isnotnull' }] },
          {
            op: 'group-by',
            by: 'nom_region',
            columns: { nb: { agg: 'count', field: 'cct_siret' } },
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-cct-max',
        agg: 'max',
        field: 'nb',
        pipeline: [
          { op: 'filter', filters: [{ field: 'nom_region', op: 'isnotnull' }] },
          {
            op: 'group-by',
            by: 'nom_region',
            columns: { nb: { agg: 'count', field: 'cct_siret' } },
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // viz/tourisme-et-handicap
  // -------------------------------------------------------------------------
  {
    id: 'tourisme-et-handicap-facettes-filiere',
    mode: 'live',
    page: 'viz/tourisme-et-handicap',
    constats: ['PG-012', 'AM-004'],
    origin:
      'viz/tourisme-et-handicap — PG-012 : les compteurs et l’ORDRE des facettes de filière, contre un group-by recalculé et rangé par compteur décroissant. AM-004 : les activités distinctes du même jeu, par un autre chemin que le group-by.',
    feed: { kind: 'raw', source: TH_BRUT },
    markup: `
  <dsfr-data-source id="th" api-type="opendatasoft"
    base-url="https://${MEF}" dataset-id="etablissements-labellises-tourisme-et-handicap"
    fetch-mode="export" max-records="6000"
    select="nom_du_professionnel, filiere, activite, region, departement"></dsfr-data-source>
  <dsfr-data-facets id="th-f" source="th" fields="filiere"
    labels="filiere:Filière" max-values="5"></dsfr-data-facets>
  <dsfr-data-kpi id="k-th" source="th" value="count" format="nombre" label="Établissements"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-th-activites" source="th" value="activite:distinct" format="nombre"
    label="Activités"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-th', agg: 'count' },
      { kind: 'kpi', id: 'k-th-activites', agg: 'distinct', field: 'activite' },
      {
        kind: 'facets',
        id: 'th-f',
        group: 'Filière',
        valueColumn: 'filiere',
        countColumn: 'n',
        pipeline: [
          { op: 'filter', filters: [{ field: 'filiere', op: 'isnotnull' }] },
          { op: 'group-by', by: 'filiere', columns: { n: { agg: 'count' } } },
          { op: 'order-by', column: 'n', dir: 'desc' },
          { op: 'limit', n: 5 },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // sports/portrait-federation
  // -------------------------------------------------------------------------
  {
    id: 'portrait-federation-part-ponderee-licenciees',
    mode: 'live',
    page: 'sports/portrait-federation',
    constats: ['LIM-014', 'AM-070'],
    origin:
      'sports/portrait-federation — LIM-014 / #763 : la part des licenciées de l’ensemble des fédérations est le rapport de DEUX SOMMES. La moyenne des parts fédération par fédération, elle, donne un autre chiffre — c’est le résumé non pondéré que le constat désigne. AM-070 : un ratio de sommes filtré.',
    feed: {
      kind: 'raw',
      source: fedeBrut(FEDE_OLYMPIQUES),
      sources: { autres: fedeBrut(FEDE_AUTRES) },
    },
    markup: `${fedeSource('fede-o', FEDE_OLYMPIQUES)}
  <dsfr-data-kpi id="k-fede-n" source="fede-o" value="count" format="nombre"
    label="Fédérations olympiques"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-fede-lics" source="fede-o" value="lics_tot_semidef:sum" format="nombre"
    decimals="0" label="Licences"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-fede-part" source="fede-o"
    value="lics_f_semidef:sum / lics_tot_semidef:sum" format="pourcentage" decimals="1"
    label="Part des licenciées"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-fede-n', agg: 'count' },
      { kind: 'kpi', id: 'k-fede-lics', agg: 'sum', field: 'lics_tot_semidef' },
      {
        kind: 'kpi',
        id: 'k-fede-part',
        agg: 'max',
        field: 'part',
        decimals: 1,
        pipeline: [
          {
            op: 'global',
            columns: {
              femmes: { agg: 'sum', field: 'lics_f_semidef' },
              total: { agg: 'sum', field: 'lics_tot_semidef' },
            },
          },
          { op: 'derive', expr: 'part = femmes / total * 100' },
        ],
      },
    ],
  },

  {
    id: 'portrait-federation-union-de-deux-sources',
    mode: 'live',
    page: 'sports/portrait-federation',
    constats: ['AM-074'],
    origin:
      'sports/portrait-federation — AM-074 : aucune union dans le pipeline, empiler deux séries demandait pivots et jointures. Deux sources disjointes du même jeu sont empilées, avec une colonne de provenance ; la pile doit redonner le jeu entier, et le regroupement par provenance retrouver chacune des deux.',
    feed: {
      kind: 'raw',
      source: fedeBrut(FEDE_OLYMPIQUES),
      sources: { autres: fedeBrut(FEDE_AUTRES) },
    },
    markup: `${fedeSource('fede-o2', FEDE_OLYMPIQUES)}${fedeSource('fede-a2', FEDE_AUTRES)}
  <dsfr-data-concat id="fede-pile" sources="fede-o2, fede-a2" origin-field="groupe"
    origin-labels="fede-o2:Olympiques | fede-a2:Autres"></dsfr-data-concat>
  <dsfr-data-query id="fede-par-groupe" source="fede-pile" group-by="groupe"
    aggregate="federation:count:nb, lics_tot_semidef:sum:lics"></dsfr-data-query>
  <dsfr-data-kpi id="k-pile" source="fede-pile" value="count" format="nombre"
    label="Fédérations empilées"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-pile-lics" source="fede-pile" value="lics_tot_semidef:sum" format="nombre"
    decimals="0" label="Licences"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-pile',
        agg: 'count',
        pipeline: [
          {
            op: 'concat',
            sources: ['main', 'autres'],
            originField: 'groupe',
            originLabels: { main: 'Olympiques', autres: 'Autres' },
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-pile-lics',
        agg: 'sum',
        field: 'lics_tot_semidef',
        pipeline: [
          {
            op: 'concat',
            sources: ['main', 'autres'],
            originField: 'groupe',
            originLabels: { main: 'Olympiques', autres: 'Autres' },
          },
        ],
      },
      {
        kind: 'rows',
        id: 'fede-par-groupe',
        key: 'groupe',
        columns: ['nb', 'lics'],
        pipeline: [
          {
            op: 'concat',
            sources: ['main', 'autres'],
            originField: 'groupe',
            originLabels: { main: 'Olympiques', autres: 'Autres' },
          },
          {
            op: 'group-by',
            by: 'groupe',
            columns: {
              nb: { agg: 'count', field: 'federation' },
              lics: { agg: 'sum', field: 'lics_tot_semidef' },
            },
          },
        ],
      },
    ],
  },
];

export const BANC_PAGES: Manifest = { domain: 'banc-pages', checks: CHECKS };
