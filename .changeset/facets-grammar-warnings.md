---
"dsfr-data": patch
---

`dsfr-data-facets` avertit désormais en console, une fois par instance, quand `display` ou `labels` sépare ses entrées par une virgule au lieu d'une barre verticale, ou quand un mode d'affichage est inconnu : `display="a:select, b:select"` rendait zéro liste déroulante sans un mot. Le message nomme l'attribut, la valeur reçue et la forme attendue (#731).
