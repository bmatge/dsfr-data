---
"dsfr-data": minor
---

feat(guide): permet de masquer les jeux de donnees de demonstration depuis la page Guide

Ajoute un interrupteur "Masquer les jeux de donnees de demonstration" sur la page Guide, a cote du reglage d'activation/desactivation des visites guidees. Quand il est active, les jeux de donnees d'exemple (regions de France, evolution annuelle, catalogue de services) n'apparaissent plus dans les selecteurs de source du Builder et du Builder IA. Le reglage est persiste par utilisateur (localStorage + synchronisation serveur via `users.tour_state`, comme les visites guidees) et expose via `isDemoDatasetsDisabled()` / `setDemoDatasetsDisabled()` dans `@dsfr-data/shared`. Les demos restent affichees par defaut.
