---
'dsfr-data': minor
---

Volet Diagnostic : les constats s'affichent dans une pastille sur le rail, un onglet « Constats » et les cartes d'étape, avec un bouton « Me montrer » (#1001). `mountDiagnosticPanel` évalue les constats à chaque trace (option `constats: { contexte, regles }`, règles génériques par défaut), les expose par `constats()` et relaie « Me montrer » par `onMontrer(repere, constat)`. Le volet ne calcule plus lui-même ses marqueurs d'étape : une seule source, `evaluerConstats`.
