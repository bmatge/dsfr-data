---
'dsfr-data': patch
---

Rend visible l'erreur de configuration `id` manquant (et `source`/`left`/`right`/`on` selon le composant) sur les composants pipeline (`dsfr-data-facets`, `dsfr-data-query`, `dsfr-data-normalize`, `dsfr-data-search`, `dsfr-data-join`).

Auparavant un `console.warn` silencieux laissait le développeur sans aucun signal visible quand un de ces attributs était oublié — le composant ne rendait simplement rien.

Désormais :
- `console.error` (croix rouge en DevTools) au lieu de `console.warn`
- attribut `data-dsfr-config-error="<cause>"` posé sur l'élément (visible immédiatement dans l'inspecteur)
- composants visuels (`dsfr-data-facets`, `dsfr-data-search`) : alerte DSFR `fr-alert--warning` rendue à la place du contenu attendu

`dsfr-data-join` gagne au passage un check explicite de `id`/`left`/`right`/`on` (auparavant `return` silencieux).
