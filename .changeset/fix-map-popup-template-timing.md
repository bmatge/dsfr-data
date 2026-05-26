---
'dsfr-data': patch
---

fix(map-popup): `<dsfr-data-map-popup>` trouve maintenant son `<template>` enfant même quand le script de la lib est chargé dans `<head>` sans `defer`.

Avant : le lookup `querySelector('template')` était fait dans `connectedCallback()`, qui est appelé par le parser HTML avant que les enfants du composant ne soient parsés. Résultat : `_templateEl` restait `null`, et le composant retombait silencieusement sur l'affichage en tableau auto (`_buildAutoTable`) sans warning. Closes #156.

Maintenant : le lookup est différé au premier appel de `hasTemplate()` ou `_renderTemplate()` (typiquement au clic sur un marker), moment où le `<template>` enfant est garanti présent. Le résultat est ensuite mis en cache.
