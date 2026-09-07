---
'dsfr-data': patch
---

Tabular : les group-by et agrégations délégués au serveur sont de nouveau acceptés par l'API data.gouv.

L'API Tabular a durci son parser de query string : elle rejette désormais la forme valuée
`colonne__groupby=` avec un 400 « Malformed query » et n'accepte que le flag nu
`colonne__groupby`. L'adapter les sérialisait via `URLSearchParams`, qui ajoute toujours un `=`.
Comme l'API n'émet pas d'en-tête CORS sur ses réponses d'erreur, le navigateur masquait ce 400
derrière un `TypeError: NetworkError` — tout graphique Tabular avec agrégation restait vide.
