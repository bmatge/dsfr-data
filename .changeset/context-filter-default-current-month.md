---
"dsfr-data": minor
---

`dsfr-data-context-filter` gagne un attribut `default` (`today`, `first-of-month`, `first-of-year` ou un littéral) qui pré-remplit le filtre au montage — après l'URL, qui gagne toujours — et un opérateur `current-month` (case à cocher, mois en cours, borne dynamique) symétrique de `current-year` : `operator="lt-day-after" default="today"` filtre jusqu'à aujourd'hui sans script (#682).
