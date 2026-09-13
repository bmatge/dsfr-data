---
'dsfr-data': patch
---

Données : trois chiffres faux et plausibles corrigés (revue du 2026-09-13).

- `compute` (`dsfr-data-normalize`) : une cellule vide n'égale plus un nombre — `when montant = 0 then 'Nul'` classait chaque montant non renseigné en zéro, là où `where="montant:eq:0"` ne le retenait pas. Et l'arithmétique `- * /` suit désormais la doctrine des fonctions numériques : opérande absent ou non numérique → `null` (`actif - passif` avec `passif` manquant rendait `actif`), division par zéro → `null` (jamais `Infinity`). `+` concatène toujours dès qu'un côté n'est pas numérique.
- `dsfr-data-join` : une clé nulle ou vide n'apparie plus rien, pas même une autre clé vide (sémantique SQL) — une ligne sans code était jointe à toute ligne sans code de l'autre côté, et n'était jamais comptée orpheline dans le diagnostic de #792. Elle apparaît désormais dans l'échantillon d'orphelins sous « (clé vide) ».
- `dsfr-data-context-filter` : `current-month`, `current-year` et `last-n-days` sont calculés sur le jour civil local, comme `default="today"` (#682). Ils restaient en UTC : à 00:30 à Paris le 1er du mois, « mois en cours » filtrait le mois précédent.
- Suite de tests épinglée sur le fuseau Europe/Paris pour que ces cas se prouvent aussi en CI.
