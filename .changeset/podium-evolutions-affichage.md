---
'dsfr-data': minor
---

**Le podium perd ses arrondis : `square` devient le rendu par défaut.** L'item passe de
4 px à 0, la barre de 3 px à 0. C'est le seul changement de cette version qui modifie un
rendu **sans qu'aucun attribut ait été posé** : toutes les pages qui affichent un
`<dsfr-data-podium>` verront des angles droits. Le changement est minime et plus conforme
au DSFR, et l'échappatoire est immédiate — `rounded` rétablit exactement les anciens
arrondis. L'attribut `square` reste disponible pour écrire le défaut explicitement ; si
`square` et `rounded` sont posés tous les deux, `square` l'emporte.

Hors ce point, **rien ne change sans attribut** : un test de rétrocompatibilité
(`tests/dsfr-data-podium-retrocompat.test.ts`) compare le DOM rendu sans attribut au DOM
capturé sur `main` avant le changement, et vérifie que la seule différence dans les règles
CSS déjà présentes porte sur `border-radius`, et que toutes les règles ajoutées sont
portées par une classe neuve.

Quatorze attributs de présentation sont ajoutés. Le classement, le tri, les ratios et
`bar-max` sont inchangés : rien ne touche à la donnée.

**Vignette** — `image-field` (+ `image-shape="square|circle"`) affiche une image de 40 px
entre le rang et le libellé ; `icon-field` / `icon` posent une classe d'icône DSFR ou
Remix ; `picto` / `picto-field` avec `picto-base` rendent un pictogramme DSFR au balisage
`fr-artwork` standard (donc mode sombre gratuit). Les trois voies sont exclusives : si
plusieurs sont posées, l'image l'emporte, puis le pictogramme, puis l'icône, et le cumul
est signalé en console.

Ce qui vient de la donnée est **contraint, jamais assaini après coup** : une classe
d'icône doit répondre à `^(fr-icon|ri)-[a-z0-9-]+$` — la donnée ne pose qu'une classe CSS,
jamais du balisage ; un nom de pictogramme est une suite de segments `[a-z0-9-]+` séparés
par `/`, et l'URL se construit en le concaténant à `picto-base`, attribut de la balise donc
écrit par l'intégrateur — ce découpage exclut mécaniquement `../` et `javascript:` sans
dépendre d'un assainisseur ; une URL d'`image-field` passe par `sanitizeTemplateUrl`, la
liste blanche de schémas du format `{{champ:url}}`. Dans les trois cas, une valeur refusée
n'affiche rien et **avertit en console en nommant le champ et la valeur**, une fois par
valeur refusée et non une fois par ligne.

**Rang** — `rank="number|medal|none"`. En `medal`, le chiffre est posé dans une pastille
de la couleur de l'item (24 px quand une vignette occupe déjà la place, 32 px sinon), et la
couleur d'encre est choisie par **calcul de luminance relative WCAG** sur la couleur
réellement servie. La rampe par défaut est `CHOROPLETH_SCALES.sequentialDescending`
(9 tons) — **et non** `PALETTE_COLORS.sequentialDescending` (5 tons), qui porte le même nom
dans le même fichier : recalculer sur la seconde donne un tableau plausible et faux.
Ratios sur les cinq premiers tons, encre retenue en gras :

| Rang | Couleur | vs blanc | vs gris de titre `#161616` |
|---|---|---|---|
| 1 | `#000091` | **14,91:1** | 1,21:1 |
| 2 | `#2323B4` | **10,65:1** | 1,70:1 |
| 3 | `#4747E5` | **6,36:1** | 2,84:1 |
| 4 | `#6A6AF4` | 4,22:1 | **4,29:1** |
| 5 | `#8585F6` | 3,14:1 | **5,76:1** |

**Le point bas est le rang 4** : 4,29:1, sous AA texte normal (4,5:1), au-dessus de AA
texte large (3:1) — aucune des deux encres n'atteint 4,5:1 sur `#6A6AF4`. Le chiffre reste
`aria-hidden`, l'ordre étant porté par la position dans le `<ol>`. Ces cinq couples
(couleur, encre) et ces ratios sont figés par un test, pour qu'un changement de palette
casse la recette au lieu de faire mentir la documentation.

Les deux encres sont deux tokens DSFR croisés sous `[data-fr-theme="dark"]`, pour rester
identiques dans les deux thèmes — le fond de la pastille étant une couleur de palette qui,
elle, ne change pas avec le thème. Aucun hexadécimal n'est écrit en dur.

**Disposition** — `orientation="vertical"` rend une colonne par item ;
`layout="podium"` rend l'estrade 2‑1‑3, le premier au centre. **L'inversion est purement
visuelle** (`order` sur les éléments de grille) : le DOM reste dans l'ordre 1‑2‑3, donc un
lecteur d'écran et la navigation clavier parcourent le classement dans l'ordre. Les items
au‑delà du 3e passent en liste compacte sous l'estrade, dans le même `<ol>`.

**Barre et liseré, trois axes séparés et combinables** — `bar="proportional|full|none"`
dit *ce que porte* la barre, `bar-position="inline|between|top|bottom"` dit *où elle est*,
`border="left|none"` pose un liseré purement décoratif. Ce ne sont pas les valeurs d'un
même attribut : `bar="proportional" bar-position="top" border="left"` est une combinaison
valide. `inline` est le rendu historique (6 px sous le libellé) ; `between` est
l'agencement « graphique en barres horizontal » (libellé de 130 px, barre de 16 px, valeur) ;
`top` et `bottom` posent un trait de 4 px en haut ou en bas de l'item.
