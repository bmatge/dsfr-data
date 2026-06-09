---
'dsfr-data': patch
---

Export CSV robuste et partagé (#291) : nouvelle fonction `buildCsv()` dans `@dsfr-data/shared` (quoting RFC 4180 incluant les sauts de ligne, BOM UTF-8 pour Excel FR, neutralisation des préfixes de formules tableur `=` `@` `+` `-`), consommée par `dsfr-data-list` et `dsfr-data-a11y`. L'export a11y utilise désormais les mêmes colonnes que le tableau rendu et exclut les champs techniques `_*` (dont le HTML de `_highlight`). `dsfr-data-list` signale en console que seule la page courante est exportée en mode serveur.
