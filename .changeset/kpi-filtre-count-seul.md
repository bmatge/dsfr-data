---
'dsfr-data': patch
---

fix(kpi) : `count:champ:valeur` n'est plus déclaré obsolète, et `sum:champ:valeur` ne ment plus

Deux défauts du parseur d'expressions du KPI.

**Un faux avertissement de dépréciation.** `count:champ:valeur` est la forme recommandée depuis le
ratio (0.24.0), exemple canonique compris (`count:statut:ouvert / count`). Le parseur posait
pourtant l'avertissement de la grammaire `fn:champ` (#303) avant de traiter les trois parties :
chaque page qui suivait la documentation se voyait dire que son écriture était obsolète. La forme
filtrée est désormais traitée avant ; seule la grammaire à deux parties (`sum:population`) reste
dépréciée. La valeur de filtre est lue en entier, deux-points compris (`count:heure:12:30`).

**Un filtre ignoré en silence.** `sum:montant:ouvert` était accepté, mais seul `count` honore une
valeur de filtre : le KPI affichait le total **non filtré**, plausible et faux. C'est désormais une
erreur de configuration nommée, pour toutes les fonctions autres que `count`. Pour agréger un
sous-ensemble, filtrer en amont par le `where` du KPI ou une `dsfr-data-query`.

Résout le constat BUG-012 du banc d'essai (#764).
