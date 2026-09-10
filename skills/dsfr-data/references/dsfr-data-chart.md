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
| value-field | String | `""` | oui (sauf gauge) | Chemin vers les valeurs. Alias inline `champ:Libellé` pour la légende : `value-field="Panier_moyen:Panier moyen"` (un `:` littéral s'échappe en `%3A`) |
| value-field-2 | String | `""` | non | 2e série de valeurs (bar-line). Alias inline `champ:Libellé` accepté |
| value-fields | String | `""` | non | Séries supplementaires separees par virgules — format LARGE, une colonne par série (ex: `"budget,score"`). Alias inline par série : `"budget:Budget, score:Score"` |
| series-field | String | `""` | non | Champ clé de série pour données LONG/tidy : ses valeurs distinctes deviennent autant de séries. Ex: données `{mois, groupe, valeur}` avec `series-field="groupe"`. S'applique a bar/line/radar. Prioritaire sur value-fields. Consommateur naturel de `dsfr-data-unpivot`. |
| name | String | `""` | non | Nom(s) de série. Chaîne simple recommandée : `name="Taux"` (enveloppée automatiquement). JSON pour le multi-séries : `'["Réalisé","Objectif"]'`. Sur les cartes, un seul nom (le premier d'un JSON est retenu). Priorité : `name` explicite, sinon l'alias inline `champ:Libellé` de value-field(s), sinon le nom du champ ou les valeurs de series-field |
| idle-message | String | `"Choisissez un filtre pour afficher les données"` | non | Message rendu quand l'amont attend un filtre (`require-where`, #690). Distinct de « aucune donnée » : aucune requête n'a été faite. Existe aussi sur list, kpi, display, podium et a11y. |
| empty-label | String | `"Non renseigné"` | non | Libellé d'une catégorie vide (`null`, `undefined` ou `""` dans label-field) : légende du pie, axe X. Évite le « Série N » de DSFR Chart sur un nom vide. Ex: `empty-label="Sans objet"` |
| selected-palette | String | `"categorical"` | non | Palette : categorical, sequentialAscending, sequentialDescending, divergentAscending, divergentDescending, neutral, default |
| color-map | String | `""` | non | Couleur fixee par modalite : paires `modalite:#couleur` separees par virgule, meme grammaire que dsfr-data-map-layer. Ex: `"Realise:#000091,Objectif:#E1000F"`. La modalite est un nom de serie, sinon un libelle de l'axe (part de camembert). Virgule ou deux-points dans une modalite : `%2C` / `%3A`. Sans effet sur les types map* |
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
| code-field | String | `""` | types map* | Champ contenant le code : departement (map), region (map-reg : code INSEE, cle DSFR Chart IDF/20R/971 ou nom, traduits), academie (map-aca : nom accentue ou non, prefixe « Academie de » retire), code pays ISO 3166-1 alpha-2/alpha-3/numerique OU nom de pays en francais (map-monde : « Allemagne », « l'Allemagne », « Pays-Bas », converti en alpha-2) — prioritaire sur label-field. Une cle hors referentiel est ignoree ET comptee (console + volet Diagnostic) |
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
| heading-level | Number | `3` | Niveau de titre HTML du titre DataBox (2 à 6, borné) — `heading-level="2"` rend un h2, à caler sur la hiérarchie de la page (RGAA 9.1) |
| databox-source | String | `""` | Source des données (ex: "INSEE, RP 2021") |
| databox-date | String | `""` | Date des données (ex: "Mars 2024"). Prime sur databox-date-field |
| databox-date-field | String | `""` | Colonne de dates ISO (AAAA-MM-JJ) : la plus récente est affichée comme date, formatée JJ/MM/AAAA (ex: `databox-date-field="gazole_maj"`) |
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
| `color-map` | `string` | `""` (vide) | Couleur fixée par modalité (#732) : paires `modalité:#couleur` séparées par des virgules, même grammaire que `dsfr-data-map-layer`. Ex : `"Réalisé:#000091,Objectif:#E1000F"`. La modalité est un nom de série (une couleur par courbe ou par barre) ou, à défaut, un libellé de l'axe (une couleur par part de camembert). Les modalités non citées gardent la couleur de la palette. Une virgule ou un deux-points dans une modalité s'écrit `%2C` ou `%3A`. Sans effet sur les cartes (`map*`). |
| `databox` | `boolean` | `false` | Envelopper le chart dans une DataBox DSFR native |
| `databox-actions` | `string` | `""` (vide) | Actions personnalisees DataBox (JSON array, ex: '["Source officielle","Pole emploi"]') |
| `databox-date` | `string` | `""` (vide) | Date de la donnée (ex: "Mars 2024"), affichée dans le pied de la DataBox et sur les cartes. Aucune date n'est rendue si l'attribut est absent — plus de repli sur la date du jour, qui n'est pas celle des données (#650). Prime sur `databox-date-field` quand les deux sont posés. |
| `databox-date-field` | `string` | `""` (vide) | Fraîcheur lue dans la donnée (#661) : chemin d'une colonne de dates ISO (`AAAA-MM-JJ`, heure facultative). La plus récente est affichée comme date de la DataBox (et des cartes), formatée JJ/MM/AAAA. Ignoré si `databox-date` est posé ; aucune date rendue si la colonne ne contient aucune date ISO valide. |
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
| `empty-label` | `string` | `'Non renseigné'` | Libellé affiché pour une catégorie vide (`null`, `undefined` ou `""` dans `label-field`) : légende du pie, axe X des cartésiens (#647). Sans lui, DSFR Chart substituerait « Série N » à un nom vide. Pour EXCLURE ces lignes plutôt que les nommer, filtrer en amont : `where="champ:isnotnull"` (query) ou `where="champ is not null"` (source ODS). |
| `fill` | `boolean` | `false` | Remplir le graphique (pie chart: true = plein, false = donut) |
| `gauge-value` | `number \| null` | `null` | Valeur pour la jauge (gauge chart uniquement) |
| `heading-level` | `number` | `3` | Niveau de titre HTML du titre de la DataBox (RGAA 9.1, #670) : entier de 2 à 6, borné (défaut 3, rendu historique de DSFR Chart). `heading-level="2"` rend un h2. |
| `highlight-index` | `string` | `""` (vide) | Index des éléments à mettre en avant (ex: "[0, 2]") |
| `horizontal` | `boolean` | `false` | Affichage horizontal (bar chart uniquement) |
| `idle-message` | `string` | `IDLE_MESSAGE_DEFAULT` | Message rendu quand l'amont attend un filtre (`require-where`, #690). Distinct de « aucune donnée » : aucune requête n'a été faite. Vide, le libellé par défaut est utilisé. |
| `label-field` | `string` | `""` (vide) | Chemin vers le champ label |
| `map-highlight` | `string` | `""` (vide) | ID du département/région à mettre en avant (map chart) |
| `name` | `string` | `""` (vide) | Nom(s) de série. Chaîne simple recommandée (`name="Taux"`), enveloppée automatiquement pour DSFR Chart ; tableau JSON pour le multi-séries (`name='["Réalisé","Objectif"]'`). Sur les cartes (`map*`), un seul nom : le premier élément d'un JSON est retenu (#653). Priorité (#668) : `name` explicite, sinon l'alias inline `champ:Libellé` de value-field(s), sinon le nom du champ (ou les valeurs de series-field en mode tidy). |
| `reference-lines` | `string` | `""` (vide) | Lignes de référence (overlay) au format JSON. Graphiques cartésiens uniquement (line, bar, bar-line, scatter). Chaque item : `{ axis: "x"\|"y", value: string\|number, label?, color?, dash?, position? }`. `axis:"x"` → ligne verticale à une catégorie/date ; `axis:"y"` → ligne horizontale à un seuil. Ex : `reference-lines='[{"axis":"x","value":"2026-02", "label":"Lancement","color":"#c9191e","dash":true}]'`. |
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
| `value-field` | `string` | `""` (vide) | Chemin vers le champ valeur. Alias inline `champ:Libellé` (#668) : `value-field="Panier_moyen:Panier moyen"` affiche « Panier moyen » dans la légende à la place du nom technique. Un `name` explicite prime sur l'alias. Un `:` littéral dans un chemin ou un libellé s'échappe en `%3A` (escapeColonValue). |
| `value-field-2` | `string` | `""` (vide) | Chemin vers un second champ de valeur (pour bar-line: y-line). Alias inline `champ:Libellé` accepté (#668). |
| `value-fields` | `string` | `""` (vide) | Champs de valeur supplémentaires, séparés par des virgules (ex: 'budget,score'). Alias inline `champ:Libellé` par série (#668) : `value-fields="budget:Budget, score:Score"`. Un `name` explicite (tableau JSON) prime sur les alias. |
| `x-max` | `string` | `""` (vide) | Limite max de l'axe X (types cartésiens : line, scatter, bar-line). |
| `x-min` | `string` | `""` (vide) | Limite min de l'axe X (types cartésiens : line, scatter, bar-line). |
| `y-max` | `string` | `""` (vide) | Limite max de l'axe Y. Pour `type="radar"` : borne max de l'echelle radiale ; si `y-min` et `y-max` sont entiers avec une amplitude de 1 a 10, la grille utilise des anneaux entiers (stepSize 1). |
| `y-min` | `string` | `""` (vide) | Limite min de l'axe Y. Pour `type="radar"` : borne min de l'échelle radiale (le centre du radar est fixé à `y-min` au lieu du minimum des données). |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `getSkippedCount()` | `number` | Nombre de lignes ignorees par la dernière carte rendue (`type="map*"`) : code geographique absent, vide, invalide ou hors du referentiel du decoupage (academie inconnue, region inconnue, #729). 0 hors carte. |


**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-loaded` | `{ sourceId, data }` | écoute | Nouvelles données publiées par la source désignée par `source`. |
| `dsfr-data-error` | `{ sourceId, error }` | écoute | Erreur amont. |
| `dsfr-data-loading` | `{ sourceId }` | écoute | Chargement amont démarré. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
