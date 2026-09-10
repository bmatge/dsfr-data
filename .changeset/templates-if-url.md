---
"dsfr-data": minor
---

Templates de `dsfr-data-display` et `dsfr-data-map-popup` : blocs conditionnels `{{#if champ}}…{{/if}}` / `{{#unless champ}}…{{/unless}}` (non imbriqués, résolus avant la substitution) et pipe `{{lien:url}}` à liste blanche de schémas (`http:`, `https:`, `mailto:`, `tel:`, URL relatives ; sinon chaîne vide). **Sécurité** : `href="{{x}}"` n'appliquait aucun filtrage de schéma, une donnée `javascript:…` passait telle quelle — utiliser `{{x:url}}` dans tout `href`. Moteur `renderTemplate` factorisé entre les deux composants (#664).
