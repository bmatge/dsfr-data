# dsfr-data-pivot

> Replie un tableau "long" en "wide" (tableau croisé) : une colonne par valeur distincte d'un champ
>
> Déclencheurs : pivot, tableau croisé, tableau croise, crosstab, cross-tab, lignes en colonnes, une colonne par année, une colonne par annee, une colonne par valeur, long vers wide, écart entre deux séries, ecart entre deux series, différence entre deux années, difference entre deux annees, comparer deux années

## <dsfr-data-pivot> - Repli "long" → "wide" (tableau croisé)

Composant invisible, pur transformateur (aucun fetch HTTP), symétrique exact de
dsfr-data-unpivot. Un jeu "long" porte une observation par ligne
(`commune | annee | montant`) ; le pivot en fait un tableau croisé : une ligne par
valeur de `row`, une colonne par valeur distincte de `column`, et dans chaque cellule
l'agrégat des valeurs de `value`.

### Position dans le pipeline
```
dsfr-data-source (long) ──► [dsfr-data-query : filtre / facette] ──► dsfr-data-pivot ──► dsfr-data-list
                                                                              └──► dsfr-data-normalize (compute) ──► chart / kpi
```

### Attributs
| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| id | String | - | oui | Identifiant unique de la sortie. |
| source | String | "" | oui | ID de la source amont (format long). |
| row | String | "" | oui | Champs formant l'identité de ligne, virgule-séparés. Ex: `"commune"`, `"etab, dep"`. |
| column | String | "" | oui | Champ dont chaque valeur distincte devient une colonne. Ex: `"annee"`. |
| value | String | "" | oui | Champ dont les valeurs remplissent les cellules. Ex: `"montant"`. |
| aggregate | String | "sum" | non | Réduction quand plusieurs lignes tombent dans la même cellule : `sum`, `count`, `avg`, `min`, `max`, `first`, `last` (grammaire commune du pipeline). |
| column-order | String | "" | non | Ordre des colonnes générées : vide = ordre d'apparition, `asc` / `desc` (tri numérique si toutes les valeurs le sont). |
| column-format | String | "" | non | Gabarit des noms de colonnes, `{value}` = valeur brute. Ex: `"annee_{value}"` → `annee_2023` (identifiant sûr pour `compute`). |
| labels | String | "" | non | Libellés par valeur brute : `"2022:Année 2022 \| 2023:Année 2023"` (prime sur column-format ; `:` et `\|` littéraux échappés en `%3A` / `%7C`). |
| max-columns | Number | 50 | non | Plafond de colonnes générées. Au-delà : erreur de configuration explicite, pas un tableau. |

### Règles
- **Cellule sans observation = `null`**, jamais 0 (#301). `sum`/`avg` sans valeur numérique → `null` aussi.
- Toutes les lignes émises portent **toutes** les colonnes générées (schéma uniforme).
- Le **schéma de sortie dépend des données** : une nouvelle valeur de `column` dans la source
  crée une nouvelle colonne sans changer le HTML. Un `dsfr-data-list` sans `columns` (ou avec
  `columns-auto`) suit ce schéma ; un `dsfr-data-chart` en `value-fields` doit nommer les colonnes
  qu'il attend (utiliser `column-format` pour des noms prévisibles).
- Les lignes dont le champ `column` est vide/null sont ignorées (comptées dans la trace).
- Une valeur de `column` qui porte le nom d'un champ de `row` est une erreur (collision) :
  poser `column-format`.
- Plus de `max-columns` valeurs distinctes (50 par défaut) → `data-dsfr-config-error` : un pivot
  sur un identifiant (10 000 valeurs) est une erreur de page. Filtrer en amont ou changer de champ.
- La trace du volet Diagnostic (#604) affiche le nombre de colonnes générées et de cellules vides.

### Exemple 1 : tableau croisé dont les colonnes suivent une facette (#640)
```html
<dsfr-data-source id="tarifs" api-type="tabular" resource="…"></dsfr-data-source>
<!-- la facette filtre les services ; les colonnes de la grille suivent la sélection -->
<dsfr-data-facets id="svc" source="tarifs" fields="service"></dsfr-data-facets>
<dsfr-data-pivot id="large" source="svc"
  row="etab, dep" column="service" value="tarif" aggregate="first">
</dsfr-data-pivot>
<dsfr-data-list source="large"
  columns="etab:Établissement, dep:Département" columns-auto
  sort="etab:asc" export="csv">
</dsfr-data-list>
```

### Exemple 2 : écart entre deux séries (pivot puis compute)
```html
<dsfr-data-source id="long" data='[
  {"commune":"Lyon","annee":2022,"montant":10},
  {"commune":"Lyon","annee":2023,"montant":12},
  {"commune":"Nice","annee":2022,"montant":7},
  {"commune":"Nice","annee":2023,"montant":9}
]'></dsfr-data-source>
<dsfr-data-pivot id="wide" source="long"
  row="commune" column="annee" value="montant" column-format="annee_{value}">
</dsfr-data-pivot>
<dsfr-data-normalize id="ecart" source="wide"
  compute="ecart = annee_2023 - annee_2022">
</dsfr-data-normalize>
<dsfr-data-chart source="ecart" type="bar" label-field="commune" value-field="ecart:Écart 2023 − 2022">
</dsfr-data-chart>
```

### Pièges
- Sans `column-format`, les colonnes s'appellent `2022`, `2023` : un `compute` lit alors
  un nombre, pas un champ. Toujours `column-format="annee_{value}"` avant un calcul.
- `aggregate` par défaut = `sum` : pour des tarifs ou des libellés (une valeur par cellule),
  préférer `first`.
- Ne pas pivoter pour alimenter un graphique multi-séries : `dsfr-data-chart series-field`
  consomme le format long directement. Le pivot sert au **tableau croisé** et au **calcul
  entre colonnes**.

### Référence `<dsfr-data-pivot>` (générée depuis le code)

**Rôle pipeline** : transformateur (`TransformerMixin`) — consomme `source`, ré-émet sous son propre `id`, relaie les commandes vers l’amont.

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `aggregate` | `string` | `'sum'` | Réduction quand plusieurs lignes tombent dans la même cellule : `sum` (défaut), `count`, `avg`, `min`, `max`, `first`, `last`. Une cellule sans valeur numérique reste `null` (pas de 0 silencieux). |
| `column` | `string` | `""` (vide) | Champ dont chaque valeur distincte devient une colonne. Ex : `"annee"`. |
| `column-format` | `string` | `""` (vide) | Gabarit des noms de colonnes générées, `{value}` = valeur brute. Ex : `"annee_{value}"` donne `annee_2023` — un identifiant utilisable dans `compute`. Défaut : la valeur brute (`2023`). |
| `column-order` | `string` | `""` (vide) | Ordre des colonnes générées : vide = ordre d'apparition dans les données, `asc` / `desc` = tri des valeurs (numérique si elles le sont toutes). |
| `labels` | `string` | `""` (vide) | Libellés des colonnes générées, par valeur brute : `"2022:Année 2022 \| 2023:Année 2023"`. Une valeur libellée prend son libellé pour nom de colonne (prime sur column-format). Un `:` ou `\|` littéral s'échappe en `%3A` / `%7C`. |
| `max-columns` | `string` | `PIVOT_DEFAULT_MAX_COLUMNS` | Plafond de colonnes générées (défaut 50). Au-delà, erreur de configuration explicite : un pivot sur un champ à 10 000 valeurs distinctes est une erreur de page, pas un tableau. |
| `row` | `string` | `""` (vide) | Champs formant l'identité de ligne, virgule-séparés : une ligne émise par combinaison distincte. Ex : `"commune"` ou `"etab, dep"`. |
| `source` | `string` | `""` (vide) | ID de la source de données à écouter (format long : une observation par ligne). |
| `value` | `string` | `""` (vide) | Champ dont les valeurs remplissent les cellules. Ex : `"montant"`. |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `getAdapter()` | `import('../adapters/api-adapter.js').ApiAdapter \| null` | Retourne l'adapter de la source amont (délégation transparente), pour que facets / search en aval atteignent l'adapter à travers ce transformateur. |
| `getAdapterParams()` | `import('../adapters/api-adapter.js').AdapterParams \| null` | Retourne les paramètres adapter résolus de la source amont (délégation, #274). |
| `getData()` | `Row[]` | — |
| `getEffectiveWhere(excludeKey?: string)` | `string` | Retourne le where effectif de la source amont (délégation transparente). |
| `getPivotStats()` | `PivotStats \| null` | Statistiques du dernier pivot (colonnes générées, cellules vides), ou null avant le premier. |
| `transformsSchema()` | `boolean` | Le pivot fabrique ses colonnes à partir des données : le schéma aval ne correspond jamais à celui de la source qui fetch (#394). Une query en aval ne doit donc jamais déléguer ses opérations au serveur à travers lui. |


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
