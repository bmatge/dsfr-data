---
"dsfr-data": patch
---

fix(tabular): retombe en agregation client-side quand les noms de colonnes contiennent des espaces ou de la ponctuation. La syntaxe a suffixe Tabular (`colonne__groupby`, `colonne__sum`) ne sait pas parser des colonnes comme "Date - Journee gaziere" ou "Inventaire LNG (m3 LNG)" et renvoyait une erreur "Malformed query" (HTTP 400). dsfr-data-query interroge desormais l'adapter via `supportsServerFields()` avant de deleguer group-by/aggregate/order-by au serveur.
