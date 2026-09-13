---
'dsfr-data': patch
---

Dette et petits défauts (revue du 2026-09-13, lot G) :

- Opendatasoft : un `select` purement agrégé passe par `/records` en une ligne AVANT le chemin `fetch-mode="export"`, qui téléchargeait `cap + 1` copies de la même valeur et signalait une troncature à tort ; un 429 ou un 5xx sur l'export replie sur `/records` cette fois-ci sans condamner l'export pour la session (seul un 4xx est définitif).
- `dsfr-data-pivot` : `count` ne compte plus les cellules vides, comme `sum` et `count-distinct`.
- `dsfr-data-normalize` : une entrée `fold` malformée est signalée une fois par valeur de l'attribut (plus à chaque lot) et l'erreur de configuration s'efface quand l'attribut est corrigé.
- `dsfr-data-facets` : un critère de tri inconnu (`sort="alpah"`) retombe toujours sur la fréquence, mais le dit une fois au lieu de se taire.
- Codes département : `2a` / `2b` en minuscules sont ramenés à `2A` / `2B`, comme `02a` l'était déjà.
- Une seule définition de l'égalité lâche (`looseEquals`, variante « tableau contient » `looseEqualsOrContains` pour les agrégations) et du retrait des accents (`stripAccents`) dans `@dsfr-data/shared`, au lieu de trois et quatre copies.
- Guides : `<dsfr-data-context-tags for="…">` (et non `context`), `<dsfr-data-list columns="…">` (et non `fields`).
