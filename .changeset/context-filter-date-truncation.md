---
"dsfr-data": patch
---

Filtres de contexte : `year-of` et `month-of` acceptent une date complète (issue d'un input type=date) et la tronquent à l'année / au mois, y compris depuis l'URL ; une valeur inexploitable retire le filtre en le signalant par un avertissement console au lieu de le retirer en silence (#646).
