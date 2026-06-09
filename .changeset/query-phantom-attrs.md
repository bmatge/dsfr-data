---
'dsfr-data': patch
---

Attributs fantômes de `dsfr-data-query` supprimés (#277) : `transform`, `server-side` et `page-size` étaient déclarés (et documentés au builder-IA via l'introspection Lit) mais jamais lus — zéro effet. Un `console.warn` de migration est émis si l'attribut HTML est encore présent (le relais de commandes vers la source est toujours actif ; `transform` et `page-size` se configurent sur `dsfr-data-source`). La doc de `where` promettait la syntaxe ODSQL alors que le parseur est colon-only : un where non parsable (syntaxe ODSQL, opérateur inconnu, valeur manquante) est désormais signalé via `reportConfigError` (console + attribut `data-dsfr-config-error`), le traitement continuant en mode dégradé. Skills builder-IA et code généré par les builders alignés.
