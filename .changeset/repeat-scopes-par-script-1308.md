---
'dsfr-data': patch
---

**`dsfr-data-repeat` : un répéteur à `scopes` construit par script alimente ses tuiles dès l'insertion (#1308).**

Créé par `document.createElement('dsfr-data-repeat')`, gabarit et `scopes` posés avant l'insertion, sur une source déjà chargée, le répéteur estampait ses lignes avant d'avoir lu `scopes` : ses tuiles scopées restaient à « — » jusqu'à la prochaine émission de la source. `scopes` est désormais lu avant l'abonnement à la source.

Ce qui change pour une page existante : rien pour un répéteur écrit dans le balisage de la page. Un répéteur inséré par script sur des données déjà là montre ses chiffres tout de suite. Gardé par le contrôle de donnée `repeteur-scopes-construit-par-script` (ADR-122).
