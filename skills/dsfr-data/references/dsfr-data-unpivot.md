# dsfr-data-unpivot

> Bascule un tableau "wide" (temps dans les noms de colonnes) en "long/tidy"
>
> Déclencheurs : unpivot, depivot, melt, wide, tableur, colonnes en lignes, transposer, format large, une colonne par mois

## <dsfr-data-unpivot> - Bascule "wide" → "tidy"

Composant invisible, pur transformateur (aucun fetch HTTP), frère de dsfr-data-query / dsfr-data-join.

Un tableau "wide" encode une dimension (souvent le temps) dans les NOMS de colonnes
(`c2023_01`, `c2023_02`, …). Le pipeline dsfr-data suppose un format "tidy" :
une observation par ligne. dsfr-data-unpivot bascule les colonnes en lignes.
C'est l'inverse exact d'un pivot. La valeur est laissée brute — le typage est délégué
à dsfr-data-normalize (`numeric-auto`) en aval.

### Position dans le pipeline
```
dsfr-data-source (wide) ──► dsfr-data-unpivot ──► dsfr-data-normalize ──► dsfr-data-query ──► dsfr-data-chart
```

### Attributs
| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| id | String | - | oui | Identifiant unique de la sortie. |
| source | String | "" | oui | ID de la source amont à déplier. |
| id-cols | String | "" | non | Colonnes conservées telles quelles sur chaque ligne (virgule-séparées). Ex: `"Indicateurs, Sous_theme"`. |
| value-cols | String | "" | non | Liste explicite des colonnes à déplier (virgule-séparée). Exclusif avec value-cols-pattern. |
| value-cols-pattern | String | "" | non | Motif des colonnes à déplier avec placeholders `{TOKEN}`. Ex: `"c{YYYY}_{MM}"`. |
| var-name | String | "variable" | non | Nom de la nouvelle colonne "variable" (clé dépliée). Ex: `"mois"`. |
| var-format | String | "" | non | Reformatage de la clé via les tokens du motif. Ex: `"{YYYY}-{MM}"` → `2023-01`. |
| value-name | String | "value" | non | Nom de la nouvelle colonne "valeur". Ex: `"valeur"`. |
| drop-empty | Boolean | false | non | Ne pas émettre de ligne quand la cellule dépliée est vide/null. |

### Tokens de motif (value-cols-pattern)
Largeur fixe : `YYYY` (4 chiffres), `YY`/`MM`/`DD`/`HH` (2 chiffres), `Q` (1 chiffre).
Tout autre `{nom}` matche un segment générique. Le motif est ancré (début à fin du nom de colonne).

### Exemple : tableur électromobilité wide → courbe temporelle
```html
<dsfr-data-source id="grist_wide" api-type="grist"
  base-url="https://grist.numerique.gouv.fr" doc-id="..." table="Plan_Elec">
</dsfr-data-source>
<dsfr-data-unpivot id="tidy" source="grist_wide"
  id-cols="Indicateurs, Sous_theme"
  value-cols-pattern="c{YYYY}_{MM}"
  var-name="mois" var-format="{YYYY}-{MM}"
  value-name="valeur">
</dsfr-data-unpivot>
<dsfr-data-normalize id="prep" source="tidy" numeric-auto></dsfr-data-normalize>
<dsfr-data-chart source="prep" type="line"
  label-field="mois" value-field="valeur">
</dsfr-data-chart>
```

### Notes
- Un nouveau mois (nouvelle colonne `c2026_05`) est déplié automatiquement, sans changer la config.
- Plusieurs id-cols sont portées sur chaque ligne émise.
- Recalcule automatiquement quand la source amont émet de nouvelles données.

### Référence `<dsfr-data-unpivot>` (générée depuis le code)

**Rôle pipeline** : transformateur (`TransformerMixin`) — consomme `source`, ré-émet sous son propre `id`, relaie les commandes vers l’amont.

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `drop-empty` | `boolean` | `false` | Ne pas émettre de ligne quand la cellule dépliée est vide/null. |
| `id-cols` | `string` | `""` (vide) | Colonnes conservées telles quelles sur chaque ligne. Ex: "Indicateurs, Sous_theme" |
| `source` | `string` | `""` (vide) | ID de la source de données à écouter |
| `value-cols` | `string` | `""` (vide) | Liste explicite des colonnes à déplier (virgule-séparée). Exclusif avec value-cols-pattern. |
| `value-cols-pattern` | `string` | `""` (vide) | Motif des colonnes à déplier, avec placeholders `{TOKEN}`. Tokens date à largeur fixe : YYYY (4 chiffres), YY/MM/DD/HH (2), Q (1). Ex: "c{YYYY}_{MM}" matche `c2023_01`. |
| `value-name` | `string` | `""` (vide) | Nom de la nouvelle colonne "valeur". Défaut: "value". |
| `var-format` | `string` | `""` (vide) | Reformatage de la clé via les tokens du motif. Ex: "{YYYY}-{MM}" → `2023-01`. |
| `var-name` | `string` | `""` (vide) | Nom de la nouvelle colonne "variable" (clé dépliée). Défaut: "variable". |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `getAdapter()` | `import('../adapters/api-adapter.js').ApiAdapter \| null` | Retourne l'adapter de la source amont (delegation transparente). Permet aux composants en aval (dsfr-data-facets, dsfr-data-search) d'atteindre l'adapter a travers ce transformateur. |
| `getAdapterParams()` | `import('../adapters/api-adapter.js').AdapterParams \| null` | Retourne les parametres adapter resolus de la source amont (delegation transparente, headers api-key-ref inclus — #274). |
| `getData()` | `Row[]` | — |
| `getEffectiveWhere(excludeKey?: string)` | `string` | Retourne le where effectif de la source amont (delegation transparente). |
| `transformsSchema()` | `boolean` | L'unpivot crée toujours des colonnes (var-name/value-name) et supprime les colonnes dépliées : le schéma aval ne correspond jamais au schéma de la source qui fetch (#394). Une query en aval ne doit donc jamais déléguer ses opérations (order-by…) au serveur à travers ce composant. |


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
