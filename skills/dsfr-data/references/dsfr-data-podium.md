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
| `bar` | `string` | `'proportional'` | Ce que porte la barre de donnée : `proportional` (longueur = la donnée, défaut), `full` (pleine largeur, la couleur seule distingue les rangs) ou `none` (aucune barre). Indépendant de `bar-position` et de `border`. |
| `bar-max` | `number \| undefined` | — | Valeur max forcee pour le calcul des barres (ex: 100 pour des %) |
| `bar-position` | `string` | `'inline'` | Où la barre se place : `inline` (6 px sous le libellé, défaut), `between` (16 px entre un libellé de 130 px et la valeur, façon graphique en barres horizontal), `top` ou `bottom` (trait de 4 px en haut ou en bas de l'item, façon liseré mais proportionnel). Indépendant de `bar` et de `border`. |
| `border` | `string` | `'left'` | Liseré gauche purement décoratif, à la couleur de l'item : `left` (défaut) ou `none`. Indépendant de `bar` et de `bar-position` — la barre porte la donnée, le liseré ne porte que la couleur. |
| `icon` | `string` | `""` (vide) | Même classe d'icône pour tous les items. Même liste blanche qu'`icon-field`. |
| `icon-field` | `string` | `""` (vide) | Chemin vers un champ contenant une classe d'icône DSFR ou Remix (`fr-icon-building-line`, `ri-map-pin-line`), rendue 40 px en Bleu France. Liste blanche stricte `^(fr-icon\|ri)-[a-z0-9-]+$` : ce qui vient de la donnée ne pose qu'une classe CSS, jamais du balisage. Une valeur hors motif est ignorée avec un avertissement nommant le champ et la valeur (dédupliqué : une fois par valeur refusée). ⚠️ 40 px sort de l'échelle documentée du DSFR, qui s'arrête à `fr-icon--lg` = 32 px ; au-delà le DSFR parle de pictogramme. Le rendu marche (le masque d'une `fr-icon-*` est en `1em`, donc pilotable par `font-size`), mais c'est un usage hors échelle : `picto` est la voie conforme pour une illustration de cette taille. |
| `idle-message` | `string` | `IDLE_MESSAGE_DEFAULT` | Message rendu quand l'amont attend un filtre (`require-where`, #690). Distinct de « aucune donnée » : aucune requête n'a été faite. Vide, le libellé par défaut est utilisé. |
| `image-field` | `string` | `""` (vide) | Chemin vers un champ contenant l'URL d'une image (logo, blason), rendue en vignette 40 px entre le rang et le libellé. L'URL vient de la donnée : elle passe par la même liste blanche de schémas que le format `{{champ:url}}` (`http:`, `https:`, `mailto:`, `tel:` ou URL relative). Une URL refusée n'affiche rien et avertit en console, une fois par valeur. Exclusif avec `icon-field` / `icon` et `picto` / `picto-field` (l'image l'emporte, et le cumul est signalé). |
| `image-shape` | `string` | `'square'` | Forme de la vignette d'`image-field` : `square` (défaut) ou `circle`. |
| `label-field` | `string` | `""` (vide) | Chemin vers le champ label |
| `layout` | `string` | `'list'` | `list` (défaut) ou `podium` : estrade 2‑1‑3, le premier au centre. L'inversion est **purement visuelle** (`order` CSS sur les éléments de grille) : le DOM reste dans l'ordre 1‑2‑3, donc un lecteur d'écran et la navigation clavier parcourent le classement dans l'ordre. Les items au‑delà du 3e passent en liste compacte sous l'estrade, dans le même `<ol>`. |
| `max-items` | `number` | `5` | Nombre maximum d'items affichés |
| `no-sort` | `boolean` | `false` | Desactive le tri automatique (desc par valeur) |
| `orientation` | `string` | `'horizontal'` | `horizontal` (défaut) ou `vertical` : barres verticales en colonnes, une par item, dans l'ordre du classement. |
| `picto` | `string` | `""` (vide) | Nom d'un pictogramme DSFR, identique pour tous les items. L'URL est construite en concaténant `picto-base` et ce nom (`<base><nom>.svg`) : la donnée ne fournit jamais qu'un nom, contraint à `^[a-z0-9-]+(/[a-z0-9-]+)*$`. Le balisage rendu est le `fr-artwork` standard du DSFR, donc les couleurs viennent des classes DSFR et le mode sombre suit sans travail. |
| `picto-base` | `string` | `""` (vide) | Préfixe d'URL des pictogrammes, écrit par l'intégrateur (jamais par la donnée) — par exemple `/dsfr/artwork/pictograms/`. Sans lui, `picto` et `picto-field` ne rendent rien et avertissent : c'est ce découpage nom / base qui exclut `../` et `javascript:` par construction. |
| `picto-field` | `string` | `""` (vide) | Chemin vers un champ contenant le nom du pictogramme. Même contrainte que `picto`. |
| `rank` | `string` | `'number'` | Rendu du rang : `number` (chiffre, défaut), `medal` (pastille de la couleur de l'item) ou `none` (masqué — l'ordre et la barre suffisent). En `medal`, la couleur d'encre du chiffre est choisie par calcul de luminance relative WCAG : la rampe s'éclaircit, et du blanc dès son **4e ton** serait illisible. Le chiffre reste `aria-hidden` : l'ordre est porté par la position dans la liste, le chiffre n'en est qu'un rappel. ⚠️ La rampe est `CHOROPLETH_SCALES.sequentialDescending` (9 tons), **pas** `PALETTE_COLORS.sequentialDescending` (5 tons) : `dsfr-palettes.ts` expose deux rampes homonymes et le podium sert la première. Lire la seconde donne un tableau de contraste plausible et faux — c'est arrivé. Ratios sur les 5 premiers tons, encre retenue en gras : \| Rang \| Couleur   \| vs blanc  \| vs `#161616` \| \|------\|-----------\|-----------\|--------------\| \| 1    \| `#000091` \| **14,91** \| 1,21         \| \| 2    \| `#2323B4` \| **10,65** \| 1,70         \| \| 3    \| `#4747E5` \| **6,36**  \| 2,84         \| \| 4    \| `#6A6AF4` \| 4,22      \| **4,29**     \| \| 5    \| `#8585F6` \| 3,14      \| **5,76**     \| Le point bas est le **rang 4** : 4,29:1, sous AA texte normal (4,5:1) et au-dessus de AA texte large (3:1). Aucune des deux encres n'atteint 4,5 sur `#6A6AF4`. Ces chiffres sont figés par `tests/dsfr-data-podium-evolutions.test.ts`. |
| `rounded` | `boolean` | `false` | Rétablit les arrondis d'avant la 0.34 (item 4 px, barre 3 px). |
| `selected-palette` | `string` | `'sequentialDescending'` | Palette de couleurs pour la bordure gauche |
| `source` | `string` | `""` (vide) | Id de la source (ou du transformateur) dont ce composant consomme les données. |
| `square` | `boolean` | `false` | Supprime les arrondis (0 px), conforme DSFR strict. **C'est le rendu par défaut depuis la 0.34** : l'attribut n'existe que pour l'écrire explicitement. L'échappatoire est `rounded`, qui rétablit les anciens arrondis (4 px sur l'item, 3 px sur la barre) ; si les deux sont posés, `square` l'emporte. |
| `subtitle` | `string` | `""` (vide) | Texte fixe affiché sous chaque label |
| `subtitle-field` | `string` | `""` (vide) | Chemin vers un champ pour le sous-titre (prioritaire sur subtitle) |
| `value-field` | `string` | `""` (vide) | Chemin vers le champ valeur (numérique) |
| `value-unit` | `string` | `""` (vide) | Unité affichée après la valeur |



**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-loaded` | `{ sourceId, data }` | écoute | Nouvelles données publiées par la source désignée par `source`. |
| `dsfr-data-error` | `{ sourceId, error }` | écoute | Erreur amont. |
| `dsfr-data-loading` | `{ sourceId }` | écoute | Chargement amont démarré. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
