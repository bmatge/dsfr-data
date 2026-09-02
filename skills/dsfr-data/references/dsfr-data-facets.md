# dsfr-data-facets

> Filtres a facettes interactifs pour exploration de données
>
> Déclencheurs : facette, facets, filtre interactif, catégorie, refinement, exploration, filtrer par

## <dsfr-data-facets> - Filtres a facettes

Composant visuel intermediaire qui affiche des filtres interactifs (checkboxes) bases sur les valeurs
categoriques des données. Se place entre une source/normalize/query et les composants de visualisation.

### Position dans le pipeline
```
dsfr-data-source -> dsfr-data-normalize -> dsfr-data-facets -> dsfr-data-chart / dsfr-data-list
```
Les données filtrees sont redistribuees automatiquement aux composants en aval.

### Format des données
Entree : tableau d'objets (fourni par dsfr-data-source, dsfr-data-normalize ou dsfr-data-query).
Sortie : même tableau, filtre selon les selections de l'utilisateur.

### Attributs
| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| id | String | - | oui | Identifiant unique. Sans cet attribut, dsfr-data-facets affiche une alerte DSFR `fr-alert--warning` au lieu des facettes (et pose `data-dsfr-config-error` pour le debug). |
| source | String | `""` | oui | ID de la source a ecouter |
| fields | String | `""` | non | Champs a exposer comme facettes (virgule-separes). Vide = auto-detection |
| labels | String | `""` | non | Labels custom : `"field:Label | field2:Label 2"` (pipe-separe) |
| max-values | Number | `6` | non | Nb de valeurs visibles par facette avant "Voir plus" |
| disjunctive | String | `""` | non | Champs en mode multi-selection OU (virgule-separes) |
| sort | String | `"count"` | non | Tri des valeurs : count, -count, alpha, -alpha |
| searchable | String | `""` | non | Champs avec barre de recherche (virgule-separes) |
| hide-empty | Boolean | `false` | non | Masquer les facettes avec une seule valeur |
| display | String | `""` | non | Mode d'affichage par facette : `"field:select | field2:multiselect"`. Modes : checkbox (défaut), select, multiselect, radio |
| hide-counts | Boolean | `false` | non | Masquer les compteurs (N) a cote de chaque valeur de facette |
| url-params | Boolean | `false` | non | Active la lecture des parametres d'URL comme pre-selections de facettes |
| url-param-map | String | `""` | non | Mapping URL param -> champ : `"r:region | t:type"`. Si vide, correspondance directe |
| url-sync | Boolean | `false` | non | Synchronise l'URL quand l'utilisateur change les facettes (replaceState) |
| server-facets | Boolean | `false` | non | Active le mode facettes serveur ODS. Fetch les valeurs depuis l'API ODS /facets. Requiert une source dsfr-data-source api-type="opendatasoft" server-side (directement ou via un dsfr-data-query, qui relaie automatiquement). En mode server-facets, fields est obligatoire |
| static-values | String | `""` | non | Valeurs de facettes pre-calculees en JSON : `'{"region":["IDF","PACA"],"type":["Commune"]}')`. Les selections envoient des commandes WHERE en colon syntax au dsfr-data-query. Compteurs masques automatiquement. Utile pour Tabular/Grist/generique qui n'ont pas d'API facettes serveur |
| cols | String | `""` | non | Colonnage DSFR : `"6"` (global, 2/ligne), `"4"` (3/ligne), ou par facette `"region:4 | type:6"` (défaut fr-col-6 pour non-specifies) |

### Modes d'affichage
- **checkbox** (défaut) : fieldset DSFR avec checkboxes, compteurs, "Voir plus/moins", recherche optionnelle
- **select** : liste deroulante DSFR standard, selection exclusive (une seule valeur)
- **multiselect** : dropdown collapsible avec checkboxes DSFR, recherche integree, bouton "Tout sélectionner/deselectionner"
- **radio** : dropdown collapsible avec radio buttons DSFR, recherche integree, selection exclusive

Le mode `select` rend la facette automatiquement exclusive.
Le mode `radio` rend la facette automatiquement exclusive.
Le mode `multiselect` rend la facette automatiquement disjonctive (multi-selection OU).

### Logique de filtrage
- Intra-facette : OU (afficher les lignes qui matchent l'une des valeurs selectionnees)
- Inter-facettes : ET (toutes les facettes doivent matcher)
- Les compteurs se recalculent dynamiquement selon les selections

### Auto-detection
Si `fields` est omis, le composant détecté automatiquement les champs categoriques :
champs de type string avec 2 a 50 valeurs uniques (exclut les champs ID-like).

### Exemples
```html
<!-- Facettes avec auto-detection -->
<dsfr-data-source id="raw" url="https://api.fr/data" transform="data"></dsfr-data-source>
<dsfr-data-normalize id="clean" source="raw" trim numeric-auto></dsfr-data-normalize>
<dsfr-data-facets id="filtered" source="clean"></dsfr-data-facets>
<dsfr-data-list source="filtered"></dsfr-data-list>

<!-- Facettes explicites avec labels custom -->
<dsfr-data-facets id="filtered" source="clean"
  fields="region, type_etablissement, statut"
  labels="region:Region | type_etablissement:Type | statut:Statut"
  searchable="region"
  max-values="10">
</dsfr-data-facets>
<dsfr-data-chart source="filtered" type="bar" label-field="region" value-field="count"></dsfr-data-chart>

<!-- Modes d'affichage mixtes -->
<dsfr-data-facets id="filtered" source="clean"
  fields="region, departement, statut"
  display="region:select | departement:multiselect"
  labels="region:Region | departement:Departement | statut:Statut">
</dsfr-data-facets>

<!-- Pre-selection via URL params (ex: ?region=PACA&type=Commune) -->
<dsfr-data-facets id="filtered" source="clean"
  fields="region, type" url-params>
</dsfr-data-facets>

<!-- URL params avec mapping et synchronisation -->
<dsfr-data-facets id="filtered" source="clean"
  fields="region, type" url-params url-sync
  url-param-map="r:region | t:type">
</dsfr-data-facets>

<!-- Colonnage DSFR des facettes -->
<dsfr-data-facets id="filtered" source="clean"
  fields="region, departement, statut"
  cols="region:6 | departement:4 | statut:12">
</dsfr-data-facets>

<!-- Colonnage global (toutes en col-6 = 2 par ligne) -->
<dsfr-data-facets id="filtered" source="clean"
  fields="region, type, statut" cols="6">
</dsfr-data-facets>

<!-- Facettes serveur ODS (server-facets) -->
<dsfr-data-source id="src" api-type="opendatasoft"
  dataset-id="mon-dataset" base-url="https://data.example.com"
  server-side page-size="20">
</dsfr-data-source>
<dsfr-data-query id="q" source="src"></dsfr-data-query>
<dsfr-data-search source="q" server-search placeholder="Rechercher..." count></dsfr-data-search>
<dsfr-data-facets id="filtered" source="q" server-facets
  fields="region, catégorie"
  labels="region:Region | catégorie:Catégorie">
</dsfr-data-facets>
<dsfr-data-display source="filtered" cols="3" pagination="20">
  <template>...</template>
</dsfr-data-display>
```

### Référence `<dsfr-data-facets>` (générée depuis le code)

**Rôle pipeline** : transformateur (`TransformerMixin`) — consomme `source`, ré-émet sous son propre `id`, relaie les commandes vers l’amont.

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `cols` | `string` | `""` (vide) | Colonnage DSFR des facettes : "6" (global) ou "field:4 \| field2:6" (par facette) |
| `disjunctive` | `string` | `""` (vide) | Champs en mode multi-selection OU (virgule-separes) |
| `display` | `string` | `""` (vide) | Mode d'affichage par facette : "field:select \| field2:multiselect". Défaut = checkbox |
| `fields` | `string` | `""` (vide) | Champs a exposer comme facettes (virgule-separes). Vide = auto-detection |
| `hide-counts` | `boolean` | `false` | Masquer les compteurs a cote de chaque valeur de facette |
| `hide-empty` | `boolean` | `false` | Masquer les facettes avec une seule valeur |
| `labels` | `string` | `""` (vide) | Labels custom : "field:Label \| field2:Label 2" |
| `max-values` | `number` | `6` | Nb de valeurs visibles par facette avant "Voir plus" |
| `searchable` | `string` | `""` (vide) | Champs avec barre de recherche (virgule-separes) |
| `server-facets` | `boolean` | `false` | Active le mode facettes serveur ODS. Fetch les valeurs de facettes depuis l'API ODS /facets au lieu de les calculer localement. Requiert source pointant vers un dsfr-data-source avec api-type="opendatasoft" et server-side. En mode server-facets, l'attribut fields est obligatoire (pas d'auto-detection). |
| `sort` | `string` | `'count'` | Tri des valeurs : count, -count, alpha, -alpha |
| `source` | `string` | `""` (vide) | ID de la source de données a ecouter |
| `static-values` | `string` | `""` (vide) | Valeurs de facettes pre-calculees (JSON). Format: {"field": ["val1", "val2"], "field2": ["a", "b"]} Quand cet attribut est défini, les facettes utilisent ces valeurs sans les calculer depuis les données. Les selections envoient des commandes WHERE en colon syntax (compatible Tabular / generique) au dsfr-data-query en amont. Attribut fields requis (pas d'auto-detection). |
| `url-param-map` | `string` | `""` (vide) | Mapping URL param -> champ facette : "param:field \| param2:field2". Si vide, correspondance directe |
| `url-params` | `boolean` | `false` | Active la lecture des parametres d'URL comme pre-selections de facettes |
| `url-sync` | `boolean` | `false` | Synchronise l'URL quand l'utilisateur change les facettes (replaceState — pas d'entree d'historique par clic) |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `getAdapter()` | `ApiAdapter \| null` | Retourne l'adapter de la source amont (delegation transparente). Permet aux composants en aval d'acceder a l'adapter sans connaitre la structure du pipeline. |
| `getEffectiveWhere(excludeKey?: string)` | `string` | Retourne le where effectif de la source amont (delegation transparente). |


**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-loaded` | `{ sourceId, data }` | écoute | Nouvelles données publiées par la source désignée par `source`. |
| `dsfr-data-error` | `{ sourceId, error }` | écoute | Erreur amont. |
| `dsfr-data-loading` | `{ sourceId }` | écoute | Chargement amont démarré. |
| `dsfr-data-loaded` | `{ sourceId, data }` | émis | Données transformées, ré-émises sous l’`id` de CE composant (c’est cet `id` que l’aval met dans son `source`). |
| `dsfr-data-error` | `{ sourceId, error }` | émis | Erreur amont ou de transformation, sous l’`id` de ce composant. |
| `dsfr-data-loading` | `{ sourceId }` | émis | Chargement amont relayé vers l’aval. |
| `dsfr-data-source-command` | `{ sourceId, page?, where?, whereKey?, orderBy?, groupBy?, aggregate? }` | émis | Commande de pagination / filtre / tri envoyée à la source AMONT — soit originée par ce composant, soit relayée depuis l’aval. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
