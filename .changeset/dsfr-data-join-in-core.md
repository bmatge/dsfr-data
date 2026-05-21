---
'dsfr-data': patch
---

Inclut `dsfr-data-join` dans le bundle `dsfr-data.core.{esm,umd}.js`.

Auparavant le composant n'était disponible que via le bundle complet `dsfr-data.umd.js`. Tous les autres composants pipeline (transformateurs purs : `dsfr-data-normalize`, `dsfr-data-query`...) étaient déjà dans `core` — `dsfr-data-join` était la seule exception, ce qui transformait silencieusement les `<dsfr-data-join>` en `HTMLUnknownElement` quand le code généré par le builder (qui charge `core.umd.js` par défaut) tentait de l'utiliser. Aucune erreur, aucun warning, juste un pipeline qui ne produit rien.

Surcoût : ~3 KB (raw) / ~1 KB (gzip) sur le bundle core.
