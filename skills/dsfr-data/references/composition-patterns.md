# Patterns de composition

> Assembler source, query et visualisations en dashboards
>
> Déclencheurs : dashboard, tableau de bord, assembler, combiner, pipeline, plusieurs, ensemble, complet, page, embarquer, integrer

## Patterns de composition dsfr-data

### REGLE IMPORTANTE : privilegier les sources dynamiques
1. **Source API dynamique** (ODS, Tabular, INSEE) = premier choix. Les données se mettent a jour automatiquement, la pagination serveur est geree, les agrégations et filtres sont delegues au serveur.
2. **Grist** = excellent choix pour les données collaboratives (tableaux partages). Suggerer a l'utilisateur de publier ses données sur grist.numerique.gouv.fr s'il n'a pas d'API.
3. **Données embarquees** (data='[...]') = dernier recours uniquement. Les données sont figees et alourdissent le HTML.

### REGLE IMPORTANTE : deleguer le travail au serveur
Preferer 3 `dsfr-data-source` bien cibles (avec select, where, group-by cote serveur) plutot qu'un seul source qui fetch tout sans filtre. Chainer les `dsfr-data-query` pour affiner :
- `dsfr-data-source` avec `select`, `where`, `group-by` cote serveur → reduit le volume transfere
- `dsfr-data-query` en chaine pour transformer/filtrer/agréger le resultat
- Chaque visualisation peut avoir sa propre query pointant vers la même source

### Architecture : composants freres lies par ID
Les composants dsfr-data sont des elements HTML freres (pas imbriques).
Ils communiquent via un bus evenementiel interne : `source="id-de-la-source"`.
```
<dsfr-data-source id="X">   --dispatch-->   <dsfr-data-query source="X">   --dispatch-->   <dsfr-data-chart source="...">
```

### Pipeline standard : Source -> Query -> Visualisation
```html
<dsfr-data-source id="data"
  url="https://api.exemple.fr/records"
  transform="results">
</dsfr-data-source>

<dsfr-data-query id="top10" source="data"
  group-by="region"
  aggregate="population:sum"
  order-by="population__sum:desc"
  limit="10">
</dsfr-data-query>

<dsfr-data-chart source="top10" type="bar"
  label-field="region" value-field="population__sum"
  selected-palette="categorical">
</dsfr-data-chart>
```

### Accessibilité : ajouter dsfr-data-a11y
Pour ameliorer l'accessibilité, ajoutez `dsfr-data-a11y` apres chaque visualisation :
```html
<dsfr-data-chart id="mon-graph" source="top10" type="bar"
  label-field="region" value-field="population__sum">
</dsfr-data-chart>
<dsfr-data-a11y for="mon-graph" source="top10" table download></dsfr-data-a11y>
```
L'attribut `for` injecte un skip link et pose `aria-describedby` + `aria-details` sur le graphique cible.

### Pipeline simplifie : Source -> Visualisation (sans transformation)
```html
<dsfr-data-source id="data" url="https://api.fr/records" transform="results"></dsfr-data-source>
<dsfr-data-chart source="data" type="line" label-field="date" value-field="valeur"></dsfr-data-chart>
```

### Multi-consommation : 1 source -> N visualisations
```html
<dsfr-data-source id="sites" url="https://api.fr/sites" transform="results"></dsfr-data-source>

<!-- KPIs -->
<dsfr-data-kpi source="sites" valeur="count:status:active" label="Sites actifs" couleur="vert"></dsfr-data-kpi>
<dsfr-data-kpi source="sites" valeur="avg:score_rgaa" label="Score RGAA moyen" format="pourcentage" seuil-vert="80" seuil-orange="50"></dsfr-data-kpi>

<!-- Graphique -->
<dsfr-data-chart source="sites" type="bar" label-field="ministere" value-field="score_rgaa" selected-palette="categorical"></dsfr-data-chart>

<!-- Tableau -->
<dsfr-data-list source="sites" colonnes="nom:Nom, ministere:Ministere, score_rgaa:Score" recherche filtres="ministere" tri="score_rgaa:desc" pagination="20" export="csv"></dsfr-data-list>
```

### Chainabilite des queries
```html
<dsfr-data-source id="raw" url="..." transform="data"></dsfr-data-source>
<dsfr-data-query id="actifs" source="raw" where="status:eq:active"></dsfr-data-query>
<dsfr-data-query id="top5" source="actifs" group-by="region" aggregate="montant:sum" order-by="montant__sum:desc" limit="5"></dsfr-data-query>
<dsfr-data-chart source="top5" type="pie" label-field="region" value-field="montant__sum"></dsfr-data-chart>
```

### Pipeline Grist : Source(api-type=grist) -> Query -> Visualisation

dsfr-data-source avec `api-type="grist"` fetch et aplatit automatiquement `records[].fields`.
L'adapter choisit entre mode Records (filter/sort/pagination) et mode SQL (group-by, aggregation, facettes).

```html
<dsfr-data-source id="src" api-type="grist"
  base-url="https://chartsbuilder.matge.com/grist-gouv-proxy/api/docs/DOC_ID/tables/TABLE/records"
  headers='{"Authorization":"Bearer API_KEY"}'>
</dsfr-data-source>
<dsfr-data-query id="data" source="src"
  group-by="region"
  aggregate="population:sum"
  order-by="population__sum:desc"
  limit="10">
</dsfr-data-query>

<dsfr-data-chart source="data" type="bar"
  label-field="region" value-field="population__sum"
  selected-palette="categorical">
</dsfr-data-chart>
```

### Pipeline Grist avec facettes :
```html
<dsfr-data-source id="src" api-type="grist"
  base-url="https://chartsbuilder.matge.com/grist-gouv-proxy/api/docs/DOC_ID/tables/TABLE/records"
  headers='{"Authorization":"Bearer API_KEY"}'>
</dsfr-data-source>

<dsfr-data-facets id="filtered" source="src"
  fields="catégorie, region"
  labels="catégorie:Catégorie | region:Region">
</dsfr-data-facets>

<dsfr-data-display source="filtered" cols="3" pagination="12">
  <template>
    <div class="fr-card">
      <div class="fr-card__body">
        <div class="fr-card__content">
          <h3 class="fr-card__title">{{nom}}</h3>
          <p class="fr-badge fr-badge--sm">{{catégorie}}</p>
        </div>
      </div>
    </div>
  </template>
</dsfr-data-display>
```

### IMPORTANT : Source ODS v1 ou Airtable (données imbriquees)
Si la source utilise `transform="records"` et que les données sont sous `fields`,
ajouter `<dsfr-data-normalize flatten="fields" trim numeric-auto>` apres la source.
Les noms de champs doivent etre les noms APLATIS (ex: `Departement`) et non les chemins imbriques (`fields.Departement`).

### Pipeline avec recherche : Source -> Search -> Facets -> Visualisation
```html
<dsfr-data-source id="data" url="https://api.exemple.fr/records" transform="results"></dsfr-data-source>
<dsfr-data-normalize id="clean" source="data" trim></dsfr-data-normalize>

<dsfr-data-search id="searched" source="clean"
  fields="nom, description"
  placeholder="Rechercher..."
  operator="words" count>
</dsfr-data-search>

<dsfr-data-facets id="filtered" source="searched"
  fields="catégorie, region">
</dsfr-data-facets>

<dsfr-data-display source="filtered" cols="3" pagination="12">
  <template>
    <div class="fr-card">
      <div class="fr-card__body">
        <div class="fr-card__content">
          <h3 class="fr-card__title">{{nom}}</h3>
          <p class="fr-badge fr-badge--sm">{{catégorie}}</p>
        </div>
      </div>
    </div>
  </template>
</dsfr-data-display>
```

La recherche et les facettes se combinent : la recherche reduit le jeu,
les facettes affinent. Les KPI et graphiques en aval se mettent a jour en temps reel.

### Format de sortie : snippet embarquable (PAS une page HTML complete)
Le code généré doit etre un **snippet** pret a copier-coller dans une page existante.
- **NE PAS** générer `<!DOCTYPE html>`, `<html>`, `<head>`, `<body>` ni `<meta>`.
- Générer uniquement : les dependances CDN (liens CSS + scripts) puis les composants HTML.
- L'utilisateur collera ce snippet dans sa propre page.

### Dependances CDN requises
Toujours inclure ces 6 dependances dans cet ordre exact :
```html
<!-- CSS DSFR (obligatoire) -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14.4/dist/dsfr.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14.4/dist/utility/utility.min.css">

<!-- DSFR Chart (obligatoire pour les graphiques) -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@2.1.1/dist/DSFRChart/DSFRChart.css">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script type="module" src="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@2.1.1/dist/DSFRChart/DSFRChart.js"></script>

<!-- dsfr-data (obligatoire) -->
<script src="https://cdn.jsdelivr.net/npm/dsfr-data@0/dist/dsfr-data.core.umd.js"></script>
```

### Exemple de snippet complet
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14.4/dist/dsfr.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14.4/dist/utility/utility.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@2.1.1/dist/DSFRChart/DSFRChart.css">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script type="module" src="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@2.1.1/dist/DSFRChart/DSFRChart.js"></script>
<script src="https://cdn.jsdelivr.net/npm/dsfr-data@0/dist/dsfr-data.core.umd.js"></script>

<dsfr-data-source id="data" url="VOTRE_URL_API" transform="results"></dsfr-data-source>
<dsfr-data-chart source="data" type="bar" label-field="CHAMP_LABEL" value-field="CHAMP_VALEUR"></dsfr-data-chart>
```

### Pattern avec habillage DataBox

Utiliser ce pattern quand l'utilisateur demande un graphique "presentable", "publiable",
"avec un titre", un export CSV/screenshot, un mode plein écran, ou un cadre editorial.

```html
<dsfr-data-source id="src" api-type="opendatasoft"
  base-url="https://data.economie.gouv.fr"
  dataset-id="population-dept">
</dsfr-data-source>
<dsfr-data-query id="data" source="src"
  group-by="region" aggregate="population:sum:total"
  order-by="total:desc">
</dsfr-data-query>
<dsfr-data-chart id="chart" source="data" type="bar"
  label-field="region" value-field="total"
  databox databox-title="Population par region"
  databox-source="INSEE via data.economie.gouv.fr"
  databox-date="2024"
  databox-download databox-screenshot>
</dsfr-data-chart>
<dsfr-data-a11y for="chart" source="data"
  description="L'Ile-de-France domine largement.">
</dsfr-data-a11y>
```
