---
'dsfr-data': minor
---

Opérateurs de date pour `dsfr-data-context-filter` (#230) — les dashboards datés (rappels, sanctions, dépenses…) : `month-of` (`<input type="month">` → plage du mois), `year-of` (plage annuelle), `lt-day-after` (inclusif jusqu'au jour choisi), `last-n-days` (« N derniers jours ») et `current-year` (checkbox → année en cours). Toutes les clauses sont des plages `[début, fin)` en ISO, générées au dialecte de chaque adapter (ODSQL/colon) ; les bornes **dynamiques** se recalculent à chaque diffusion (pas de date figée dans le DOM) et l'URL sérialise l'**intention** (« 30 »), jamais les dates résolues (ADR-031) — un lien partagé ne gèle pas de vieilles dates.
