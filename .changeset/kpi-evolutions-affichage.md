---
'dsfr-data': minor
---

`dsfr-data-kpi` et `dsfr-data-kpi-group` : évolutions d'affichage de la planche
« kpi-evolutions » (tours 1 à 3). **Rien ne change côté données** — libellé, valeur,
tendance, description, seuils et tokens sémantiques gardent leur calcul — et **rien ne
change sans les nouveaux attributs** : le rendu par défaut est identique, byte à byte sur
le balisage et règle par règle sur le CSS (`tests/kpi-rendu-retrocompat.test.ts`, référence
capturée sur `main` avant le chantier).

Nouveaux attributs de `dsfr-data-kpi` :

- `icon-position="label|top|right"` (défaut `label`, le rendu historique) et
  `icon-size="sm|md"` — 1,5 rem et 2 rem. L'échelle s'arrête là : le DSFR ne documente
  pas d'icône au-delà de `fr-icon--lg` (2 rem) ; au-delà, c'est un pictogramme.
- `picto="environment/leaf"` (ou `picto-field`) + `picto-base="/dsfr/artwork/pictograms/"` :
  pictogramme DSFR déclaratif, rendu en SVG `fr-artwork` à trois `<use>`. Le nom est
  contraint à `[a-z0-9-]` et `/`, l'adresse est écrite par l'intégrateur : `../` et
  `javascript:` sont exclus par construction. Les couleurs viennent des classes
  `fr-artwork-*` (mode sombre compris). ⚠️ Même origine que la page : `<use>` ne charge
  pas un SVG d'un autre domaine.
- `image` + `image-alt` + `image-position="top|left|right"` : bandeau 16:9, colonne de
  10 rem ou vignette de 7,5 rem. URL passée par la liste blanche de schémas de
  `{{champ:url}}` ; refusée = rien, avec un avertissement.
- `orientation="vertical"` : tuile à liseré haut, centrée quand elle porte un média.
- `border="left|top|bottom|outline|left-short|none"` (défaut `left`).
- `tint` (`950` par défaut, `975`, `925`) : fond teinté dans la couleur du token ; la
  valeur reste en gris titre, par contraste.
- `color-token` étendu aux **17 couleurs illustratives DSFR** (`green-emeraude`,
  `blue-cumulus`, `purple-glycine`…) via `var(--border-plain-<nom>)` et
  `var(--background-contrast-<nom>)` — aucun hexadécimal, le mode sombre suit. Elles
  disent une CATÉGORIE ; l'ÉTAT reste aux quatre tokens sémantiques.

`icon` est désormais sur liste blanche (`fr-icon-*`, `ri-*`) : une valeur hors motif est
ignorée avec un avertissement qui la nomme, une fois par valeur.

`dsfr-data-kpi-group orientation="vertical"` empile les KPI dans un cadre à liseré
continu, avec un filet entre les items.
