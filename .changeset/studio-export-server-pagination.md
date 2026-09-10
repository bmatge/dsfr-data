---
"dsfr-data": minor
---

Un document exporté par le Studio pagine désormais côté serveur (`server-side`, `page-size` et
`server-sort`) quand une source n'alimente qu'un seul tableau paginé : il ne rapatrie plus tout le
jeu pour en afficher vingt lignes. Une source partagée entre plusieurs blocs, agrégée ou pilotée par
un bloc de filtres continue de charger l'ensemble — y poser la pagination serveur fausserait
silencieusement les graphiques et KPI d'à côté ; pour ce cas, utiliser `fetch-mode="export"` (#717).
