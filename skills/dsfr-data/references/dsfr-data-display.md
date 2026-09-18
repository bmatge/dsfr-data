# dsfr-data-display

> Affichage dynamique de données via template HTML (cartes, tuiles, listes)
>
> Déclencheurs : cartes, carte, tuiles, tuile, cards, tiles, display, template, affichage, liste de resultats, motif repetitif, un graphique par ligne, un kpi par ligne, composant par ligne, repeter, ng-repeat

## <dsfr-data-display> - Affichage dynamique via template

Généré des elements HTML repetitifs (cartes DSFR, tuiles, callouts, etc.) a partir
d'un template et d'une source de données. Chaque element du tableau de données produit
une instance du template avec les valeurs injectees.

### Syntaxe du template
Le template est défini dans un element `<template>` enfant du composant.
Les placeholders sont remplaces pour chaque element de données :

Grammaire d'un placeholder : `{{chemin[:format[:arg]][|défaut]}}` — l'argument du format vient
après un second `:` ; il ne peut pas contenir `|` (qui ouvre le défaut).

| Syntaxe | Description |
|---------|-------------|
| `{{champ}}` | Valeur echappee (HTML-safe) |
| `{{{champ}}}` | Valeur brute (non echappee — utiliser avec precaution) |
| `{{champ\|défaut}}` | Valeur avec fallback si null/undefined |
| `{{champ:number}}` | Valeur avec separateur de milliers (ex: 32073247 → 32 073 247) |
| `{{champ:number:2}}` | Nombre fr-FR avec 2 décimales fixes |
| `{{champ:number\|0}}` | Format number + fallback si null |
| `{{champ:date}}` | Date JJ/MM/AAAA depuis une ISO (`2026-09-09T10:00:00Z` → `09/09/2026`), « — » si invalide |
| `{{champ:datetime}}` | Date et heure JJ/MM/AAAA HH:MM |
| `{{tags}}` | Un tableau (champ multivalué ODS/Grist) est joint par `, ` |
| `{{tags:join: / }}` | Tableau joint par le séparateur donné, espaces compris |
| `{{lien:url}}` | URL filtrée : seuls `http:`, `https:`, `mailto:`, `tel:` et les URL relatives passent, sinon chaîne vide. **À utiliser dans tout `href`** |
| `{{champ.sous.clé}}` | Acces aux proprietes imbriquees (dot notation) |
| `{{$index}}` | Index de l'element dans le tableau (0-based) |
| `{{$uid}}` | Identifiant unique de l'element (base sur uid-field ou index) |

### Blocs conditionnels
`{{#if champ}}…{{/if}}` affiche son contenu si la valeur existe (ni null, undefined, chaîne vide,
tableau vide ni false) ; `{{#unless champ}}…{{/unless}}` est le complément. Les blocs ne s'imbriquent
pas. Le bloc doit englober du texte, des éléments complets ou la valeur d'un attribut : placé entre
deux attributs d'une balise, il est découpé par l'analyse HTML du `<template>` et ignoré.

```html
<!-- Lien optionnel : rien si le champ est vide, lien filtré sinon -->
{{#if site_web}}<a class="fr-link" href="{{site_web:url}}">Site web</a>{{/if}}
{{#unless site_web}}<span class="fr-text--mention-grey">Pas de site</span>{{/unless}}
```

### Bloc de répétition (#737)
`{{#each champ}}…{{/each}}` répète son contenu pour chaque élément d'un champ tableau —
la seule façon de rendre un champ multivalué en liste structurée (sinon il est aplati par
`{{tags}}` ou `{{tags:join: / }}`). Dans le bloc :

- `{{.}}` = l'élément courant, toujours échappé, et les formats de la grammaire s'y
  appliquent (`{{.:number}}`, `{{.:date}}`, `{{.:url}}`) ;
- `{{$index}}` = le rang de l'élément (0-based), qui masque l'index de ligne ;
- les autres placeholders désignent toujours les champs de l'enregistrement.

Un tableau vide, un `null` ou un champ absent ne rendent RIEN (pas de `<li>` vide) ; les
éléments vides sont ignorés ; une valeur scalaire vaut un élément unique. Comme `{{#if}}`,
le bloc ne s'imbrique pas (un `{{#each}}` dans un `{{#if}}` n'est pas développé).

Il n'existe PAS de pipe qui rendrait du balisage (`:tags` et compagnie) : le moteur échappe
toujours, un pipe produisant du HTML ouvrirait une surface d'injection.

```html
<ul class="fr-tags-group">
  {{#each besoins}}<li><p class="fr-tag">{{.}}</p></li>{{/each}}
</ul>
```

Recette de transition (versions antérieures à 0.22, sans bloc) : rendre le lien toujours et le
masquer en CSS quand l'attribut est vide — `a[href=""] { display: none; }`.

### Un composant dsfr-data par ligne : le gabarit peut contenir des composants

Le gabarit n'est pas limite a du HTML inerte : il est rendu par `innerHTML`, donc les
composants `dsfr-data-*` qu'il contient sont rehausses comme n'importe quel element de la
page. C'est **la voie native pour repeter un graphique, un KPI ou une liste sur les lignes
d'une source** — l'equivalent d'un `ng-repeat` autour d'un `<ods-chart>` — et elle tient en
trois idees :

1. **Repeter** : le `<template>` du display contient le ou les composants.
2. **Scoper** : une `dsfr-data-query` par ligne, dont l'`id` et le `where` sont interpoles
   (`id="q-{{code}}" where="code:eq:{{code}}"`), filtre pour cette ligne une source
   **deja chargee en entier**. Les composants de la ligne consomment cet id.
3. **Choisir le type depuis un champ** : `type="{{champ}}"` — un recodage prealable par
   `dsfr-data-normalize compute="type_graphique = when … then 'line' else 'bar'"` si le
   jeu ne porte pas directement un type DSFR Chart.

```html
<!-- La table des questions : une ligne par question -->
<dsfr-data-source id="questions" api-type="opendatasoft"
  base-url="https://data.economie.gouv.fr" dataset-id="bfn-table-de-correspondance"
  fetch-mode="export" max-records="200"></dsfr-data-source>
<!-- Les scores : UNE requete, chargee une fois — les queries du gabarit filtrent en local -->
<dsfr-data-source id="scores" api-type="opendatasoft"
  base-url="https://data.economie.gouv.fr" dataset-id="questions-reponses"
  select="code_unifie, annee, score" where="region = 'Toutes régions'"
  fetch-mode="export" max-records="5000"></dsfr-data-source>

<dsfr-data-display source="questions" per-row="1 md:2">
  <template>
    <h4>{{libelle_unifie}}</h4>
    <dsfr-data-query id="q-{{code_unifie}}" source="scores"
      where="code_unifie:eq:{{code_unifie}}"
      group-by="annee" aggregate="score:sum" order-by="annee:asc"></dsfr-data-query>
    <dsfr-data-chart source="q-{{code_unifie}}" type="bar"
      label-field="annee" value-field="score__sum" name="{{libelle_unifie}}"></dsfr-data-chart>
  </template>
</dsfr-data-display>
```

Mesure (0.30.0, Chromium headless, sources inline) : 119 lignes × (query + graphique) rendues
en **410 ms** jusqu'au 119e canvas ; une re-emission de la source des scores — ce que fait un
filtre de `dsfr-data-context` — fait re-emettre les 119 queries en **29 ms** ; aucune erreur.
Chaque ligne coute deux abonnes au bus (≈ 250 ecouteurs `document` par type d'evenement).

**Les limites, ecrites :**

- **Pas d'imbrication.** Un `dsfr-data-display` dans le gabarit d'un autre ne marche pas : la
  passe de substitution consomme aussi les `{{…}}` du `<template>` interieur avec la ligne
  exterieure (champ inconnu → chaine vide), et il n'existe pas d'echappement de `{{`. Le
  niveau exterieur s'ecrit en HTML statique (un accordeon par chapitre, un display par accordeon).
- **Re-creation totale.** Chaque emission de la source *repetee* reecrit tout l'`innerHTML` :
  les composants sont detruits et recrees (119 graphiques : ≈ 640 ms, remontage Vue/Chart.js).
  Garder la source repetee stable (une table de reference) ; le filtre transverse doit viser la
  source *scopee* (`scores`), dont la re-emission ne touche que les queries.
- **Un id reutilise purge le cache.** A cette re-creation, l'ancienne query purge a sa
  deconnexion le cache de son `id` — que la nouvelle instance vient de remplir. Un
  consommateur monte plus tard sur `q-001` lit du vide jusqu'a la prochaine emission.
- **Pas de delegation serveur derriere un id scope.** La query du gabarit lit une source
  partagee par N lectrices : son `where` reste client, sans avertissement — c'est voulu (un
  fetch, N filtres). Les composants qui ont besoin d'un adaptateur (`dsfr-data-facets`,
  `dsfr-data-search`) ne fonctionnent pas branches sur `q-{{…}}`.
- **Un attribut booleen ne se conditionne pas** dans la balise (`horizontal`) : ecrire deux
  elements complets sous `{{#if champ}}…{{/if}}` et `{{#unless champ}}…{{/unless}}`.
- Le bundle doit etre charge **en fin de body** (ou en `type="module"`) : charge en `<head>`
  sans `defer`, le display capture son `<template>` avant qu'il soit analyse et ne rend rien.

### Attributs
| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| source | String | `""` | oui | ID de la source, query ou normalize |
| per-row | String | `""` | non | Nombre d'éléments par ligne (1, 2, 3, 4, 6), prime sur `cols` (#790) |
| cols | Number | `1` | non | Ancien nom de `per-row`, même sens — toujours accepté |
| pagination | Number | `0` | non | Elements par page (0 = tout afficher) |
| empty | String | `"Aucun resultat"` | non | Message quand le tableau est vide |
| idle-message | String | `"Choisissez un filtre pour afficher les données"` | non | Message rendu quand l'amont attend un filtre (`require-where`, #690) — distinct de `empty`, qui répond à une requête revenue vide. |
| gap | String | `"fr-grid-row--gutters"` | non | Classe CSS de gap pour la grille |
| uid-field | String | `""` | non | Champ de données pour l'ID unique par item. Chaque item recoit un id="item-{valeur}" pour ancrage URL |
| url-sync | Boolean | `false` | non | Synchronise le numero de page dans l'URL (?page=N) via replaceState |
| url-page-param | String | `"page"` | non | Nom du parametre URL pour la page |
| refine-on-click | String | `""` | non | Champ dont la valeur de l'element clique devient un filtre `eq` (#734) : premier clic = filtre, second clic sur le meme element = retrait, autre element = remplacement. Avec `context` (recommande) : filtre du dsfr-data-context (tag, URL, dialecte de chaque cible). Sans `context` : commande directe a `source` (whereKey `display-select-ID`) |
| context | String | `""` | non | Id du dsfr-data-context auquel s'enregistrer en `refine-on-click` (#734, ADR-104). Peut etre declare apres le composant |
| label | String | `""` | non | Libelle du tag du contexte en `refine-on-click` (defaut : le nom du champ) |

### Le clic sur un element filtre les autres vues (refine-on-click, #734)
Meme mecanique et meme mixin que `dsfr-data-list` et `dsfr-data-map-layer`. Chaque element
recoit un vrai `<button>` « Filtrer sur … » : atteignable au clavier, annonce comme un bouton,
etat porte par `aria-pressed` et par son libelle (« Retirer le filtre … » une fois selectionne),
jamais par la seule couleur ; l'element selectionne porte `aria-current="true"`. Le clic
n'importe ou sur l'element fait la meme bascule, sans voler le clic d'un lien du template.
Evenement `dsfr-data-select` `{ record, elementId, selected }` (bubbles, composed).

### Pagination serveur
Quand la source est un `dsfr-data-source` avec `paginate`, dsfr-data-display détecté automatiquement
la pagination serveur via les metadonnees (`meta.total`, `meta.page_size`).
Chaque changement de page declenche un nouvel appel API. Les données recues sont affichees
telles quelles (pas de slicing client). Le nombre total de pages vient de `meta.total / meta.page_size`.

### Synchronisation URL
Avec `url-sync`, le numero de page est synchronise dans l'URL via `replaceState`.
L'attribut `url-page-param` permet de personnaliser le nom du parametre (défaut: "page").
Quand la page est 1, le parametre est supprime de l'URL. Compatible avec les autres params URL.

### Exemples
```html
<!-- Cartes DSFR en grille 3 colonnes avec pagination -->
<dsfr-data-display source="data" per-row="3" pagination="12">
  <template>
    <div class="fr-card">
      <div class="fr-card__body">
        <div class="fr-card__content">
          <h3 class="fr-card__title">{{titre}}</h3>
          <p class="fr-card__desc">{{description}}</p>
        </div>
        <div class="fr-card__footer">
          <p class="fr-badge fr-badge--sm">{{catégorie}}</p>
        </div>
      </div>
    </div>
  </template>
</dsfr-data-display>

<!-- Tuiles DSFR simples -->
<dsfr-data-display source="data" per-row="4">
  <template>
    <div class="fr-tile">
      <div class="fr-tile__body">
        <div class="fr-tile__content">
          <h3 class="fr-tile__title">{{nom}}</h3>
          <p class="fr-tile__desc">{{description|Pas de description}}</p>
        </div>
      </div>
    </div>
  </template>
</dsfr-data-display>

<!-- Montants avec separateurs de milliers -->
<dsfr-data-display source="data" per-row="3" pagination="12">
  <template>
    <div class="fr-card">
      <div class="fr-card__body">
        <div class="fr-card__content">
          <h3 class="fr-card__title">{{nom}}</h3>
          <p class="fr-card__desc">Budget : {{montant:number}} €</p>
        </div>
      </div>
    </div>
  </template>
</dsfr-data-display>

<!-- Cartes avec identifiants uniques et ancrage URL (ex: page.html#item-42) -->
<dsfr-data-display source="data" per-row="3" pagination="12" uid-field="id">
  <template>
    <div class="fr-card">
      <div class="fr-card__body">
        <div class="fr-card__content">
          <h3 class="fr-card__title">
            <a href="#{{$uid}}">{{titre}}</a>
          </h3>
          <p class="fr-card__desc">{{description}}</p>
        </div>
      </div>
    </div>
  </template>
</dsfr-data-display>
```

### Référence `<dsfr-data-display>` (générée depuis le code)

**Rôle pipeline** : affichage (`SourceSubscriberMixin`) — feuille du pipeline : consomme `source`, n’émet pas de données.

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `cols` | `number` | `1` | Nombre de colonnes dans la grille (1-6, défaut 1 = pleine largeur). Même rôle que `per-row`, qui est préféré : `cols` désigne une LARGEUR sur `dsfr-data-facets` (#790). Toujours accepté, avec le même sens. |
| `context` | `string` | `""` (vide) | Identifiant du dsfr-data-context auquel s'enregistrer en `refine-on-click` (#734, ADR-104). Le contexte peut être déclaré après le composant dans la page. Vide = commande directe à `source` (chemin dégradé). |
| `empty` | `string` | `'Aucun resultat'` | Message quand aucune donnee |
| `gap` | `string` | `'fr-grid-row--gutters'` | Classe CSS de gap pour la grille (défaut: fr-grid-row--gutters) |
| `idle-message` | `string` | `IDLE_MESSAGE_DEFAULT` | Message rendu quand l'amont attend un filtre (`require-where`, #690). Distinct de « aucune donnée » : aucune requête n'a été faite. Vide, le libellé par défaut est utilisé. |
| `label` | `string` | `""` (vide) | Libellé du tag de contexte en `refine-on-click` (#734). Vide = le nom du champ filtré. |
| `pagination` | `number` | `0` | Nombre d'éléments par page (0 = tout afficher) |
| `per-row` | `string` | `""` (vide) | Nombre d'éléments par ligne à partir de 768 px (en dessous : un par ligne) — 1, 2, 3, 4 ou 6, les diviseurs de la grille de 12 colonnes. Échelle mobile-first (#789) : `per-row="1 sm:2 lg:3"` — le premier terme sous 576 px, puis un palier par point de rupture DSFR (sm 576, md 768, lg 992, xl 1248 px). Remplace `cols`, même sens, sans l'ambiguïté du mot sur les autres composants (#790). Prime sur `cols` s'ils sont posés ensemble. |
| `refine-on-click` | `string` | `""` (vide) | Champ dont la valeur de l'élément cliqué devient un filtre `eq` (#734). Premier clic = filtre, second clic sur le même élément = retrait, clic sur un autre élément = remplacement. Chaque élément reçoit un bouton « Filtrer sur … », atteignable au clavier et dont l'état est annoncé (`aria-pressed`) : la mise en avant de l'élément sélectionné n'est jamais la seule marque. Avec `context="id"` (recommandé), le composant s'enregistre comme filtre du dsfr-data-context : diffusion à toutes ses sources cibles au dialecte de chacune, tag dans dsfr-data-context-tags, URL portée par le contexte. Sans `context`, la clause part directement à `source` (whereKey `display-select-ID`) — sans tag ni URL, et la liste se filtre elle-même (seul l'élément cliqué reste, jusqu'au second clic). |
| `source` | `string` | `""` (vide) | Id de la source (ou du transformateur) dont ce composant consomme les données. |
| `uid-field` | `string` | `""` (vide) | Champ de données a utiliser comme identifiant unique par item. Si vide, utilise l'index |
| `url-page-param` | `string` | `'page'` | Nom du paramètre URL pour la page (défaut: "page") |
| `url-sync` | `boolean` | `false` | Synchronise le numéro de page dans l'URL (replaceState) |



**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-loaded` | `{ sourceId, data }` | écoute | Nouvelles données publiées par la source désignée par `source`. |
| `dsfr-data-error` | `{ sourceId, error }` | écoute | Erreur amont. |
| `dsfr-data-loading` | `{ sourceId }` | écoute | Chargement amont démarré. |
| `dsfr-data-select` | — | émis | `{ record, elementId, selected }` sur le composant (bubbles, composed) — au clic sur un élément en `refine-on-click` (#734). `selected` vaut `true` à la sélection, `false` quand le clic la retire (second clic sur le même élément, ou croix du tag de contexte). |
| `dsfr-data-source-command` | — | émis | `{ sourceId, where, whereKey, origin }` sur `document` — en `refine-on-click` SANS `context` (chemin dégradé) : clause `eq` poussée directement à `source` sous le whereKey `display-select-ID`. Avec `context`, c'est le contexte qui diffuse. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
