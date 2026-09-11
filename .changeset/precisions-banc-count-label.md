---
'dsfr-data': patch
---

docs et `count-label` : quatre précisions relevées par le banc d'essai, et une position sur l'iframe

- **`count-label` sur `dsfr-data-search`** : le compteur dit « résultat » quel que soit ce qu'on
  cherche. `count-label="établissement"` affiche « 12 345 établissements » ; un pluriel irrégulier
  prend les deux formes, `count-label="cheval|chevaux"`.
- **`first` et `last` dans la référence du KPI** : ils figuraient dans le guide, pas dans le JSDoc de
  `value`, donc pas dans la section de référence générée.
- **L'ordre `where` puis `group_by` est écrit** dans le JSDoc de `group-by` (`dsfr-data-query`) et
  de `field` (`dsfr-data-context-filter`) : un filtre ne peut viser ni un alias d'agrégat ni une
  colonne calculée en aval, l'API répond 400.
- **Une colonne de classe peut porter une phrase** : « occupation saturée » produit deux classes et
  le texte entier reste restitué aux lecteurs d'écran. Le guide le dit.
- **Encastrer une dataviz dans un site tiers** : nouvelle section du guide utilisateur. Balise ou
  iframe, ce qu'il advient de la déclaration d'accessibilité, des mentions, de la licence des
  données et des requêtes vers des tiers, et le cas de l'hôte hors DSFR.

Résout les constats AM-076, PG-025, AM-044, AM-073 et AM-062 du banc d'essai (#779, #778).
