---
'dsfr-data': patch
---

Le guide des skills IA (écrit à la main), sa référence générée depuis le manifeste des composants et leur découpage en sections quittent `apps/builder-ia` pour `packages/shared/src/skills/`, afin de survivre au retrait de l'ancien Assistant IA (#1081, étape 1). Aucun changement de contenu servi : `dist/skills.json` et les fichiers générés du serveur MCP sont identiques octet pour octet ; la skill Claude Code `skills/dsfr-data/` ne change que par la ligne qui indique où vit le guide.
