# dsfr-data-chart

> Wrapper DSFR Chart connecte aux sources de données
>
> Déclencheurs : graphique, chart, visualisation, barres, camembert, ligne, radar, nuage, scatter, carte, map, jauge, gauge, departement, region, academie, monde, pays, databox, habillage, encadrer, titre graphique, source données, screenshot, capture écran, plein écran, fullscreen, tendance, trend

## <dsfr-data-chart> - Graphiques DSFR

Wrapper connectant les composants DSFR Chart officiels au systeme dsfr-data-source/dsfr-data-query.
Se connecte a une source via l'attribut `source`. Généré automatiquement le format
JSON imbrique attendu par les composants DSFR Chart natifs.

### Format des données
Attend un tableau d'objets plats depuis la source :
`[{"region": "IDF", "population": 12000000}, {"region": "OCC", "population": 6000000}]`

Les champs `label-field` et `value-field` indiquent quels champs utiliser pour
les labels (axe X) et les valeurs (axe Y). Le composant transforme automatiquement
ce tableau en format DSFR Chart (tableaux imbriques x/y).

### Types supportes
| Type | Composant DSFR | Description |
|------|---------------|-------------|
| bar | bar-chart | Barres verticales (ou horizontales avec `horizontal`) |
| line | line-chart | Courbes / lignes |
| pie | pie-chart | Anneau (défaut) ou camembert plein (avec `fill`) |
| radar | radar-chart | Diagramme radar |
| scatter | scatter-chart | Nuage de points |
| gauge | gauge-chart | Jauge circulaire 0-100% |
| bar-line | bar-chart + line-chart | Combine barres et ligne (2 séries) |
| map | map-chart (level="dep") | Carte par departement francais |
| map-reg | map-chart (level="reg") | Carte par region francaise |
| map-aca | map-chart (level="aca") | Carte par academie |
| map-monde | map-chart (level="monde") | Carte mondiale par pays |

### Attributs
| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| source | String | `""` | oui | ID de la source ou query |
| type | String | `"bar"` | oui | Type de graphique (voir tableau ci-dessus) |
| label-field | String | `""` | selon type | Chemin vers les labels dans les données |
| value-field | String | `""` | oui (sauf gauge) | Chemin vers les valeurs |
| value-field-2 | String | `""` | non | 2e série de valeurs (bar-line) |
| value-fields | String | `""` | non | Séries supplementaires separees par virgules — format LARGE, une colonne par série (ex: `"budget,score"`) |
| series-field | String | `""` | non | Champ clé de série pour données LONG/tidy : ses valeurs distinctes deviennent autant de séries. Ex: données `{mois, groupe, valeur}` avec `series-field="groupe"`. S'applique a bar/line/radar. Prioritaire sur value-fields. Consommateur naturel de `dsfr-data-unpivot`. |
| name | String | `""` | non | Noms des séries en JSON : `'["Série 1","Série 2"]'` (auto-deduit des colonnes ou des valeurs de series-field si absent) |
| selected-palette | String | `"categorical"` | non | Palette : categorical, sequentialAscending, sequentialDescending, divergentAscending, divergentDescending, neutral, default |
| unit-tooltip | String | `""` | non | Unite dans les info-bulles : %, EUR, etc. |
| unit-tooltip-bar | String | `""` | non | Unite des barres dans un bar-line |
| horizontal | Boolean | `false` | non | Barres horizontales (type bar uniquement) |
| stacked | Boolean | `false` | non | Barres empilees (type bar uniquement) |
| fill | Boolean | `false` | non | Camembert plein au lieu d'anneau (type pie) |
| highlight-index | String | `""` | non | Indices a mettre en avant : `"[0, 2]"` |
| x-min | String | `""` | non | Limite min axe X |
| x-max | String | `""` | non | Limite max axe X |
| y-min | String | `""` | non | Limite min axe Y. Pour type radar : borne min de l'echelle radiale (le centre du radar est fixe a y-min au lieu du minimum des donnees) |
| y-max | String | `""` | non | Limite max axe Y. Pour type radar : borne max de l'echelle radiale ; si y-min et y-max sont entiers avec une amplitude de 1 a 10, anneaux de grille entiers (stepSize 1) |
| gauge-value | Number | `null` | type gauge | Valeur de la jauge (0-100) |
| code-field | String | `""` | types map* | Champ contenant le code : departement/region (map, map-reg), nom d'academie en majuscules (map-aca), code pays ISO 3166-1 alpha-2/alpha-3/numerique (map-monde, converti en alpha-2) — prioritaire sur label-field |
| map-highlight | String | `""` | non | Departements/regions a surligner |
| reference-lines | String | `""` | non | Lignes de reference (overlay) en JSON. Cartesiens uniquement (line, bar, bar-line, scatter). Chaque item : `{ axis: "x" ou "y", value (string ou number), label?, color?, dash?, position? }`. `axis:"x"` → ligne verticale a une categorie/date ; `axis:"y"` → ligne horizontale a un seuil. Ex : `reference-lines='[{"axis":"x","value":"2026-02","label":"Lancement","color":"#c9191e","dash":true},{"axis":"y","value":3000,"label":"Objectif"}]'`. |
| targets | String | `""` | non | Cibles / objectifs futurs (overlay) en JSON. Types line et bar-line uniquement. Chaque item : `{ x (echeance, string ou number, requis), value (number, requis), series? (nom de dataset ou index, defaut 0), label?, color? }`. L'axe X est etendu automatiquement si l'echeance depasse les donnees : trait plein jusqu'au dernier point reel, trajectoire pointillee vers un losange a l'echeance, zone future grisee. Ex : `targets='[{"x":2030,"value":26,"label":"Cible 2030 : 26 %"}]'`. |
| targets-zone | String | `"on"` | non | Bande grisee + frontiere pointillee realise/projete. `"off"` desactive. |
| targets-legend | String | `""` | non | Legende sous le graphe : `""` = libelles par defaut (« Donnees historiques » / « Trajectoire, cible extrapolee »), `"off"` = masquee, `'["a","b"]'` = libelles personnalises. |

### Attributs par type de graphique
| Type | Attributs essentiels | Attributs optionnels |
|------|---------------------|---------------------|
| bar | source, type, label-field, value-field | horizontal, stacked, highlight-index, selected-palette |
| line | source, type, label-field, value-field | x-min, x-max, y-min, y-max, value-field-2 |
| pie | source, type, label-field, value-field | fill (false=anneau, true=camembert plein) |
| radar | source, type, label-field, value-field | value-field-2, name, y-min, y-max |
| scatter | source, type, label-field, value-field | x-min, x-max, y-min, y-max |
| gauge | source, type, gauge-value | - |
| bar-line | source, type, label-field, value-field, value-field-2 | name, unit-tooltip, unit-tooltip-bar |
| map | source, type, code-field, value-field | selected-palette, map-highlight |
| map-reg | source, type, code-field, value-field | selected-palette, map-highlight |
| map-aca | source, type, code-field, value-field | selected-palette, map-highlight |
| map-monde | source, type, code-field, value-field | selected-palette, map-highlight |

### Exemples
```html
<!-- Barres verticales -->
<dsfr-data-chart source="stats" type="bar"
  label-field="region" value-field="population"
  selected-palette="categorical">
</dsfr-data-chart>

<!-- Barres horizontales empilees -->
<dsfr-data-chart source="data" type="bar"
  label-field="catégorie" value-field="valeur"
  horizontal stacked>
</dsfr-data-chart>

<!-- Combine barres + ligne -->
<dsfr-data-chart source="data" type="bar-line"
  label-field="mois" value-field="ca" value-field-2="objectif"
  name='["CA","Objectif"]'
  unit-tooltip="EUR" unit-tooltip-bar="EUR">
</dsfr-data-chart>

<!-- Anneau (défaut de pie) -->
<dsfr-data-chart source="repartition" type="pie"
  label-field="catégorie" value-field="montant"
  unit-tooltip="%">
</dsfr-data-chart>

<!-- Camembert plein -->
<dsfr-data-chart source="repartition" type="pie"
  label-field="catégorie" value-field="montant" fill>
</dsfr-data-chart>

<!-- Carte par departement -->
<dsfr-data-chart source="dept-data" type="map"
  code-field="code_dept" value-field="valeur"
  selected-palette="sequentialAscending">
</dsfr-data-chart>

<!-- Carte par region -->
<dsfr-data-chart source="reg-data" type="map-reg"
  code-field="code_reg" value-field="valeur">
</dsfr-data-chart>

<!-- Carte par academie (noms en majuscules : PARIS, LYON...) -->
<dsfr-data-chart source="aca-data" type="map-aca"
  code-field="academie" value-field="valeur">
</dsfr-data-chart>

<!-- Carte mondiale (codes pays ISO : FR, US ou FRA, USA ou 250, 840) -->
<dsfr-data-chart source="pays-data" type="map-monde"
  code-field="code_pays" value-field="valeur"
  selected-palette="sequentialAscending">
</dsfr-data-chart>

<!-- Jauge -->
<dsfr-data-chart type="gauge" gauge-value="73"></dsfr-data-chart>
```

### Habillage DataBox (optionnel)

L'attribut `databox` active l'habillage DataBox DSFR autour du graphique :
cadre editorial avec titre, source, date, switch chart/tableau integre, screenshot PNG,
téléchargement CSV, plein écran, tendance.

| Attribut | Type | Défaut | Description |
|----------|------|--------|-------------|
| databox | Boolean | `false` | Active l'habillage DataBox DSFR |
| databox-title | String | `""` | Titre affiche dans l'en-tete (ex: "Population par region") |
| databox-source | String | `""` | Source des données (ex: "INSEE, RP 2021") |
| databox-date | String | `""` | Date des données (ex: "Mars 2024") |
| databox-download | Boolean | `false` | Bouton téléchargement CSV |
| databox-screenshot | Boolean | `false` | Bouton screenshot PNG |
| databox-fullscreen | Boolean | `false` | Bouton plein écran |
| databox-trend | String | `""` | Tendance (ex: "+5.2" ou "-3.1") |
| databox-tooltip-title | String | `""` | Titre du tooltip info |
| databox-tooltip-content | String | `""` | Contenu du tooltip info |
| databox-modal-title | String | `""` | Titre de la modale |
| databox-modal-content | String | `""` | Contenu de la modale |
| databox-default-source | String | `""` | Source par défaut (selecteur multi-source) |
| databox-actions | String | `""` | Actions personnalisees (JSON array) |

Quand `databox` est active, dsfr-data-a11y ne doit PAS inclure `table` ni `download`
(DataBox les fournit déjà). Conserver uniquement `description` sur dsfr-data-a11y.

```html
<!-- Graphique avec habillage DataBox -->
<dsfr-data-chart source="data" type="bar"
  label-field="region" value-field="total"
  databox
  databox-title="Population par region"
  databox-source="INSEE, RP 2021"
  databox-date="Mars 2024"
  databox-download>
</dsfr-data-chart>
<dsfr-data-a11y for="chart" source="data"
  description="L'Ile-de-France concentre la majorite de la population.">
</dsfr-data-a11y>
```

### Référence `<dsfr-data-chart>` (générée depuis le code)

**Rôle pipeline** : affichage (`SourceSubscriberMixin`) — feuille du pipeline : consomme `source`, n’émet pas de données.

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `code-field` | `string` | `""` (vide) | Chemin vers le champ code (prioritaire sur label-field) : departement/region (map/map-reg), nom d'academie (map-aca), code pays ISO a2/a3/num (map-monde) |
| `databox` | `boolean` | `false` | Envelopper le chart dans une DataBox DSFR native |
| `databox-actions` | `string` | `""` (vide) | Actions personnalisees DataBox (JSON array, ex: '["Source officielle","Pole emploi"]') |
| `databox-date` | `string` | `""` (vide) | Date de la donnée (ex: "Mars 2024") |
| `databox-default-source` | `string` | `""` (vide) | Source par défaut dans le selecteur multi-source DataBox |
| `databox-download` | `boolean` | `false` | Bouton téléchargement CSV dans DataBox |
| `databox-fullscreen` | `boolean` | `false` | Bouton plein écran |
| `databox-modal-content` | `string` | `""` (vide) | Contenu de la modale DataBox |
| `databox-modal-title` | `string` | `""` (vide) | Titre de la modale DataBox |
| `databox-screenshot` | `boolean` | `false` | Bouton screenshot PNG |
| `databox-source` | `string` | `""` (vide) | Mention de la source (ex: "INSEE, 2024") |
| `databox-title` | `string` | `""` (vide) | Titre affiché dans l'en-tête DataBox |
| `databox-tooltip-content` | `string` | `""` (vide) | Contenu du tooltip info DataBox |
| `databox-tooltip-title` | `string` | `""` (vide) | Titre du tooltip info DataBox |
| `databox-trend` | `string` | `""` (vide) | Badge tendance (ex: "+5.2", "-3.1") |
| `fill` | `boolean` | `false` | Remplir le graphique (pie chart: true = plein, false = donut) |
| `gauge-value` | `number \| null` | `null` | Valeur pour la jauge (gauge chart uniquement) |
| `highlight-index` | `string` | `""` (vide) | Index des éléments à mettre en avant (ex: "[0, 2]") |
| `horizontal` | `boolean` | `false` | Affichage horizontal (bar chart uniquement) |
| `label-field` | `string` | `""` (vide) | Chemin vers le champ label |
| `map-highlight` | `string` | `""` (vide) | ID du département/région à mettre en avant (map chart) |
| `name` | `string` | `""` (vide) | Noms des séries (ex: '["Série 1", "Série 2"]') |
| `reference-lines` | `string` | `""` (vide) | Lignes de reference (overlay) au format JSON. Graphiques cartesiens uniquement (line, bar, bar-line, scatter). Chaque item : `{ axis: "x"\|"y", value: string\|number, label?, color?, dash?, position? }`. `axis:"x"` → ligne verticale à une catégorie/date ; `axis:"y"` → ligne horizontale a un seuil. Ex : `reference-lines='[{"axis":"x","value":"2026-02", "label":"Lancement","color":"#c9191e","dash":true}]'`. |
| `selected-palette` | `string` | `'categorical'` | Palette de couleurs |
| `series-field` | `string` | `""` (vide) | Champ "clé de série" pour des données au format long/tidy : ses valeurs distinctes deviennent autant de series (mode multi-series sans colonnes multiples). Ex: données {mois, groupe, valeur} avec series-field="groupe" → une série par groupe. S'applique aux types multi-series (bar, line, radar). Prioritaire sur value-fields. |
| `source` | `string` | `""` (vide) | Id de la `<dsfr-data-source>` (ou d'un transformateur) dont ce graphique consomme les données. |
| `stacked` | `boolean` | `false` | Barres empilées (bar chart uniquement) |
| `targets` | `string` | `""` (vide) | Cibles / objectifs futurs (overlay) au format JSON. Types `line` et `bar-line` uniquement. Chaque item : `{ x: string\|number (échéance, requis), value: number (requis), series?: string\|number (nom de dataset ou index, défaut 0), label?: string, color?: string }`. L'axe X est étendu automatiquement si l'échéance est au-delà des données (séries paddées avec null : trait plein jusqu'au dernier point réel, trajectoire pointillée vers le losange). Ex : `targets='[{"x":2030,"value":26,"label":"Cible 2030 : 26 %"}]'`. |
| `targets-legend` | `string` | `""` (vide) | Légende réalisé/projeté sous le graphe : `""` = libellés par défaut (« Données historiques » / « Trajectoire, cible extrapolée »), `"off"` = masquée, `'["a","b"]'` = libellés personnalisés. |
| `targets-zone` | `string` | `'on'` | Zone future grisée + frontière pointillée réalisé/projeté. `"off"` désactive. |
| `type` | `DSFRChartType` | `'bar'` | Type de graphique DSFR |
| `unit-tooltip` | `string` | `""` (vide) | Unité à afficher dans les tooltips |
| `unit-tooltip-bar` | `string` | `""` (vide) | Unité pour les barres (bar-line uniquement) |
| `value-field` | `string` | `""` (vide) | Chemin vers le champ valeur |
| `value-field-2` | `string` | `""` (vide) | Chemin vers un second champ de valeur (pour bar-line: y-bar) |
| `value-fields` | `string` | `""` (vide) | Champs de valeur supplementaires, separes par des virgules (ex: 'budget,score') |
| `x-max` | `string` | `""` (vide) | Limite max de l'axe X (types cartesiens : line, scatter, bar-line). |
| `x-min` | `string` | `""` (vide) | Limite min de l'axe X (types cartesiens : line, scatter, bar-line). |
| `y-max` | `string` | `""` (vide) | Limite max de l'axe Y. Pour `type="radar"` : borne max de l'echelle radiale ; si `y-min` et `y-max` sont entiers avec une amplitude de 1 a 10, la grille utilise des anneaux entiers (stepSize 1). |
| `y-min` | `string` | `""` (vide) | Limite min de l'axe Y. Pour `type="radar"` : borne min de l'échelle radiale (le centre du radar est fixé à `y-min` au lieu du minimum des données). |



**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-loaded` | `{ sourceId, data }` | écoute | Nouvelles données publiées par la source désignée par `source`. |
| `dsfr-data-error` | `{ sourceId, error }` | écoute | Erreur amont. |
| `dsfr-data-loading` | `{ sourceId }` | écoute | Chargement amont démarré. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
