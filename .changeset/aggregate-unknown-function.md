---
"dsfr-data": patch
---

Une fonction d'agrégat inconnue (ex. `sum` mal orthographié en `somme`) n'est plus silencieuse : `dsfr-data-kpi` (`value`, `trend`) affiche une erreur de configuration à la place d'un indicateur vide, et `dsfr-data-query` (`aggregate`) passe en erreur au lieu de produire un 0 plausible — le message nomme le composant, l'attribut, la fonction reçue et la liste acceptée (#649).
