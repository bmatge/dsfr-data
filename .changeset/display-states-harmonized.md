---
'dsfr-data': patch
---

États loading/error harmonisés sur les 6 composants d'affichage (#284) : il y avait quatre comportements pour la même erreur — list/chart affichaient le message, display un texte générique, kpi/podium un libellé sans message ni `role="alert"`. Templates partagés (`renderSourceError`/`renderSourceLoading`) : partout `role="alert"` + `aria-live` + message de l'erreur, `aria-busy` sur le chargement, classes par composant conservées (styles existants intacts) + classe commune `dsfr-data-status--*` pour le theming. `SourceSubscriberMixin` purge désormais ses états et l'état dérivé de l'hôte (`onSourceReset()`) à chaque changement de `source` — basculer vers une source sans cache n'affiche plus les anciennes données. `dsfr-data-display` gagne le revert de page sur erreur de fetch qu'implémentait `dsfr-data-list` (pagination serveur : retour à la page précédente, données courantes conservées).
