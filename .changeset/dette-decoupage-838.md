---
'dsfr-data': patch
---

Refactor interne, comportement inchangé (#838) : les fonctions de plus de 150 lignes sont découpées en méthodes nommées — `_negotiateServerSide` de `dsfr-data-query`, `_fetchViaAdapter` de `dsfr-data-source`, `_getTypeSpecificAttributes` de `dsfr-data-chart`, et le `render()` de `dsfr-data-facets` et de `dsfr-data-list`. `dsfr-data-facets` passe de 2 736 à 2 177 lignes : ses blocs client (comptage, tri, filtrage), serveur (découverte, paramètres, fetch des facettes), statique (`static-values`), attributs et URL sortent en fonctions pures dans `components/facets/`, testées unitairement. Aucun attribut, événement, rendu ni JSDoc public ne change ; la vérification des données passe à l'identique (191 contrôles).
