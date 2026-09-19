---
'dsfr-data': patch
---

Deux défauts du motif « un composant par ligne » (gabarit de `dsfr-data-display` contenant des composants `dsfr-data-*`).

**Le cache d'un `id` repris n'est plus purgé par l'instance qu'il remplace (#893).** À la déconnexion d'un transformateur — et d'une `dsfr-data-source`, qui portait la même purge — le cache global n'est vidé que si plus aucun élément du document ne porte cet `id`. Dans un navigateur, réécrire un `innerHTML` connecte les nouvelles instances **avant** de déconnecter les anciennes (mesuré sous Chromium : `connected a`, `connected b`, `disconnected a` — happy-dom ordonne l'inverse) : chaque ré-émission de la source répétée vidait donc le cache que la nouvelle query homonyme venait de remplir, et un consommateur monté plus tard — un KPI par exemple — lisait du vide et affichait « — ». Un composant réellement retiré de la page purge toujours son cache.

**Le gabarit est recapturé quand le bundle est chargé dans le `<head>` (#894).** `connectedCallback` s'exécutait alors avant que le `<template>` enfant ne soit analysé : le gabarit était vide, et quand les données étaient déjà connues au montage (source `data` en ligne, cache déjà rempli) aucun rendu ultérieur ne venait le rattraper — la liste restait vide définitivement. Une seconde capture a lieu à la fin de l'analyse du document, sur le modèle de `dsfr-data-map-popup`.
