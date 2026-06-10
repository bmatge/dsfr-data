---
'dsfr-data': patch
---

`dsfr-data-facets` durci (#309, #310) : les fetch de facettes sont **abortés** entre deux interactions (AbortController par cycle + jeton de génération — deux clics rapides laissaient la réponse la plus lente, potentiellement l'ancienne, écraser les groupes) et les erreurs ne sont plus avalées en silence (`console.warn` + bannière d'erreur rendue). L'UI ne disparaît plus quand un filtre serveur donne **0 résultat** : le bouton « Réinitialiser les filtres » reste rendu (l'utilisateur n'est plus coincé). Les **sélections fantômes** (valeur sélectionnée disparue des données après refetch) sont réinjectées dans les groupes, cochées et marquées indisponibles — donc désélectionnables, fini le filtre invisible qui rend les résultats vides inexplicables.
