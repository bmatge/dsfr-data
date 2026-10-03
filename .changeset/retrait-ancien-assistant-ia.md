---
'dsfr-data': patch
---

Retrait de l'ancien Assistant IA (`apps/builder-ia`), remplacé par le Studio IA (#1081, étape 2). Le guide des skills ne sert plus ses deux actions JSON `createChartAction` et `reloadDataAction`, que seul cet Assistant interprétait : `dist/skills.json` passe de 37 à 35 skills et la skill Claude Code de 36 à 34 références. Aucun composant `dsfr-data-*` ne change. En déploiement, l'adresse `apps/builder-ia/` redirige vers le Studio IA.
