---
"dsfr-data": minor
---

`dsfr-data-source` pose `truncated: true` dans sa meta quand les lignes livrées sont un sous-ensemble du jeu (plafond `max-records` atteint, y compris sur un `group-by` ODS au total inconnu, ou `limit` sous le total) ; le volet Diagnostic et `formatTrace()` rendent « tronqué à N / total lignes (plafond max-records) » en alerte (#658).
