---
'dsfr-data': patch
---

Libellés et messages accentués (#1158) : les textes affichés par les composants perdaient leurs accents — compteur de `dsfr-data-display` (« 12 résultats », `empty` par défaut « Aucun résultat »), compteurs et aide de recherche lus par les lecteurs d'écran dans `dsfr-data-facets`, libellé accessible du panneau de `dsfr-data-map-popup`, noms des cartes dans le libellé accessible de `dsfr-data-chart`, messages d'erreur et d'avertissement (`dsfr-data-query`, `dsfr-data-context-filter`, `dsfr-data-map`, tri déprécié des facettes, overlay de débogage). Les descriptions d'attributs concernées (`refresh`, `bbox`, `highlight`, `code-field`, `count-label`) et le diagnostic statique du balisage sont corrigés dans la foulée. Aucun changement de comportement.
