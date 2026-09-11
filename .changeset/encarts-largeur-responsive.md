---
'dsfr-data': minor
---

feat(map-inset) : largeur responsive des encarts territoriaux

`width` acceptait une seule longueur, posée en style inline, qui ne peut pas porter de media query.
Cinq encarts à 20 % tenaient sur une ligne en bureau, pas sur téléphone. `width` accepte désormais
la même échelle mobile-first que `per-row` et `span` :

```html
<dsfr-data-map-inset territory="guadeloupe" width="50% md:20%"></dsfr-data-map-inset>
```

Deux encarts par ligne sous 768 px, cinq au-delà : vérifié dans un navigateur, 200 px sur un écran
de 400 px comme de 1 000 px. **Une valeur nue garde exactement son rendu actuel.** En échelle, une
règle de page `dsfr-data-map-inset { width: … }` prime toujours, à toutes les largeurs. Un point de
rupture inconnu ou une longueur illisible est une erreur de configuration nommée.

Suite de #789 (#818).
