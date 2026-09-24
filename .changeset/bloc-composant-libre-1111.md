---
'dsfr-data': minor
---

Studio IA : bloc « composant libre » (#1111). Un bloc `kind: "component"` porte une petite chaîne de
composants `dsfr-data-*` (transformations puis affichage) avec leurs attributs HTML, pour ce que
les blocs guidés (texte, graphique, filtres, carte) n'expriment pas : tableau croisé
(`dsfr-data-pivot`), recherche, facettes, légende ou volet de carte à gabarit, sélection au clic.
Chaque appel est validé contre le manifeste par le moteur du lint de balisage : balise connue,
attributs déclarés, valeurs d'énumération permises, `source=` / `for=` qui visent un id existant ;
un refus nomme l'attribut en cause et les valeurs permises. Pas de HTML libre : ni script, ni
balise hors `dsfr-data-*`, gabarit `<template>` filtré, valeurs échappées à l'export — y compris
pour un tableau de bord relu depuis le stockage partagé. Le Tableau de bord conserve et affiche le
bloc (configuration en lecture seule). Le lint de balisage (Playground, serveur MCP) signale
désormais une valeur hors énumération (`balisage/valeur-invalide`) : le contrat des composants
relit dans le code les unions de valeurs que le manifeste laisse en texte (`PopupMode`,
`SearchOperator`…). Couverture du Studio : 12 → 27 composants sur 28, 71 → 357 attributs sur 387.
