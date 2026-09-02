# dsfr-data-list

> Tableau de données avec recherche, filtres, tri, pagination et export CSV/HTML
>
> Déclencheurs : tableau, table, liste, colonnes, pagination, exporter, csv, html, recherche, datalist

## <dsfr-data-list> - Tableau de données

Affiche un tableau DSFR filtrable, triable, paginable avec export CSV et/ou HTML.
Se connecte a une dsfr-data-source ou dsfr-data-query via l'attribut `source`.

### Format des données
Attend un tableau d'objets plats. Les colonnes sont définies par l'attribut `colonnes`
au format `"cle_json:Label affiche, cle2:Label2"`. Si `colonnes` est omis, toutes
les clés du premier objet sont utilisees comme colonnes.

### Attributs
| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| source | String | `""` | oui | ID de la source ou query |
| columns | String | `""` | non | Definition des colonnes : `"key:Label, key2:Label2"`. Alias deprecie : `colonnes` |
| search | Boolean | `false` | non | Afficher la barre de recherche full-text (desactivee en pagination serveur, #304). Alias deprecie : `recherche` |
| filters | String | `""` | non | Colonnes filtrables (dropdown) : `"col1,col2"`. Alias deprecie : `filtres` |
| sort | String | `""` | non | Tri par défaut : `"col:asc"` ou `"col:desc"`. Alias deprecie : `tri` |
| pagination | Number | `0` | non | Lignes par page (0 = tout afficher sans pagination) |
| export | String | `""` | non | Formats d'export : `"csv"`, `"html"` ou `"csv,html"` |
| url-sync | Boolean | `false` | non | Synchronise le numero de page dans l'URL (?page=N) via replaceState |
| url-page-param | String | `"page"` | non | Nom du parametre URL pour la page |
| server-sort | Boolean | `false` | non | Delegue le tri au serveur (retour page 1 automatique, #304). Alias deprecie : `server-tri` |

### Tri serveur
Avec `server-tri`, le clic sur un en-tete de colonne envoie une commande `{ orderBy }`
au source upstream (relais automatique du dsfr-data-query) au lieu de trier localement. Les données
reviennent déjà triees du serveur.

### Pagination serveur
Quand la source est un `dsfr-data-source` avec `paginate`, dsfr-data-list détecté automatiquement
la pagination serveur via les metadonnees (`meta.total`, `meta.page_size`).
Chaque changement de page declenche un nouvel appel API (pas de pagination client).
Le total affiche vient de `meta.total`. La recherche et le tri ne s'appliquent qu'a la page courante.

### Synchronisation URL
Avec `url-sync`, le numero de page est synchronise dans l'URL via `replaceState`.
L'attribut `url-page-param` permet de personnaliser le nom du parametre (défaut: "page").
Quand la page est 1, le parametre est supprime de l'URL pour des URLs plus propres.
Fonctionne avec la pagination client et serveur. Compatible avec les autres params URL (facettes, recherche).

### Exemples
```html
<!-- Tableau simple -->
<dsfr-data-list source="data"
  colonnes="nom:Nom, email:Email, ville:Ville">
</dsfr-data-list>

<!-- Tableau complet avec toutes les fonctionnalites -->
<dsfr-data-list source="sites"
  colonnes="nom:Nom du site, ministere:Ministere, score_rgaa:Score RGAA"
  recherche
  filtres="ministere"
  tri="score_rgaa:desc"
  pagination="20"
  export="csv,html">
</dsfr-data-list>
```

### Référence `<dsfr-data-list>` (générée depuis le code)

**Rôle pipeline** : affichage (`SourceSubscriberMixin`) — feuille du pipeline : consomme `source`, n’émet pas de données.

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `colonnes` | `string` | `""` (vide) | **DEPRECIE** — ne pas utiliser dans du code neuf. alias français de `columns` (#300) |
| `columns` | `string` | `""` (vide) | Définition des colonnes: "clé:Label, cle2:Label2" |
| `export` | `string` | `""` (vide) | Formats d'export disponibles: "csv", "html" (separables par virgule) |
| `filters` | `string` | `""` (vide) | Colonnes filtrables: "ministere,statut" |
| `filtres` | `string` | `""` (vide) | **DEPRECIE** — ne pas utiliser dans du code neuf. alias français de `filters` (#300) |
| `pagination` | `number` | `0` | Nombre d'éléments par page (0 = pas de pagination) |
| `recherche` | `boolean` | `false` | **DEPRECIE** — ne pas utiliser dans du code neuf. alias français de `search` (#300) |
| `search` | `boolean` | `false` | Afficher un champ de recherche |
| `server-sort` | `boolean` | `false` | Active le tri serveur. Au lieu de trier localement, envoie une commande { orderBy } au source upstream (dsfr-data-query server-side) qui re-fetche les données triees. |
| `server-tri` | `boolean` | `false` | **DEPRECIE** — ne pas utiliser dans du code neuf. alias français de `server-sort` (#300) |
| `sort` | `string` | `""` (vide) | Tri par défaut: "score:desc" |
| `source` | `string` | `""` (vide) | Id de la source (ou du transformateur) dont ce tableau consomme les données. |
| `tri` | `string` | `""` (vide) | **DEPRECIE** — ne pas utiliser dans du code neuf. alias français de `sort` (#300) |
| `url-page-param` | `string` | `'page'` | Nom du paramètre URL pour la page (défaut: "page") |
| `url-sync` | `boolean` | `false` | Synchronise le numero de page dans l'URL (replaceState) |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `formatCellValue(value: unknown)` | `string` | — |
| `getFilteredData()` | `Record<string, unknown>[]` | — |
| `parseColumns()` | `ColumnDef[]` | — |


**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-loaded` | `{ sourceId, data }` | écoute | Nouvelles données publiées par la source désignée par `source`. |
| `dsfr-data-error` | `{ sourceId, error }` | écoute | Erreur amont. |
| `dsfr-data-loading` | `{ sourceId }` | écoute | Chargement amont démarré. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
