# dsfr-data-list

> Tableau de données avec recherche, filtres, tri, pagination et export CSV/HTML
>
> Déclencheurs : tableau, table, liste, colonnes, pagination, exporter, csv, html, recherche, datalist

## <dsfr-data-list> - Tableau de données

Affiche un tableau DSFR filtrable, triable, paginable avec export CSV et/ou HTML.
Se connecte a une dsfr-data-source ou dsfr-data-query via l'attribut `source`.

### Format des données
Attend un tableau d'objets plats. Les colonnes sont définies par l'attribut `columns`
au format `"cle_json:Label affiche, cle2:Label2"`. Si `columns` est omis, toutes
les clés présentes dans les données deviennent colonnes (ordre d'apparition, libellé = clé) :
le tableau suit un schéma dynamique — c'est le consommateur naturel d'un `dsfr-data-pivot`
dont les colonnes suivent une facette (#255, #640). `columns-auto` combine les deux :
les colonnes déclarées (libellées, en tête) puis celles des données.

### Attributs
| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| source | String | `""` | oui | ID de la source ou query |
| columns | String | `""` | non | Definition des colonnes : `"key:Label, key2:Label2"`. Omis : toutes les clés des données (ordre d'apparition). Alias deprecie : `colonnes` |
| columns-auto | Boolean | `false` | non | Complète `columns` avec les clés des données absentes de la liste (libellé = clé) : colonnes figées en tête, dynamiques ensuite (#640) |
| search | Boolean | `false` | non | Afficher la barre de recherche full-text (desactivee en pagination serveur, #304). Alias deprecie : `recherche` |
| filters | String | `""` | non | Colonnes filtrables (dropdown) : `"col1,col2"`. Alias deprecie : `filtres` |
| sort | String | `""` | non | Tri par défaut : `"col:asc"` ou `"col:desc"`. Alias deprecie : `tri` |
| pagination | Number | `0` | non | Lignes par page (0 = tout afficher sans pagination) |
| caption | String | `""` | non | Titre du tableau (RGAA 5.4), rendu dans `caption` masqué visuellement ; à défaut dérivé de `aria-label` (#669) |
| decimals | Number | — | non | Nombre de décimales des cellules numériques ; absent : au plus 2, format fr-FR (#666) |
| export | String | `""` | non | Formats d'export : `"csv"`, `"html"` ou `"csv,html"` |
| url-sync | Boolean | `false` | non | Synchronise le numero de page dans l'URL (?page=N) via replaceState |
| url-page-param | String | `"page"` | non | Nom du parametre URL pour la page |
| server-sort | Boolean | `false` | non | Delegue le tri au serveur (retour page 1 automatique, #304). Alias deprecie : `server-tri` |

### Tri serveur
Avec `server-sort`, le clic sur un en-tete de colonne envoie une commande `{ orderBy }`
au source upstream (relais automatique du dsfr-data-query) au lieu de trier localement. Les données
reviennent déjà triees du serveur.

### Pagination serveur
Quand la source est un `dsfr-data-source` avec `paginate`, dsfr-data-list détecté automatiquement
la pagination serveur via les metadonnees (`meta.total`, `meta.page_size`).
Chaque changement de page declenche un nouvel appel API (pas de pagination client).
Le total affiche vient de `meta.total`. La recherche et le tri ne s'appliquent qu'a la page courante.

### Pagination et format des cellules
La pagination suit le motif DSFR : première/dernière page, ellipses (`1 2 3 … 115`), et
« Page N sur M » affiché et annoncé aux lecteurs d'écran (`aria-current="page"` sur la page
courante). M vient de `meta.total` en mode serveur, sinon du nombre de lignes filtrées.
Les cellules numériques (`typeof number`) sont rendues en fr-FR : `2.27` → « 2,27 », au plus
2 décimales, ou exactement `decimals` décimales. Les chaînes ne sont JAMAIS reformatées
(codes INSEE, SIREN, années en texte restent intacts) et l'export CSV/HTML reste brut.
Pour arrondir la donnée elle-même (et pas seulement l'affichage), `normalize round="champ:2"`
reste disponible.

### Synchronisation URL
Avec `url-sync`, le numero de page est synchronise dans l'URL via `replaceState`.
L'attribut `url-page-param` permet de personnaliser le nom du parametre (défaut: "page").
Quand la page est 1, le parametre est supprime de l'URL pour des URLs plus propres.
Fonctionne avec la pagination client et serveur. Compatible avec les autres params URL (facettes, recherche).

### Exemples
```html
<!-- Tableau simple -->
<dsfr-data-list source="data"
  columns="nom:Nom, email:Email, ville:Ville">
</dsfr-data-list>

<!-- Tableau complet avec toutes les fonctionnalites -->
<dsfr-data-list source="sites"
  columns="nom:Nom du site, ministere:Ministere, score_rgaa:Score RGAA"
  search
  filters="ministere"
  sort="score_rgaa:desc"
  pagination="20"
  export="csv,html">
</dsfr-data-list>
```

### Référence `<dsfr-data-list>` (générée depuis le code)

**Rôle pipeline** : affichage (`SourceSubscriberMixin`) — feuille du pipeline : consomme `source`, n’émet pas de données.

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `caption` | `string` | `""` (vide) | Titre du tableau, rendu dans `caption` (masqué visuellement, lu par les lecteurs d'écran — RGAA 5.4, #669). À défaut, dérivé de `aria-label`. |
| `colonnes` | `string` | `""` (vide) | **DEPRECIE** — ne pas utiliser dans du code neuf. alias français de `columns` (#300) |
| `columns` | `string` | `""` (vide) | Définition des colonnes : `"clé:Label, cle2:Label2"`. Omis : toutes les clés présentes dans les données deviennent colonnes, dans leur ordre d'apparition, libellé = clé — le tableau suit un schéma dynamique (aval d'un `dsfr-data-pivot`, #255). |
| `columns-auto` | `boolean` | `false` | Complète `columns` avec les clés des données qui n'y figurent pas (ordre d'apparition, libellé = clé) : les premières colonnes sont libellées et figées, les suivantes suivent les données (#640). |
| `decimals` | `number \| null` | `null` | Nombre de décimales des cellules numériques (#666). Absent : au plus 2 décimales, format fr-FR. Les exports CSV/HTML ne sont pas concernés. |
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
| `url-sync` | `boolean` | `false` | Synchronise le numéro de page dans l'URL (replaceState) |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `formatCellValue(value: unknown)` | `string` | Texte d'une cellule : « — » pour l'absence, Oui/Non pour les booléens, nombres en fr-FR (#666), tout le reste tel quel (jamais de parsing des chaînes : un code INSEE « 75056 » reste « 75056 »). |
| `getFilteredData()` | `Record<string, unknown>[]` | — |
| `getPageItems(totalPages: number, current: number, totalKnown: unknown)` | `PageItem[]` | Pages à afficher (#669) : première et dernière, fenêtre autour de la courante, ellipse pour chaque trou — « 1 2 3 … 115 », « 1 … 49 50 51 … 115 ». Un trou d'une seule page est comblé par son numéro plutôt qu'une ellipse. Total inconnu (`totalKnown` false) : pas de dernière page ni d'ellipse finale. |
| `parseColumns()` | `ColumnDef[]` | — |


**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-loaded` | `{ sourceId, data }` | écoute | Nouvelles données publiées par la source désignée par `source`. |
| `dsfr-data-error` | `{ sourceId, error }` | écoute | Erreur amont. |
| `dsfr-data-loading` | `{ sourceId }` | écoute | Chargement amont démarré. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
