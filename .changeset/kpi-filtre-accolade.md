---
'dsfr-data': minor
---

feat(kpi) : filtrer un côté du ratio entre accolades — une part de sommes devient exprimable

Le ratio (0.24.0) exprimait une part de **comptages** avec `count:champ:valeur`, jamais une part
de **sommes** : sur une source pré-agrégée, une ligne par école et par sexe avec un effectif, la
part des filles n'avait pas d'écriture. Le `where` du KPI ne répond pas au besoin, puisqu'il filtre
les deux côtés à la fois.

Une expression accepte désormais un filtre de lignes entre accolades, dans le dialecte du `where` :

```html
<dsfr-data-kpi source="effectifs" format="pourcentage"
  value="effectif:sum{sexe:eq:F} / effectif:sum" label="Part des filles">
</dsfr-data-kpi>
```

Le filtre ne vaut que pour son côté. Plusieurs clauses se séparent par des virgules
(`{sexe:eq:F, secteur:eq:public}`), les douze opérateurs du `where` sont acceptés, et la forme
marche aussi pour `count{…}`, `avg`, `min`, `max`, dans `value`, `trend` et `lines`. La grammaire
colon existante est inchangée. Un filtre non reconnu, des accolades mal formées, un filtre sur
`meta:total` ou sur un accès direct sont des erreurs de configuration nommées.

Résout le constat AM-070 du banc d'essai (#776).
