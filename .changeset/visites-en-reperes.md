---
'dsfr-data': minor
---

Visites guidées exprimées en repères (#1013, ADR-143) : une étape désigne un repère du registre de l'app (`repere: 'carto.couches'`) plutôt qu'un sélecteur, et la visite demande à l'adaptateur de l'app de le révéler (section, panneau, modale) avant de l'afficher — `onBeforeShow` disparaît au profit de `reveler()`. `selector` reste un repli pour les apps sans registre. Les visites du builder et du builder carto sont migrées, et `check:reperes` refuse désormais une étape qui cite un repère absent du registre (règle 6).
