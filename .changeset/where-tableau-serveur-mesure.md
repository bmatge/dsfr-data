---
'dsfr-data': patch
---

Champ tableau : dire que le serveur, lui, lit `=` comme un « contient » (#953)

La documentation livrée par #842 portait la mention « non vérifié à ce jour » sur ce
que fait Opendatasoft d'une égalité posée sur un champ multivalué. C'est mesuré, le
2026-09-19, sur le catalogue de `data.economie.gouv.fr`, champ `keyword` :

```
where=keyword = "budgets annexes"   -> HTTP 200, total_count = 1   (2e element)
where=keyword = "LFI 2011"          -> HTTP 200, total_count = 1   (1er element)
where=keyword = "inexistant-xyz"    -> HTTP 200, total_count = 0   (temoin)
```

Le serveur trouve la ligne sur n'importe quel élément du tableau. Il y a donc trois
comportements, pas deux : `['urgent']` matche des deux côtés, `['urgent','social']`
matche au serveur seulement, `['a','b']` comparé à `'a,b'` matche au client seulement.

Et ce qui décide de la délégation n'est pas écrit dans la balise qui porte le `where` :
mode de la source, transformateur amont, partage de la source, `explode`. Ajouter un
second graphique à une page peut donc changer un chiffre sans qu'on touche au filtre.

Documentation seule, aucun changement de comportement : JSDoc de `where` sur
`dsfr-data-query` et `dsfr-data-kpi`, section « Champs tableau » du guide, passages
correspondants de la skill.
