---
"dsfr-data": minor
---

`dsfr-data-query` accepte l'agrégat cumulé `aggregate="montant:running_sum"` : une ligne par ligne de sortie, chacune portant la somme des précédentes, calculée après `order-by` (et cumulable sur une colonne issue du `group-by`, `montant__sum:running_sum`). Le cumul reste toujours côté client — aucune API ne le traduit — et un avertissement console signale son emploi sans `order-by`, où le résultat n'a pas de sens (#738).
