# Spike — rendu par clonage DOM contre `innerHTML` (#889)

**Archive. Ce code ne tourne pas, n'est pas ramassé par les tests, et n'est pas à maintenir.**

Ce spike a servi à trancher une question de conception avant d'écrire `dsfr-data-repeat` :
fallait-il rendre les instances répétées par `.innerHTML` (comme `dsfr-data-display`) ou par
clonage du `<template>` ?

Il a nourri l'[ADR-135](../../../docs) et le lot 1 du répéteur (#905). Sa conclusion est
passée dans le composant : **le clonage l'emporte**, parce qu'`innerHTML` reconstruit tout à
chaque émission et perd l'état des instances, là où le clonage permet une réconciliation par
clé.

## Pourquoi on le garde

Parce qu'un spike qui a justifié une décision d'architecture est la seule trace de ce qui a
été *écarté*, et pourquoi. L'ADR dit ce qu'on a choisi ; ceci dit ce à quoi on l'a comparé, et
avec quels chiffres.

## Pourquoi il est ici et pas dans `e2e/`

Il vivait sous `e2e/spike-repeat/` sur une branche sans PR. Laissé là, il aurait été ramassé
par Playwright (`spike.spec.ts`), compilé par `typecheck:tests`, et serait devenu de la dette :
un module jetable que chaque refonte aurait fallu réparer sans que personne sache pourquoi.

Même motif que l'archivage des specs historiques du Builder (#868) : on ne supprime pas ce qui
documente une décision, on le sort de ce qui est exécuté.

## Pour le rejouer

Il vise une version de la bibliothèque antérieure au répéteur publié et **ne compilera
probablement plus tel quel**. Ce qu'il faut en lire, ce sont `renderer.ts` (les deux stratégies
côte à côte) et `spike.spec.ts` (ce qui a été mesuré). Le composant réel est dans
`packages/core/src/components/dsfr-data-repeat.ts`.

Branche d'origine : `spike/repeat-clonage-dom`, commit `8c35137`, supprimée après versement.
