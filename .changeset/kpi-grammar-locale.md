---
'dsfr-data': patch
---

`dsfr-data-kpi` aligné sur le pipeline (#303) : la grammaire commune `champ:fn` (ex. `valeur="population:sum"`) est acceptée — la grammaire historique inversée `fn:champ` reste lue en alias déprécié (warn unique). Les chemins imbriqués fonctionnent enfin (`valeur="fields.score:avg"` — seul composant sans `getByPath`, l'expression échouait silencieusement). La tendance est formatée fr-FR (« 5,2 % » au lieu de « 5.2% » anglo-saxon à côté d'une valeur « 5 825 ») et sa doc est corrigée (c'est une expression d'agrégation, pas un littéral). `count:champ:valeur` compare en égalité lâche comme les filtres de query (`"75"` matche 75).
