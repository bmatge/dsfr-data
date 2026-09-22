---
'dsfr-data': minor
---

Assistant contextuel : correspondance sans modèle entre la phrase de l'usager et un repère d'interface (#1012). `trouverRepere()` projette le registre généré (libellé, synonymes, noms d'attributs composés, titres des fiches liées par `data-attribut`) et le passe au moteur `searchSkills()`, qui ne change pas. Le résultat vaut `trouve`, `ambigu` (2 ou 3 repères proposés) ou `aucun`. Les raisons de chaque correspondance sont exposées, et `formulerCorrespondance()` rend le chemin à suivre (« Éléments de la couche › Au clic sur un élément › Comportement au clic ») sans appel à Albert.
