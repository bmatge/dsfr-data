/**
 * Playground examples data
 *
 * 25 exemples organises en 9 catégories :
 *
 * Mode direct       : dsfr-data-source → composant (dsfr-data-chart / dsfr-data-kpi / dsfr-data-list)
 * Mode requête      : dsfr-data-source → dsfr-data-query → composant
 * Mode normalisation : dsfr-data-source → dsfr-data-normalize → dsfr-data-query → composant
 * Mode display      : dsfr-data-source → dsfr-data-display (template HTML dynamique)
 * Mode recherche    : dsfr-data-source → dsfr-data-search → composant
 * Mode facettes     : dsfr-data-source → dsfr-data-normalize → dsfr-data-facets → composant
 * Pagination serveur : dsfr-data-source paginate → composant
 * Server-side       : dsfr-data-source server-side → composant
 *
 * Sources de données :
 *  - OpenDataSoft : Fiscalite locale, Industrie du futur, RappelConso (data.economie.gouv.fr)
 *  - Tabular API  : Registre des maires, Code officiel geographique, LOVAC (tabular-api.data.gouv.fr)
 */
export const examples: Record<string, string> = {
  // =====================================================================
  // MODE DIRECT — dsfr-data-source → composant
  // Les données de la source sont transmises directement au composant
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
  date, tendance, screenshot, téléchargement, plein écran, actions
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
    databox-tooltip-content="Taux global de taxe fonciere sur les proprietes baties (TFB) par commune. Source : DGFiP, données fiscales des particuliers."
    databox-modal-title="A propos de ces données"
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
  DataBox simplifiee : titre, source, date, tendance, téléchargement
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
  KPI — Indicateurs clés Industrie du futur
  Mode direct : dsfr-data-source → dsfr-data-kpi (x4)
  Source : Industrie du futur (OpenDataSoft)
  Chaque KPI calcule une agrégation sur les données brutes
-->

<div class="fr-container fr-my-4w">
  <h2>Indicateurs clés — Industrie du futur</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.economie.gouv.fr — Industrie du futur
  </p>

  <dsfr-data-source id="data" api-type="opendatasoft"
    dataset-id="industrie-du-futur"
    base-url="https://data.economie.gouv.fr">
  </dsfr-data-source>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem;">
    <dsfr-data-kpi source="data"
      value="nombre_beneficiaires:sum"
      label="Total beneficiaires"
      format="nombre">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="data"
      value="nombre_beneficiaires:avg"
      label="Moyenne par enregistrement"
      format="decimal">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="data"
      value="montant_investissement:max"
      label="Investissement max"
      format="euro"
      color-token="vert">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="data"
      value="count"
      label="Enregistrements"
      format="nombre">
    </dsfr-data-kpi>
  </div>
</div>`,

  'kpi-barometre': `<!--
  KPI baromètre — titre (heading) + ligne d'évolution (lines)
  Mode direct : dsfr-data-source (data inline) → dsfr-data-kpi (x3)
  Démontre :
    - heading : surtitre AU-DESSUS de la valeur
    - lines   : ligne secondaire data-driven entre la valeur et le label,
                avec signe (+), suffixe ("vs mai 2025") et couleur "auto"
                (vert si hausse, rouge si baisse)
    - label   : légende sous la ligne d'évolution
-->

<div class="fr-container fr-my-4w">
  <h2>Baromètre — Plan Électrification</h2>

  <dsfr-data-source id="baro" data='[{"immat_ve":37849,"immat_ve_evol":92.5,"pdm_ve":29.4,"pdm_ve_evol":86.1,"pac":15041,"pac_evol":0.8}]'>
  </dsfr-data-source>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem;">
    <dsfr-data-kpi source="baro"
      heading="Immat. VE — véhicules particuliers"
      value="immat_ve"
      format="nombre"
      lines='[{"value":"immat_ve_evol","sign":true,"suffix":"vs mai 2025","color":"auto"}]'
      label="Donnée mai 2026">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="baro"
      heading="Part de marché VE (VP)"
      value="pdm_ve"
      format="pourcentage"
      lines='[{"value":"pdm_ve_evol","sign":true,"suffix":"vs mai 2025","color":"auto"}]'
      label="Donnée mai 2026">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="baro"
      heading="Ventes PAC air/eau"
      value="pac"
      format="nombre"
      lines='[{"value":"pac_evol","sign":true,"suffix":"vs mars 2025","color":"auto"}]'
      label="Donnée mars 2026">
    </dsfr-data-kpi>
  </div>
</div>`,

  'chart-reference-lines': `<!--
  Lignes de référence — repère vertical (lancement) + seuil horizontal (objectif)
  Mode direct : dsfr-data-source (data inline) → dsfr-data-chart (type line)
  Démontre l'attribut reference-lines :
    - axis "x" : ligne verticale pointillée à une catégorie (mois) + pastille
    - axis "y" : ligne horizontale à un seuil (objectif), libellé ancré à gauche
  Les repères sont aussi annoncés dans l'aria-label du graphique.
-->

<div class="fr-container fr-my-4w">
  <h2>Immatriculations VE — repères de référence</h2>

  <dsfr-data-source id="immat" data='[
    {"mois":"2025-11","ventes":21000},
    {"mois":"2025-12","ventes":23500},
    {"mois":"2026-01","ventes":22800},
    {"mois":"2026-02","ventes":28900},
    {"mois":"2026-03","ventes":33200},
    {"mois":"2026-04","ventes":35800},
    {"mois":"2026-05","ventes":37849}
  ]'></dsfr-data-source>

  <dsfr-data-chart source="immat" type="line"
    label-field="mois" value-field="ventes"
    name='["Immatriculations VE"]'
    unit-tooltip=" VE"
    reference-lines='[
      {"axis":"x","value":"2026-02","label":"Lancement du plan","color":"#c9191e","dash":true},
      {"axis":"y","value":30000,"label":"Objectif","position":"start"}
    ]'>
  </dsfr-data-chart>
</div>`,

  'chart-targets': `<!--
  Cibles / objectifs futurs — trajectoire pointillée vers un losange à l'échéance
  Mode direct : dsfr-data-source (data inline) → dsfr-data-chart (type line)
  Démontre l'attribut targets (#377) :
    - l'axe X est étendu automatiquement jusqu'à 2030 (données → 2025)
    - trait plein jusqu'au dernier point réel, trajectoire pointillée vers le losange
    - zone future grisée + frontière pointillée (targets-zone="off" pour retirer)
    - tooltip au survol du losange : toutes les cibles de l'échéance
    - légende « Données historiques / Trajectoire, cible extrapolée » (targets-legend)
  Les cibles sont aussi annoncées dans l'aria-label du graphique.
-->

<div class="fr-container fr-my-4w">
  <h2>Part des énergies fossiles — cibles 2030</h2>

  <dsfr-data-source id="fossiles" data='[
    {"annee":"2019","petrole":36.2,"gaz":20.8},
    {"annee":"2020","petrole":34.5,"gaz":20.1},
    {"annee":"2021","petrole":35.1,"gaz":20.5},
    {"annee":"2022","petrole":34.8,"gaz":19.2},
    {"annee":"2023","petrole":33.9,"gaz":17.8},
    {"annee":"2024","petrole":32.4,"gaz":16.9},
    {"annee":"2025","petrole":31.6,"gaz":16.1}
  ]'></dsfr-data-source>

  <dsfr-data-chart source="fossiles" type="line"
    label-field="annee" value-fields="petrole,gaz"
    name='["Pétrole","Gaz naturel"]'
    unit-tooltip=" %"
    targets='[
      {"x":"2030","value":26,"series":0,"label":"Cible 2030 : 26 %"},
      {"x":"2030","value":12,"series":1}
    ]'>
  </dsfr-data-chart>
</div>`,

  'unpivot-series-line': `<!--
  Unpivot + series-field — donnees "wide" → tidy → multi-séries
  Pipeline : dsfr-data-source (colonnes par annee) → dsfr-data-unpivot → dsfr-data-chart
  Chaque valeur distincte de series-field devient une série du graphique
-->

<div class="fr-container fr-my-4w">
  <h2>Production annuelle par filiere (TWh)</h2>
  <p class="fr-text--sm fr-text--light">
    Données illustratives au format "wide" (une colonne par annee), depliees en format long
  </p>

  <dsfr-data-source id="wide"
    data='[
      {"filiere":"Nucleaire","a2022":279,"a2023":320,"a2024":361},
      {"filiere":"Hydraulique","a2022":49,"a2023":58,"a2024":74},
      {"filiere":"Eolien","a2022":38,"a2023":50,"a2024":45},
      {"filiere":"Solaire","a2022":18,"a2023":21,"a2024":24}
    ]'>
  </dsfr-data-source>

  <dsfr-data-unpivot id="tidy" source="wide"
    id-cols="filiere"
    value-cols-pattern="a{YYYY}"
    var-name="annee" var-format="{YYYY}"
    value-name="twh">
  </dsfr-data-unpivot>

  <dsfr-data-chart source="tidy"
    type="line"
    label-field="annee"
    value-field="twh"
    series-field="filiere"
    unit-tooltip=" TWh"
    selected-palette="categorical">
  </dsfr-data-chart>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>dsfr-data-unpivot</strong> deplie les colonnes <code>a2022..a2024</code> en lignes
      <code>{filiere, annee, twh}</code> ; <strong>series-field="filiere"</strong> transforme chaque
      filiere en série. Une nouvelle colonne d'annee est prise en compte sans changer la config.
    </p>
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
    columns="Nom de l'élu:Nom, Prénom de l'élu:Prenom, Libellé du département:Departement, Libellé de la commune:Commune"
    sort="Nom de l'élu:asc"
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
    columns="Nom de l'élu:Nom, Prénom de l'élu:Prenom, Libellé du département:Departement, Libellé de la commune:Commune"
    search="true"
    sort="Nom de l'élu:asc"
    pagination="20">
  </dsfr-data-list>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      Avec <code>paginate</code> et <code>page-size="20"</code>, <code>dsfr-data-source</code>
      injecte <code>?page=N&amp;page_size=20</code> dans l'URL. Pas besoin de <code>transform="data"</code> :
      en mode pagination, les données sont auto-extraites depuis <code>json.data</code>.
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
    <br>Double source : pagination serveur pour la navigation, agrégation pour les KPI
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
      value="count"
      label="Projets"
      format="nombre">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="all"
      value="nombre_beneficiaires:sum"
      label="Total beneficiaires"
      format="nombre"
      color-token="bleu">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="all"
      value="montant_investissement:sum"
      label="Investissement total"
      format="euro"
      color-token="vert">
    </dsfr-data-kpi>
  </div>

  <dsfr-data-list source="browse"
    columns="nom_departement:Departement, nom_region:Region, nombre_beneficiaires:Beneficiaires, montant_investissement:Investissement"
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
  // Les données passent par dsfr-data-query qui les filtre, regroupe
  // et/ou agrégé avant de les transmettre au composant de visualisation.
  // =====================================================================

  'query-bar': `<!--
  Barres — Beneficiaires agrégés par region
  Mode requête : dsfr-data-source → dsfr-data-query → dsfr-data-chart (bar)
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
  Mode requête : dsfr-data-source → dsfr-data-query → dsfr-data-chart (pie)
  Source : Industrie du futur (OpenDataSoft) — 101 records
  dsfr-data-query regroupe par region et somme les investissements
  DataBox ajoute titre, source et téléchargement CSV
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
  Mode requête : dsfr-data-source → dsfr-data-query → dsfr-data-chart (map)
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
  // Les données passent par dsfr-data-normalize pour etre nettoyees
  // (conversion numérique, renommage, trim) avant traitement par dsfr-data-query.
  // =====================================================================

  'normalize-bar': `<!--
  Barres — Logements vacants par departement (données LOVAC nettoyees)
  Pipeline : dsfr-data-source → dsfr-data-normalize → dsfr-data-query → dsfr-data-chart (bar)
  Source : LOVAC - Logements vacants (tabular-api)
  Probleme : les clés ont des espaces (" DEP ", " LIB_DEP ") et les
  nombres sont en string avec separateurs milliers (" 19 805   ").
  dsfr-data-normalize nettoie les clés (trim), convertit les nombres (numeric-auto)
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
    - trim nettoie les clés (" DEP " → "DEP") ET les valeurs (" Ain " → "Ain")
    - numeric-auto convertit " 19 805   " → 19805 (détecté les nombres avec espaces)
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

  <!-- Nettoyage : trim (clés + valeurs), conversion numérique explicite, renommage -->
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
  Tableau — Données LOVAC nettoyees et lisibles
  Pipeline : dsfr-data-source → dsfr-data-normalize → dsfr-data-list
  Source : LOVAC - Logements vacants (tabular-api)
  Les données brutes ont des clés avec espaces (" DEP ", " LIB_DEP "),
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
    - trim : nettoie les espaces dans les clés ET les valeurs
    - numeric-auto : détecté et convertit tous les champs numériques
    - rename : noms lisibles pour le tableau -->
  <dsfr-data-normalize id="clean" source="raw"
    trim
    numeric-auto
    rename="DEP:Code | LIB_DEP:Departement | pp_vacant_25:Vacants 2025 | pp_vacant_plus_2ans_25:Vacants >2 ans | pp_total_24:Total logements 2024 | pp_vacant_24:Vacants 2024">
  </dsfr-data-normalize>

  <dsfr-data-list source="clean"
    columns="Code, Departement, Vacants 2025, Vacants >2 ans, Total logements 2024, Vacants 2024"
    search="true"
    sort="Vacants 2025:desc"
    pagination="15"
    export="csv">
  </dsfr-data-list>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      Les données LOVAC brutes ont des clés avec espaces (<code>" DEP "</code>),
      des nombres en texte avec separateurs milliers (<code>" 19 805   "</code>),
      et des noms de colonnes techniques. Avec <code>trim</code> + <code>numeric-auto</code>
      + <code>rename</code>, les données deviennent propres et lisibles.
    </p>
  </div>
</div>`,

  // =====================================================================
  // MODE FACETTES — dsfr-data-source → dsfr-data-normalize → dsfr-data-facets → composant
  // Les données passent par dsfr-data-facets qui affiche des filtres interactifs.
  // L'utilisateur sélectionné des valeurs et les composants en aval
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
    columns="Departement, Region, nombre_beneficiaires:Beneficiaires, montant_investissement:Investissement"
    search="true"
    sort="Departement:asc"
    pagination="10"
    export="csv">
  </dsfr-data-list>
</div>`,

  'facets-bar': `<!--
  Barres — Beneficiaires Industrie du futur filtres par region
  Pipeline : dsfr-data-source → dsfr-data-normalize → dsfr-data-facets → dsfr-data-query → dsfr-data-chart (bar)
  Source : Industrie du futur (OpenDataSoft)
  dsfr-data-facets filtre par region, dsfr-data-query agrégé ensuite les données filtrees
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
  // dsfr-data-display repete un template HTML pour chaque element de données,
  // ideal pour créer des cartes DSFR, tuiles ou tout motif repetitif.
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
  Tuiles DSFR — LOVAC logements vacants (données nettoyees)
  Pipeline : dsfr-data-source → dsfr-data-normalize → dsfr-data-query → dsfr-data-display (tuiles)
  Source : LOVAC - Logements vacants (tabular-api)
  Les données brutes sont nettoyees puis affichees sous forme de tuiles DSFR
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
      Les données LOVAC brutes ont des clés avec espaces et des nombres en texte.
      <code>dsfr-data-normalize</code> nettoie tout avant l'affichage en tuiles DSFR
      via <code>dsfr-data-display</code>.
    </p>
  </div>
</div>`,

  // =====================================================================
  // MODE RECHERCHE — dsfr-data-source → dsfr-data-search → composant
  // dsfr-data-search affiche un champ de recherche DSFR et filtre les données
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
    columns="modeles_ou_references:Produit, categorie_produit:Catégorie, marque_produit:Marque, date_publication:Date"
    server-sort
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
      value="count"
      label="Projets"
      color-token="bleu">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="searched"
      value="montant_investissement:sum"
      label="Investissement total"
      format="euro">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="searched"
      value="nombre_beneficiaires:sum"
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
  dsfr-data-facets filtre par region, la carte et les KPI refletent les données filtrees
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

  <!-- KPI sur les données filtrees -->
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
    <dsfr-data-kpi source="filtered"
      value="count"
      label="Communes"
      format="nombre">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="filtered"
      value="taux_global_tfb:avg"
      label="Taux TFB moyen"
      format="pourcentage">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="filtered"
      value="taux_global_th:avg"
      label="Taux TH moyen"
      format="pourcentage">
    </dsfr-data-kpi>
  </div>

  <!-- Carte sur les données filtrees et agregees -->
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
    columns="COM:Code commune, LIBELLE:Commune, DEP:Departement, REG:Region"
    server-sort
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
              dont {{montant_participation_etat:number}} \u20ac finances par l'État
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
  // CARTES DSFR CHART 2.1 — dsfr-data-chart type="map-reg|map-aca|map-monde"
  // API cartes unifiee <map-chart level> (DSFR Chart >= 2.1) — #402
  // =====================================================================

  'direct-map-reg': `<!--
  Carte regionale nationale — dsfr-data-chart type="map-reg"
  Mode direct : dsfr-data-source (données inline) → dsfr-data-chart
  Cles = codes region INSEE (level="reg", DSFR Chart 2.1)
-->

<div class="fr-container fr-my-4w">
  <h2>Population par region (millions)</h2>
  <p class="fr-text--sm fr-text--light">
    Données embarquees — Source : INSEE, estimations 2024 (arrondies)
  </p>

  <dsfr-data-source id="data"
    data='[
      {"code":"11","pop":12.4},{"code":"84","pop":8.2},{"code":"93","pop":5.2},
      {"code":"75","pop":6.1},{"code":"76","pop":6.1},{"code":"32","pop":6.0},
      {"code":"44","pop":5.6},{"code":"52","pop":3.9},{"code":"53","pop":3.4},
      {"code":"28","pop":3.3},{"code":"27","pop":2.8},{"code":"24","pop":2.6},
      {"code":"94","pop":0.35}
    ]'>
  </dsfr-data-source>

  <dsfr-data-chart source="data"
    type="map-reg"
    code-field="code"
    value-field="pop"
    name="Population (M)"
    unit-tooltip=" M hab."
    selected-palette="sequentialAscending">
  </dsfr-data-chart>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>type="map-reg"</strong> : carte nationale des regions via
      <code>&lt;map-chart level="reg"&gt;</code> (DSFR Chart 2.1). Les cles de données
      sont les codes region INSEE (<code>11</code>, <code>84</code>...).
    </p>
  </div>
</div>`,

  'direct-map-aca': `<!--
  Carte des academies — dsfr-data-chart type="map-aca"
  Mode direct : dsfr-data-source (données inline) → dsfr-data-chart
  Cles = noms d'academie en MAJUSCULES (level="aca", DSFR Chart 2.1)
-->

<div class="fr-container fr-my-4w">
  <h2>Effectifs eleves par academie (milliers)</h2>
  <p class="fr-text--sm fr-text--light">
    Données illustratives — ordres de grandeur MENJ
  </p>

  <dsfr-data-source id="data"
    data='[
      {"aca":"VERSAILLES","n":1120},{"aca":"CRETEIL","n":980},{"aca":"LILLE","n":810},
      {"aca":"LYON","n":640},{"aca":"NANTES","n":600},{"aca":"TOULOUSE","n":520},
      {"aca":"BORDEAUX","n":560},{"aca":"RENNES","n":540},{"aca":"MONTPELLIER","n":480},
      {"aca":"AIX-MARSEILLE","n":500},{"aca":"STRASBOURG","n":320},{"aca":"PARIS","n":300},
      {"aca":"NICE","n":330},{"aca":"NANCY-METZ","n":370},{"aca":"ORLEANS-TOURS","n":410}
    ]'>
  </dsfr-data-source>

  <dsfr-data-chart source="data"
    type="map-aca"
    code-field="aca"
    value-field="n"
    name="Eleves (k)"
    unit-tooltip=" k eleves"
    selected-palette="sequentialAscending">
  </dsfr-data-chart>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>type="map-aca"</strong> : carte des academies via
      <code>&lt;map-chart level="aca"&gt;</code> (DSFR Chart 2.1). Les cles de données
      sont les noms d'academie en majuscules (<code>PARIS</code>, <code>LYON</code>...).
    </p>
  </div>
</div>`,

  'direct-map-monde': `<!--
  Carte mondiale — dsfr-data-chart type="map-monde"
  Mode direct : dsfr-data-source (données inline) → dsfr-data-chart
  Cles = codes pays ISO 3166-1 : alpha-2, alpha-3 OU numeriques
  (convertis automatiquement en alpha-2 — level="monde", DSFR Chart 2.1)
-->

<div class="fr-container fr-my-4w">
  <h2>PIB par pays (milliards USD)</h2>
  <p class="fr-text--sm fr-text--light">
    Données embarquees — Source : Banque mondiale (extrait).
    Les codes melangent volontairement alpha-3 (USA), alpha-2 (CN) et numerique (250)
    pour illustrer la conversion automatique.
  </p>

  <dsfr-data-source id="data"
    data='[
      {"code":"USA","pib":25462},{"code":"CN","pib":17963},{"code":"JPN","pib":4231},
      {"code":"276","pib":4072},{"code":"GB","pib":3070},{"code":"IND","pib":3385},
      {"code":"250","pib":2783},{"code":"IT","pib":2010},{"code":"CAN","pib":2139},
      {"code":"KR","pib":1665},{"code":"BRA","pib":1920},{"code":"AU","pib":1675},
      {"code":"MX","pib":1293},{"code":"ESP","pib":1397},{"code":"ID","pib":1319},
      {"code":"SAU","pib":1108},{"code":"NL","pib":991},{"code":"TR","pib":906},
      {"code":"CHE","pib":818},{"code":"PL","pib":688},{"code":"SE","pib":586},
      {"code":"BEL","pib":578},{"code":"NO","pib":579},{"code":"AR","pib":632},
      {"code":"NGA","pib":477},{"code":"AT","pib":471},{"code":"ZA","pib":405},
      {"code":"THA","pib":495},{"code":"EG","pib":476},{"code":"DK","pib":395}
    ]'>
  </dsfr-data-source>

  <dsfr-data-chart source="data"
    type="map-monde"
    code-field="code"
    value-field="pib"
    name="PIB"
    unit-tooltip=" Mds USD"
    selected-palette="sequentialAscending">
  </dsfr-data-chart>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>type="map-monde"</strong> : carte mondiale native via
      <code>&lt;map-chart level="monde"&gt;</code> (DSFR Chart 2.1). Les codes
      alpha-3 et numeriques sont convertis automatiquement en alpha-2.
    </p>
  </div>
</div>`,

  // =====================================================================
  // JOINTURE MULTI-SOURCES — dsfr-data-source (A) + dsfr-data-source (B) → dsfr-data-join → composant
  // Croise deux jeux de données sur une clé pivot pour enrichir les données.
  // =====================================================================

  'join-basic': `<!--
  Jointure — Population vs Budget (left join, 2 séries)
  Mode jointure : dsfr-data-source x2 → dsfr-data-join → dsfr-data-chart
  Le graphique affiche 2 séries provenant chacune d'une source differente
-->

<div class="fr-container fr-my-4w">
  <h2>Population vs Budget par region</h2>
  <p class="fr-text--sm fr-text--light">
    Deux sources independantes croisees par <code>dsfr-data-join</code> sur le code region.
    Le graphique affiche deux séries : <strong>population</strong> (source A) et <strong>budget</strong> (source B).
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

  <!-- Source B : budget (en M EUR) — même echelle pour lisibilite -->
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

  <!-- Graphique 2 séries : population (source A) + budget (source B) -->
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
      <strong>L'interet de la jointure</strong> : les données de population et de budget viennent
      de deux sources separees. <code>dsfr-data-join on="code"</code> les fusionne en un seul
      dataset, ce qui permet d'afficher les deux séries cote a cote avec
      <code>value-field="population" value-fields="budget"</code>.
    </p>
  </div>
</div>`,

  'join-query': `<!--
  Jointure + query — Recettes vs Depenses (inner join + tri, 2 séries)
  Mode jointure : dsfr-data-source x2 → dsfr-data-join → dsfr-data-query → dsfr-data-chart
  Le graphique compare deux séries issues de sources differentes
-->

<div class="fr-container fr-my-4w">
  <h2>Recettes vs Depenses par region</h2>
  <p class="fr-text--sm fr-text--light">
    Inner join + tri : les recettes (source A) et les depenses (source B) sont croisees puis triees.
    La Normandie n'a pas de données de depenses → elle est exclue par l'inner join.
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

  <!-- 2 séries : recettes (source A) vs depenses (source B) -->
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
      <code>dsfr-data-query order-by="recettes:desc"</code> → graphique 2 séries.
      Sans la jointure, il serait impossible de comparer recettes et depenses sur un même graphique.
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
      (<code>dsfr-data-map-popup mode="panel-right"</code>), et companion d'accessibilité
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
    Données embarquees — Nombre approximatif de centres et prix moyen
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

  // =====================================================================
  // PODIUM — dsfr-data-podium
  // Classement top N : rang, libelle, barre proportionnelle, valeur.
  // =====================================================================

  'podium-lycees-dept': `<!--
  Podium — Les 10 departements les mieux dotes en lycees
  Pipeline : dsfr-data-source → dsfr-data-query (group-by + count) → dsfr-data-podium
  Source : Annuaire de l'education (OpenDataSoft, data.education.gouv.fr)
  Le regroupement part au serveur : seules 10 lignes agregees reviennent,
  pas les 68 000 etablissements.
-->

<div class="fr-container fr-my-4w">
  <h2>Les 10 departements les mieux dotes en lycees</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.education.gouv.fr — Annuaire de l'education
  </p>

  <dsfr-data-source id="etab" api-type="opendatasoft"
    dataset-id="fr-en-annuaire-education"
    base-url="https://data.education.gouv.fr"
    where="type_etablissement = 'Lycée'">
  </dsfr-data-source>

  <dsfr-data-query id="top" source="etab"
    group-by="libelle_departement"
    aggregate="libelle_departement:count:nb"
    order-by="nb:desc"
    limit="10">
  </dsfr-data-query>

  <dsfr-data-podium source="top"
    label-field="libelle_departement"
    value-field="nb"
    subtitle="Lycees recenses"
    value-unit="lycees"
    selected-palette="sequentialDescending"
    max-items="10">
  </dsfr-data-podium>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Un classement n'est pas un graphique en barres.</strong> Le podium numerote les rangs
      et cadre la lecture sur « qui est devant » ; il attend donc une liste deja triee et courte.
      Le tri est fait par <code>dsfr-data-query</code> (<code>order-by</code> + <code>limit</code>),
      pas dans le composant : c'est la requete qui decide du perimetre, l'affichage n'en decide pas.
      <br><strong>Attention a la lecture :</strong> un departement peuple a mecaniquement plus de
      lycees. Ce classement dit une dotation absolue, pas une densite.
    </p>
  </div>
</div>`,

  'podium-kpi-group-regions': `<!--
  Podium + groupe de KPI — Lycees par region
  Pipeline : dsfr-data-source → dsfr-data-query (group-by region) →
             dsfr-data-kpi-group + dsfr-data-podium
  Source : Annuaire de l'education (OpenDataSoft, data.education.gouv.fr)
  Les KPI agregent les MEMES lignes que le podium : les chiffres affiches
  et le classement ne peuvent pas diverger.
-->

<div class="fr-container fr-my-4w">
  <h2>Lycees par region</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.education.gouv.fr — Annuaire de l'education
  </p>

  <dsfr-data-source id="etab" api-type="opendatasoft"
    dataset-id="fr-en-annuaire-education"
    base-url="https://data.education.gouv.fr"
    where="type_etablissement = 'Lycée'">
  </dsfr-data-source>

  <dsfr-data-query id="par-region" source="etab"
    group-by="libelle_region"
    aggregate="libelle_region:count:nb"
    order-by="nb:desc">
  </dsfr-data-query>

  <dsfr-data-kpi-group per-row="2 md:4" gap="md" aria-label="Indicateurs des lycees par region">
    <dsfr-data-kpi source="par-region"
      value="count"
      label="Regions representees"
      format="nombre">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="par-region"
      value="nb:sum"
      label="Lycees au total"
      format="nombre"
      color-token="bleu">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="par-region"
      value="nb:avg"
      label="Moyenne par region"
      format="nombre">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="par-region"
      value="nb:max"
      label="Region la mieux dotee"
      format="nombre"
      color-token="vert">
    </dsfr-data-kpi>
  </dsfr-data-kpi-group>

  <dsfr-data-podium source="par-region"
    label-field="libelle_region"
    value-field="nb"
    subtitle="Lycees recenses"
    value-unit="lycees"
    max-items="6">
  </dsfr-data-podium>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong><code>dsfr-data-kpi-group</code> pose la grille</strong> (<code>per-row="2 md:4"</code> :
      deux indicateurs par ligne sur telephone, quatre a partir de 768 px) — inutile d'ecrire
      une grille CSS a la main. Chaque <code>dsfr-data-kpi</code> peut forcer sa largeur avec
      <code>span</code>.
      <br><strong>Le point qui compte :</strong> les KPI et le podium lisent la MEME requete.
      Un total calcule sur un autre perimetre que le classement qu'il surmonte est la premiere
      facon de faire mentir une page.
    </p>
  </div>
</div>`,

  // =====================================================================
  // SOURCES — INSEE Melodi, API JSON quelconque
  // Au-dela d'Opendatasoft et de data.gouv : les autres adaptateurs.
  // =====================================================================

  'insee-population-bar': `<!--
  INSEE Melodi — Population municipale des regions
  Pipeline : dsfr-data-source (api-type="insee") → dsfr-data-query → dsfr-data-chart
  Source : api.insee.fr/melodi — jeu DS_POPULATIONS_REFERENCE
  CORS actif, aucune cle necessaire, 30 requetes/minute.
-->

<div class="fr-container fr-my-4w">
  <h2>Population municipale par region (2023)</h2>
  <p class="fr-text--sm fr-text--light">
    Source : INSEE Melodi — Populations de reference
  </p>

  <!-- Le where d'une source INSEE filtre des DIMENSIONS : chaque clause
       devient un parametre de l'API, et « in » repete le parametre.
       C'est ce qui rend ce jeu utilisable : il porte 106 000 observations
       (communes, arrondissements, departements, regions melanges), et
       sans filtre de maille l'adaptateur les paginerait toutes.

       L'adaptateur aplatit ensuite les observations SDMX (dimensions +
       measures + attributes) en lignes plates : OBS_VALUE_NIVEAU.value
       devient la colonne OBS_VALUE. Les libelles sont resolus : GEO vaut
       « Bretagne » et non « 2025-REG-53 » — le code d'origine reste dans
       GEO_CODE, a utiliser pour les filtres et les jointures. -->
  <dsfr-data-source id="pop" api-type="insee"
    base-url="https://api.insee.fr/melodi"
    dataset-id="DS_POPULATIONS_REFERENCE"
    where="POPREF_MEASURE:eq:PMUN, TIME_PERIOD:eq:2023, GEO:in:2025-REG-11|2025-REG-24|2025-REG-27|2025-REG-28|2025-REG-32|2025-REG-44|2025-REG-52|2025-REG-53|2025-REG-75|2025-REG-76|2025-REG-84|2025-REG-93|2025-REG-94">
  </dsfr-data-source>

  <dsfr-data-query id="tri" source="pop"
    order-by="OBS_VALUE:desc">
  </dsfr-data-query>

  <dsfr-data-chart source="tri"
    type="bar"
    label-field="GEO"
    value-field="OBS_VALUE"
    name="Population municipale"
    selected-palette="sequentialDescending"
    horizontal>
  </dsfr-data-chart>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Filtrer la maille a la SOURCE, pas en aval.</strong> Ce jeu melange les niveaux
      geographiques. Un <code>where</code> pose sur la <code>dsfr-data-query</code> aurait
      filtre APRES coup : l'adaptateur aurait d'abord telecharge les 106 000 observations,
      page par page. Pose sur la source, le filtre devient un parametre de l'API et treize
      lignes reviennent.
      <br><strong>Deux colonnes par dimension.</strong> INSEE Melodi publie en codes SDMX ;
      l'adaptateur resout les libelles et garde le code a cote, suffixe <code>_CODE</code>.
      Afficher <code>GEO</code>, filtrer et joindre sur <code>GEO_CODE</code> : un libelle peut
      changer d'orthographe d'un millesime a l'autre, un code non.
    </p>
  </div>
</div>`,

  'generic-geo-list': `<!--
  API JSON quelconque — Geo API (adaptateur generique)
  Pipeline : dsfr-data-source (url brute) → dsfr-data-list
  Source : geo.api.gouv.fr — l'API geographique de l'Etat
  Le mode « url brute » (attribut url, sans api-type) accepte n'importe
  quelle API REST qui rend du JSON et autorise le CORS.
-->

<div class="fr-container fr-my-4w">
  <h2>Les departements francais</h2>
  <p class="fr-text--sm fr-text--light">
    Source : geo.api.gouv.fr — API Decoupage administratif
  </p>

  <!-- Cette API rend directement un tableau JSON : aucun attribut
       transform n'est necessaire. Quand la reponse enveloppe les lignes
       dans un objet (par exemple {"results": [...]}), transform="results"
       designe le chemin du tableau. -->
  <dsfr-data-source id="dept"
    url="https://geo.api.gouv.fr/departements?fields=nom,code,codeRegion">
  </dsfr-data-source>

  <dsfr-data-list source="dept"
    columns="code:Code, nom:Departement, codeRegion:Code region"
    pagination="15"
    sort="code:asc"
    search>
  </dsfr-data-list>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>C'est le mode a retenir pour votre propre API.</strong> Pas d'adaptateur, donc
      pas de pagination automatique ni de filtre delegue au serveur : tout ce qui suit
      (<code>query</code>, <code>search</code>, facettes, tri) s'execute dans le navigateur
      sur les lignes recues. Convenable pour quelques milliers de lignes, a proscrire sur un
      gros jeu — la ou un adaptateur (<code>opendatasoft</code>, <code>tabular</code>,
      <code>grist</code>, <code>insee</code>) delegue le travail a l'API.
    </p>
  </div>
</div>`,

  'generic-join-ods': `<!--
  Croiser une API quelconque et un portail Opendatasoft
  Pipeline : 2 x dsfr-data-source (generic + opendatasoft) → dsfr-data-join → dsfr-data-chart
  Sources : geo.api.gouv.fr (noms de regions) + data.education.gouv.fr (lycees)
  Les deux adaptateurs se melangent sans precaution : join ne voit que des lignes.
-->

<div class="fr-container fr-my-4w">
  <h2>Lycees par region, avec le nom officiel de la region</h2>
  <p class="fr-text--sm fr-text--light">
    Sources : geo.api.gouv.fr + data.education.gouv.fr
  </p>

  <!-- Source A : le referentiel geographique (API JSON brute) -->
  <dsfr-data-source id="geo"
    url="https://geo.api.gouv.fr/regions?fields=nom,code">
  </dsfr-data-source>

  <!-- Source B : le comptage des lycees, agrege cote serveur -->
  <dsfr-data-source id="etab" api-type="opendatasoft"
    dataset-id="fr-en-annuaire-education"
    base-url="https://data.education.gouv.fr"
    where="type_etablissement = 'Lycée'">
  </dsfr-data-source>

  <dsfr-data-query id="compte" source="etab"
    group-by="code_region"
    aggregate="code_region:count:nb"
    order-by="nb:desc">
  </dsfr-data-query>

  <!-- Les deux cotes codent la region de la meme facon (« 52 ») : la
       jointure se pose directement, en nommant la colonne de chaque cote. -->
  <dsfr-data-join id="croise"
    left="compte" right="geo"
    on="code_region=code"
    type="left">
  </dsfr-data-join>

  <dsfr-data-chart source="croise"
    type="bar"
    label-field="nom"
    value-field="nb"
    name="Lycees"
    selected-palette="categorical">
  </dsfr-data-chart>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>La clé est le vrai sujet d'une jointure.</strong> Ici les deux cotes codent la
      region a l'identique et <code>on="code_region=code"</code> suffit. Ce n'est pas la regle :
      le meme annuaire code le DEPARTEMENT sur trois caracteres (« 044 ») la ou la Geo API en
      met deux (« 44 »). Une jointure sur des cles non alignees ne leve aucune erreur — elle
      rend des lignes vides, ce qui se voit mal sur un graphique. Verifier le nombre de lignes
      en sortie, au volet Diagnostic, est le geste qui evite cette panne silencieuse.
    </p>
  </div>
</div>`,

  // =====================================================================
  // EMPILEMENT — dsfr-data-concat
  // Mettre les LIGNES de plusieurs sources bout a bout (une source par
  // millesime, par region, par serie). A ne pas confondre avec join, qui
  // juxtapose des COLONNES.
  // =====================================================================

  'concat-millesimes': `<!--
  Empilement — Deux millesimes en une serie par annee
  Pipeline : 2 x dsfr-data-source → dsfr-data-concat → dsfr-data-chart
  Source : donnees en dur (le motif est le meme sur des sources distantes)
  origin-field garde la trace de la source de chaque ligne : le resultat se
  branche tel quel sur le series-field du graphique, sans pivot ni jointure.
-->

<div class="fr-container fr-my-4w">
  <h2>Frequentation mensuelle, 2024 et 2025</h2>
  <p class="fr-text--sm fr-text--light">
    Deux sources aux MEMES colonnes, empilees par <code>dsfr-data-concat</code>.
  </p>

  <dsfr-data-source id="v2024" data='[
    {"mois":"Janvier","visites":1200},{"mois":"Fevrier","visites":1450},
    {"mois":"Mars","visites":1610},{"mois":"Avril","visites":1390},
    {"mois":"Mai","visites":1720},{"mois":"Juin","visites":1880}
  ]'>
  </dsfr-data-source>

  <dsfr-data-source id="v2025" data='[
    {"mois":"Janvier","visites":1340},{"mois":"Fevrier","visites":1520},
    {"mois":"Mars","visites":1780},{"mois":"Avril","visites":1660},
    {"mois":"Mai","visites":2010},{"mois":"Juin","visites":2240}
  ]'>
  </dsfr-data-source>

  <!-- origin-field ajoute une colonne qui dit d'ou vient chaque ligne ;
       origin-labels lui donne un libelle lisible plutot que l'id. -->
  <dsfr-data-concat id="visites" sources="v2024, v2025"
    origin-field="millesime"
    origin-labels="v2024:2024 | v2025:2025">
  </dsfr-data-concat>

  <dsfr-data-chart source="visites"
    type="line"
    label-field="mois"
    value-field="visites"
    series-field="millesime"
    selected-palette="categorical">
  </dsfr-data-chart>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Empiler ou joindre ?</strong> <code>dsfr-data-join</code> juxtapose des COLONNES
      (deux tables, une cle commune). <code>dsfr-data-concat</code> met des LIGNES bout a bout,
      quand les sources ont les memes colonnes. Ici chaque millesime est publie separement :
      l'empilement les remet dans un seul tableau, et <code>origin-field</code> fabrique la
      colonne de serie qui manquait.
      <br>Des schemas divergents sont une erreur de configuration qui liste, par source, les
      colonnes en trop et en moins : rien n'est empile plutot qu'un tableau aux colonnes vides.
    </p>
  </div>
</div>`,

  'concat-deux-requetes': `<!--
  Empilement de deux requetes agregees — Lycees et colleges par region
  Pipeline : 2 x (source → query group-by) → dsfr-data-concat → dsfr-data-chart
  Source : Annuaire de l'education (OpenDataSoft, data.education.gouv.fr)
  Chaque niveau est compte par le serveur dans sa propre chaine, puis les
  deux resultats sont empiles pour donner deux series comparables.
-->

<div class="fr-container fr-my-4w">
  <h2>Lycees et colleges par region</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.education.gouv.fr — Annuaire de l'education
  </p>

  <dsfr-data-source id="src-lyc" api-type="opendatasoft"
    dataset-id="fr-en-annuaire-education"
    base-url="https://data.education.gouv.fr"
    where="type_etablissement = 'Lycée'">
  </dsfr-data-source>

  <dsfr-data-query id="lyc" source="src-lyc"
    group-by="libelle_region"
    aggregate="libelle_region:count:nb">
  </dsfr-data-query>

  <dsfr-data-source id="src-col" api-type="opendatasoft"
    dataset-id="fr-en-annuaire-education"
    base-url="https://data.education.gouv.fr"
    where="type_etablissement = 'Collège'">
  </dsfr-data-source>

  <dsfr-data-query id="col" source="src-col"
    group-by="libelle_region"
    aggregate="libelle_region:count:nb">
  </dsfr-data-query>

  <dsfr-data-concat id="niveaux" sources="lyc, col"
    origin-field="niveau"
    origin-labels="lyc:Lycees | col:Colleges">
  </dsfr-data-concat>

  <dsfr-data-chart source="niveaux"
    type="bar"
    label-field="libelle_region"
    value-field="nb"
    series-field="niveau"
    selected-palette="categorical">
  </dsfr-data-chart>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Une chaîne par série.</strong> Chaque niveau a sa propre source et sa propre
      requete : le regroupement part au serveur des deux cotes (une query est seule lectrice de
      sa source), et seules les lignes agregees reviennent. L'empilement se fait ensuite sur
      deux fois dix-huit lignes.
      <br><strong>Ce que concat ne fait pas :</strong> aucune commande aval (page, filtre, tri)
      n'est relayee aux sources, faute de savoir a laquelle l'adresser. Derriere un empilement,
      un filtre s'execute cote client — ou se pose sur chaque source.
    </p>
  </div>
</div>`,

  // =====================================================================
  // TABLEAU CROISE — dsfr-data-pivot
  // Replie un tableau « long » (une observation par ligne) en tableau
  // « wide » : une ligne par valeur de row, une colonne par valeur de column.
  // =====================================================================

  'pivot-region-type': `<!--
  Tableau croise — Etablissements par region et par type
  Pipeline : dsfr-data-source → dsfr-data-query (group-by) → dsfr-data-pivot → dsfr-data-list
  Source : Annuaire de l'education (OpenDataSoft, data.education.gouv.fr)
  La requete rend un tableau long (region, type, nombre) ; le pivot le
  replie en une ligne par region et une colonne par type.
-->

<div class="fr-container fr-my-4w">
  <h2>Etablissements par region et par type</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.education.gouv.fr — Annuaire de l'education
  </p>

  <dsfr-data-source id="etab" api-type="opendatasoft"
    dataset-id="fr-en-annuaire-education"
    base-url="https://data.education.gouv.fr"
    where="type_etablissement IN ('Lycée', 'Collège', 'Ecole')">
  </dsfr-data-source>

  <!-- Tableau LONG : une ligne par couple (region, type) -->
  <dsfr-data-query id="long" source="etab"
    group-by="libelle_region, type_etablissement"
    aggregate="type_etablissement:count:nb"
    limit="200">
  </dsfr-data-query>

  <!-- Tableau WIDE : une ligne par region, une colonne par type -->
  <dsfr-data-pivot id="croise" source="long"
    row="libelle_region"
    column="type_etablissement"
    value="nb"
    aggregate="sum"
    column-order="asc">
  </dsfr-data-pivot>

  <dsfr-data-list source="croise"
    pagination="20"
    caption="Nombre d'etablissements par region et par type">
  </dsfr-data-list>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Une cellule sans observation vaut <code>null</code>, jamais <code>0</code>.</strong>
      L'absence de mesure et une mesure nulle ne se confondent pas : une region sans lycee
      recense et une region a zero lycee ne disent pas la meme chose.
      <br>Le <code>dsfr-data-list</code> n'a pas d'attribut <code>columns</code> : il derive ses
      colonnes des donnees, et suit donc les colonnes que le pivot a generees. Leur nom vient
      des VALEURS rencontrees — pour des noms stables et utilisables dans un
      <code>compute</code>, poser <code>column-format</code>.
    </p>
  </div>
</div>`,

  'unpivot-pivot-aller-retour': `<!--
  Depivot puis pivot — le meme tableau, dans les deux sens
  Pipeline : dsfr-data-source (wide) → dsfr-data-unpivot (long) → dsfr-data-chart
             et dsfr-data-source (wide) → dsfr-data-list
  Source : donnees en dur
  unpivot et pivot sont exactement symetriques : le premier deplie une
  colonne par periode en une observation par ligne, le second replie.
-->

<div class="fr-container fr-my-4w">
  <h2>Crédits par mission — le même tableau, deux formes</h2>
  <p class="fr-text--sm fr-text--light">
    Donnees en dur, en millions d'euros.
  </p>

  <!-- Forme WIDE : une colonne par annee. C'est la forme qu'on lit. -->
  <dsfr-data-source id="wide" data='[
    {"mission":"Ecologie","2023":21400,"2024":23900,"2025":24800},
    {"mission":"Enseignement scolaire","2023":60200,"2024":62100,"2025":63400},
    {"mission":"Justice","2023":11600,"2024":12200,"2025":12900}
  ]'>
  </dsfr-data-source>

  <h3 class="fr-h5 fr-mt-4w">La forme lue : un tableau croise</h3>
  <dsfr-data-list source="wide"
    columns="mission:Mission, 2023:2023, 2024:2024, 2025:2025"
    caption="Credits de paiement par mission et par annee (M EUR)">
  </dsfr-data-list>

  <h3 class="fr-h5 fr-mt-4w">La forme calculee : une observation par ligne</h3>
  <!-- unpivot deplie les colonnes d'annees en deux colonnes : annee, credits.
       C'est la forme « tidy » qu'attend un graphique a series. -->
  <dsfr-data-unpivot id="long" source="wide"
    id-cols="mission"
    value-cols="2023, 2024, 2025"
    var-name="annee"
    value-name="credits">
  </dsfr-data-unpivot>

  <dsfr-data-chart source="long"
    type="line"
    label-field="annee"
    value-field="credits"
    series-field="mission"
    unit-tooltip="M EUR"
    selected-palette="categorical">
  </dsfr-data-chart>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Les deux formes ne servent pas le même lecteur.</strong> Un humain lit le tableau
      croise : une ligne par sujet, une colonne par periode. Un graphique a series veut la forme
      longue : une observation par ligne. <code>dsfr-data-unpivot</code> passe de la premiere a
      la seconde, <code>dsfr-data-pivot</code> fait le chemin inverse.
      <br>Publier en long et replier a l'affichage est le sens qui se tient : une colonne par
      annee oblige a recrire la page a chaque millesime.
    </p>
  </div>
</div>`,

  // =====================================================================
  // REPETITION — dsfr-data-repeat
  // Repete des INSTANCES VIVANTES : pour chaque ligne d'une source, le
  // <template> est clone et ses composants dsfr-data-* estampes. Un
  // graphique par question, un KPI par service.
  // =====================================================================

  'repeat-chart-par-type': `<!--
  Repetition — Un graphique par type d'etablissement
  Pipeline : dsfr-data-source (liste des types) → dsfr-data-repeat (scopes)
             → un dsfr-data-chart par ligne
  Source : Annuaire de l'education (OpenDataSoft, data.education.gouv.fr)
  scopes partitionne la source de donnees UNE FOIS et emet un id par ligne
  repetee : pas une dsfr-data-query par graphique.
-->

<div class="fr-container fr-my-4w">
  <h2>Etablissements par region, un graphique par type</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.education.gouv.fr — Annuaire de l'education
  </p>

  <!-- La source REPETEE : une ligne = un graphique a produire. -->
  <dsfr-data-source id="types" data='[
    {"code":"Lycée","nom":"Lycees"},
    {"code":"Collège","nom":"Colleges"},
    {"code":"Ecole","nom":"Ecoles"}
  ]'>
  </dsfr-data-source>

  <!-- La source SCOPEE : toutes les donnees, partitionnees par type. -->
  <dsfr-data-source id="etab" api-type="opendatasoft"
    dataset-id="fr-en-annuaire-education"
    base-url="https://data.education.gouv.fr"
    where="type_etablissement IN ('Lycée', 'Collège', 'Ecole')">
  </dsfr-data-source>

  <dsfr-data-query id="par-type" source="etab"
    group-by="type_etablissement, libelle_region"
    aggregate="libelle_region:count:nb"
    limit="200">
  </dsfr-data-query>

  <dsfr-data-repeat source="types" key-field="code"
    per-row="1 md:3"
    scopes="par-type:type_etablissement:t">
    <template>
      <h3 class="fr-h6" id="{{$uid}}">{{nom}}</h3>
      <dsfr-data-chart source="{{$scope.t}}"
        type="bar"
        label-field="libelle_region"
        value-field="nb"
        name="{{nom}}"
        horizontal>
      </dsfr-data-chart>
    </template>
  </dsfr-data-repeat>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong><code>scopes</code> évite N requêtes.</strong> Sans lui, il faudrait ecrire une
      <code>dsfr-data-query</code> par ligne dans le gabarit, chacune refiltrant la source
      entiere. <code>scopes="par-type:type_etablissement:t"</code> partitionne une seule fois et
      emet un id par ligne, lu dans le gabarit par <code>{{$scope.t}}</code>.
      <br><strong><code>repeat</code> ou <code>display</code> ?</strong> <code>display</code>
      quand la ligne est du CONTENU (une liste de resultats). <code>repeat</code> quand la ligne
      est un PIPELINE : il est transparent — aucun role, aucun compteur, aucune pagination — et
      la structure de la page vient des titres que vous ecrivez dans le gabarit.
    </p>
  </div>
</div>`,

  'repeat-kpi-par-region': `<!--
  Repetition — Un indicateur par region
  Pipeline : dsfr-data-query (regions) → dsfr-data-repeat → un dsfr-data-kpi par ligne
  Source : Annuaire de l'education (OpenDataSoft, data.education.gouv.fr)
  Ici la ligne repetee porte deja sa valeur : pas besoin de scopes, le
  gabarit lit les champs de la ligne.
-->

<div class="fr-container fr-my-4w">
  <h2>Lycees par region</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.education.gouv.fr — Annuaire de l'education
  </p>

  <dsfr-data-source id="etab" api-type="opendatasoft"
    dataset-id="fr-en-annuaire-education"
    base-url="https://data.education.gouv.fr"
    where="type_etablissement = 'Lycée'">
  </dsfr-data-source>

  <dsfr-data-query id="regions" source="etab"
    group-by="libelle_region"
    aggregate="libelle_region:count:nb"
    order-by="nb:desc"
    limit="12">
  </dsfr-data-query>

  <!-- Le KPI n'a pas de source : sa valeur est un litteral interpole depuis
       la ligne repetee (value="={{nb}}"). Un litteral numerique passe par
       le format, exactement comme une valeur calculee. -->
  <dsfr-data-repeat source="regions" key-field="libelle_region" per-row="2 md:4">
    <template>
      <dsfr-data-kpi
        value="={{nb}}"
        label="{{libelle_region}}"
        format="nombre">
      </dsfr-data-kpi>
    </template>
  </dsfr-data-repeat>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>L'identité par clé.</strong> <code>key-field</code> dit ce qui identifie une ligne
      d'une emission a l'autre. Une cle qui subsiste garde ses noeuds : les instances ne sont ni
      deconnectees ni recreees, leurs attributs sont mis a jour en place. C'est ce qui permet de
      reemettre des dizaines de graphiques sans detruire un seul canvas.
      <br>Sans <code>key-field</code>, la cle est le rang : au moindre reordonnancement, chaque
      instance change de contenu.
    </p>
  </div>
</div>`,

  // =====================================================================
  // CONTEXTE PARTAGE — dsfr-data-context
  // Filtres transverses : un controle d'UI, N sources filtrees. Le fan-out
  // declaratif qui evite d'ecrire l'orchestration a la main.
  // =====================================================================

  'context-dashboard': `<!--
  Contexte partage — Un filtre, trois affichages
  Pipeline : UI native → dsfr-data-context → 2 sources → kpi + chart + podium
  Source : Annuaire de l'education (OpenDataSoft, data.education.gouv.fr)
  Le contexte n'effectue aucun fetch et ne transforme aucune donnee : il
  emet des commandes where vers les sources qu'il nomme.
-->

<div class="fr-container fr-my-4w">
  <h2>Etablissements — tableau de bord a filtre commun</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.education.gouv.fr — Annuaire de l'education
  </p>

  <!-- L'UI est du DSFR ordinaire : le contexte ecoute des elements natifs. -->
  <div class="fr-grid-row fr-grid-row--gutters fr-mb-3w">
    <div class="fr-col-12 fr-col-md-6">
      <label class="fr-label" for="ui-region">Region</label>
      <select id="ui-region" class="fr-select">
        <option value="">Toutes les regions</option>
        <option value="Bretagne">Bretagne</option>
        <option value="Normandie">Normandie</option>
        <option value="Occitanie">Occitanie</option>
        <option value="Ile-de-France">Ile-de-France</option>
      </select>
    </div>
    <div class="fr-col-12 fr-col-md-6">
      <label class="fr-label" for="ui-statut">Statut</label>
      <select id="ui-statut" class="fr-select">
        <option value="">Tous les statuts</option>
        <option value="Public">Public</option>
        <option value="Privé">Prive</option>
      </select>
    </div>
  </div>

  <!-- Les sources sont declarees AVANT le contexte : il les resout par id
       au moment de s'enregistrer. -->
  <dsfr-data-source id="src-type" api-type="opendatasoft"
    dataset-id="fr-en-annuaire-education"
    base-url="https://data.education.gouv.fr"
    where="statut_public_prive is not null">
  </dsfr-data-source>

  <dsfr-data-source id="src-dept" api-type="opendatasoft"
    dataset-id="fr-en-annuaire-education"
    base-url="https://data.education.gouv.fr"
    where="statut_public_prive is not null">
  </dsfr-data-source>

  <!-- Chaque requete est SEULE lectrice de sa source : son regroupement
       part au serveur, et seules les lignes agregees reviennent. -->
  <!-- Les colonnes que le contexte filtre sont RANGEES DANS LE
       REGROUPEMENT. C'est la condition pour qu'il puisse les deleguer :
       un filtre de contexte part avant le group_by, mais le contexte ne
       le pose que sur une colonne que la source lui declare. Sur une
       source dont le seul lecteur regroupe par type, « libelle_region »
       n'existe plus a ses yeux — et il refuse, en le disant. -->
  <dsfr-data-query id="par-type" source="src-type"
    group-by="libelle_region, statut_public_prive, type_etablissement"
    aggregate="type_etablissement:count:nb"
    order-by="nb:desc">
  </dsfr-data-query>

  <dsfr-data-query id="par-dept" source="src-dept"
    group-by="libelle_region, statut_public_prive, libelle_departement"
    aggregate="libelle_departement:count:nb"
    order-by="nb:desc"
    limit="8">
  </dsfr-data-query>

  <dsfr-data-context id="ctx" sources="src-type src-dept">
    <dsfr-data-context-filter field="libelle_region" label="Region"
      operator="eq" ui="ui-region">
    </dsfr-data-context-filter>
    <dsfr-data-context-filter field="statut_public_prive" label="Statut"
      operator="eq" ui="ui-statut">
    </dsfr-data-context-filter>
  </dsfr-data-context>

  <!-- Recapitulatif supprimable des filtres actifs -->
  <dsfr-data-context-tags for="ctx"></dsfr-data-context-tags>

  <dsfr-data-kpi-group per-row="1 md:2" gap="md" aria-label="Indicateurs filtres">
    <dsfr-data-kpi source="par-type" value="nb:sum"
      label="Etablissements retenus" format="nombre" color-token="bleu">
    </dsfr-data-kpi>
    <dsfr-data-kpi source="par-type" value="count"
      label="Groupes type x statut" format="nombre">
    </dsfr-data-kpi>
  </dsfr-data-kpi-group>

  <dsfr-data-chart source="par-type"
    type="bar"
    label-field="type_etablissement"
    value-field="nb"
    series-field="statut_public_prive"
    selected-palette="categorical">
  </dsfr-data-chart>

  <dsfr-data-podium source="par-dept"
    label-field="libelle_departement"
    value-field="nb"
    subtitle="Etablissements recenses"
    value-unit="etablissements"
    max-items="8">
  </dsfr-data-podium>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Un filtre, N sources.</strong> Le contexte diffuse la meme clause a toutes les
      sources qu'il nomme dans <code>sources</code>. Les clauses sont posees en overlay, avec une
      cle stable par filtre, et combinees en ET : elles se fusionnent avec celles des facettes,
      de la recherche et d'une <code>dsfr-data-query</code> au lieu de s'ecraser.
      <br><strong>Le champ filtre doit exister dans les SOURCES</strong>, telles que l'API les
      connait : le filtre part avant tout regroupement. Ni un alias d'agregat (<code>nb</code>),
      ni une colonne calculee en aval n'existent a ce stade — et, sur une source dont le seul
      lecteur regroupe, une colonne absente du <code>group-by</code> n'existe plus non plus.
      Le contexte le dit alors en clair plutot que de filtrer dans le vide : c'est pourquoi
      <code>libelle_region</code> et <code>statut_public_prive</code> sont ranges dans les
      deux regroupements.
      <br><code>apply-to</code> restreint un filtre a certaines sources ; sans lui, il vise
      toutes celles du contexte.
      <br><strong>Nommer ce qu'on compte.</strong> Le second indicateur compte les LIGNES de la
      requete regroupee, c'est-a-dire les couples type x statut — pas les types. Un libelle
      « types representes » aurait annonce neuf la ou la requete en rend quatorze. Le
      <code>where</code> des sources ecarte par ailleurs les etablissements sans statut
      renseigne, qui formaient sinon une troisieme serie anonyme dans la legende.
    </p>
  </div>
</div>`,

  'context-url-sync-dates': `<!--
  Contexte partage — Filtre de date et synchronisation d'URL
  Pipeline : UI native → dsfr-data-context (url-sync) → source → list + kpi
  Source : Annuaire de l'education (OpenDataSoft, data.education.gouv.fr)
  url-sync serialise les filtres dans l'URL : la page filtree se partage
  par simple copie du lien.
-->

<div class="fr-container fr-my-4w">
  <h2>Etablissements ouverts depuis une date</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.education.gouv.fr — Annuaire de l'education
  </p>

  <div class="fr-grid-row fr-grid-row--gutters fr-mb-3w">
    <div class="fr-col-12 fr-col-md-6">
      <label class="fr-label" for="ui-depuis">Ouvert a partir du</label>
      <input id="ui-depuis" class="fr-input" type="date" value="2020-01-01">
    </div>
    <div class="fr-col-12 fr-col-md-6">
      <label class="fr-label" for="ui-type">Type</label>
      <select id="ui-type" class="fr-select">
        <option value="">Tous les types</option>
        <option value="Lycée">Lycee</option>
        <option value="Collège">College</option>
        <option value="Ecole">Ecole</option>
      </select>
    </div>
  </div>

  <!-- url-sync est OPT-IN : il ecrit un parametre d'URL par champ, en
       history.replaceState, et relit ces parametres au chargement. -->
  <dsfr-data-context id="ctx" sources="src" url-sync>
    <dsfr-data-context-filter field="date_ouverture" label="Ouvert depuis"
      operator="gte" ui="ui-depuis">
    </dsfr-data-context-filter>
    <dsfr-data-context-filter field="type_etablissement" label="Type"
      operator="eq" ui="ui-type">
    </dsfr-data-context-filter>
  </dsfr-data-context>

  <dsfr-data-context-tags for="ctx"></dsfr-data-context-tags>

  <dsfr-data-source id="src" api-type="opendatasoft"
    dataset-id="fr-en-annuaire-education"
    base-url="https://data.education.gouv.fr"
    server-side page-size="20">
  </dsfr-data-source>

  <dsfr-data-list source="src"
    columns="nom_etablissement:Etablissement, type_etablissement:Type, libelle_departement:Departement, date_ouverture:Ouverture"
    pagination="20">
  </dsfr-data-list>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Dans CET aperçu, l'URL ne bouge pas.</strong> Le playground rend le code dans un
      iframe sans adresse propre (<code>about:srcdoc</code>) : <code>url-sync</code> n'a pas
      d'URL ou ecrire. Les filtres fonctionnent — la clause envoyee au serveur est bien
      <code>date_ouverture &gt;= "…" AND type_etablissement = "…"</code> — mais la
      synchronisation ne se constate que sur une vraie page. Copiez le code dans un fichier
      HTML pour la voir a l'oeuvre.
      <br><strong>Le piege a deux contextes.</strong> Deux contextes a <code>url-sync</code> qui
      filtrent le MEME champ ecrivent le MEME parametre : le dernier ecrase les autres, et au
      rechargement ils relisent tous la meme valeur — un comparateur se compare alors a lui-meme.
      Un seul contexte dans l'URL, ou <code>url-param-map</code> pour separer les parametres.
      <br><strong>Le type de la colonne compte.</strong> Un controle de formulaire rend toujours
      du TEXTE. Sur une colonne que le jeu publie en ENTIER, le portail compare en texte et ne
      trouve rien — sans erreur. Seuls les codes a zero de tete (01 a 09) sont muets, ce qui
      cache longtemps le defaut.
    </p>
  </div>
</div>`,

  // =====================================================================
  // CARTE ENRICHIE — legende et encarts territoriaux
  // dsfr-data-map-legend rend la legende des couches ; dsfr-data-map-inset
  // ajoute les mini-cartes des territoires hors metropole.
  // =====================================================================

  'map-legend-statut': `<!--
  Carte + legende — Les lycees bretons par statut
  Pipeline : dsfr-data-source → dsfr-data-map → map-layer (color-map) + map-legend
  Source : Annuaire de l'education (OpenDataSoft, data.education.gouv.fr)
  278 lycees : le jeu entier tient sous le plafond de la source, aucune
  troncature silencieuse.
-->

<div class="fr-container fr-my-4w">
  <h2>Les lycees bretons, par statut</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.education.gouv.fr — Annuaire de l'education
  </p>

  <dsfr-data-source id="lycees" api-type="opendatasoft"
    dataset-id="fr-en-annuaire-education"
    base-url="https://data.education.gouv.fr"
    where="type_etablissement = 'Lycée' AND libelle_region = 'Bretagne'">
  </dsfr-data-source>

  <dsfr-data-map center="48.2,-2.9" zoom="8" height="520px"
    name="Lycees de Bretagne par statut">
    <!-- color-field designe la colonne, color-map associe une couleur a
         chaque valeur. La legende se DEDUIT de ce couple : elle n'est pas
         saisie a part, donc elle ne peut pas se desynchroniser. -->
    <dsfr-data-map-layer id="couche" source="lycees" type="circle"
      lat-field="latitude" lon-field="longitude"
      radius="5"
      color-field="statut_public_prive"
      color-map="Public:#000091, Privé:#E1000F"
      fill-opacity="0.7"
      tooltip-field="nom_etablissement">
    </dsfr-data-map-layer>

    <dsfr-data-map-legend for="couche" label="Statut de l'etablissement">
    </dsfr-data-map-legend>

    <dsfr-data-map-popup mode="popup" title-field="nom_etablissement">
      <template>
        <p class="fr-text--sm">{{statut_public_prive}} — {{nom_commune}}</p>
        <p class="fr-text--sm">{{adresse_1}}</p>
      </template>
    </dsfr-data-map-popup>
  </dsfr-data-map>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Une legende qui se deduit ne ment pas.</strong>
      <code>dsfr-data-map-legend</code> lit les couches de la carte et rend leurs entrees :
      classes d'une choroplethe, paires de <code>color-map</code>, ou entree unique d'une couche
      monochrome. Une legende ecrite a la main a cote, elle, survit aux changements de couleurs.
      <br><strong>Regardez la troisieme entree.</strong> La legende affiche « Autres valeurs »
      en plus de Public et Prive : sur les 278 lycees bretons, un etablissement n'a pas de statut
      renseigne. Le <code>color-map</code> ne l'avait pas prevu, la legende le dit quand meme —
      elle decrit ce que la carte CONTIENT, pas ce que l'auteur avait en tete. Une legende
      ecrite a la main aurait affirme « deux statuts » et le point serait passe inapercu.
      <br><code>for</code> designe la couche decrite ; vide, la legende concatene les entrees de
      toutes les couches directes de la carte.
    </p>
  </div>
</div>`,

  'map-inset-drom': `<!--
  Carte + encarts territoriaux — Les lycees des DROM
  Pipeline : dsfr-data-source → dsfr-data-map → map-layer + 5 x map-inset
  Source : Annuaire de l'education (OpenDataSoft, data.education.gouv.fr)
  dsfr-data-map-inset rend une mini-carte par territoire, alimentee par les
  memes couches que la carte hote.
-->

<div class="fr-container fr-my-4w">
  <h2>Les lycees des departements et regions d'outre-mer</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.education.gouv.fr — Annuaire de l'education
  </p>

  <dsfr-data-source id="lycees" api-type="opendatasoft"
    dataset-id="fr-en-annuaire-education"
    base-url="https://data.education.gouv.fr"
    where="type_etablissement = 'Lycée' AND code_region IN ('01','02','03','04','06')">
  </dsfr-data-source>

  <dsfr-data-map center="10,-40" zoom="3" height="420px"
    name="Lycees des DROM">
    <dsfr-data-map-layer id="couche" source="lycees" type="circle"
      lat-field="latitude" lon-field="longitude"
      radius="5"
      color-field="statut_public_prive"
      color-map="Public:#000091, Privé:#E1000F"
      fill-opacity="0.7"
      tooltip-field="nom_etablissement">
    </dsfr-data-map-layer>

    <dsfr-data-map-legend for="couche" label="Statut de l'etablissement">
    </dsfr-data-map-legend>

    <!-- Chaque encart est une mini-carte cadree sur son territoire. Le
         preset « territory » fournit centre, zoom et libelle ; width
         accepte une echelle mobile-first (une colonne sur telephone,
         cinq sur ecran large). -->
    <dsfr-data-map-inset territory="guadeloupe" width="100% md:20%"></dsfr-data-map-inset>
    <dsfr-data-map-inset territory="martinique" width="100% md:20%"></dsfr-data-map-inset>
    <dsfr-data-map-inset territory="guyane" width="100% md:20%"></dsfr-data-map-inset>
    <dsfr-data-map-inset territory="la-reunion" width="100% md:20%"></dsfr-data-map-inset>
    <dsfr-data-map-inset territory="mayotte" width="100% md:20%"></dsfr-data-map-inset>
  </dsfr-data-map>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Les encarts ne sont pas un ornement.</strong> Une carte de France cadree sur la
      metropole laisse cinq departements hors champ : ils ne sont pas « petits », ils sont
      ailleurs. <code>dsfr-data-map-inset</code> leur donne une mini-carte a la bonne echelle,
      alimentee par les MEMES couches — rien a dupliquer, rien a maintenir en double.
      <br>Les presets <code>territory</code> couvrent les DROM, les collectivites et la Corse ;
      <code>center</code> et <code>zoom</code> permettent un cadrage libre pour un zoom local.
    </p>
  </div>
</div>`,

  // =====================================================================
  // FACETTES ET RECHERCHE sur l'annuaire de l'education
  // =====================================================================

  'facets-education': `<!--
  Facettes serveur — Explorer l'annuaire de l'education
  Pipeline : dsfr-data-source (server-side) → dsfr-data-facets → dsfr-data-list
  Source : Annuaire de l'education (OpenDataSoft, data.education.gouv.fr)
  68 000 etablissements : les facettes et la pagination sont deleguees au
  serveur, rien n'est charge d'avance.
-->

<div class="fr-container fr-my-4w">
  <h2>Explorer l'annuaire de l'education</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.education.gouv.fr — Annuaire de l'education (68 583 etablissements)
  </p>

  <dsfr-data-source id="src" api-type="opendatasoft"
    dataset-id="fr-en-annuaire-education"
    base-url="https://data.education.gouv.fr"
    server-side page-size="20">
  </dsfr-data-source>

  <!-- server-facets : les comptes de chaque modalite sont demandes a l'API,
       pas calcules sur une page deja chargee. -->
  <dsfr-data-facets id="filtres" source="src"
    fields="type_etablissement, statut_public_prive, libelle_region"
    labels="type_etablissement:Type | statut_public_prive:Statut | libelle_region:Region"
    server-facets
    cols="4">
  </dsfr-data-facets>

  <dsfr-data-list source="src"
    columns="nom_etablissement:Etablissement, type_etablissement:Type, statut_public_prive:Statut, nom_commune:Commune"
    pagination="20"
    search>
  </dsfr-data-list>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Des facettes calculees sur une page ne sont pas des facettes.</strong> Sans
      <code>server-facets</code>, les comptes porteraient sur les vingt lignes chargees et
      annonceraient « 3 lycees » sur un jeu qui en compte 5 644. Delegues au serveur, ils
      portent sur le jeu filtre entier.
      <br>Les clauses des facettes, de la recherche et d'un <code>dsfr-data-context</code> se
      fusionnent en ET au lieu de s'ecraser : cocher une region et taper un nom restreint les
      deux fois.
      <br><strong>Deux attributs a ne pas confondre.</strong> <code>fields</code> ne prend que
      des noms de colonnes ; les libelles vont dans <code>labels</code>, separes par des barres
      verticales. Et <code>cols</code> est une LARGEUR sur la grille de douze, pas un nombre de
      facettes par ligne : <code>cols="4"</code> en range trois par ligne.
    </p>
  </div>
</div>`,

  // =====================================================================
  // GRIST — dsfr-data-source api-type="grist"
  // L'adaptateur aplatit lui-meme records[].fields : aucun normalize
  // n'est necessaire pour la mise a plat en mode adaptateur.
  // =====================================================================

  'grist-pdm-ve-line': `<!--
  Grist — Part de marche des vehicules electriques, par segment
  Pipeline : dsfr-data-source (grist) → dsfr-data-query → dsfr-data-unpivot
             → dsfr-data-normalize → dsfr-data-chart
  Source : Plan Electrification (grist.numerique.gouv.fr, document public)
  Une table « wide » : une ligne par indicateur, une colonne par mois.
-->

<div class="fr-container fr-my-4w">
  <h2>Part de marche des vehicules electriques, par segment</h2>
  <p class="fr-text--sm fr-text--light">
    Source : SDES, via le document Grist du Plan Electrification
  </p>

  <!-- En mode adaptateur, base-url pointe l'endpoint /records complet.
       L'adaptateur aplatit records[].fields tout seul : les colonnes du
       tableau Grist arrivent directement comme colonnes de lignes. -->
  <dsfr-data-source id="plan" api-type="grist"
    base-url="https://grist.numerique.gouv.fr/api/docs/jGd2ge4dy2ZM/tables/Plan_Elec_Indic_dyanmiques/records">
  </dsfr-data-source>

  <!-- Le tableau melange tous les indicateurs du plan : on retient les
       cinq lignes de part de marche, une par segment de vehicule. -->
  <dsfr-data-query id="pdm" source="plan"
    where="Indicateurs:eq:PDM %25 VE">
  </dsfr-data-query>

  <!-- 44 colonnes mensuelles c2023_01 … c2026_08 depliees en deux
       colonnes (mois, pdm). Un mois de plus dans le document est pris en
       compte sans toucher a ce code : c'est tout l'interet du motif. -->
  <dsfr-data-unpivot id="mensuel" source="pdm"
    id-cols="Sous_theme"
    value-cols-pattern="c{YYYY}_{MM}"
    var-name="mois" var-format="{YYYY}-{MM}"
    value-name="pdm">
  </dsfr-data-unpivot>

  <!-- Les cellules valent « 16,2% » : une CHAINE, virgule decimale et
       signe pourcent. numeric la convertit (16.2) ; sans lui, le
       graphique trierait et additionnerait du texte. -->
  <dsfr-data-normalize id="chiffres" source="mensuel" numeric="pdm">
  </dsfr-data-normalize>

  <dsfr-data-chart source="chiffres"
    type="line"
    label-field="mois"
    value-field="pdm"
    series-field="Sous_theme"
    unit-tooltip="%"
    selected-palette="categorical">
  </dsfr-data-chart>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Grist publie ce qu'une equipe saisit, pas ce qu'une API normalise.</strong>
      Les valeurs arrivent en texte francais (« 16,2% »), les libelles portent leurs
      coquilles, et plusieurs lignes partagent le meme nom d'indicateur — c'est
      <code>Sous_theme</code> qui les distingue. Ces trois traits sont la regle sur un
      document collaboratif, pas l'exception : le <code>numeric</code> et le
      <code>series-field</code> ci-dessus ne sont pas des precautions, ce sont les gestes
      normaux.
      <br><strong>Un pourcent litteral dans un <code>where</code> s'echappe.</strong> Le
      dialecte colon decode les sequences pourcent : « PDM % VE » s'ecrit
      <code>PDM %25 VE</code>, comme un <code>:</code> s'ecrit <code>%3A</code> et un
      <code>|</code> <code>%7C</code>.
    </p>
  </div>
</div>`,

  'grist-catalogue-list': `<!--
  Grist — Le catalogue des indicateurs d'un document collaboratif
  Pipeline : dsfr-data-source (grist) → dsfr-data-normalize (compute) → dsfr-data-list
  Source : Plan Electrification (grist.numerique.gouv.fr, document public)
  Montre ce qu'un document Grist rend tel quel, avant toute dataviz.
-->

<div class="fr-container fr-my-4w">
  <h2>Les indicateurs du Plan Electrification</h2>
  <p class="fr-text--sm fr-text--light">
    Source : grist.numerique.gouv.fr — document public du Plan Electrification
  </p>

  <dsfr-data-source id="plan" api-type="grist"
    base-url="https://grist.numerique.gouv.fr/api/docs/jGd2ge4dy2ZM/tables/Plan_Elec_Indic_dyanmiques/records">
  </dsfr-data-source>

  <!-- « Nombre immatriculations VE » apparait cinq fois : une par segment.
       Le libelle seul ne designe donc rien. compute fabrique la colonne
       qui identifie vraiment une serie, en concatenant les deux champs. -->
  <!-- trim ecarte les espaces de saisie (« … 12 mois) » avec un blanc
       final) ; a_libelle marque les lignes de separation, que le document
       laisse a blanc. -->
  <dsfr-data-normalize id="series" source="plan"
    trim
    compute="a_libelle = when is_empty(Indicateurs) then 0 else 1; serie = Indicateurs + ' — ' + Sous_theme">
  </dsfr-data-normalize>

  <dsfr-data-query id="renseignes" source="series"
    where="a_libelle:eq:1"
    order-by="Theme:asc">
  </dsfr-data-query>

  <dsfr-data-list source="renseignes"
    columns="Theme:Theme, serie:Serie, Source:Source, Derniere_mise_a_jour:Mise a jour"
    pagination="15"
    search>
  </dsfr-data-list>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Un libelle n'est pas un identifiant.</strong> « Nombre immatriculations VE »
      figure cinq fois dans ce document, une fois par segment de vehicule. Brancher un
      graphique sur cette colonne empilerait cinq series sous un seul nom, sans rien signaler.
      La colonne calculee par <code>compute</code> — <code>Indicateurs + ' — ' + Sous_theme</code>
      — rend l'identite explicite avant qu'un affichage en depende.
      <br><strong>Aucun <code>flatten</code> n'a ete necessaire.</strong> En mode adaptateur,
      Grist aplatit <code>records[].fields</code> de lui-meme. Le <code>flatten</code> de
      <code>dsfr-data-normalize</code> ne sert qu'en mode URL brute (attribut <code>url</code>
      sans <code>api-type</code>), ou la reponse arrive telle quelle.
      <br><strong>Une cellule vide n'est pas une cellule nulle.</strong> Vingt-huit des
      cinquante-sept lignes de ce document sont des separateurs laisses a blanc.
      <code>where="Indicateurs:isnotnull"</code> les garde TOUTES : la chaine vide n'est pas
      <code>null</code>. Et comme <code>order-by="Theme:asc"</code> range le vide en tete, la
      premiere page du tableau n'affichait que des tirets. Le filtre correct passe par
      <code>is_empty()</code>, qui couvre le null, la chaine vide et le tableau vide.
      <br>Le document est lu en LECTURE SEULE et sans jeton : il est public. Un document
      prive demanderait un <code>Authorization: Bearer</code>, visible dans le source de la
      page — a reserver aux cles a acces restreint ou aux contextes proteges.
    </p>
  </div>
</div>`,

  // =====================================================================
  // HABILLAGE DES KPI ET DES PODIUMS (#967, #966)
  // Icone, lisere, teinte, couleurs illustratives ; estrade, pastille,
  // orientation, barre sur trois axes.
  // =====================================================================

  'kpi-habillage': `<!--
  KPI — La planche d'habillage : icone, lisere, teinte
  Mode direct : dsfr-data-source (data inline) → dsfr-data-kpi-group
  Donnees en dur : l'exemple porte sur la FORME, pas sur le pipeline.
  Chaque carte isole un reglage, pour comparer d'un coup d'oeil.
-->

<div class="fr-container fr-my-4w">
  <h2>Habillage des indicateurs</h2>
  <p class="fr-text--sm fr-text--light">
    Un même chiffre, huit habillages. Icône, position, liseré, teinte.
  </p>

  <dsfr-data-source id="d" data='[{"n":12463,"pct":38.2,"eur":248900}]'>
  </dsfr-data-source>

  <h3 class="fr-h6 fr-mt-3w">Où se place l'icône</h3>
  <dsfr-data-kpi-group per-row="1 md:3" gap="md" aria-label="Position de l'icône">
    <dsfr-data-kpi source="d" value="n" format="nombre"
      heading="Position par défaut"
      label="icon-position=&quot;label&quot;"
      icon="fr-icon-user-line">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="d" value="n" format="nombre"
      heading="En tête de carte"
      label="icon-position=&quot;top&quot; icon-size=&quot;md&quot;"
      icon="fr-icon-user-line" icon-position="top" icon-size="md"
      color-token="blue-cumulus">
    </dsfr-data-kpi>

    <dsfr-data-kpi source="d" value="n" format="nombre"
      heading="Dans la marge"
      label="icon-position=&quot;right&quot;"
      icon="fr-icon-user-line" icon-position="right" icon-size="md"
      color-token="green-emeraude">
    </dsfr-data-kpi>
  </dsfr-data-kpi-group>

  <h3 class="fr-h6 fr-mt-4w">Ce que trace le liseré</h3>
  <dsfr-data-kpi-group per-row="2 md:4" gap="md" aria-label="Tracé du liseré">
    <dsfr-data-kpi source="d" value="pct" format="pourcentage"
      label="border=&quot;left&quot; (défaut)" color-token="purple-glycine">
    </dsfr-data-kpi>
    <dsfr-data-kpi source="d" value="pct" format="pourcentage"
      label="border=&quot;top&quot;" border="top" color-token="purple-glycine">
    </dsfr-data-kpi>
    <dsfr-data-kpi source="d" value="pct" format="pourcentage"
      label="border=&quot;outline&quot;" border="outline" color-token="purple-glycine">
    </dsfr-data-kpi>
    <dsfr-data-kpi source="d" value="pct" format="pourcentage"
      label="border=&quot;left-short&quot;" border="left-short" color-token="purple-glycine">
    </dsfr-data-kpi>
  </dsfr-data-kpi-group>

  <h3 class="fr-h6 fr-mt-4w">Le fond teinté</h3>
  <dsfr-data-kpi-group per-row="1 md:3" gap="md" aria-label="Fond teinté">
    <dsfr-data-kpi source="d" value="eur" format="euro"
      heading="Le plus clair"
      label="tint=&quot;975&quot; border=&quot;none&quot;"
      tint="975" border="none" color-token="orange-terre-battue"
      icon="fr-icon-money-euro-circle-line" icon-position="top">
    </dsfr-data-kpi>
    <dsfr-data-kpi source="d" value="eur" format="euro"
      heading="Par défaut"
      label="tint border=&quot;none&quot;"
      tint border="none" color-token="orange-terre-battue"
      icon="fr-icon-money-euro-circle-line" icon-position="top">
    </dsfr-data-kpi>
    <dsfr-data-kpi source="d" value="eur" format="euro"
      heading="Le plus soutenu"
      label="tint=&quot;925&quot; border=&quot;none&quot;"
      tint="925" border="none" color-token="orange-terre-battue"
      icon="fr-icon-money-euro-circle-line" icon-position="top">
    </dsfr-data-kpi>
  </dsfr-data-kpi-group>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Aucun hexadécimal dans tout cet habillage.</strong> Les couleurs passent par les
      tokens DSFR (<code>--border-plain-*</code>, <code>--background-contrast-*</code>) :
      le mode sombre suit sans travail, et une page ne peut pas dériver du système.
      <br><strong>La valeur reste en gris titre</strong>, même sur fond teinté. Les teintes
      pleines claires — tournesol, café-crème, galet — ne tiennent pas le contraste pour du
      texte : la contrainte est dans le composant, pas dans la vigilance de l'auteur.
      <br><strong>Le pictogramme, lui, n'est pas démontrable ici.</strong> <code>picto</code>
      rend un <code>fr-artwork</code> dont l'adresse vient de <code>picto-base</code>, et
      <code>&lt;use href&gt;</code> n'accepte pas une autre origine (aucun CORS sur
      <code>use</code>). Il faut donc servir une copie de <code>dist/artwork/pictograms/</code>
      depuis votre propre domaine ; ce playground charge le DSFR depuis un CDN, donc rien ne
      s'afficherait.
    </p>
  </div>
</div>`,

  'kpi-etat-vs-categorie': `<!--
  KPI — Une couleur d'ETAT et une couleur de CATEGORIE ne disent pas la meme chose
  Pipeline : dsfr-data-source → dsfr-data-query (group-by) → dsfr-data-kpi-group
  Source : Annuaire de l'education (OpenDataSoft, data.education.gouv.fr)
  Les seuils posent un etat ; les couleurs illustratives posent un theme.
-->

<div class="fr-container fr-my-4w">
  <h2>État ou catégorie : deux familles de couleurs</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.education.gouv.fr — Annuaire de l'éducation
  </p>

  <dsfr-data-source id="etab" api-type="opendatasoft"
    dataset-id="fr-en-annuaire-education"
    base-url="https://data.education.gouv.fr"
    where="statut_public_prive is not null">
  </dsfr-data-source>

  <dsfr-data-query id="par-statut" source="etab"
    group-by="statut_public_prive"
    aggregate="statut_public_prive:count:nb"
    order-by="nb:desc">
  </dsfr-data-query>

  <h3 class="fr-h6 fr-mt-3w">Un ÉTAT — porté par les seuils</h3>
  <p class="fr-text--sm">
    La couleur est calculée à partir de la valeur. Elle est aussi annoncée aux lecteurs d'écran
    (« état bon »), donc elle doit vouloir dire quelque chose.
  </p>
  <dsfr-data-kpi-group per-row="1 md:3" gap="md" aria-label="Indicateurs d'état">
    <dsfr-data-kpi source="par-statut" value="nb:sum"
      heading="Volume" label="Établissements recensés" format="nombre"
      threshold-green="50000" threshold-orange="20000"
      icon="fr-icon-school-line" icon-position="top">
    </dsfr-data-kpi>
    <dsfr-data-kpi source="par-statut" value="nb:max"
      heading="Volume" label="Plus grand statut" format="nombre"
      threshold-green="50000" threshold-orange="20000"
      icon="fr-icon-school-line" icon-position="top">
    </dsfr-data-kpi>
    <dsfr-data-kpi source="par-statut" value="nb:min"
      heading="Volume" label="Plus petit statut" format="nombre"
      threshold-green="50000" threshold-orange="20000"
      icon="fr-icon-school-line" icon-position="top">
    </dsfr-data-kpi>
  </dsfr-data-kpi-group>

  <h3 class="fr-h6 fr-mt-4w">Une CATÉGORIE — posée par l'auteur</h3>
  <p class="fr-text--sm">
    La couleur identifie un thème, pas une performance. Les mêmes chiffres, sans aucun jugement.
  </p>
  <dsfr-data-kpi-group per-row="1 md:3" gap="md" aria-label="Indicateurs par thème">
    <dsfr-data-kpi source="par-statut" value="nb:sum"
      heading="Éducation" label="Établissements recensés" format="nombre"
      color-token="blue-cumulus" tint border="none"
      icon="fr-icon-school-line" icon-position="top">
    </dsfr-data-kpi>
    <dsfr-data-kpi source="par-statut" value="nb:max"
      heading="Éducation" label="Plus grand statut" format="nombre"
      color-token="blue-cumulus" tint border="none"
      icon="fr-icon-school-line" icon-position="top">
    </dsfr-data-kpi>
    <dsfr-data-kpi source="par-statut" value="nb:min"
      heading="Éducation" label="Plus petit statut" format="nombre"
      color-token="blue-cumulus" tint border="none"
      icon="fr-icon-school-line" icon-position="top">
    </dsfr-data-kpi>
  </dsfr-data-kpi-group>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Deux familles, deux sens.</strong> Les quatre tokens sémantiques — vert, orange,
      rouge, bleu — disent un ÉTAT, et c'est ce que le libellé accessible annonce. Les dix-sept
      couleurs illustratives disent une CATÉGORIE et n'annoncent rien.
      <br><strong>Le contresens à éviter :</strong> un indicateur en rouge illustratif
      (<code>pink-tuile</code>) qui ne veut pas dire « mauvais ». Un lecteur y lira une alerte.
      L'état reste aux tokens sémantiques ; le thème aux couleurs illustratives.
      <br>Les seuils ci-dessus (<code>threshold-green</code>, <code>threshold-orange</code>) sont
      posés pour la démonstration : un vrai seuil se justifie, sinon il fabrique un jugement à
      partir de rien.
    </p>
  </div>
</div>`,

  'podium-estrade': `<!--
  Podium — Estrade 2-1-3, pastilles de rang, orientation verticale
  Pipeline : dsfr-data-source → dsfr-data-query (group-by) → dsfr-data-podium
  Source : Annuaire de l'education (OpenDataSoft, data.education.gouv.fr)
  Le meme classement, trois mises en forme.
-->

<div class="fr-container fr-my-4w">
  <h2>Un classement, trois mises en forme</h2>
  <p class="fr-text--sm fr-text--light">
    Source : data.education.gouv.fr — Annuaire de l'éducation
  </p>

  <dsfr-data-source id="etab" api-type="opendatasoft"
    dataset-id="fr-en-annuaire-education"
    base-url="https://data.education.gouv.fr"
    where="type_etablissement = 'Lycée'">
  </dsfr-data-source>

  <dsfr-data-query id="top" source="etab"
    group-by="libelle_region"
    aggregate="libelle_region:count:nb"
    order-by="nb:desc"
    limit="6">
  </dsfr-data-query>

  <h3 class="fr-h6 fr-mt-3w">Estrade — le premier au centre</h3>
  <dsfr-data-podium source="top"
    label-field="libelle_region" value-field="nb"
    value-unit="lycées"
    layout="podium" rank="medal" max-items="6">
  </dsfr-data-podium>

  <h3 class="fr-h6 fr-mt-4w">Colonnes verticales</h3>
  <dsfr-data-podium source="top"
    label-field="libelle_region" value-field="nb"
    value-unit="lycées"
    orientation="vertical" rank="medal" max-items="6">
  </dsfr-data-podium>

  <h3 class="fr-h6 fr-mt-4w">Liste sans rang — l'ordre et la barre suffisent</h3>
  <dsfr-data-podium source="top"
    label-field="libelle_region" value-field="nb"
    subtitle="Lycées recensés" value-unit="lycées"
    rank="none" bar-position="between" border="none" max-items="6">
  </dsfr-data-podium>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>L'estrade est purement visuelle.</strong> <code>layout="podium"</code> place le
      premier au centre par <code>order</code> CSS : le DOM reste dans l'ordre 1‑2‑3. Un lecteur
      d'écran et la navigation clavier parcourent donc le classement dans le bon ordre, pas dans
      l'ordre des colonnes. Les items au-delà du troisième passent en liste compacte sous
      l'estrade, dans la même liste ordonnée.
      <br><strong>La pastille choisit son encre par calcul.</strong> En <code>rank="medal"</code>,
      la couleur du chiffre est décidée par luminance relative WCAG — la rampe s'éclaircit, et du
      blanc dès son quatrième ton serait illisible. Le chiffre reste <code>aria-hidden</code> :
      l'ordre est porté par la position dans la liste, le chiffre n'en est qu'un rappel.
      <br><strong>Le rang n'est pas obligatoire.</strong> <code>rank="none"</code> laisse l'ordre
      et la barre faire le travail — souvent plus lisible quand les écarts parlent d'eux-mêmes.
    </p>
  </div>
</div>`,

  'podium-barre-et-vignettes': `<!--
  Podium — La barre sur trois axes, et des vignettes par ligne
  Mode direct : dsfr-data-source (data inline) → dsfr-data-podium
  bar (ce qu'elle porte), bar-position (ou elle est), border (le lisere)
  sont TROIS reglages independants.
-->

<div class="fr-container fr-my-4w">
  <h2>La barre, le liseré et la vignette</h2>
  <p class="fr-text--sm fr-text--light">
    Données en dur — taux de conformité RGAA déclarés, en pourcentage.
  </p>

  <!-- icon-field : chaque ligne porte SA classe d'icône. La valeur est
       contrainte a ^(fr-icon|ri)-[a-z0-9-]+$ : ce qui vient de la donnée
       ne pose jamais qu'une classe CSS, jamais du balisage. -->
  <dsfr-data-source id="sites" data='[
    {"nom":"Portail des démarches","score":94,"famille":"Services en ligne","ico":"fr-icon-computer-line"},
    {"nom":"Annuaire des services","score":88,"famille":"Référentiels","ico":"fr-icon-book-2-line"},
    {"nom":"Observatoire des données","score":81,"famille":"Données ouvertes","ico":"fr-icon-line-chart-line"},
    {"nom":"Espace agents","score":73,"famille":"Intranet","ico":"fr-icon-team-line"},
    {"nom":"Cartographie du territoire","score":66,"famille":"Cartographie","ico":"fr-icon-map-pin-2-line"}
  ]'>
  </dsfr-data-source>

  <h3 class="fr-h6 fr-mt-3w">Barre proportionnelle, façon graphique en barres</h3>
  <dsfr-data-podium source="sites"
    label-field="nom" value-field="score" subtitle-field="famille"
    icon-field="ico"
    value-unit="/ 100" bar-max="100"
    bar-position="between" max-items="5">
  </dsfr-data-podium>

  <h3 class="fr-h6 fr-mt-4w">Barre pleine — seule la couleur classe</h3>
  <dsfr-data-podium source="sites"
    label-field="nom" value-field="score" subtitle-field="famille"
    icon-field="ico"
    value-unit="/ 100" bar-max="100"
    bar="full" rank="medal" border="none" max-items="5">
  </dsfr-data-podium>

  <h3 class="fr-h6 fr-mt-4w">Sans barre, liseré seul</h3>
  <dsfr-data-podium source="sites"
    label-field="nom" value-field="score" subtitle-field="famille"
    icon-field="ico"
    value-unit="/ 100" bar-max="100"
    bar="none" max-items="5">
  </dsfr-data-podium>

  <div class="fr-callout fr-mt-4w">
    <p class="fr-callout__text">
      <strong>Trois réglages indépendants, et une règle.</strong> <code>bar</code> dit ce que la
      barre PORTE (proportionnelle, pleine, aucune), <code>bar-position</code> dit OÙ elle est,
      <code>border</code> ne pose qu'une couleur. La règle : <strong>la barre porte la donnée, le
      liseré ne porte que la couleur.</strong> Un liseré de longueur variable laisserait croire à
      une mesure.
      <br><strong><code>bar-max="100"</code> est ce qui rend ces barres comparables.</strong> Sans
      lui, la plus grande valeur du jeu ferait la barre pleine : un premier à 66 % occuperait toute
      la largeur, comme un premier à 94 %. Sur une échelle bornée — un pourcentage, une note sur
      100 — forcer le maximum est ce qui empêche de lire un écart qui n'existe pas.
      <br><strong>Ce que coûte <code>bar-position="between"</code> :</strong> il fixe la colonne
      de libellé à 130 px pour aligner toutes les barres sur la même origine — c'est ce qui rend
      la comparaison possible, et c'est aussi ce qui tronque « Portail des démarches » en
      « Portail des dé… ». Sur des libellés longs, <code>inline</code> (le défaut) leur laisse
      toute la largeur, au prix d'une origine de barre qui ne s'aligne plus.
      <br><strong>Vignettes :</strong> <code>icon-field</code> lit une classe d'icône par ligne ;
      <code>image-field</code> fait de même avec l'URL d'un logo ou d'un blason, en vignette de
      40 px, carrée ou ronde (<code>image-shape</code>). Les deux sont exclusifs — si les deux sont
      posés, l'image l'emporte et le cumul est signalé.
    </p>
  </div>
</div>`,
};
