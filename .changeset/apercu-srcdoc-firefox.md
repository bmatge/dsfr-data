---
'dsfr-data': patch
---

Aperçu du Builder sur Firefox : une `dsfr-data-source` dont l'`url` est relative (`/api/sources/<id>/records`, aperçu d'une table Grist à clé avant publication, ADR-165) affichait « Données momentanément indisponibles » avec « URL constructor: /api/… is not a valid URL ». Dans l'iframe `srcdoc` des aperçus, Firefox rend `location.origin` à « null » (Chrome donne l'origine du parent) et le composant n'avait plus de base de résolution. La source et l'adaptateur tabular résolvent désormais sur l'origine de la page (`pageOrigin()` : `location.origin`, sinon l'origine de `document.baseURI`), et l'aperçu du Builder écrit la route authentifiée en absolu sur l'origine de la page. Le code copié ne change pas.
