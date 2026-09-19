---
'dsfr-data': minor
---

`dsfr-data-facets` : un libellé pour les VALEURS d'une facette (`value-labels`)

`labels` nomme les CHAMPS ; rien ne nommait ce qu'ils contiennent. Une facette
posée sur un champ de code affichait donc « 29 », « 56 », « 101 » là où le
lecteur attend « Finistère », « Morbihan », « Fédération française
d'athlétisme » — alors que le libellé se trouve presque toujours dans la même
ligne, juste à côté du code. Faute d'attribut, les pages retombaient sur un
`<select>` dont les options étaient générées hors ligne (609 lignes d'`option`
sur les portraits Sports), liste qui se périme au premier ajout au référentiel.

Voie native nouvelle : `value-labels="dep_code:dep_nom"` lit le libellé dans un
champ compagnon des mêmes lignes ; `value-labels='{"dep_code":{"29":"Finistère"}}'`
accepte une table figée quand aucun champ compagnon n'existe. La valeur
diffusée au contexte, à l'URL et au `where` reste le CODE ; le tri `alpha` et
la recherche portent sur le libellé, et les tags de `dsfr-data-context-tags`
affichent le libellé tout en retirant la bonne valeur.

Au passage, une entrée de `labels` qui nomme une valeur au lieu d'un champ
(`labels="22:Côtes-d'Armor"`) était lue comme un nom de champ et ignorée sans
un mot : elle est désormais signalée en console, avec renvoi vers
`value-labels`.

Strictement additif : sans `value-labels`, rien ne change.
