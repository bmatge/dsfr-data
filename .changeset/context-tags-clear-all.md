---
"dsfr-data": minor
---

`dsfr-data-context-tags` reprend les filtres issus des facettes (un tag par valeur, retirable seule) et de la recherche (« Recherche : terme »), et gagne l'attribut `clear-all` : un bouton unique « Tout effacer » qui vide tous les filtres du contexte en une seule diffusion (`DsfrDataContext.clearAll()`). Nouvel attribut `no-reset` sur `dsfr-data-facets` pour masquer son bouton « Réinitialiser les filtres » local (#679).
