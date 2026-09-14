---
'dsfr-data': patch
---

`parseExpression` : un parseur par grammaire (#839). La fonction qui lit les
expressions de `value` du KPI entrelaçait quatre grammaires — commune
`champ:fn`, historique `fn:champ`, ratio ` / `, filtre entre accolades — en une
seule suite de conditions. Elle est découpée en un tokenizer (coupe du
séparateur de ratio hors des accolades) et un parseur par grammaire. Refactor
interne : tout ce que la documentation promet rend exactement le même arbre,
sous une table de référence de cinquante expressions et leurs pièges.

Deux défauts de conception disparaissent au passage :

- un filtre qui contient une barre oblique entourée d'espaces ne coupe plus le
  ratio — `a:sum{b:eq:x / y} / c:sum` se lisait « mal formé » ;
- l'alias `count-distinct` n'est plus appliqué aux NOMS DE CHAMP, seulement aux
  fonctions — une colonne nommée `count-distinct` était renommée `distinct` et
  l'agrégat portait sur une colonne inexistante.
