# dsfr-data-join

> Jointure multi-sources autour d'une clé pivot
>
> Déclencheurs : join, jointure, croiser, fusionner, enrichir, merge, left join, inner join, multi-source, combiner

## <dsfr-data-join> - Jointure multi-sources

Composant invisible qui joint deux sources de données sur une ou plusieurs clés pivot.
Ne fait aucun fetch HTTP — c'est un pur transformateur de données.
Il attend que les deux sources aient emis leurs données avant de calculer la jointure.
Si une source se recharge, le join est recalcule automatiquement.

### Position dans le pipeline
```
dsfr-data-source (A)  ──────┐
                             ├──► dsfr-data-join ──► dsfr-data-query ──► dsfr-data-chart
dsfr-data-source (B)  ──────┘
```

### Attributs
| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| id | String | - | oui | Identifiant unique. Sans cet attribut, dsfr-data-join ne se monte pas (log `console.error` + attribut `data-dsfr-config-error` sur l'element). |
| left | String | "" | oui | ID de la source gauche (source principale) |
| right | String | "" | oui | ID de la source droite |
| on | String | "" | oui | Clé(s) de jointure (voir formats ci-dessous) |
| type | String | "left" | non | Type de jointure : inner, left, right, full |
| prefix-left | String | "" | non | Prefixe pour les champs gauche en cas de collision |
| prefix-right | String | "right_" | non | Prefixe pour les champs droite en cas de collision |

### Format de l'attribut `on`
- Clé commune : `on="code_dept"`
- Clé differente gauche/droite : `on="dept_code=code"`
- Multi-clé : `on="annee,code_region"`

### Types de jointure
- **inner** : seuls les enregistrements presents dans les deux sources
- **left** : tous les enregistrements de la source gauche, champs droite a null si absent
- **right** : tous les enregistrements de la source droite, champs gauche a null si absent
- **full** : union de tous les enregistrements, null pour les champs manquants

### Gestion des collisions
Si un champ existe dans les deux sources avec le même nom :
- Le `prefix-right` est applique au champ droit (défaut : `right_`)
- Le `prefix-left` est applique au champ gauche si défini
- La clé de jointure n'est jamais dupliquee

### Exemple 1 : enrichir un dataset population avec des budgets
```html
<dsfr-data-source id="pop" api-type="opendatasoft"
  dataset-id="population-dept" base-url="https://data.economie.gouv.fr">
</dsfr-data-source>
<dsfr-data-source id="budget" api-type="tabular"
  resource="abc123-budget-dept">
</dsfr-data-source>
<dsfr-data-join id="enriched"
  left="pop" right="budget"
  on="code_dept" type="left"
  prefix-right="budget_">
</dsfr-data-join>
<dsfr-data-chart source="enriched" type="bar"
  label-field="nom_dept" value-field="budget_montant">
</dsfr-data-chart>
```

### Exemple 2 : jointure avec transformation aval
```html
<dsfr-data-join id="joined" left="src1" right="src2" on="code_region" type="inner">
</dsfr-data-join>
<dsfr-data-query id="q" source="joined"
  aggregate="population:sum:total,budget:sum:total_budget"
  group-by="nom_region" order-by="total:desc">
</dsfr-data-query>
<dsfr-data-chart source="q" type="horizontalBar"
  label-field="nom_region" value-field="total">
</dsfr-data-chart>
```

### Exemple 3 : clés de nommage different
```html
<!-- La source gauche a "dept_code", la droite a "code" -->
<dsfr-data-join id="merged"
  left="src-a" right="src-b"
  on="dept_code=code" type="inner">
</dsfr-data-join>
```

### Notes
- Le join est recalcule automatiquement quand l'une des sources emet de nouvelles données
- Relations 1-N : si plusieurs enregistrements droite matchent une clé gauche, autant de lignes sont generees
- Le composant emet `dsfr-data-loading` tant qu'une source n'a pas encore repondu
- Le composant emet `dsfr-data-error` si l'une des sources est en erreur

### Référence `<dsfr-data-join>` (générée depuis le code)

**Rôle pipeline** : transformateur (`TransformerMixin`) — consomme `source`, ré-émet sous son propre `id`, relaie les commandes vers l’amont.

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `left` | `string` | `""` (vide) | ID de la source gauche (source principale) |
| `on` | `string` | `""` (vide) | Clé(s) de jointure. - Clé commune : on="code_dept" - Clé différente : on="dept_code=code" (gauche=droite) - Multi-clé : on="annee,code_region" |
| `prefix-left` | `string` | `""` (vide) | Préfixe pour les champs de la source gauche en cas de collision |
| `prefix-right` | `string` | `'right_'` | Préfixe pour les champs de la source droite en cas de collision |
| `right` | `string` | `""` (vide) | ID de la source droite |
| `type` | `JoinType` | `'left'` | Type de jointure : inner \| left \| right \| full |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `getAdapter()` | `import('../adapters/api-adapter.js').ApiAdapter \| null` | Retourne l'adapter de la source GAUCHE (delegation transparente). Coherent avec le relais des commandes (#272) : la gauche porte les lignes. Permet aux composants en aval (dsfr-data-facets, dsfr-data-search) d'atteindre l'adapter a travers ce transformateur. |
| `getAdapterParams()` | `import('../adapters/api-adapter.js').AdapterParams \| null` | Retourne les parametres adapter resolus de la source amont (delegation transparente, headers api-key-ref inclus — #274). |
| `getData()` | `Row[]` | — |
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
