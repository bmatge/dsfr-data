---
"dsfr-data": minor
---

`dsfr-data-context-filter` : nouvel attribut `year-start-month` sur les opérateurs `year-of` et `current-year` — l'année peut commencer en septembre (année scolaire), en avril (exercice comptable) ou en octobre (saison) au lieu de janvier. La clause reste une plage `gte` + `lt`, donc elle se délègue au serveur comme n'importe quelle autre, et le tag affiche « 2024-2025 » (#735).
