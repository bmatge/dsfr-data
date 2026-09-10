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
| labels | String | `""` | non | Labels custom : `"field:Label \| field2:Label 2"` (pipe-separe) |
| max-values | Number | `6` | non | Nb de valeurs visibles par facette avant "Voir plus" |
| disjunctive | String | `""` | non | Champs en mode multi-selection OU (virgule-separes) |
| sort | String | `"count"` | non | Tri des valeurs, grammaire `critere:sens` (comme order-by) : `count:desc` (défaut, plus frequent d'abord), `count:asc`, `alpha:asc` (A-Z), `alpha:desc` (Z-A). Raccourcis : `count` = count:desc, `alpha` = alpha:asc. `-count` / `-alpha` deprecies (warn console) — ne plus les generer |
| searchable | String | `""` | non | Champs avec barre de recherche (virgule-separes) |
| hide-empty | Boolean | `false` | non | Masquer les facettes avec une seule valeur |
| display | String | `""` | non | Mode d'affichage par facette : `"field:select \| field2:multiselect"`. Modes : checkbox (défaut), select, multiselect, radio (dropdown a radios), radio-inline (radios visibles en ligne + « Tous ») |
| hide-counts | Boolean | `false` | non | Masquer les compteurs (N) a cote de chaque valeur de facette |
| url-params | Boolean | `false` | non | Active la lecture des parametres d'URL comme pre-selections de facettes |
| url-param-map | String | `""` | non | Mapping URL param -> champ : `"r:region \| t:type"`. Si vide, correspondance directe |
| url-sync | Boolean | `false` | non | Synchronise l'URL quand l'utilisateur change les facettes (replaceState) |
| server-facets | Boolean | `false` | non | Active le mode facettes serveur ODS. Fetch les valeurs depuis l'API ODS /facets. Requiert une source dsfr-data-source api-type="opendatasoft" server-side (directement ou via un dsfr-data-query, qui relaie automatiquement). Sans fields, les facettes declarees par le jeu sont decouvertes au premier cycle (ODS : metadonnees du jeu ; Grist : colonnes Choice/ChoiceList) ; une facette de type date (valeurs par annee) est filtree par intervalle (#680, #676) |
| static-values | String | `""` | non | Valeurs de facettes pre-calculees en JSON : `'{"region":["IDF","PACA"],"type":["Commune"]}')`. Les selections envoient des commandes WHERE en colon syntax au dsfr-data-query. Compteurs masques automatiquement. Utile pour Tabular/Grist/generique qui n'ont pas d'API facettes serveur |
| cols | String | `""` | non | Colonnage DSFR : `"6"` (global, 2/ligne), `"4"` (3/ligne), ou par facette `"region:4 \| type:6"` (défaut fr-col-6 pour non-specifies) |
| context | String | `""` | non | Id d'un dsfr-data-context (#678, ADR-104) : la facette devient un filtre du contexte, un par champ. Le contexte diffuse a toutes ses sources cibles (au dialecte de chacune), porte l'URL (url-sync / url-params de la facette ignores) et alimente context-tags. Valeurs, compteurs et cascade restent calcules sur `source`. Vide = mode autonome (commande directe a `source`) |
| no-reset | Boolean | `false` | non | Masque le bouton local « Réinitialiser les filtres » (#679, #640) : a poser quand un context-tags clear-all fait office de « tout effacer », ou pour qu'une colonne de facettes ne change pas de hauteur a la premiere selection |

### Mode context (#678) — un select peuple depuis la donnee, avec cascade
```html
<dsfr-data-context id="ctx" sources="src-charges src-produits" url-sync></dsfr-data-context>
<dsfr-data-facets id="geo" context="ctx" source="src-facettes" server-facets
  fields="region,departement" display="region:select | departement:select"></dsfr-data-facets>
<dsfr-data-context-tags for="ctx"></dsfr-data-context-tags>
```
Zero <option> ecrite a la main : les valeurs viennent de l'API facettes, choisir une region
restreint les departements (cascade server-facets), et les deux sources cibles se refiltrent
ensemble. Un filtre par champ (eq une valeur, in plusieurs), whereKey stable `uid + champ`.
Le contexte peut etre declare apres la facette dans la page. Ne PAS generer d'`<option>` en dur
ni d'`options-source` sur context-filter (refuse) : c'est ce pattern qu'il faut.
Migration d'une facette qui portait url-sync : reporter `url-param-map` sur le contexte
(un parametre par champ, format du contexte).

### Modes d'affichage
- **checkbox** (défaut) : fieldset DSFR avec checkboxes, compteurs, "Voir plus/moins", recherche optionnelle
- **select** : liste deroulante DSFR standard, selection exclusive (une seule valeur)
- **multiselect** : dropdown collapsible avec checkboxes DSFR, recherche integree, bouton "Tout sélectionner/deselectionner"
- **radio** : dropdown collapsible avec radio buttons DSFR, recherche integree, selection exclusive (sera renomme `radio-dropdown` dans une version majeure)
- **radio-inline** : boutons radio DSFR visibles en ligne dans un fieldset, precedes d'une option « Tous » qui retire la selection ; selection exclusive, toutes les valeurs affichees (#684)

Le mode `select` rend la facette automatiquement exclusive.
Le mode `radio` rend la facette automatiquement exclusive, `radio-inline` aussi.
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
| `context` | `string` | `""` (vide) | Id du dsfr-data-context auquel s'enregistrer (#678, ADR-104). La facette devient alors un filtre du contexte, un par champ : c'est le contexte qui diffuse a ses sources cibles et qui porte l'URL (`url-sync` et `url-params` de la facette sont ignores — reporter `url-param-map` sur le contexte). Le contexte peut etre declare apres la facette dans la page. Vide = comportement autonome historique (commande directe a `source`). |
| `disjunctive` | `string` | `""` (vide) | Champs en mode multi-selection OU (virgule-separes) |
| `display` | `string` | `""` (vide) | Mode d'affichage par facette : "champ:mode \| champ2:mode". Défaut = checkbox. - `checkbox` : cases à cocher visibles dans un fieldset DSFR (sélection multiple) - `select` : liste déroulante native fr-select (sélection unique) - `multiselect` : menu déroulant repliable avec cases à cocher et recherche (sélection multiple) - `radio` : menu déroulant repliable contenant des boutons radio et une recherche (sélection unique) — sera renommé `radio-dropdown` dans une version majeure - `radio-inline` : boutons radio DSFR visibles en ligne, précédés d'une option « Tous » qui retire la sélection (sélection unique, #684) |
| `fields` | `string` | `""` (vide) | Champs à exposer comme facettes (virgule-séparés). Vide = auto-détection sur les données chargées ; en `server-facets`, vide = découverte des facettes déclarées par le jeu de données (OpenDataSoft : métadonnées du jeu ; Grist : colonnes Choice/ChoiceList, #680) |
| `hide-counts` | `boolean` | `false` | Masquer les compteurs a cote de chaque valeur de facette |
| `hide-empty` | `boolean` | `false` | Masquer les facettes avec une seule valeur |
| `labels` | `string` | `""` (vide) | Labels custom : "field:Label \| field2:Label 2" |
| `max-values` | `number` | `6` | Nb de valeurs visibles par facette avant "Voir plus" |
| `no-reset` | `boolean` | `false` | Masque le bouton local « Réinitialiser les filtres » (#679, #640 pt 9). À poser quand un dsfr-data-context-tags clear-all fait office de « tout effacer » pour la page (mode `context`), ou pour qu'une colonne de facettes ne change pas de hauteur à la première sélection. |
| `searchable` | `string` | `""` (vide) | Champs avec barre de recherche (virgule-separes) |
| `server-facets` | `boolean` | `false` | Active le mode facettes serveur ODS. Fetch les valeurs de facettes depuis l'API ODS /facets au lieu de les calculer localement. Requiert source pointant vers un dsfr-data-source avec api-type="opendatasoft" et server-side. Sans `fields`, un appel de découverte au premier cycle liste les facettes déclarées par le jeu (mémorisé, invalidé si la source ou `dataset-id` change, #680). Les facettes de type date (valeurs par année) sont filtrées par intervalle et non par égalité (#676). |
| `sort` | `string` | `'count'` | Tri des valeurs de chaque facette, grammaire `critere:sens` alignee sur `order-by` de dsfr-data-query (#645) : - `count:desc` (defaut) : du plus frequent au plus rare - `count:asc` : du plus rare au plus frequent - `alpha:asc` : A -> Z (collation francaise) - `alpha:desc` : Z -> A Raccourcis : `count` = `count:desc`, `alpha` = `alpha:asc`. Formes `-count` / `-alpha` DEPRECIEES : conservees a l'identique (`-count` = rare d'abord, `-alpha` = Z -> A) mais un avertissement console invite a passer a la forme explicite ; retrait dans une version majeure. |
| `source` | `string` | `""` (vide) | ID de la source de données a ecouter |
| `static-values` | `string` | `""` (vide) | Valeurs de facettes pre-calculees (JSON). Format: {"field": ["val1", "val2"], "field2": ["a", "b"]} Quand cet attribut est défini, les facettes utilisent ces valeurs sans les calculer depuis les données. Les selections envoient des commandes WHERE en colon syntax (compatible Tabular / generique) au dsfr-data-query en amont. Attribut fields requis (pas d'auto-detection). |
| `url-param-map` | `string` | `""` (vide) | Mapping URL param -> champ facette : "param:field \| param2:field2". Si vide, correspondance directe |
| `url-params` | `boolean` | `false` | Active la lecture des parametres d'URL comme pre-selections de facettes |
| `url-sync` | `boolean` | `false` | Synchronise l'URL quand l'utilisateur change les facettes (replaceState — pas d'entree d'historique par clic) |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `emitTransformerError(error: Error)` | `void` | Erreur amont en mode serveur AVANT toute decouverte (#676) : une selection annuelle issue de l'URL a pu etre emise en egalite sur un champ date (400) — la source n'emet alors aucune donnee, donc le cycle de facettes (et sa decouverte) n'aurait jamais lieu. On lance la decouverte ici et, si un champ date est concerne, on re-emet la commande en intervalle. Une seule tentative par jeu (decouverte memorisee). |
| `getAdapter()` | `ApiAdapter \| null` | Retourne l'adapter de la source amont (delegation transparente). Permet aux composants en aval d'acceder a l'adapter sans connaitre la structure du pipeline. |
| `getEffectiveWhere(excludeKey?: string | string[])` | `string` | Retourne le where effectif de la source amont (delegation transparente). |


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
