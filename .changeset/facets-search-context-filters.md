---
"dsfr-data": minor
---

Facettes et recherche comme filtres de `dsfr-data-context` : nouvel attribut `context="id"` sur `dsfr-data-facets` (un filtre par champ, select peuplé depuis la donnée avec cascade `server-facets`, sans `<option>` en dur), `dsfr-data-search` (filtre `contains`) et `dsfr-data-context-filter` (placé hors du contexte, même déclaré avant lui). Un seul bus de diffusion : le contexte diffuse à ses sources cibles, porte l'URL (un paramètre par champ) et alimente `context-tags` ; `contains` est exposé dans les opérateurs du `context-filter` ; `whereKey` stable indexé sur le champ (#678).
