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
| operator | String | "contains" | non | Mode de la recherche CALCULEE DANS LE NAVIGATEUR : contains, starts, words (casse et accents ignores). Une recherche confiee a un serveur (`server-search`, ou cible de `context` dont l'API sait chercher) suit la comparaison de ce serveur |
| sr-label | Boolean | false | non | Label en sr-only (masque visuellement) |
| count | Boolean | false | non | Affiche un compteur de résultats visible sous le champ (compte serveur en `server-search`), avec séparateur de milliers français. Voir Accessibilité : il n'est une région live que sans afficheur aval. Tant que l'amont attend un filtre (`require-where`), le compteur cède la place au message d'attente |
| count-label | String | `""` | non | Nom compté à la place de « résultat » : `count-label="établissement"` → « 12 345 établissements ». Pluriel irrégulier : les deux formes, `count-label="cheval|chevaux"` |
| idle-message | String | "Choisissez un filtre pour afficher les données" | non | Message rendu à la place du compteur quand l'amont attend un filtre (`require-where`). Nécessite `count` |
| url-search-param | String | "" | non | Nom du parametre d'URL a lire comme terme de recherche initial |
| url-sync | Boolean | false | non | Synchronise l'URL quand l'utilisateur tape (replaceState) |
| server-search | Boolean | false | non | Delegue la recherche au serveur (le dsfr-data-query amont relaie automatiquement vers la source server-side) |
| search-template | String | `'search("{q}")'` | non | Template ODSQL pour la recherche serveur ({q} = terme) |
| context | String | "" | non | Id d'un dsfr-data-context (#678) : la recherche est confiee au contexte, qui la diffuse a ses cibles, porte l'URL (parametre nomme d'apres le champ ; url-sync / url-search-param ignores) et le tag « Recherche : terme ». `fields` doit nommer UN seul champ. Ce n'est PAS un filtre `contains` : chaque cible traduit la recherche selon son API (voir « Recherche portee par le contexte »). Vide = mode autonome |

### Recherche portee par le contexte (`context="id"`, ADR-159)
Une recherche n'est pas un filtre. Le filtre `contains` est EXACT (sous-chaine, accents
respectes) ; la recherche est TOLERANTE, et quand l'API d'une source sait chercher, c'est elle qui
cherche. En mode `context`, le terme saisi est porte comme une recherche et CHAQUE SOURCE CIBLE
le traduit :

| Source cible | Qui cherche | Comment |
|---|---|---|
| Opendatasoft | le moteur du portail, borne au champ (`search(champ, "terme")`) | par DEBUT DE MOT, casse et accents ignores : « aliment » trouve « alimentation », « mentation » non. Le champ doit etre du TEXTE (un champ numerique : recherche calculee dans le navigateur) |
| Tabular, Grist | l'API (`champ:contains:terme`) | sous-chaine, casse ignoree, accents RESPECTES : « ecole » ne trouve pas « École » |
| INSEE Melodi, adaptateur tiers | la source, dans le navigateur | sur les lignes chargees (sous `max-records`), avec `operator`, casse et accents ignores |
| source en mode URL (sans `api-type`) | personne : la commande est refusee et signalee en console | brancher la recherche SUR cette source (`source="…"`, sans `context`) : elle filtre alors ses lignes elle-meme |

Consequences :
- confiee a l'API, la recherche entre dans le `where` de la source : une cible `server-side`
  pagine les seules lignes trouvees, et des `dsfr-data-facets server-facets` voisines comptent le
  meme ensemble. La recherche laisse alors passer les lignes de sa source sans les refiltrer, et son
  compteur (`count`) annonce le total du serveur ;
- calculee dans le navigateur, elle exige que la source charge le jeu : une cible `server-side`,
  ou des `server-facets` voisines, passent en ERREUR DE CONFIGURATION ;
- le resultat n'est donc pas identique d'un fournisseur a l'autre (debut de mot, sous-chaine,
  accents) : c'est assume, et c'est ce tableau qui le dit. Ne pas promettre une recherche « au
  milieu d'un mot » sur un portail Opendatasoft ;
- dans l'URL, dans `dsfr-data-context-tags` et dans `dsfr-data-context-value`, la recherche
  reste un filtre comme les autres : un parametre au nom du champ, un tag retirable, `{{champ}}`.

```html
<!-- Recherche, facettes serveur et pagination serveur sur un portail Opendatasoft :
     les trois comptent le meme ensemble -->
<dsfr-data-source id="src" api-type="opendatasoft" base-url="https://data.economie.gouv.fr"
  dataset-id="rappelconso-v2-gtin-trie" server-side page-size="20"></dsfr-data-source>
<dsfr-data-context id="ctx" sources="src" url-sync></dsfr-data-context>
<dsfr-data-search id="recherche" source="src" context="ctx" fields="libelle"
  label="Rechercher un produit" count></dsfr-data-search>
<dsfr-data-context-tags for="ctx" clear-all></dsfr-data-context-tags>
<dsfr-data-facets id="facettes" source="src" context="ctx" server-facets
  fields="categorie_produit" labels="categorie_produit:Catégorie" no-reset></dsfr-data-facets>
<dsfr-data-list source="src" columns="libelle:Produit, marque_produit:Marque" pagination="20">
</dsfr-data-list>
```

### Recherche serveur
Avec `server-search`, au lieu de filtrer localement, dsfr-data-search envoie une commande
`{ where }` au source upstream (relais automatique du dsfr-data-query). Le template par défaut utilise
la fonction ODSQL `search()` pour une recherche full-text. Personnalisable via `search-template`.

Sur **Tabular** (#1026), le template par défaut est `{fields}:contains:{q}` : `{fields}` devient les
champs de `fields` séparés par `|` (un OU entre champs), traduit en
`or=(nom__contains.q,commune__contains.q)`. Le compteur lit alors le total serveur, juste sur tout le
jeu. `fields` est donc obligatoire. `contains` y est insensible à la casse mais SENSIBLE aux accents :
« ecole » ne trouve pas « École » côté serveur. Un terme que l'API ne sait pas transmettre (`,` `.`
`(` `)` `"` `&`) retombe sur une recherche locale, signalée en console.

```html
<dsfr-data-source id="src" api-type="tabular" resource="…" server-side page-size="20"></dsfr-data-source>
<dsfr-data-search id="r" source="src" fields="nom,commune" server-search count></dsfr-data-search>
<dsfr-data-list id="l" source="r" columns="nom:Nom, commune:Commune" pagination="20"></dsfr-data-list>
```

### Accessibilité : une seule région live par chaîne
Le compte de résultats n'est annoncé au lecteur d'écran (`aria-live`) qu'une fois par chaîne,
par le composant terminal. Quand un afficheur aval (`dsfr-data-list`, `dsfr-data-display`)
consomme la sortie de search — en direct ou via `dsfr-data-facets` — search ne rend aucune
région live : le compteur `count` reste visible mais silencieux, l'afficheur annonce seul
le compte final (après les facettes). Sans afficheur aval (search → chart, kpi...), search
annonce lui-même son compte. Ne pas ajouter de région live supplémentaire dans la page
(un `<p role="status">` maison) : deux annonces pour un même geste donnent deux nombres
contradictoires (#654).

### Modes de recherche
Ils valent pour la recherche calculee dans le navigateur (mode autonome, repli de
`server-search`, cible de `context` sans API pour chercher) :
- **contains** (défaut) : sous-chaine insensible a la casse et aux accents
- **starts** : chaque mot du champ doit commencer par le terme
- **words** : tous les mots saisis doivent etre presents (dans n'importe quel champ)

### Exemples
```html
<!-- Recherche simple -->
<dsfr-data-search id="searched" source="clean"
  placeholder="Rechercher..." count>
</dsfr-data-search>
<dsfr-data-display source="searched" per-row="2" pagination="12">
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
<dsfr-data-display source="searched" per-row="1">
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
| `context` | `string` | `""` (vide) | Id du dsfr-data-context auquel s'enregistrer (#678, ADR-104) : la recherche est confiée au contexte, qui la diffuse à ses cibles et porte l'URL (`url-sync` et `url-search-param` sont ignorés — le paramètre est nommé d'après le champ, ou via `url-param-map` du contexte). `fields` doit nommer UN seul champ (le OU entre champs, `a\|b:contains:q` #1026, reste propre à `server-search`). Le contexte peut être déclaré après la recherche dans la page. Vide = comportement autonome. La recherche n'est pas un filtre `contains` (ADR-159) : CHAQUE CIBLE LA TRADUIT, selon ce que son API sait faire. - Opendatasoft : le moteur de recherche du portail, borné au champ (`search(champ, "terme")`) — par DÉBUT DE MOT, casse et accents ignorés : « aliment » trouve « alimentation », « mentation » non. Le champ doit être du texte. - Tabular, Grist : une sous-chaîne (`champ:contains:terme`), casse ignorée, accents respectés. - INSEE Melodi, adaptateur tiers : la source calcule la recherche dans le navigateur, sur les lignes chargées (dans la limite de `max-records`), avec `operator`, casse et accents ignorés. Confiée à l'API, la recherche entre dans le `where` de la source : une cible en `server-side` et des facettes `server-facets` voisines comptent le même ensemble. Ce composant laisse alors passer les lignes de sa source sans les refiltrer, et son compteur (`count`) annonce le total du serveur. Calculée dans le navigateur, elle exige que la source charge le jeu : une cible en `server-side` passe en erreur de configuration. |
| `count` | `boolean` | `false` | Affiche un compteur de résultats sous le champ (compte serveur `meta.total` en `server-search`), séparateur de milliers français (#728). Ce compteur reste visible dès qu'une donnée a circulé ; seule sa nature de région live dépend de la chaîne aval (#654). Tant que l'amont attend un filtre (`require-where`), il cède la place au message d'attente : annoncer « 0 résultats » avant toute requête laisserait croire à une page vide. |
| `count-label` | `string` | `""` (vide) | Nom compté par le compteur de `count`, à la place de « résultat » : `count-label="établissement"` affiche « 12 345 établissements ». Une forme seule prend un « s » au pluriel ; pour un pluriel irrégulier, donner les deux formes séparées par une barre verticale : `count-label="cheval\|chevaux"`, `count-label="prix\|prix"`. |
| `debounce` | `number` | `300` | Délai en ms avant déclenchement du filtre après la dernière frappe |
| `fields` | `string` | `""` (vide) | Champs sur lesquels rechercher (virgule-séparés). Vide = tous les champs |
| `highlight` | `boolean` | `false` | Ajoute un champ _highlight à chaque record avec les termes trouvés marqués en <mark> |
| `idle-message` | `string` | `IDLE_MESSAGE_DEFAULT` | Message rendu quand l'amont attend un filtre (`require-where`, #690). Distinct de « aucune donnée » : aucune requête n'a été faite. Vide, le libellé par défaut est utilisé. |
| `label` | `string` | `'Rechercher'` | Label du champ (accessible) |
| `min-length` | `number` | `0` | Nombre minimum de caractères avant déclenchement |
| `operator` | `SearchOperator` | `'contains'` | Mode de recherche quand elle est calculée dans le navigateur, casse et accents ignorés : `contains` (le terme est une sous-chaîne), `starts` (un mot commence par le terme), `words` (tous les mots du terme sont présents). Une recherche confiée à un serveur (`server-search`, ou cible de `context` dont l'API a de quoi chercher) suit la comparaison de ce serveur. |
| `placeholder` | `string` | `'Rechercher…'` | Placeholder du champ de saisie |
| `search-template` | `string` | `""` (vide) | Template pour la recherche serveur. {q} est remplacé par le terme de recherche, {fields} par les champs de `fields` séparés par `\|` (#1026) — la grammaire colon des champs multiples, un OU entre eux. Si vide et server-search activé, lu depuis l'adaptateur de la source amont (gabarit par défaut de chaque adaptateur déclarant `serverSearch` : recherche plein texte native, ou `{fields}:contains:{q}` traduit en OU entre colonnes — la casse et les accents suivent l'API ; table des capacités d'ARCHITECTURE). Ex. personnalisés : '{q} IN nom', 'nom\|commune:contains:{q}'. Une clause que l'adaptateur ne sait pas transmettre (caractère que son API ne sait pas porter), ou une source sans adaptateur, retombe sur une recherche locale, signalée en console. |
| `server-search` | `boolean` | `false` | Active le mode recherche serveur. Au lieu de filtrer localement, envoie une commande { where } au source upstream (dsfr-data-query server-side) qui re-fetche les données avec le filtre search. |
| `source` | `string` | `""` (vide) | ID de la source de données a ecouter |
| `sr-label` | `boolean` | `false` | Si true, le label est en sr-only (visuellement masque, accessible) |
| `url-search-param` | `string` | `""` (vide) | Nom du paramètre d'URL à lire comme terme de recherche initial. Vide = désactivé |
| `url-sync` | `boolean` | `false` | Synchronise l'URL quand l'utilisateur tape (replaceState) |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `clear()` | `void` | Efface le champ et restaure toutes les données |
| `getAdapter()` | `import('../adapters/api-adapter.js').ApiAdapter \| null` | Retourne l'adapter de la source amont (délégation transparente). Permet aux composants en aval (dsfr-data-facets) d'acceder a l'adapter sans connaitre la structure du pipeline. |
| `getAdapterParams()` | `import('../adapters/api-adapter.js').AdapterParams \| null` | Retourne les paramètres adapter résolus de la source amont (délégation transparente, headers api-key-ref inclus — #274). |
| `getData()` | `Record<string, unknown>[]` | Retourne les données actuellement filtrees. Vide pendant une panne de l'amont (#1272) : voir `getLastKnownData()`. |
| `getEffectiveWhere(excludeKey?: string | string[])` | `string` | Retourne le where effectif de la source amont (délégation transparente). |
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
| `dsfr-data-search-change` | — | émis | `{ query, count }` sur l'élément — la saisie de recherche a change (pour synchroniser une UI de page). |
| `dsfr-data-source-command` | — | émis | `{ sourceId, where, whereKey, origin }` sur `document` — recherche relayee en filtre serveur vers la source amont (hors mode `context`, ou c'est le contexte qui diffuse). `origin` porte l'id de ce composant (#603). |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
