---
'dsfr-data': patch
---

fix(adapter-ods) : un découpeur ODSQL qui respecte les parenthèses, et un `select` enfin échappé

Trois demandes du banc d'essai, une seule cause : `group-by` et `select` étaient traités comme des
listes de noms de champs, avec la présence d'une parenthèse pour seul indice d'expression.

- **Un alias sans fonction n'est plus backquoté** : `group-by="periode as an"` partait en
  `` `periode as an` `` et l'API répondait 400. Le correctif de la 0.21.1 ne voyait que les
  expressions à parenthèses.
- **Une virgule à l'intérieur d'une fonction ne coupe plus l'élément** :
  `date_format(d, 'yyyy-MM') as m` restait en deux morceaux, dont le second était backquoté. Le
  découpage ignore désormais les virgules entre parenthèses et entre quotes.
- **Le `select` explicite est échappé** comme le `group_by`, ce qu'il n'était jamais. Un nom de
  champ à chiffre initial (`1_uai`), qui rend HTTP 400 nu et 200 backquoté, est backquoté ; un nom à
  espaces ou à accents aussi.

Les expressions passent intactes : `count(*) as total`, `*`, les chemins pointés, les opérateurs,
un élément déjà backquoté par l'auteur. Le `select` généré par les deux builders et celui de la
documentation ne changent pas. Un identifiant n'est laissé nu que s'il commence par une lettre ou
un souligné, ce qui règle aussi l'agrégat sur un champ à chiffre initial.

Résout les constats BUG-010, BUG-011 et PG-027 du banc d'essai (#767).
