# dsfr-data-search

> Recherche textuelle avec champ DSFR, filtre les données en amont
>
> Déclencheurs : recherche, search, chercher, filtrer texte, barre de recherche, full-text

## <dsfr-data-search> - Recherche textuelle

Composant visuel intermediaire qui affiche un champ de recherche DSFR et filtre
les données avant de les redistribuer aux composants en aval. Se place entre
une source/normalize et les facettes/visualisations.

### Position dans le pipeline
```
dsfr-data-source -> dsfr-data-normalize -> dsfr-data-search -> dsfr-data-facets -> dsfr-data-display
```
La recherche reduit le jeu de données, les facettes affinent ensuite.
Les compteurs de facettes se recalculent dynamiquement.

### Attributs
| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| id | String | - | oui | Identifiant unique. Sans cet attribut, dsfr-data-search affiche une alerte DSFR `fr-alert--warning` au lieu de la barre de recherche (et pose `data-dsfr-config-error` pour le debug). |
| source | String | "" | oui | ID de la source a ecouter |
| fields | String | "" | non | Champs a rechercher (virgule-separes). Vide = tous les champs |
| placeholder | String | "Rechercher..." | non | Placeholder du champ |
| label | String | "Rechercher" | non | Label accessible |
| debounce | Number | 300 | non | Delai en ms avant filtrage |
| min-length | Number | 0 | non | Nb minimum de caractères |
| highlight | Boolean | false | non | Ajoute _highlight avec <mark> pour dsfr-data-display |
| operator | String | "contains" | non | Mode : contains, starts, words |
| sr-label | Boolean | false | non | Label en sr-only (masque visuellement) |
| count | Boolean | false | non | Affiche compteur de resultats |
| url-search-param | String | "" | non | Nom du parametre d'URL a lire comme terme de recherche initial |
| url-sync | Boolean | false | non | Synchronise l'URL quand l'utilisateur tape (replaceState) |
| server-search | Boolean | false | non | Delegue la recherche au serveur (le dsfr-data-query amont relaie automatiquement vers la source server-side) |
| search-template | String | `'search("{q}")'` | non | Template ODSQL pour la recherche serveur ({q} = terme) |

### Recherche serveur
Avec `server-search`, au lieu de filtrer localement, dsfr-data-search envoie une commande
`{ where }` au source upstream (relais automatique du dsfr-data-query). Le template par défaut utilise
la fonction ODSQL `search()` pour une recherche full-text. Personnalisable via `search-template`.

### Modes de recherche
- **contains** (défaut) : sous-chaine insensible a la casse et aux accents
- **starts** : chaque mot du champ doit commencer par le terme
- **words** : tous les mots saisis doivent etre presents (dans n'importe quel champ)

### Exemples
```html
<!-- Recherche simple -->
<dsfr-data-search id="searched" source="clean"
  placeholder="Rechercher..." count>
</dsfr-data-search>
<dsfr-data-display source="searched" cols="2" pagination="12">
  <template>...</template>
</dsfr-data-display>

<!-- Recherche + facettes -->
<dsfr-data-search id="searched" source="clean"
  fields="nom, description, code"
  operator="words" count>
</dsfr-data-search>
<dsfr-data-facets id="filtered" source="searched"
  fields="catégorie, region">
</dsfr-data-facets>
<dsfr-data-display source="filtered" ...>...</dsfr-data-display>

<!-- Recherche avec highlight -->
<dsfr-data-search id="searched" source="clean" highlight count>
</dsfr-data-search>
<dsfr-data-display source="searched" cols="1">
  <template>
    <h3>{{nom}}</h3>
    <p>{{{_highlight}}}</p>
  </template>
</dsfr-data-display>

<!-- Recherche pre-remplie depuis URL (ex: ?q=ecole) -->
<dsfr-data-search id="searched" source="clean"
  url-search-param="q" count>
</dsfr-data-search>

<!-- Recherche avec sync URL bidirectionnelle -->
<dsfr-data-search id="searched" source="clean"
  url-search-param="q" url-sync count>
</dsfr-data-search>

<!-- Recherche serveur (le dsfr-data-query relaie automatiquement vers la source server-side) -->
<dsfr-data-search id="s" source="q" server-search
  url-search-param="q" url-sync count>
</dsfr-data-search>
```

### Référence `<dsfr-data-search>` (générée depuis le code)

**Rôle pipeline** : transformateur (`TransformerMixin`) — consomme `source`, ré-émet sous son propre `id`, relaie les commandes vers l’amont.

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `count` | `boolean` | `false` | Affiche un compteur de resultats sous le champ |
| `debounce` | `number` | `300` | Delai en ms avant declenchement du filtre apres la derniere frappe |
| `fields` | `string` | `""` (vide) | Champs sur lesquels rechercher (virgule-separes). Vide = tous les champs |
| `highlight` | `boolean` | `false` | Ajoute un champ _highlight a chaque record avec les termes trouves marques en <mark> |
| `label` | `string` | `'Rechercher'` | Label du champ (accessible) |
| `min-length` | `number` | `0` | Nombre minimum de caractères avant declenchement |
| `operator` | `SearchOperator` | `'contains'` | Mode de recherche : contains, starts, words |
| `placeholder` | `string` | `'Rechercher…'` | Placeholder du champ de saisie |
| `search-template` | `string` | `""` (vide) | Template pour la recherche serveur. {q} est remplace par le terme de recherche. Si vide et server-search active, lu depuis l'adapter de la source amont. Ex ODS: 'search("{q}")', custom: '{q} IN nom' |
| `server-search` | `boolean` | `false` | Active le mode recherche serveur. Au lieu de filtrer localement, envoie une commande { where } au source upstream (dsfr-data-query server-side) qui re-fetche les données avec le filtre search. |
| `source` | `string` | `""` (vide) | ID de la source de données a ecouter |
| `sr-label` | `boolean` | `false` | Si true, le label est en sr-only (visuellement masque, accessible) |
| `url-search-param` | `string` | `""` (vide) | Nom du paramètre d'URL à lire comme terme de recherche initial. Vide = désactivé |
| `url-sync` | `boolean` | `false` | Synchronise l'URL quand l'utilisateur tape (replaceState) |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `clear()` | `void` | Efface le champ et restaure toutes les données |
| `getAdapter()` | `import('../adapters/api-adapter.js').ApiAdapter \| null` | Retourne l'adapter de la source amont (delegation transparente). Permet aux composants en aval (dsfr-data-facets) d'acceder a l'adapter sans connaitre la structure du pipeline. |
| `getAdapterParams()` | `import('../adapters/api-adapter.js').AdapterParams \| null` | Retourne les paramètres adapter résolus de la source amont (delegation transparente, headers api-key-ref inclus — #274). |
| `getData()` | `Record<string, unknown>[]` | Retourne les données actuellement filtrees |
| `getEffectiveWhere(excludeKey?: string)` | `string` | Retourne le where effectif de la source amont (delegation transparente). |
| `search(term: string)` | `void` | Declenche une recherche programmatique |
| `setData(data: Record<string, unknown>[])` | `void` | Remplace le jeu de données source |


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
| `dsfr-data-search-change` | — | émis | `{ query, count }` sur l'element — la saisie de recherche a change (pour synchroniser une UI de page). |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
