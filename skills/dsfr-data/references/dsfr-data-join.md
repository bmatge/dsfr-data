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

### Pattern : ratio entre DEUX sources (agréger, joindre, diviser)
Le ratio de `dsfr-data-kpi` (`value="a / b"`) s'évalue sur l'UNIQUE source du KPI : `source` est
un scalaire. Un indicateur « par habitant » — donc toute comparaison entre territoires de tailles
différentes — croise deux jeux. Le motif qui marche aujourd'hui, à trois balises : **agréger avant
de joindre**. On ne joint pas 333 611 équipements à une table de population ; un `group-by` par
territoire ramène chaque source à UNE LIGNE PAR TERRITOIRE, la jointure les rapproche, et le ratio
mono-source s'applique à la ligne jointe.
```html
<!-- 1. Agréger CHAQUE source par territoire -->
<dsfr-data-query id="equip-par-commune" source="equipements"
  group-by="code_insee" aggregate="code_insee:count:nb_equipements"></dsfr-data-query>
<dsfr-data-query id="pop-par-commune" source="communes"
  group-by="com_code" aggregate="population:sum:habitants"></dsfr-data-query>

<!-- 2. Rapprocher les deux agrégats sur la clé de maille commune -->
<dsfr-data-join id="par-commune" type="inner"
  left="equip-par-commune" right="pop-par-commune" on="code_insee=com_code"></dsfr-data-join>

<!-- 3. Le ratio mono-source s'applique à la ligne jointe -->
<dsfr-data-kpi source="par-commune" value="nb_equipements:sum / habitants:sum"
  format="decimal" decimals="3" label="Équipements par habitant"></dsfr-data-kpi>
```
Pour un CLASSEMENT plutôt qu'un chiffre, intercaler un `dsfr-data-normalize` après la jointure :
`compute="pour_mille = round(nb_equipements / habitants * 1000, 1)"`, puis brancher un podium ou
un chart sur la colonne calculée.

**Limite à énoncer à l'utilisateur** : ce motif exige une CLÉ DE MAILLE COMMUNE aux deux sources —
même niveau territorial et même codage de la clé. Mailles différentes (adresse contre département) :
ramener d'abord la source fine à la maille grossière par `group-by`. Codages différents (code INSEE
contre nom, `01` contre `1`) : normaliser la clé avec `dsfr-data-normalize` AVANT la jointure.
**Le cas dangereux n'est pas la jointure vide, c'est la jointure PRESQUE pleine** : même nom de
colonne ne veut pas dire même graphie. Une source en `1`…`9`, l'autre en `01`…`09` : 98 lignes
sur 101 s'apparient, neuf départements tombent, et le ratio reste plausible (−1,5 % mesuré). La
jointure le signale (avertissement console citant les clés orphelines, alerte du volet Diagnostic
dès que les clés ne diffèrent qu'à la graphie près) — le lire avant de publier un chiffre. Si une
seule des deux sources connaît le territoire, le ratio n'est pas exprimable.

### Jointure-filtre : garder les lignes égales à une valeur calculée par l'API
Aucun opérateur de `where` ne sait dire « la dernière année publiée ». La voie : une source d'UNE
ligne qui fait calculer la valeur par le serveur, puis une jointure `inner` qui ne garde que les lignes
égales. Rien n'est écrit en dur : la page suit le jeu quand un nouveau millésime paraît.
```html
<dsfr-data-source id="derniere" api-type="opendatasoft" base-url="…" dataset-id="clubs_dep"
  select="max(year(annee)) as an"></dsfr-data-source>
<dsfr-data-source id="toutes" api-type="opendatasoft" base-url="…" dataset-id="clubs_dep"
  select="year(annee) as an, dep, n_actifs"></dsfr-data-source>
<dsfr-data-join id="dernier-millesime" left="toutes" right="derniere" on="an" type="inner"></dsfr-data-join>
```
Contre une source d'une ligne, écarter les autres lignes est le but : ni avertissement console ni alerte
au volet Diagnostic, qui la nomme « jointure-filtre ». Un écart de graphie (`2024` face à `"2024 "`)
reste signalé.

### Comparaison des clés : en chaîne, sans trim ni complétion
Les clés sont converties en chaîne avant comparaison — le type ne compte pas, la forme oui :
- `201` (nombre) et `"201"` (chaîne) **se joignent** ;
- `"0201"` et `"201"` **ne se joignent pas** (zéro initial) ; `" 201"` et `"201"` non plus (espace) ;
- `null` et `""` valent tous deux la clé vide et se joignent entre eux.
Harmoniser en amont : `numeric="code"` sur les deux sources pour un code numérique à zéro
initial, `normalize trim` pour les espaces, `where="cle:isnotnull"` pour écarter les lignes sans clé.

### Taux d'appariement (volet Diagnostic)
En `left`, le nombre de lignes ne change pas : une jointure qui n'apparie que 22 % des lignes
paraît saine. Le composant publie `leftMatched / leftTotal` et `rightMatched / rightTotal` dans sa
meta (`getJoinStats()`) ; le volet Diagnostic affiche « 237 / 1 065 lignes gauche appariées (22 %) »
et alerte sous 50 %. Pas d'attribut : ouvrir le volet quand les valeurs droites restent vides.

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
| `getAdapter()` | `import('../adapters/api-adapter.js').ApiAdapter \| null` | Retourne l'adapter de la source GAUCHE (délégation transparente). Coherent avec le relais des commandes (#272) : la gauche porte les lignes. Permet aux composants en aval (dsfr-data-facets, dsfr-data-search) d'atteindre l'adapter a travers ce transformateur. |
| `getAdapterParams()` | `import('../adapters/api-adapter.js').AdapterParams \| null` | Retourne les paramètres adapter resolus de la source amont (délégation transparente, headers api-key-ref inclus — #274). |
| `getData()` | `Row[]` | — |
| `getEffectiveWhere(excludeKey?: string)` | `string` | Retourne le where effectif de la source amont (délégation transparente). |
| `getJoinStats()` | `JoinStats \| null` | Taux d'appariement de la dernière jointure, ou null avant la première (#660). |


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
