---
'dsfr-data': minor
---

Carte : quatre retours du banc d'essai open-data-viz (#1229). Le constat BUG-034 (encarts qui clonent la couche entière) n'est **pas** traité ici : il reste ouvert.

- **La couche se vide au retour en attente — résout le constat BUG-039 du banc d'essai.** Quand la source ou la requête amont porte `require-where` et repasse en attente (dernier filtre retiré), `dsfr-data-map-layer` rend ce qu'elle avait tracé : formes, grappes, carte de chaleur, bandeau et entrées de légende. Elle gardait jusqu'ici les points du dernier filtre, sous une page dont les autres afficheurs disaient « Choisissez un filtre ». `dsfr-data-map` reçoit l'attribut **`idle-message`** des autres afficheurs (#690) : le message se pose sur le fond de carte tant qu'une de ses couches attend un filtre, et s'ajoute à la description lue par les lecteurs d'écran. Les encarts vident leurs couches de la même façon, sans répéter le message.
