---
'dsfr-data': minor
---

`dsfr-data-chart` : `map-summary`, le mode de synthèse du résumé d'une carte — résout le constat AM-079 du banc d'essai

Le résumé affiché sous le titre d'une carte de **volumes** était une moyenne de
volumes : « 3 074,06 en France » pour 310 480 licences, la moyenne arithmétique
de 101 nombres de licenciés, un chiffre sans signification. #763 avait réglé les
TAUX (`map-summary-weight`) et permis une valeur fournie (`map-summary-value`),
mais celle-ci est un **littéral** : juste pour une fédération, fausse dès qu'on
en change ou qu'on filtre une région — précisément le geste dont le banc a
montré qu'il produit des chiffres faux.

`map-summary` choisit désormais le mode, calculé sur les lignes dessinées :

- `sum` — la **somme**, seule synthèse juste d'un volume, et elle **suit les
  filtres** ;
- `weighted` — la moyenne pondérée Σ(valeur × effectif) / Σ(effectif), la
  synthèse juste d'un taux (exige `map-summary-weight`) ;
- `avg` — la moyenne non pondérée, le calcul historique ;
- `none` — aucun chiffre. Ce qui disparaît est la valeur : l'en-tête « …, en
  France » appartient à DSFR Chart et reste affiché.

La première question d'une carte thématique est **volume ou taux**, et elle
décide du mode : un volume s'additionne, un taux se pondère, et l'autre calcul
est faux dans les deux sens. Une somme suppose en outre une **partition** —
chaque territoire compté une fois. Deux lignes portant le même code
géographique sont additionnées toutes les deux alors que la carte n'en dessine
qu'une : un avertissement console le dit désormais, avec le nombre de lignes et
le nombre de territoires dessinés, et renvoie à une agrégation en amont.

Un mode inconnu, ou `weighted` sans `map-summary-weight`, est une **erreur de
configuration** : aucun résumé n'est affiché plutôt qu'un chiffre de repli qui
aurait l'air juste. Un mode posé à côté de `map-summary-value`, ou un
`map-summary-weight` qu'un mode ignore, est signalé en console — l'intention
contredite est dite, pas subie.

Le résumé lit la colonne `value-field` telle qu'elle arrive, arrondis d'un
`dsfr-data-normalize round="…"` en amont compris ; c'est marginal sur une somme,
pas sur `weighted` (PG-031), et le JSDoc le dit.

**Strictement additif** : sans `map-summary`, le résumé garde exactement son
ordre historique — valeur fournie, sinon pondérée si un effectif est posé, sinon
moyenne non pondérée. Aucun chiffre déjà publié ne change.
