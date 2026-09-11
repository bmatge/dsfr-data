---
'dsfr-data': patch
---

fix(join) : une jointure-filtre contre une source d'une ligne ne déclenche plus d'avertissement

L'avertissement de jointure `inner` ajouté dans cette même version partait dès que des lignes
étaient retirées. Or une jointure `inner` contre une source d'**une seule ligne** sert à filtrer
sur une valeur calculée par l'API : « ne garder que la dernière année publiée », avec
`select="max(year(annee)) as an"` d'un côté. Retirer les autres lignes est alors le but. Le banc
d'essai recevait deux avertissements injustifiés par chargement, sur une page aux chiffres justes.

Contre une source d'une ligne, ni avertissement console ni alerte au volet Diagnostic : la trace
nomme la « jointure-filtre ». Un écart de graphie des clés (zéro de tête, espaces) reste signalé
dans tous les cas. Le motif est décrit dans le guide de la jointure.

Résout le constat AM-080 du banc d'essai (#816).
