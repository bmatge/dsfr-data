# dsfr-data-display

> Affichage dynamique de données via template HTML (cartes, tuiles, listes)
>
> Déclencheurs : cartes, carte, tuiles, tuile, cards, tiles, display, template, affichage, liste de resultats, motif repetitif

## <dsfr-data-display> - Affichage dynamique via template

Généré des elements HTML repetitifs (cartes DSFR, tuiles, callouts, etc.) a partir
d'un template et d'une source de données. Chaque element du tableau de données produit
une instance du template avec les valeurs injectees.

### Syntaxe du template
Le template est défini dans un element `<template>` enfant du composant.
Les placeholders sont remplaces pour chaque element de données :

| Syntaxe | Description |
|---------|-------------|
| `{{champ}}` | Valeur echappee (HTML-safe) |
| `{{{champ}}}` | Valeur brute (non echappee — utiliser avec precaution) |
| `{{champ\|défaut}}` | Valeur avec fallback si null/undefined |
| `{{champ:number}}` | Valeur avec separateur de milliers (ex: 32073247 → 32 073 247) |
| `{{champ:number\|0}}` | Format number + fallback si null |
| `{{champ.sous.clé}}` | Acces aux proprietes imbriquees (dot notation) |
| `{{$index}}` | Index de l'element dans le tableau (0-based) |
| `{{$uid}}` | Identifiant unique de l'element (base sur uid-field ou index) |

### Attributs
| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| source | String | `""` | oui | ID de la source, query ou normalize |
| cols | Number | `1` | non | Nombre de colonnes dans la grille (1-6) |
| pagination | Number | `0` | non | Elements par page (0 = tout afficher) |
| empty | String | `"Aucun resultat"` | non | Message quand le tableau est vide |
| gap | String | `"fr-grid-row--gutters"` | non | Classe CSS de gap pour la grille |
| uid-field | String | `""` | non | Champ de données pour l'ID unique par item. Chaque item recoit un id="item-{valeur}" pour ancrage URL |
| url-sync | Boolean | `false` | non | Synchronise le numero de page dans l'URL (?page=N) via replaceState |
| url-page-param | String | `"page"` | non | Nom du parametre URL pour la page |

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
<dsfr-data-display source="data" cols="3" pagination="12">
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
<dsfr-data-display source="data" cols="4">
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
<dsfr-data-display source="data" cols="3" pagination="12">
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
<dsfr-data-display source="data" cols="3" pagination="12" uid-field="id">
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
| `cols` | `number` | `1` | Nombre de colonnes dans la grille (1-6, défaut 1 = pleine largeur) |
| `empty` | `string` | `'Aucun resultat'` | Message quand aucune donnee |
| `gap` | `string` | `'fr-grid-row--gutters'` | Classe CSS de gap pour la grille (défaut: fr-grid-row--gutters) |
| `pagination` | `number` | `0` | Nombre d'elements par page (0 = tout afficher) |
| `source` | `string` | `""` (vide) | Id de la source (ou du transformateur) dont ce composant consomme les donnees. |
| `uid-field` | `string` | `""` (vide) | Champ de données a utiliser comme identifiant unique par item. Si vide, utilise l'index |
| `url-page-param` | `string` | `'page'` | Nom du parametre URL pour la page (défaut: "page") |
| `url-sync` | `boolean` | `false` | Synchronise le numero de page dans l'URL (replaceState) |



**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-loaded` | `{ sourceId, data }` | écoute | Nouvelles données publiées par la source désignée par `source`. |
| `dsfr-data-error` | `{ sourceId, error }` | écoute | Erreur amont. |
| `dsfr-data-loading` | `{ sourceId }` | écoute | Chargement amont démarré. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
