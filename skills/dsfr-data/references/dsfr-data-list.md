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
| refine-on-click | String | `""` | non | Champ dont la valeur de la ligne cliquee devient un filtre `eq` (#734) : premier clic = filtre, second clic sur la meme ligne = retrait, autre ligne = remplacement. Avec `context` (recommande) : filtre du dsfr-data-context (tag, URL, dialecte de chaque cible). Sans `context` : commande directe a `source` (whereKey `list-select-ID`) |
| context | String | `""` | non | Id du dsfr-data-context auquel s'enregistrer en `refine-on-click` (#734, ADR-104). Peut etre declare apres le tableau |
| label | String | `""` | non | Libelle du tag du contexte en `refine-on-click` (defaut : le libelle de la colonne filtree, sinon le nom du champ) |
| cell-class | String | `""` | non | Classe CSS d'une cellule pilotee par une colonne calculee (#740) : `"colonne:colonne_classe"`, plusieurs paires separees par des virgules ; `"colonne"` seul classe la cellule par sa propre valeur |

### Colorer une cellule selon un seuil (cell-class, #740)
Il n'y a pas de `threshold-*` par colonne sur le tableau : la voie est **colonne calculee →
classe**. Le `compute` de `dsfr-data-normalize` sait deja produire une tranche (#671) ;
`cell-class` en fait la classe de la cellule. Une seule mecanique, et le critere RGAA 1.4.1
satisfait par construction : la valeur textuelle existe deja dans une colonne. Quand cette
colonne n'est PAS affichee, le tableau la restitue dans la cellule en texte masque
visuellement — l'information n'est jamais portee par la seule couleur.

La valeur de la colonne de classe devient la classe (plusieurs classes separees par des
espaces) ; seuls les identifiants CSS sont retenus, le reste est ignore.

```html
<dsfr-data-normalize id="avec-seuil" source="brut"
  compute="alerte = when taux_reponse >= 50 then 'seuil-ok' else 'seuil-bas'"></dsfr-data-normalize>

<dsfr-data-list source="avec-seuil"
  columns="service:Service, taux_reponse:Taux de reponse, alerte:Seuil"
  cell-class="taux_reponse:alerte"></dsfr-data-list>

<style>
  .seuil-bas { background: var(--background-contrast-error); font-weight: 700; }
  .seuil-ok  { background: var(--background-contrast-success); }
</style>
```

### Le clic sur une ligne filtre les autres vues (refine-on-click, #734)
Meme mecanique que `dsfr-data-map-layer refine-on-click` (#681), meme mixin : le tableau
devient un filtre du `dsfr-data-context`. Une colonne de selection est ajoutee en tete du
tableau, avec un vrai `<button>` par ligne : atteignable au clavier, annonce comme un bouton,
etat porte par `aria-pressed` et par le libelle (« Filtrer sur Paris » / « Retirer le filtre
Paris »), jamais par la seule couleur. La ligne selectionnee porte aussi `aria-current="true"`.
Le clic n'importe ou sur la ligne fait la meme bascule (confort a la souris) sans voler le clic
d'un lien rendu dans une cellule. L'evenement `dsfr-data-select` `{ record, elementId, selected }`
est emis a chaque bascule (bubbles, composed). Meme chose sur `dsfr-data-display`.

```html
<dsfr-data-context id="ctx" sources="details" url-sync></dsfr-data-context>
<dsfr-data-list source="communes" columns="commune:Commune, population:Population"
  refine-on-click="commune" context="ctx"></dsfr-data-list>
<dsfr-data-context-tags context="ctx"></dsfr-data-context-tags>
<dsfr-data-chart source="details" type="bar" label-field="annee" value-field="valeur"></dsfr-data-chart>
```

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
| `cell-class` | `string` | `""` (vide) | Classe CSS d'une cellule pilotée par une colonne calculée (#740) : `"colonne:colonne_classe"`, plusieurs paires séparées par des virgules ; `"colonne"` seul classe la cellule par sa propre valeur. La valeur de la colonne de classe DEVIENT la classe de la cellule (plusieurs classes séparées par des espaces) : produisez-la avec le `compute` de dsfr-data-normalize, par exemple `compute="alerte = when taux >= 50 then 'seuil-ok' else 'seuil-bas'"`, puis stylez `.seuil-bas` dans la page. Seuls les identifiants CSS sont retenus, le reste est ignoré. Quand la colonne de classe n'est pas affichée, sa valeur est ajoutée à la cellule en texte pour les lecteurs d'écran : l'information n'est jamais portée par la seule couleur. |
| `colonnes` | `string` | `""` (vide) | **DEPRECIE** — ne pas utiliser dans du code neuf. alias français de `columns` (#300) |
| `columns` | `string` | `""` (vide) | Définition des colonnes : `"clé:Label, cle2:Label2"`. Omis : toutes les clés présentes dans les données deviennent colonnes, dans leur ordre d'apparition, libellé = clé — le tableau suit un schéma dynamique (aval d'un `dsfr-data-pivot`, #255). |
| `columns-auto` | `boolean` | `false` | Complète `columns` avec les clés des données qui n'y figurent pas (ordre d'apparition, libellé = clé) : les premières colonnes sont libellées et figées, les suivantes suivent les données (#640). |
| `context` | `string` | `""` (vide) | Identifiant du dsfr-data-context auquel s'enregistrer en `refine-on-click` (#734, ADR-104). Le contexte peut être déclaré après le tableau dans la page. Vide = commande directe à `source` (chemin dégradé). |
| `decimals` | `number \| null` | `null` | Nombre de décimales des cellules numériques (#666). Absent : au plus 2 décimales, format fr-FR. Les exports CSV/HTML ne sont pas concernés. |
| `export` | `string` | `""` (vide) | Formats d'export disponibles: "csv", "html" (separables par virgule) |
| `filters` | `string` | `""` (vide) | Colonnes filtrables: "ministere,statut" |
| `filtres` | `string` | `""` (vide) | **DEPRECIE** — ne pas utiliser dans du code neuf. alias français de `filters` (#300) |
| `idle-message` | `string` | `IDLE_MESSAGE_DEFAULT` | Message rendu quand l'amont attend un filtre (`require-where`, #690). Distinct de « aucune donnée » : aucune requête n'a été faite. Vide, le libellé par défaut est utilisé. |
| `label` | `string` | `""` (vide) | Libellé du tag de contexte en `refine-on-click` (#734). Vide = le libellé de la colonne filtrée, à défaut le nom du champ. |
| `pagination` | `number` | `0` | Nombre d'éléments par page (0 = pas de pagination) |
| `recherche` | `boolean` | `false` | **DEPRECIE** — ne pas utiliser dans du code neuf. alias français de `search` (#300) |
| `refine-on-click` | `string` | `""` (vide) | Champ dont la valeur de la ligne cliquée devient un filtre `eq` (#734). Premier clic = filtre, second clic sur la même ligne = retrait, clic sur une autre ligne = remplacement. Une colonne de sélection est ajoutée en tête du tableau : un bouton par ligne, atteignable au clavier, dont l'état est annoncé (`aria-pressed`) — la couleur de la ligne sélectionnée n'est jamais la seule marque. Avec `context="id"` (recommandé), le tableau s'enregistre comme filtre du dsfr-data-context : diffusion à toutes ses sources cibles au dialecte de chacune, tag dans dsfr-data-context-tags, URL portée par le contexte. Sans `context`, la clause part directement à `source` (whereKey `list-select-ID`) — sans tag ni URL, et le tableau se filtre lui-même (seule la ligne cliquée reste, jusqu'au second clic). |
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
| `selectionLabel()` | `string` | Libellé du tag : `label`, à défaut le libellé de la colonne, à défaut le champ |


**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-loaded` | `{ sourceId, data }` | écoute | Nouvelles données publiées par la source désignée par `source`. |
| `dsfr-data-error` | `{ sourceId, error }` | écoute | Erreur amont. |
| `dsfr-data-loading` | `{ sourceId }` | écoute | Chargement amont démarré. |
| `dsfr-data-select` | — | émis | `{ record, elementId, selected }` sur le tableau (bubbles, composed) — au clic sur une ligne en `refine-on-click` (#734). `selected` vaut `true` à la sélection, `false` quand le clic la retire (second clic sur la même ligne, ou croix du tag de contexte). |
| `dsfr-data-source-command` | — | émis | `{ sourceId, where, whereKey, origin }` sur `document` — en `refine-on-click` SANS `context` (chemin dégradé) : clause `eq` poussée directement à `source` sous le whereKey `list-select-ID`. Avec `context`, c'est le contexte qui diffuse. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
