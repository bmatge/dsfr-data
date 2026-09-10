---
"dsfr-data": minor
---

`dsfr-data-kpi` accepte `format="date"` (chaîne ISO rendue JJ/MM/AAAA, aussi sur une ligne de `lines`) et les agrégats `min`/`max` acceptent une colonne de dates ISO (`value="maj:max" format="date"` → « 09/09/2026 ») ; `first`/`last` renvoient la chaîne brute, formatée par le KPI. Les colonnes numériques gardent leur comportement (#667).
