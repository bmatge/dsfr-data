/**
 * Playground examples data
 *
 * 25 exemples organises en 9 categories :
 *
 * Mode direct       : dsfr-data-source → composant (dsfr-data-chart / dsfr-data-kpi / dsfr-data-list)
 * Mode requete      : dsfr-data-source → dsfr-data-query → composant
 * Mode normalisation : dsfr-data-source → dsfr-data-normalize → dsfr-data-query → composant
 * Mode display      : dsfr-data-source → dsfr-data-display (template HTML dynamique)
 * Mode recherche    : dsfr-data-source → dsfr-data-search → composant
 * Mode facettes     : dsfr-data-source → dsfr-data-normalize → dsfr-data-facets → composant
 * Pagination serveur : dsfr-data-source paginate → composant
 * Server-side       : dsfr-data-source server-side → composant
 * Carte du monde    : dsfr-data-source → dsfr-data-world-map
 *
 * Sources de donnees :
 *  - OpenDataSoft : Fiscalite locale, Industrie du futur, RappelConso (data.economie.gouv.fr)
 *  - Tabular API  : Registre des maires, Code officiel geographique, LOVAC (tabular-api.data.gouv.fr)
 */
export const examples: Record<string, string> = {
  // =====================================================================
  // MODE DIRECT — dsfr-data-source → composant
  // Les donnees de la source sont transmises directement au composant
  // de visualisation, sans transformation intermediaire.
  // =====================================================================

  'direct-bar': `<!--
  Barres — Taux de taxe fonciere par commune
  Mode direct : dsfr-data-source → dsfr-data-chart (bar)
  Source : Fiscalite locale des particuliers (OpenDataSoft)
-->

<div class="fr-container fr-my-4w">
  <h2>Taux de taxe fonciere par commune</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.economie.gouv.fr — Fiscalite locale des particuliers
  </p>

  <dsfr-data-source id="data" api-type="opendatasoft"
    dataset-id="fiscalite-locale-des-particuliers"
    base-url="https://data.economie.gouv.fr"
    limit="15">
  </dsfr-data-source>

  <dsfr-data-chart source="data"
    type="bar"
    label-field="libcom"
    value-field="taux_global_tfb"
    unit-tooltip="%"
    selected-palette="categorical">
  </dsfr-data-chart>
</div>`,

  'direct-bar-databox': `<!--
  Barres avec DataBox complete — Taux de taxe fonciere par commune
  Mode direct : dsfr-data-source → dsfr-data-chart (bar + databox)
  Source : Fiscalite locale des particuliers (OpenDataSoft)
  DataBox avec tous les attributs : titre, tooltip, modale, source,
  date, tendance, screenshot, telechargement, plein ecran, actions
-->

<div class="fr-container fr-my-4w">
  <dsfr-data-source id="data" api-type="opendatasoft"
    dataset-id="fiscalite-locale-des-particuliers"
    base-url="https://data.economie.gouv.fr"
    limit="10">
  </dsfr-data-source>

  <dsfr-data-chart id="chart" source="data"
    type="bar"
    label-field="libcom"
    value-field="taux_global_tfb"
    unit-tooltip="%"
    selected-palette="categorical"
    databox
    databox-title="Taux de taxe fonciere par commune"
    databox-tooltip-title="Taxe fonciere"
    databox-tooltip-content="Taux global de taxe fonciere sur les proprietes baties (TFB) par commune. Source : DGFiP, donnees fiscales des particuliers."
    databox-modal-title="A propos de ces donnees"
    databox-modal-content="Les taux de fiscalite locale sont votes chaque annee par les collectivites territoriales. Le taux global TFB inclut les parts communale, intercommunale et departementale."
    databox-source="DGFiP via data.economie.gouv.fr"
    databox-date="2024"
    databox-trend="+1.2%"
    databox-screenshot
    databox-download
    databox-fullscreen
    databox-actions='["Voir sur data.economie.gouv.fr", "Methodologie DGFiP"]'>
  </dsfr-data-chart>

  <dsfr-data-a11y for="chart" source="data"
    table download
    description="Ce graphique montre les taux de taxe fonciere globaux par commune.">
  </dsfr-data-a11y>
</div>`,

  'direct-line-databox': `<!--
  Ligne avec DataBox — Taux de taxe fonciere par commune
  Mode direct : dsfr-data-source → dsfr-data-chart (line + databox)
  Source : Fiscalite locale des particuliers (OpenDataSoft)
  DataBox simplifiee : titre, source, date, tendance, telechargement
-->

<div class="fr-container fr-my-4w">
  <dsfr-data-source id="data" api-type="opendatasoft"
    dataset-id="fiscalite-locale-des-particuliers"
    base-url="https://data.economie.gouv.fr"
    limit="15">
  </dsfr-data-source>

  <dsfr-data-chart id="chart" source="data"
    type="line"
    label-field="libcom"
    value-field="taux_global_tfb"
    unit-tooltip="%"
    selected-palette="default"
    databox
    databox-title="Evolution du taux de taxe fonciere"
    databox-tooltip-title="Taux TFB"
    databox-tooltip-content="Evolution du taux global de taxe fonciere sur les proprietes baties par commune."
    databox-source="DGFiP via data.economie.gouv.fr"
    databox-date="2024"
    databox-trend="-0.3%"
    databox-download
    databox-screenshot
    databox-fullscreen>
  </dsfr-data-chart>

  <dsfr-data-a11y for="chart" source="data"
    table download
    description="Ce graphique montre l'evolution des taux de taxe fonciere.">
  </dsfr-data-a11y>
</div>`,

  'direct-kpi': `<!--
  KPI — Indicateurs cles Industrie du futur
  Mode direct : dsfr-data-source → dsfr-data-kpi (x4)
  Source : Industrie du futur (OpenDataSoft)
  Chaque KPI calcule une agregation sur les donnees brutes
-->

<div class="fr-container fr-my-4w">
  <h2>Indicateurs cles — Industrie du futur</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.economie.gouv.fr — Industrie du futur
  </p>

  <dsfr-data-source id="data" api-type="opendatasoft"
    dataset-id="industrie-du-futur"
    base-url="https://data.economie.gouv.fr">
  </dsfr-data-source>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem;">
    <dsfr-data-kpi source="data"
      valeur="sum:nombre_beneficiaires"
      label="Total beneficiaires"
      format="nombre">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="data"
      valeur="avg:nombre_beneficiaires"
      label="Moyenne par enregistrement"
      format="decimal">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="data"
      valeur="max:montant_investissement"
      label="Investissement max"
      format="euro"
      couleur="vert">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="data"
      valeur="count"
      label="Enregistrements"
      format="nombre">
    </dsfr-data-kpi>
  </div>
</div>`,

  'direct-datalist': `<!--
  Tableau — Maires de France (pagination serveur)
  Mode : dsfr-data-source (api-type="tabular", server-side) → dsfr-data-list
  Source : Registre des maires (tabular-api) — 34 874 records
  Chaque page est chargee a la demande depuis l'API (pas de chargement complet)
-->

<div class="fr-container fr-my-4w">
  <h2>Maires de France</h2>
  <p class="fr-text--sm fr-text--light">
    Source : tabular-api.data.gouv.fr — Repertoire national des elus (maires)
    <br>34 874 enregistrements — pagination serveur (20 par page)
  </p>

  <dsfr-data-source id="data"
    api-type="tabular"
    resource="2876a346-d50c-4911-934e-19ee07b0e503"
    server-side
    page-size="20">
  </dsfr-data-source>

  <dsfr-data-list source="data"
    colonnes="Nom de l'élu:Nom, Prénom de l'élu:Prenom, Libellé du département:Departement, Libellé de la commune:Commune"
    tri="Nom de l'élu:asc"
    pagination="20"
    export="csv">
  </dsfr-data-list>
</div>`,

  // =====================================================================
  // PAGINATION SERVEUR — dsfr-data-source paginate → composant
  // dsfr-data-source gere la pagination cote serveur : chaque changement
  // de page declenche un nouvel appel API avec page=N&page_size=M.
  // =====================================================================

  'server-paginate-datalist': `<!--
  Tableau avec pagination serveur — Maires de France (34 874 records)
  Mode direct : dsfr-data-source (paginate) → dsfr-data-list
  Source : Registre des maires (tabular-api)
  Chaque page est chargee depuis l'API, pas de chargement complet en memoire
-->

<div class="fr-container fr-my-4w">
  <h2>Maires de France — Pagination serveur</h2>
  <p class="fr-text--sm fr-text--light">
    Source : tabular-api.data.gouv.fr — Repertoire national des elus (maires)
    <br>34 874 enregistrements navigables page par page via l'API
  </p>

  <dsfr-data-source id="data"
    url="https://tabular-api.data.gouv.fr/api/resources/2876a346-d50c-4911-934e-19ee07b0e503/data/"
    paginate page-size="20">
  </dsfr-data-source>

  <dsfr-data-list source="data"
    colonnes="Nom de l'élu:Nom, Prénom de l'élu:Prenom, Libellé du département:Departement, Libellé de la commune:Commune"
    recherche="true"
    tri="Nom de l'élu:asc"
    pagination="20">
  </dsfr-data-list>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      Avec <code>paginate</code> et <code>page-size="20"</code>, <code>dsfr-data-source</code>
      injecte <code>?page=N&amp;page_size=20</code> dans l'URL. Pas besoin de <code>transform="data"</code> :
      en mode pagination, les donnees sont auto-extraites depuis <code>json.data</code>.
      Cliquer sur une page declenche un nouvel appel API.
    </p>
  </div>
</div>`,

  'server-paginate-display': `<!--
  Cartes avec pagination serveur — Maires de France
  Mode direct : dsfr-data-source (paginate) → dsfr-data-display (cartes)
  Source : Registre des maires (tabular-api)
  Naviguez dans les 34 874 maires avec des cartes DSFR, page par page
-->

<div class="fr-container fr-my-4w">
  <h2>Maires de France — Cartes paginee serveur</h2>
  <p class="fr-text--sm fr-text--light">
    Source : tabular-api.data.gouv.fr — Repertoire national des elus (maires)
    <br>Pagination cote serveur : chaque page = un appel API
  </p>

  <dsfr-data-source id="data"
    url="https://tabular-api.data.gouv.fr/api/resources/2876a346-d50c-4911-934e-19ee07b0e503/data/"
    paginate page-size="12">
  </dsfr-data-source>

  <dsfr-data-display source="data" cols="3" pagination="12">
    <template>
      <div class="fr-card fr-card--shadow">
        <div class="fr-card__body">
          <div class="fr-card__content">
            <h3 class="fr-card__title">{{Nom de l'élu}} {{Prénom de l'élu}}</h3>
            <p class="fr-card__desc">{{Libellé de la commune}}</p>
            <div class="fr-card__start">
              <p class="fr-badge fr-badge--sm fr-badge--green-emeraude">
                {{Libellé du département}}
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </dsfr-data-display>
</div>`,

  'paginate-kpi-global': `<!--
  Pagination serveur + KPI — Industrie du futur
  Double source : dsfr-data-source (server-side) pour navigation + dsfr-data-source (ODS) pour KPI
  Source : Industrie du futur (OpenDataSoft) — 101 records
  La datalist navigue page par page, les KPI portent sur le dataset complet
-->

<div class="fr-container fr-my-4w">
  <h2>Industrie du futur — Pagination + KPI</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.economie.gouv.fr — Industrie du futur
    <br>Double source : pagination serveur pour la navigation, agregation pour les KPI
  </p>

  <!-- Source 1 : pagination serveur pour la navigation -->
  <dsfr-data-source id="browse" api-type="opendatasoft"
    dataset-id="industrie-du-futur"
    base-url="https://data.economie.gouv.fr"
    server-side page-size="20">
  </dsfr-data-source>

  <!-- Source 2 : chargement complet pour les KPI globaux (101 records) -->
  <dsfr-data-source id="all" api-type="opendatasoft"
    dataset-id="industrie-du-futur"
    base-url="https://data.economie.gouv.fr">
  </dsfr-data-source>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
    <dsfr-data-kpi source="all"
      valeur="count"
      label="Projets"
      format="nombre">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="all"
      valeur="sum:nombre_beneficiaires"
      label="Total beneficiaires"
      format="nombre"
      couleur="bleu">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="all"
      valeur="sum:montant_investissement"
      label="Investissement total"
      format="euro"
      couleur="vert">
    </dsfr-data-kpi>
  </div>

  <dsfr-data-list source="browse"
    colonnes="nom_departement:Departement, nom_region:Region, nombre_beneficiaires:Beneficiaires, montant_investissement:Investissement"
    pagination="20">
  </dsfr-data-list>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Pattern double source :</strong> <code>dsfr-data-source server-side</code> charge une page a la fois
      pour la navigation (20 records). En parallele, une seconde <code>dsfr-data-source</code>
      charge le dataset complet (101 records) et les <code>dsfr-data-kpi</code> agregent pour les indicateurs globaux.
      Les deux sources fonctionnent independamment.
    </p>
  </div>
</div>`,

  // =====================================================================
  // MODE AVEC REQUETE — dsfr-data-source → dsfr-data-query → composant
  // Les donnees passent par dsfr-data-query qui les filtre, regroupe
  // et/ou agrege avant de les transmettre au composant de visualisation.
  // =====================================================================

  'query-bar': `<!--
  Barres — Beneficiaires agreges par region
  Mode requete : dsfr-data-source → dsfr-data-query → dsfr-data-chart (bar)
  Source : Industrie du futur (OpenDataSoft)
  dsfr-data-query regroupe par region et somme les beneficiaires
-->

<div class="fr-container fr-my-4w">
  <h2>Beneficiaires Industrie du futur par region</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.economie.gouv.fr — Industrie du futur
  </p>

  <dsfr-data-source id="data" api-type="opendatasoft"
    dataset-id="industrie-du-futur"
    base-url="https://data.economie.gouv.fr">
  </dsfr-data-source>

  <dsfr-data-query id="q-bar" source="data"
    group-by="nom_region"
    aggregate="nombre_beneficiaires:sum:beneficiaires"
    order-by="beneficiaires:desc"
    limit="10">
  </dsfr-data-query>

  <dsfr-data-chart id="chart" source="q-bar"
    type="bar"
    label-field="nom_region"
    value-field="beneficiaires"
    selected-palette="categorical"
    databox
    databox-title="Beneficiaires Industrie du futur par region"
    databox-source="data.economie.gouv.fr — Industrie du futur"
    databox-download>
  </dsfr-data-chart>
</div>`,

  'query-pie': `<!--
  Camembert — Investissement Industrie du futur par region
  Mode requete : dsfr-data-source → dsfr-data-query → dsfr-data-chart (pie)
  Source : Industrie du futur (OpenDataSoft) — 101 records
  dsfr-data-query regroupe par region et somme les investissements
  DataBox ajoute titre, source et telechargement CSV
-->

<div class="fr-container fr-my-4w">
  <dsfr-data-source id="src" api-type="opendatasoft"
    dataset-id="industrie-du-futur"
    base-url="https://data.economie.gouv.fr">
  </dsfr-data-source>

  <dsfr-data-query id="q-pie" source="src"
    group-by="nom_region"
    aggregate="montant_investissement:sum:investissement"
    order-by="investissement:desc"
    limit="10">
  </dsfr-data-query>

  <div style="max-width: 500px; margin: 0 auto;">
    <dsfr-data-chart id="chart" source="q-pie"
      type="pie"
      label-field="nom_region"
      value-field="investissement"
      unit-tooltip="EUR"
      selected-palette="categorical"
      databox
      databox-title="Investissement par region"
      databox-source="data.economie.gouv.fr — Industrie du futur"
      databox-download>
    </dsfr-data-chart>
  </div>
</div>`,

  'query-map': `<!--
  Carte — Taux TFB moyen par departement
  Mode requete : dsfr-data-source → dsfr-data-query → dsfr-data-chart (map)
  Source : Fiscalite locale des particuliers (OpenDataSoft)
  dsfr-data-query calcule la moyenne TFB par departement (code dep)
-->

<div class="fr-container fr-my-4w">
  <h2>Taux moyen de taxe fonciere par departement</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.economie.gouv.fr — Fiscalite locale des particuliers
  </p>

  <dsfr-data-source id="data" api-type="opendatasoft"
    dataset-id="fiscalite-locale-des-particuliers"
    base-url="https://data.economie.gouv.fr">
  </dsfr-data-source>

  <dsfr-data-query id="q-map" source="data"
    group-by="dep"
    aggregate="taux_global_tfb:avg:taux">
  </dsfr-data-query>

  <dsfr-data-chart source="q-map"
    type="map"
    code-field="dep"
    value-field="taux"
    selected-palette="sequentialAscending">
  </dsfr-data-chart>
</div>`,

  // =====================================================================
  // MODE AVEC NORMALISATION — dsfr-data-source → dsfr-data-normalize → dsfr-data-query → composant
  // Les donnees passent par dsfr-data-normalize pour etre nettoyees
  // (conversion numerique, renommage, trim) avant traitement par dsfr-data-query.
  // =====================================================================

  'normalize-bar': `<!--
  Barres — Logements vacants par departement (donnees LOVAC nettoyees)
  Pipeline : dsfr-data-source → dsfr-data-normalize → dsfr-data-query → dsfr-data-chart (bar)
  Source : LOVAC - Logements vacants (tabular-api)
  Probleme : les cles ont des espaces (" DEP ", " LIB_DEP ") et les
  nombres sont en string avec separateurs milliers (" 19 805   ").
  dsfr-data-normalize nettoie les cles (trim), convertit les nombres (numeric-auto)
  et renomme les colonnes cryptiques en noms lisibles.
-->

<div class="fr-container fr-my-4w">
  <h2>Top 15 departements par logements vacants (2025)</h2>
  <p class="fr-text--sm fr-text--light">
    Source : tabular-api.data.gouv.fr — LOVAC, logements vacants du parc prive
    <br>Pipeline : dsfr-data-source → <strong>dsfr-data-normalize</strong> → dsfr-data-query → dsfr-data-chart
  </p>

  <dsfr-data-source id="raw"
    url="https://tabular-api.data.gouv.fr/api/resources/42a34c0a-7c97-4463-b00e-5913ea5f7077/data/?page_size=101"
    transform="data">
  </dsfr-data-source>

  <!-- Nettoyage :
    - trim nettoie les cles (" DEP " → "DEP") ET les valeurs (" Ain " → "Ain")
    - numeric-auto convertit " 19 805   " → 19805 (detecte les nombres avec espaces)
    - rename donne des noms lisibles aux colonnes -->
  <dsfr-data-normalize id="clean" source="raw"
    trim
    numeric-auto
    rename="LIB_DEP:Departement | pp_vacant_25:Vacants 2025">
  </dsfr-data-normalize>

  <dsfr-data-query id="top" source="clean"
    order-by="Vacants 2025:desc"
    limit="15">
  </dsfr-data-query>

  <dsfr-data-chart source="top"
    type="bar"
    label-field="Departement"
    value-field="Vacants 2025"
    selected-palette="categorical"
    databox
    databox-title="Top 15 departements par logements vacants"
    databox-source="tabular-api.data.gouv.fr — LOVAC"
    databox-date="2025"
    databox-download>
  </dsfr-data-chart>
</div>`,

  'normalize-pie': `<!--
  Camembert — Part des logements vacants de longue duree
  Pipeline : dsfr-data-source → dsfr-data-normalize → dsfr-data-query → dsfr-data-chart (pie)
  Source : LOVAC - Logements vacants (tabular-api)
  Montre la proportion de logements vacants >2 ans parmi les top departements.
-->

<div class="fr-container fr-my-4w">
  <h2>Top 8 departements — Vacants longue duree (>2 ans)</h2>
  <p class="fr-text--sm fr-text--light">
    Source : tabular-api.data.gouv.fr — LOVAC, logements vacants du parc prive
    <br>Pipeline : dsfr-data-source → <strong>dsfr-data-normalize</strong> → dsfr-data-query → dsfr-data-chart
  </p>

  <dsfr-data-source id="raw"
    url="https://tabular-api.data.gouv.fr/api/resources/42a34c0a-7c97-4463-b00e-5913ea5f7077/data/?page_size=101"
    transform="data">
  </dsfr-data-source>

  <!-- Nettoyage : trim (cles + valeurs), conversion numerique explicite, renommage -->
  <dsfr-data-normalize id="clean" source="raw"
    trim
    numeric="pp_vacant_plus_2ans_25"
    rename="LIB_DEP:Departement | pp_vacant_plus_2ans_25:Vacants longue duree">
  </dsfr-data-normalize>

  <dsfr-data-query id="top" source="clean"
    order-by="Vacants longue duree:desc"
    limit="8">
  </dsfr-data-query>

  <div style="max-width: 500px; margin: 0 auto;">
    <dsfr-data-chart source="top"
      type="pie"
      label-field="Departement"
      value-field="Vacants longue duree"
      selected-palette="categorical"
      databox
      databox-title="Vacants longue duree (>2 ans)"
      databox-source="tabular-api.data.gouv.fr — LOVAC"
      databox-date="2025"
      databox-download>
    </dsfr-data-chart>
  </div>
</div>`,

  'normalize-datalist': `<!--
  Tableau — Donnees LOVAC nettoyees et lisibles
  Pipeline : dsfr-data-source → dsfr-data-normalize → dsfr-data-list
  Source : LOVAC - Logements vacants (tabular-api)
  Les donnees brutes ont des cles avec espaces (" DEP ", " LIB_DEP "),
  des nombres en string (" 19 805   ") et des noms de colonnes cryptiques.
  dsfr-data-normalize nettoie tout avant l'affichage en tableau.
-->

<div class="fr-container fr-my-4w">
  <h2>LOVAC — Logements vacants par departement</h2>
  <p class="fr-text--sm fr-text--light">
    Source : tabular-api.data.gouv.fr — LOVAC, logements vacants du parc prive
    <br>Pipeline : dsfr-data-source → <strong>dsfr-data-normalize</strong> → dsfr-data-list
  </p>

  <dsfr-data-source id="raw"
    url="https://tabular-api.data.gouv.fr/api/resources/42a34c0a-7c97-4463-b00e-5913ea5f7077/data/?page_size=101"
    transform="data">
  </dsfr-data-source>

  <!-- Nettoyage complet :
    - trim : nettoie les espaces dans les cles ET les valeurs
    - numeric-auto : detecte et convertit tous les champs numeriques
    - rename : noms lisibles pour le tableau -->
  <dsfr-data-normalize id="clean" source="raw"
    trim
    numeric-auto
    rename="DEP:Code | LIB_DEP:Departement | pp_vacant_25:Vacants 2025 | pp_vacant_plus_2ans_25:Vacants >2 ans | pp_total_24:Total logements 2024 | pp_vacant_24:Vacants 2024">
  </dsfr-data-normalize>

  <dsfr-data-list source="clean"
    colonnes="Code, Departement, Vacants 2025, Vacants >2 ans, Total logements 2024, Vacants 2024"
    recherche="true"
    tri="Vacants 2025:desc"
    pagination="15"
    export="csv">
  </dsfr-data-list>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      Les donnees LOVAC brutes ont des cles avec espaces (<code>" DEP "</code>),
      des nombres en texte avec separateurs milliers (<code>" 19 805   "</code>),
      et des noms de colonnes techniques. Avec <code>trim</code> + <code>numeric-auto</code>
      + <code>rename</code>, les donnees deviennent propres et lisibles.
    </p>
  </div>
</div>`,

  // =====================================================================
  // MODE FACETTES — dsfr-data-source → dsfr-data-normalize → dsfr-data-facets → composant
  // Les donnees passent par dsfr-data-facets qui affiche des filtres interactifs.
  // L'utilisateur selectionne des valeurs et les composants en aval
  // se mettent a jour automatiquement.
  // =====================================================================

  'facets-datalist': `<!--
  Tableau filtrable — Industrie du futur avec facettes
  Pipeline : dsfr-data-source → dsfr-data-normalize → dsfr-data-facets → dsfr-data-list
  Source : Industrie du futur (OpenDataSoft) — 101 records
  dsfr-data-facets affiche des filtres interactifs, dsfr-data-list le tableau filtre
-->

<div class="fr-container fr-my-4w">
  <h2>Industrie du futur — exploration par facettes</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.economie.gouv.fr — Industrie du futur
    <br>Pipeline : <strong>dsfr-data-source</strong> → dsfr-data-normalize → <strong>dsfr-data-facets</strong> → dsfr-data-list
  </p>

  <dsfr-data-source id="raw" api-type="opendatasoft"
    dataset-id="industrie-du-futur"
    base-url="https://data.economie.gouv.fr">
  </dsfr-data-source>

  <dsfr-data-normalize id="clean" source="raw"
    numeric="nombre_beneficiaires, montant_investissement"
    rename="nom_region:Region | nom_departement:Departement | mesure_light:Mesure"
    trim>
  </dsfr-data-normalize>

  <!-- Facettes : multiselect et select avec colonnage DSFR -->
  <dsfr-data-facets id="filtered" source="clean"
    fields="Region, Mesure"
    labels="Region:Region | Mesure:Type de mesure"
    display="Region:multiselect | Mesure:select"
    cols="6">
  </dsfr-data-facets>

  <dsfr-data-list source="filtered"
    colonnes="Departement, Region, nombre_beneficiaires:Beneficiaires, montant_investissement:Investissement"
    recherche="true"
    tri="Departement:asc"
    pagination="10"
    export="csv">
  </dsfr-data-list>
</div>`,

  'facets-bar': `<!--
  Barres — Beneficiaires Industrie du futur filtres par region
  Pipeline : dsfr-data-source → dsfr-data-normalize → dsfr-data-facets → dsfr-data-query → dsfr-data-chart (bar)
  Source : Industrie du futur (OpenDataSoft)
  dsfr-data-facets filtre par region, dsfr-data-query agrege ensuite les donnees filtrees
-->

<div class="fr-container fr-my-4w">
  <h2>Beneficiaires Industrie du futur</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.economie.gouv.fr — Industrie du futur
    <br>Pipeline : dsfr-data-source → dsfr-data-normalize → <strong>dsfr-data-facets</strong> → dsfr-data-query → dsfr-data-chart
  </p>

  <dsfr-data-source id="raw" api-type="opendatasoft"
    dataset-id="industrie-du-futur"
    base-url="https://data.economie.gouv.fr">
  </dsfr-data-source>

  <dsfr-data-normalize id="clean" source="raw"
    numeric="montant_investissement, montant_participation_etat, nombre_beneficiaires"
    rename="nom_region:Region | nom_departement:Departement"
    trim>
  </dsfr-data-normalize>

  <!-- Facettes : filtrer par region (multiselect) avant aggregation -->
  <dsfr-data-facets id="filtered" source="clean"
    fields="Region"
    display="Region:multiselect"
    sort="alpha">
  </dsfr-data-facets>

  <dsfr-data-query id="stats" source="filtered"
    group-by="Departement"
    aggregate="nombre_beneficiaires:sum:Beneficiaires"
    order-by="Beneficiaires:desc"
    limit="15">
  </dsfr-data-query>

  <dsfr-data-chart source="stats"
    type="bar"
    label-field="Departement"
    value-field="Beneficiaires"
    selected-palette="categorical"
    databox
    databox-title="Beneficiaires par departement"
    databox-source="data.economie.gouv.fr — Industrie du futur"
    databox-download>
  </dsfr-data-chart>
</div>`,

  // =====================================================================
  // MODE DISPLAY — dsfr-data-source → dsfr-data-display (template HTML dynamique)
  // dsfr-data-display repete un template HTML pour chaque element de donnees,
  // ideal pour creer des cartes DSFR, tuiles ou tout motif repetitif.
  // =====================================================================

  'direct-display': `<!--
  Cartes DSFR — Beneficiaires Industrie du futur (pagination serveur)
  Pipeline : dsfr-data-source (server-side) → dsfr-data-display
  Source : OpenDataSoft — Industrie du futur
  Pagination serveur : chaque page = un appel API
-->

<div class="fr-container fr-my-4w">
  <h2>Beneficiaires Industrie du futur</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.economie.gouv.fr — Industrie du futur
    <br>Pipeline : <strong>dsfr-data-source server-side</strong> → dsfr-data-display
  </p>

  <dsfr-data-source id="q" api-type="opendatasoft"
    dataset-id="industrie-du-futur"
    base-url="https://data.economie.gouv.fr"
    server-side page-size="6">
  </dsfr-data-source>

  <dsfr-data-display source="q" cols="3" pagination="6">
    <template>
      <div class="fr-card">
        <div class="fr-card__body">
          <div class="fr-card__content">
            <h3 class="fr-card__title">{{nom_departement}}</h3>
            <p class="fr-card__desc">
              Region : {{nom_region}}<br>
              Beneficiaires : {{nombre_beneficiaires}}
            </p>
          </div>
          <div class="fr-card__footer">
            <p class="fr-badge fr-badge--sm fr-badge--blue-ecume">
              Investissement : {{montant_investissement}} EUR
            </p>
          </div>
        </div>
      </div>
    </template>
  </dsfr-data-display>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Pagination serveur</strong> : <code>dsfr-data-source server-side</code> ne charge qu'une page a la fois.
      Chaque clic sur la pagination declenche un nouvel appel API.
      Le template <code>&lt;template&gt;</code> est repete pour chaque element de la page.
    </p>
  </div>
</div>`,

  'query-display': `<!--
  Cartes DSFR — Communes de l'Ain (pagination serveur)
  Pipeline : dsfr-data-source (server-side, Tabular) → dsfr-data-display
  Source : Tabular API — Code officiel geographique (communes)
  Filtre server-side par departement, pagination serveur
-->

<div class="fr-container fr-my-4w">
  <h2>Communes — Departement de l'Ain</h2>
  <p class="fr-text--sm fr-text--light">
    Source : tabular-api.data.gouv.fr — Code officiel geographique (communes)
    <br>Pipeline : <strong>dsfr-data-source server-side</strong> (Tabular, where) → dsfr-data-display
  </p>

  <dsfr-data-source id="q" api-type="tabular"
    resource="91a95bee-c7c8-45f9-a8aa-f14cc4697545"
    where="DEP:eq:01"
    server-side page-size="8">
  </dsfr-data-source>

  <dsfr-data-display source="q" cols="4" pagination="8">
    <template>
      <div class="fr-card fr-card--shadow">
        <div class="fr-card__body">
          <div class="fr-card__content">
            <h3 class="fr-card__title">{{LIBELLE}}</h3>
            <p class="fr-card__desc">
              Code commune : {{COM}}
            </p>
            <div class="fr-card__start">
              <p class="fr-badge fr-badge--sm fr-badge--green-emeraude">
                Dept. {{DEP}} — Region {{REG}}
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </dsfr-data-display>
</div>`,

  'normalize-display': `<!--
  Tuiles DSFR — LOVAC logements vacants (donnees nettoyees)
  Pipeline : dsfr-data-source → dsfr-data-normalize → dsfr-data-query → dsfr-data-display (tuiles)
  Source : LOVAC - Logements vacants (tabular-api)
  Les donnees brutes sont nettoyees puis affichees sous forme de tuiles DSFR
-->

<div class="fr-container fr-my-4w">
  <h2>Top 9 departements — Logements vacants (2025)</h2>
  <p class="fr-text--sm fr-text--light">
    Source : tabular-api.data.gouv.fr — LOVAC, logements vacants du parc prive
    <br>Pipeline : dsfr-data-source → <strong>dsfr-data-normalize</strong> → dsfr-data-query → dsfr-data-display
  </p>

  <dsfr-data-source id="raw"
    url="https://tabular-api.data.gouv.fr/api/resources/42a34c0a-7c97-4463-b00e-5913ea5f7077/data/?page_size=101"
    transform="data">
  </dsfr-data-source>

  <dsfr-data-normalize id="clean" source="raw"
    trim
    numeric-auto
    rename="LIB_DEP:Departement | pp_vacant_25:Vacants | pp_total_24:Total logements | DEP:Code">
  </dsfr-data-normalize>

  <dsfr-data-query id="top" source="clean"
    order-by="Vacants:desc"
    limit="9">
  </dsfr-data-query>

  <dsfr-data-display source="top" cols="3">
    <template>
      <div class="fr-tile">
        <div class="fr-tile__body">
          <div class="fr-tile__content">
            <h3 class="fr-tile__title">{{Departement}}</h3>
            <p class="fr-tile__detail">Dept. {{Code}}</p>
            <p class="fr-tile__desc">
              {{Vacants}} logements vacants
              sur {{Total logements}} au total
            </p>
          </div>
        </div>
      </div>
    </template>
  </dsfr-data-display>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      Les donnees LOVAC brutes ont des cles avec espaces et des nombres en texte.
      <code>dsfr-data-normalize</code> nettoie tout avant l'affichage en tuiles DSFR
      via <code>dsfr-data-display</code>.
    </p>
  </div>
</div>`,

  // =====================================================================
  // MODE RECHERCHE — dsfr-data-source → dsfr-data-search → composant
  // dsfr-data-search affiche un champ de recherche DSFR et filtre les donnees
  // en amont. Se combine naturellement avec dsfr-data-facets et dsfr-data-display.
  // =====================================================================

  'search-datalist': `<!--
  Tableau filtrable — Rappels de produits avec recherche serveur
  Pipeline : dsfr-data-source (server-side) → dsfr-data-search (server-search) → dsfr-data-list (server-tri)
  Source : OpenDataSoft — RappelConso
  Recherche full-text deleguee au serveur, tri et pagination serveur
-->

<div class="fr-container fr-my-4w">
  <h2>Recherche serveur — Rappels de produits</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.economie.gouv.fr — RappelConso
    <br>Pipeline : <strong>dsfr-data-source server-side</strong> → dsfr-data-search server-search → dsfr-data-list server-tri
  </p>

  <dsfr-data-source id="q" api-type="opendatasoft"
    dataset-id="rappelconso-v2-gtin-trie"
    base-url="https://data.economie.gouv.fr"
    server-side page-size="20"
    order-by="date_publication:desc">
  </dsfr-data-source>

  <dsfr-data-search id="s" source="q"
    server-search
    placeholder="Rechercher un produit rappele..."
    min-length="2"
    count>
  </dsfr-data-search>

  <dsfr-data-list source="q"
    colonnes="modeles_ou_references:Produit, categorie_produit:Categorie, marque_produit:Marque, date_publication:Date"
    server-tri
    pagination="20">
  </dsfr-data-list>
</div>`,

  'search-display': `<!--
  Cartes avec recherche serveur — Industrie du futur
  Pipeline : dsfr-data-source (server-side) → dsfr-data-search (server-search) → dsfr-data-display
  Source : OpenDataSoft — Industrie du futur
  Recherche full-text deleguee au serveur, pagination serveur
-->

<div class="fr-container fr-my-4w">
  <h2>Recherche serveur — Industrie du futur</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.economie.gouv.fr — Industrie du futur
    <br>Pipeline : <strong>dsfr-data-source server-side</strong> → dsfr-data-search server-search → dsfr-data-display
  </p>

  <dsfr-data-source id="q" api-type="opendatasoft"
    dataset-id="industrie-du-futur"
    base-url="https://data.economie.gouv.fr"
    server-side page-size="9">
  </dsfr-data-source>

  <dsfr-data-search id="s" source="q"
    server-search
    placeholder="Entreprise, region ou departement..."
    count>
  </dsfr-data-search>

  <dsfr-data-display source="q" cols="3" pagination="9">
    <template>
      <div class="fr-card">
        <div class="fr-card__body">
          <div class="fr-card__content">
            <h3 class="fr-card__title">{{nom_entreprise}}</h3>
            <p class="fr-card__desc">
              {{nom_departement}} — {{nom_region}}<br>
              Beneficiaires : {{nombre_beneficiaires}}
            </p>
          </div>
          <div class="fr-card__footer">
            <p class="fr-badge fr-badge--sm fr-badge--blue-ecume">
              {{montant_investissement}} EUR
            </p>
          </div>
        </div>
      </div>
    </template>
  </dsfr-data-display>
</div>`,

  'search-kpi-chart': `<!--
  Recherche + KPI + graphique — Industrie du futur
  Pipeline : dsfr-data-source → dsfr-data-normalize → dsfr-data-search → dsfr-data-kpi + dsfr-data-query → dsfr-data-chart
  Source : Industrie du futur (OpenDataSoft)
  Les KPI et le graphique se recalculent en temps reel selon la recherche
-->

<div class="fr-container fr-my-4w">
  <h2>Recherche dynamique — Industrie du futur</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.economie.gouv.fr — Industrie du futur
    <br>Pipeline : dsfr-data-source → dsfr-data-normalize → <strong>dsfr-data-search</strong> → KPI + graphique
  </p>

  <dsfr-data-source id="raw" api-type="opendatasoft"
    dataset-id="industrie-du-futur"
    base-url="https://data.economie.gouv.fr">
  </dsfr-data-source>

  <dsfr-data-normalize id="clean" source="raw"
    numeric="montant_investissement, montant_participation_etat, nombre_beneficiaires"
    rename="nom_region:Region | nom_departement:Departement | nom_entreprise:Entreprise"
    trim>
  </dsfr-data-normalize>

  <dsfr-data-search id="searched" source="clean"
    fields="Entreprise, Region, Departement"
    placeholder="Entreprise, region, departement..."
    operator="words"
    count>
  </dsfr-data-search>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin: 1.5rem 0;">
    <dsfr-data-kpi source="searched"
      valeur="count"
      label="Projets"
      couleur="bleu">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="searched"
      valeur="sum:montant_investissement"
      label="Investissement total"
      format="euro">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="searched"
      valeur="sum:nombre_beneficiaires"
      label="Beneficiaires"
      format="nombre">
    </dsfr-data-kpi>
  </div>

  <dsfr-data-query id="stats" source="searched"
    group-by="Region"
    aggregate="nombre_beneficiaires:sum:Beneficiaires"
    order-by="Beneficiaires:desc"
    limit="10">
  </dsfr-data-query>

  <dsfr-data-chart source="stats"
    type="bar"
    label-field="Region"
    value-field="Beneficiaires"
    selected-palette="categorical">
  </dsfr-data-chart>
</div>`,

  'facets-map': `<!--
  Carte + KPI — Fiscalite locale filtree par region et departement
  Pipeline : dsfr-data-source → dsfr-data-normalize → dsfr-data-facets → dsfr-data-query → dsfr-data-chart (map) + dsfr-data-kpi
  Source : Fiscalite locale des particuliers (OpenDataSoft)
  dsfr-data-facets filtre par region, la carte et les KPI refletent les donnees filtrees
-->

<div class="fr-container fr-my-4w">
  <h2>Fiscalite locale — exploration par region</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.economie.gouv.fr — Fiscalite locale des particuliers
    <br>Pipeline : dsfr-data-source → dsfr-data-normalize → <strong>dsfr-data-facets</strong> → dsfr-data-query → carte + KPI
  </p>

  <dsfr-data-source id="raw" api-type="opendatasoft"
    dataset-id="fiscalite-locale-des-particuliers"
    base-url="https://data.economie.gouv.fr">
  </dsfr-data-source>

  <dsfr-data-normalize id="clean" source="raw"
    numeric="taux_global_tfb, taux_global_th, mpoid"
    rename="libreg:Region | libdep:Departement | libcom:Commune"
    trim>
  </dsfr-data-normalize>

  <!-- Facettes : filtrer par region (multiselect) -->
  <dsfr-data-facets id="filtered" source="clean"
    fields="Region"
    display="Region:multiselect"
    sort="alpha">
  </dsfr-data-facets>

  <!-- KPI sur les donnees filtrees -->
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
    <dsfr-data-kpi source="filtered"
      valeur="count"
      label="Communes"
      format="nombre">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="filtered"
      valeur="avg:taux_global_tfb"
      label="Taux TFB moyen"
      format="pourcentage">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="filtered"
      valeur="avg:taux_global_th"
      label="Taux TH moyen"
      format="pourcentage">
    </dsfr-data-kpi>
  </div>

  <!-- Carte sur les donnees filtrees et agregees -->
  <dsfr-data-query id="stats" source="filtered"
    group-by="dep"
    aggregate="taux_global_tfb:avg:taux">
  </dsfr-data-query>

  <dsfr-data-chart source="stats"
    type="map"
    code-field="dep"
    value-field="taux"
    selected-palette="sequentialAscending">
  </dsfr-data-chart>
</div>`,

  // =====================================================================
  // SERVER-SIDE — dsfr-data-source server-side → composant
  // dsfr-data-source ne charge qu'une page a la fois et ecoute les commandes
  // des composants en aval (pagination, recherche, tri, facettes).
  // =====================================================================

  'server-side-ods': `<!--
  Server-side ODS — Recherche + pagination serveur
  Mode: dsfr-data-source (server-side) -> dsfr-data-search (server-search) -> dsfr-data-display
  Source: OpenDataSoft - RappelConso (rappels de produits)
-->

<div class="fr-container fr-my-4w">
  <h2>Recherche serveur — Rappels de produits</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.economie.gouv.fr — Mode server-side avec recherche full-text ODS
  </p>

  <dsfr-data-source id="q" api-type="opendatasoft"
    dataset-id="rappelconso-v2-gtin-trie"
    base-url="https://data.economie.gouv.fr"
    server-side page-size="10"
    order-by="date_publication:desc">
  </dsfr-data-source>

  <dsfr-data-search id="s" source="q"
    server-search
    placeholder="Rechercher un produit..."
    url-search-param="q" url-sync
    count>
  </dsfr-data-search>

  <dsfr-data-display source="q" cols="1" pagination="10"
    url-sync url-page-param="page">
    <template>
      <div class="fr-card fr-card--horizontal fr-card--sm fr-mb-2w">
        <div class="fr-card__body">
          <div class="fr-card__content">
            <h3 class="fr-card__title">{{modeles_ou_references}}</h3>
            <p class="fr-card__desc">
              <strong>{{categorie_produit}}</strong> — {{marque_produit}}<br>
              Publie le {{date_publication}}
            </p>
          </div>
        </div>
      </div>
    </template>
  </dsfr-data-display>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Mode server-side</strong> : dsfr-data-source server-side ne charge qu'une page a la fois.
      La recherche est deleguee au serveur via <code>dsfr-data-search server-search</code>.
      La pagination est geree par <code>dsfr-data-display</code> via les metadonnees server.
    </p>
  </div>
</div>`,

  'server-side-tabular-tri': `<!--
  Server-side Tabular — Tri serveur
  Mode: dsfr-data-source (server-side tabular) -> dsfr-data-list (server-tri)
  Source: Tabular API data.gouv.fr - Code officiel geographique (communes)
-->

<div class="fr-container fr-my-4w">
  <h2>Tri serveur — Communes</h2>
  <p class="fr-text--sm fr-text--light">
    Source : tabular-api.data.gouv.fr — Mode server-side avec tri par colonne
  </p>

  <dsfr-data-source id="q" api-type="tabular"
    resource="91a95bee-c7c8-45f9-a8aa-f14cc4697545"
    server-side page-size="20">
  </dsfr-data-source>

  <dsfr-data-list source="q"
    colonnes="COM:Code commune, LIBELLE:Commune, DEP:Departement, REG:Region"
    server-tri
    pagination="20"
    url-sync>
  </dsfr-data-list>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Mode server-side + tri</strong> : dsfr-data-source server-side charge une page,
      <code>dsfr-data-list server-tri</code> delegue le tri au serveur.
      Chaque clic sur un en-tete de colonne declenche un re-fetch avec le bon \`orderBy\`.
    </p>
  </div>
</div>`,

  'server-facets-display': `<!--
  Server-facets ODS — Recherche + facettes + normalize + cartes
  Mode: dsfr-data-source (server-side ODS) + dsfr-data-search + dsfr-data-normalize + dsfr-data-facets (server-facets) -> dsfr-data-display
  Source: OpenDataSoft - Industrie du futur (data.economie.gouv.fr)
  dsfr-data-normalize arrondit les montants pour un affichage propre
-->

<div class="fr-container fr-my-4w">
  <h2>Facettes serveur ODS — Industrie du futur</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.economie.gouv.fr — Facettes dynamiques + recherche full-text, pagination serveur
    <br>Pipeline : dsfr-data-source server-side → dsfr-data-search → <strong>dsfr-data-normalize</strong> (round) → dsfr-data-facets server-facets → dsfr-data-display
  </p>

  <dsfr-data-source id="q" server-side page-size="12"
    api-type="opendatasoft"
    dataset-id="industrie-du-futur"
    base-url="https://data.economie.gouv.fr">
  </dsfr-data-source>

  <dsfr-data-search source="q" server-search
    placeholder="Rechercher une entreprise..."
    count>
  </dsfr-data-search>

  <!-- Arrondir les montants (supprimer les decimales parasites) -->
  <dsfr-data-normalize id="clean" source="q"
    round="montant_investissement, montant_participation_etat">
  </dsfr-data-normalize>

  <dsfr-data-facets id="filtered" source="clean"
    server-facets
    fields="nom_region"
    labels="nom_region:Region"
    display="nom_region:multiselect"
    cols="6">
  </dsfr-data-facets>

  <dsfr-data-display source="filtered" cols="3" pagination="12">
    <template>
      <div class="fr-card fr-card--shadow">
        <div class="fr-card__body">
          <div class="fr-card__content">
            <h3 class="fr-card__title">{{nombre_beneficiaires}} beneficiaires</h3>
            <p class="fr-card__desc">
              Investissement de {{montant_investissement:number}} \u20ac
              dont {{montant_participation_etat:number}} \u20ac finances par l'Etat
            </p>
            <div class="fr-card__start">
              <p class="fr-badge fr-badge--sm fr-badge--green-emeraude">{{nom_region}}</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </dsfr-data-display>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Facettes serveur + normalize + format</strong> : <code>dsfr-data-normalize round</code> arrondit les montants
      (supprime les decimales parasites type <code>32073247.27</code> → <code>32073247</code>).
      <code>{{champ:number}}</code> dans le template dsfr-data-display ajoute les separateurs de milliers
      (<code>32073247</code> → <code>32 073 247</code>).
      <code>dsfr-data-facets server-facets</code> fetche les valeurs de facettes depuis l'API ODS.
    </p>
  </div>
</div>`,

  // =====================================================================
  // CARTE DU MONDE — dsfr-data-source → dsfr-data-world-map
  // =====================================================================

  'direct-worldmap': `<!--
  Carte du monde — PIB par pays (donnees embarquees)
  Mode direct : dsfr-data-source (donnees inline) → dsfr-data-world-map
  Cliquer sur un pays pour zoomer sur son continent
-->

<div class="fr-container fr-my-4w">
  <h2>PIB par pays (milliards USD)</h2>
  <p class="fr-text--sm fr-text--light">
    Donnees embarquees — Source : Banque mondiale (extrait)
  </p>

  <dsfr-data-source id="data"
    data='[
      {"code":"US","pib":25462},{"code":"CN","pib":17963},{"code":"JP","pib":4231},
      {"code":"DE","pib":4072},{"code":"GB","pib":3070},{"code":"IN","pib":3385},
      {"code":"FR","pib":2783},{"code":"IT","pib":2010},{"code":"CA","pib":2139},
      {"code":"KR","pib":1665},{"code":"BR","pib":1920},{"code":"AU","pib":1675},
      {"code":"RU","pib":2240},{"code":"MX","pib":1293},{"code":"ES","pib":1397},
      {"code":"ID","pib":1319},{"code":"SA","pib":1108},{"code":"NL","pib":991},
      {"code":"TR","pib":906},{"code":"CH","pib":818},{"code":"PL","pib":688},
      {"code":"SE","pib":586},{"code":"BE","pib":578},{"code":"NO","pib":579},
      {"code":"AR","pib":632},{"code":"NG","pib":477},{"code":"AT","pib":471},
      {"code":"ZA","pib":405},{"code":"TH","pib":495},{"code":"EG","pib":476},
      {"code":"DK","pib":395},{"code":"PH","pib":404},{"code":"PK","pib":376},
      {"code":"CL","pib":301},{"code":"CO","pib":343},{"code":"FI","pib":281},
      {"code":"CZ","pib":290},{"code":"PT","pib":253},{"code":"NZ","pib":247},
      {"code":"RO","pib":301},{"code":"PE","pib":242},{"code":"GR","pib":219},
      {"code":"IQ","pib":264},{"code":"KZ","pib":220},{"code":"DZ","pib":187},
      {"code":"HU","pib":188},{"code":"MA","pib":134},{"code":"KE","pib":113},
      {"code":"ET","pib":126},{"code":"GH","pib":77}
    ]'>
  </dsfr-data-source>

  <dsfr-data-world-map source="data"
    code-field="code"
    value-field="pib"
    code-format="iso-a2"
    name="PIB"
    unit-tooltip="Mds USD"
    selected-palette="sequentialAscending">
  </dsfr-data-world-map>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>dsfr-data-world-map</strong> : carte du monde choropleth avec zoom interactif par continent.
      Cliquer sur un pays pour zoomer sur son continent, cliquer a nouveau pour revenir a la vue monde.
    </p>
  </div>
</div>`,

  // =====================================================================
  // JOINTURE MULTI-SOURCES — dsfr-data-source (A) + dsfr-data-source (B) → dsfr-data-join → composant
  // Croise deux jeux de donnees sur une cle pivot pour enrichir les donnees.
  // =====================================================================

  'join-basic': `<!--
  Jointure — Population vs Budget (left join, 2 series)
  Mode jointure : dsfr-data-source x2 → dsfr-data-join → dsfr-data-chart
  Le graphique affiche 2 series provenant chacune d'une source differente
-->

<div class="fr-container fr-my-4w">
  <h2>Population vs Budget par region</h2>
  <p class="fr-text--sm fr-text--light">
    Deux sources independantes croisees par <code>dsfr-data-join</code> sur le code region.
    Le graphique affiche deux series : <strong>population</strong> (source A) et <strong>budget</strong> (source B).
  </p>

  <!-- Source A : population (en milliers) -->
  <dsfr-data-source id="pop"
    data='[
      {"code":"75","region":"Ile-de-France","population":12263},
      {"code":"13","region":"PACA","population":5099},
      {"code":"35","region":"Bretagne","population":3395},
      {"code":"14","region":"Normandie","population":3304}
    ]'>
  </dsfr-data-source>

  <!-- Source B : budget (en M EUR) — meme echelle pour lisibilite -->
  <dsfr-data-source id="budget"
    data='[
      {"code":"75","budget":5200},
      {"code":"13","budget":2100},
      {"code":"35","budget":1500},
      {"code":"14","budget":1400}
    ]'>
  </dsfr-data-source>

  <!-- Jointure sur le code region -->
  <dsfr-data-join id="enriched"
    left="pop" right="budget"
    on="code" type="left">
  </dsfr-data-join>

  <!-- Graphique 2 series : population (source A) + budget (source B) -->
  <dsfr-data-chart source="enriched"
    type="bar"
    label-field="region"
    value-field="population"
    value-fields="budget"
    title="Population (milliers) vs Budget (M EUR) par region">
  </dsfr-data-chart>

  <dsfr-data-a11y for="enriched-chart" source="enriched" table></dsfr-data-a11y>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>L'interet de la jointure</strong> : les donnees de population et de budget viennent
      de deux sources separees. <code>dsfr-data-join on="code"</code> les fusionne en un seul
      dataset, ce qui permet d'afficher les deux series cote a cote avec
      <code>value-field="population" value-fields="budget"</code>.
    </p>
  </div>
</div>`,

  'join-query': `<!--
  Jointure + query — Recettes vs Depenses (inner join + tri, 2 series)
  Mode jointure : dsfr-data-source x2 → dsfr-data-join → dsfr-data-query → dsfr-data-chart
  Le graphique compare deux series issues de sources differentes
-->

<div class="fr-container fr-my-4w">
  <h2>Recettes vs Depenses par region</h2>
  <p class="fr-text--sm fr-text--light">
    Inner join + tri : les recettes (source A) et les depenses (source B) sont croisees puis triees.
    La Normandie n'a pas de donnees de depenses → elle est exclue par l'inner join.
  </p>

  <!-- Source A : recettes par region (5 regions) -->
  <dsfr-data-source id="recettes"
    data='[
      {"code":"75","region":"Ile-de-France","recettes":8500},
      {"code":"13","region":"PACA","recettes":3200},
      {"code":"35","region":"Bretagne","recettes":2100},
      {"code":"14","region":"Normandie","recettes":1800},
      {"code":"44","region":"Pays de la Loire","recettes":2800}
    ]'>
  </dsfr-data-source>

  <!-- Source B : depenses par region (4 regions, pas de Normandie) -->
  <dsfr-data-source id="depenses"
    data='[
      {"code":"75","depenses":7200},
      {"code":"13","depenses":3500},
      {"code":"35","depenses":1900},
      {"code":"44","depenses":2600}
    ]'>
  </dsfr-data-source>

  <!-- Inner join : seules les 4 regions communes -->
  <dsfr-data-join id="merged"
    left="recettes" right="depenses"
    on="code" type="inner">
  </dsfr-data-join>

  <!-- Tri par recettes decroissantes -->
  <dsfr-data-query id="sorted"
    source="merged"
    order-by="recettes:desc">
  </dsfr-data-query>

  <!-- 2 series : recettes (source A) vs depenses (source B) -->
  <dsfr-data-chart source="sorted"
    type="bar"
    label-field="region"
    value-field="recettes"
    value-fields="depenses"
    title="Recettes vs Depenses (M EUR)">
  </dsfr-data-chart>

  <dsfr-data-a11y for="sorted-chart" source="sorted" table></dsfr-data-a11y>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Pipeline complet :</strong> deux sources → <code>dsfr-data-join type="inner"</code>
      (exclut la Normandie absente de la source depenses) →
      <code>dsfr-data-query order-by="recettes:desc"</code> → graphique 2 series.
      Sans la jointure, il serait impossible de comparer recettes et depenses sur un meme graphique.
    </p>
  </div>
</div>`,

  // =====================================================================
  // CARTE INTERACTIVE — dsfr-data-source → dsfr-data-map + dsfr-data-map-layer
  // Cartes Leaflet multi-couches avec tuiles IGN souveraines.
  // =====================================================================

  'map-markers-cluster': `<!--
  Carte — Centres de controle technique avec clustering
  Mode carte : dsfr-data-source (ODS) → dsfr-data-map → dsfr-data-map-layer (marker + cluster)
  Source : Prix du controle technique (data.economie.gouv.fr)
  5000 centres VP essence avec clustering et panneau lateral au clic
-->

<div class="fr-container fr-my-4w">
  <h2>Centres de controle technique en France</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.economie.gouv.fr — Prix du controle technique (VP essence)
  </p>

  <dsfr-data-source id="data" api-type="opendatasoft"
    base-url="https://data.economie.gouv.fr"
    dataset-id="prix-controle-technique"
    where="cat_vehicule_id=1 AND cat_energie_id=1"
    select="cct_denomination,cct_adresse,cct_commune,cct_code_postal,nom_departement,latitude,longitude,prix_visite,prix_contre_visite_mini,prix_contre_visite_maxi"
    order-by="prix_visite"
    limit="5000">
  </dsfr-data-source>

  <dsfr-data-map center="46.6,2.3" zoom="6" tiles="ign-plan" height="600px"
    name="5000 centres de controle technique les moins chers">
    <dsfr-data-map-layer source="data" type="marker"
      lat-field="latitude" lon-field="longitude"
      tooltip-field="cct_denomination"
      cluster cluster-radius="60">
    </dsfr-data-map-layer>

    <dsfr-data-map-popup mode="panel-right" title-field="cct_denomination" width="380px">
      <template>
        <p>{{cct_adresse}}</p>
        <p>{{cct_code_postal}} {{cct_commune}} ({{nom_departement}})</p>
        <hr>
        <table class="fr-table fr-table--sm">
          <tr><th>Visite</th><td><strong>{{prix_visite}} EUR</strong></td></tr>
          <tr><th>Contre-visite min</th><td>{{prix_contre_visite_mini}} EUR</td></tr>
          <tr><th>Contre-visite max</th><td>{{prix_contre_visite_maxi}} EUR</td></tr>
        </table>
      </template>
    </dsfr-data-map-popup>
  </dsfr-data-map>

  <dsfr-data-a11y for="data" source="data" table download
    label-field="cct_denomination" value-field="cct_commune,prix_visite"
    description="Carte des 5000 centres de controle technique les moins chers en France.">
  </dsfr-data-a11y>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Carte interactive</strong> avec clustering (5000 POI), panneau lateral au clic
      (<code>dsfr-data-map-popup mode="panel-right"</code>), et companion d'accessibilite
      (<code>dsfr-data-a11y</code> avec tableau + CSV).
    </p>
  </div>
</div>`,

  'map-circles-proportional': `<!--
  Carte — Cercles proportionnels (nombre de centres CT par ville)
  Mode carte : dsfr-data-source (inline) → dsfr-data-map → dsfr-data-map-layer (circle)
  Cercles avec auto-scaling : radius-field + radius-min/radius-max
-->

<div class="fr-container fr-my-4w">
  <h2>Centres de controle technique par grande ville</h2>
  <p class="fr-text--sm fr-text--light">
    Donnees embarquees — Nombre approximatif de centres et prix moyen
  </p>

  <dsfr-data-source id="data" data='[
    {"nom":"Paris","lat":48.8566,"lon":2.3522,"nb":142,"prix":95},
    {"nom":"Marseille","lat":43.2965,"lon":5.3698,"nb":87,"prix":78},
    {"nom":"Lyon","lat":45.7578,"lon":4.8320,"nb":95,"prix":82},
    {"nom":"Toulouse","lat":43.6047,"lon":1.4442,"nb":63,"prix":71},
    {"nom":"Nice","lat":43.7102,"lon":7.2620,"nb":48,"prix":89},
    {"nom":"Nantes","lat":47.2184,"lon":-1.5536,"nb":52,"prix":68},
    {"nom":"Strasbourg","lat":48.5734,"lon":7.7521,"nb":41,"prix":74},
    {"nom":"Bordeaux","lat":44.8378,"lon":-0.5792,"nb":58,"prix":76},
    {"nom":"Lille","lat":50.6292,"lon":3.0573,"nb":71,"prix":72},
    {"nom":"Rennes","lat":48.1173,"lon":-1.6778,"nb":35,"prix":65},
    {"nom":"Reims","lat":49.2583,"lon":4.0317,"nb":22,"prix":69},
    {"nom":"Toulon","lat":43.1242,"lon":5.9280,"nb":31,"prix":85},
    {"nom":"Montpellier","lat":43.6108,"lon":3.8767,"nb":44,"prix":77},
    {"nom":"Grenoble","lat":45.1885,"lon":5.7245,"nb":38,"prix":79},
    {"nom":"Rouen","lat":49.4432,"lon":1.0999,"nb":29,"prix":73}
  ]'></dsfr-data-source>

  <dsfr-data-map center="46.6,2.3" zoom="6" tiles="ign-ortho" height="550px"
    name="Nombre de centres CT par grande ville">
    <dsfr-data-map-layer source="data" type="circle"
      lat-field="lat" lon-field="lon"
      radius-field="nb" radius-min="6" radius-max="35"
      color="#000091" fill-opacity="0.5"
      tooltip-field="nom">
    </dsfr-data-map-layer>

    <dsfr-data-map-popup mode="modal" title-field="nom">
      <template>
        <div class="fr-grid-row fr-grid-row--gutters">
          <div class="fr-col-6">
            <p class="fr-text--bold fr-text--lg" style="color:var(--text-action-high-blue-france)">{{nb}}</p>
            <p class="fr-text--sm">centres de CT</p>
          </div>
          <div class="fr-col-6">
            <p class="fr-text--bold fr-text--lg" style="color:var(--text-action-high-blue-france)">{{prix}} EUR</p>
            <p class="fr-text--sm">prix moyen visite</p>
          </div>
        </div>
      </template>
    </dsfr-data-map-popup>
  </dsfr-data-map>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Cercles proportionnels</strong> avec auto-scaling (<code>radius-min="6" radius-max="35"</code>).
      Les 142 centres de Paris donnent le plus grand cercle, les 22 de Reims le plus petit.
      Clic → modale DSFR (<code>dsfr-data-map-popup mode="modal"</code>).
    </p>
  </div>
</div>`,

  'map-multi-layer': `<!--
  Carte — Multi-couches avec heatmap + marqueurs
  Mode carte : 2 sources ODS → dsfr-data-map → 2 layers (heatmap + markers)
  Densite en fond + POI detailles par-dessus
-->

<div class="fr-container fr-my-4w">
  <h2>Controles techniques en Ile-de-France</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.economie.gouv.fr — Heatmap de densite + marqueurs detailles
  </p>

  <!-- Source large pour la heatmap (1000 points) -->
  <dsfr-data-source id="heat-src" api-type="opendatasoft"
    base-url="https://data.economie.gouv.fr"
    dataset-id="prix-controle-technique"
    where="cat_vehicule_id=1 AND cat_energie_id=1 AND code_region=11"
    select="latitude,longitude"
    limit="1000">
  </dsfr-data-source>

  <!-- Source detaillee pour les marqueurs (200 points, tries par prix) -->
  <dsfr-data-source id="poi-src" api-type="opendatasoft"
    base-url="https://data.economie.gouv.fr"
    dataset-id="prix-controle-technique"
    where="cat_vehicule_id=1 AND cat_energie_id=1 AND code_region=11"
    select="cct_denomination,cct_commune,latitude,longitude,prix_visite"
    order-by="prix_visite"
    limit="200">
  </dsfr-data-source>

  <dsfr-data-map center="48.86,2.35" zoom="10" tiles="ign-plan" height="600px"
    name="Centres de controle technique en Ile-de-France">

    <!-- Couche heatmap en fond -->
    <dsfr-data-map-layer source="heat-src" type="heatmap"
      lat-field="latitude" lon-field="longitude"
      heat-radius="20" heat-blur="15">
    </dsfr-data-map-layer>

    <!-- Couche marqueurs par-dessus -->
    <dsfr-data-map-layer id="poi-layer" source="poi-src" type="marker"
      lat-field="latitude" lon-field="longitude"
      tooltip-field="cct_denomination"
      cluster cluster-radius="40">
    </dsfr-data-map-layer>

    <dsfr-data-map-popup mode="panel-left" title-field="cct_denomination" for="poi-layer" width="320px">
      <template>
        <p>{{cct_commune}}</p>
        <p class="fr-text--bold" style="font-size:1.5rem;color:var(--text-action-high-blue-france)">
          {{prix_visite}} EUR
        </p>
        <p class="fr-text--sm">Prix de la visite technique</p>
      </template>
    </dsfr-data-map-popup>
  </dsfr-data-map>

  <dsfr-data-a11y source="poi-src" table download
    label-field="cct_denomination" value-field="cct_commune,prix_visite"
    description="200 centres de controle technique les moins chers en Ile-de-France.">
  </dsfr-data-a11y>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Multi-couches</strong> : heatmap de densite (1000 points) en fond +
      marqueurs clusters (200 POI) par-dessus. Deux sources differentes alimentent deux layers.
      Panneau lateral gauche au clic (<code>dsfr-data-map-popup mode="panel-left" for="poi-layer"</code>)
      cible uniquement la couche marqueurs.
    </p>
  </div>
</div>`,
};
