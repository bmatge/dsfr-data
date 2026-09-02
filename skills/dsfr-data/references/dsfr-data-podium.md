# dsfr-data-podium

> Classement visuel (top N) avec rang, barres proportionnelles et couleurs
>
> Déclencheurs : podium, classement, ranking, top, palmares, top 5, top 10, leaderboard

## <dsfr-data-podium> - Classement visuel

Affiche un podium (top N) avec rang numerote, label, sous-titre, barre de progression proportionnelle et valeur formatee.
Se connecte au pipeline dsfr-data-source / dsfr-data-query via l'attribut `source`.

### Attributs
| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| source | String | `""` | oui | ID de la dsfr-data-source ou dsfr-data-query |
| label-field | String | `""` | oui | Chemin vers le champ label (supporte dot notation) |
| value-field | String | `""` | oui | Chemin vers le champ valeur numérique |
| subtitle | String | `""` | non | Texte fixe affiche sous chaque label |
| subtitle-field | String | `""` | non | Chemin vers un champ pour le sous-titre (prioritaire sur subtitle) |
| value-unit | String | `""` | non | Unite affichee apres la valeur (ex: "hab.", "€", "%") |
| selected-palette | String | `"sequentialDescending"` | non | Palette de couleurs : sequentialDescending, sequentialAscending, categorical, neutral |
| max-items | Number | `5` | non | Nombre maximum d'items affiches |
| no-sort | Boolean | `false` | non | Desactive le tri automatique (desc par valeur) |
| bar-max | Number | - | non | Valeur max forcee pour les barres (ex: 100 pour des pourcentages) |

### Comportement
- **Tri automatique** : les items sont tries par valeur decroissante (sauf si `no-sort` est present)
- **Barres proportionnelles** : largeur relative au max des valeurs (ou `bar-max` si défini)
- **Couleurs** : chaque item recoit une couleur de la palette choisie (bordure gauche + barre)
- **Accessibilité** : `<ol>` semantique avec aria-label descriptif du classement complet

### Exemples
```html
<!-- Top 5 des regions par population -->
<dsfr-data-source id="src" api-type="opendatasoft"
  dataset-id="regions" base-url="https://data.gouv.fr">
</dsfr-data-source>
<dsfr-data-podium source="src"
  label-field="nom"
  value-field="population"
  subtitle="Region"
  value-unit="hab."
  selected-palette="sequentialDescending"
  max-items="5">
</dsfr-data-podium>

<!-- Podium avec données transformees par query -->
<dsfr-data-query id="top-villes" source="src"
  group-by="ville" aggregate="montant:sum:total"
  order-by="total:desc">
</dsfr-data-query>
<dsfr-data-podium source="top-villes"
  label-field="ville"
  value-field="total"
  value-unit="€"
  max-items="10"
  selected-palette="categorical">
</dsfr-data-podium>

<!-- Podium avec sous-titres dynamiques -->
<dsfr-data-podium source="data"
  label-field="nom"
  value-field="score"
  subtitle-field="catégorie"
  bar-max="100"
  max-items="3">
</dsfr-data-podium>

<!-- Podium sans tri (ordre de la source) -->
<dsfr-data-podium source="data"
  label-field="etape"
  value-field="progression"
  value-unit="%"
  bar-max="100"
  no-sort>
</dsfr-data-podium>
```

### Référence `<dsfr-data-podium>` (générée depuis le code)

**Rôle pipeline** : affichage (`SourceSubscriberMixin`) — feuille du pipeline : consomme `source`, n’émet pas de données.

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `bar-max` | `number \| undefined` | — | Valeur max forcee pour le calcul des barres (ex: 100 pour des %) |
| `label-field` | `string` | `""` (vide) | Chemin vers le champ label |
| `max-items` | `number` | `5` | Nombre maximum d'items affiches |
| `no-sort` | `boolean` | `false` | Desactive le tri automatique (desc par valeur) |
| `selected-palette` | `string` | `'sequentialDescending'` | Palette de couleurs pour la bordure gauche |
| `source` | `string` | `""` (vide) | Id de la source (ou du transformateur) dont ce composant consomme les donnees. |
| `subtitle` | `string` | `""` (vide) | Texte fixe affiche sous chaque label |
| `subtitle-field` | `string` | `""` (vide) | Chemin vers un champ pour le sous-titre (prioritaire sur subtitle) |
| `value-field` | `string` | `""` (vide) | Chemin vers le champ valeur (numérique) |
| `value-unit` | `string` | `""` (vide) | Unite affichee apres la valeur |



**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-loaded` | `{ sourceId, data }` | écoute | Nouvelles données publiées par la source désignée par `source`. |
| `dsfr-data-error` | `{ sourceId, error }` | écoute | Erreur amont. |
| `dsfr-data-loading` | `{ sourceId }` | écoute | Chargement amont démarré. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
