---
'dsfr-data': patch
---

`dsfr-data-map-popup` : le corps du panneau et celui de la modale sont maintenant
écrits dans un `<div>` créé à part, plutôt qu'interpolés dans le gabarit de chrome.
La donnée n'a ainsi qu'un point d'entrée HTML, nommé et commentable — le rendu est
identique. L'échappement, lui, n'a pas changé : il est désormais **prouvé** par
`tests/map-popup-xss.test.ts` (quatre charges utiles sur les deux modes et les deux
chemins de rendu, avec et sans `<template>` d'auteur), ce qui permet d'écarter en
connaissance de cause les deux alertes CodeQL `js/html-constructed-from-input`.
